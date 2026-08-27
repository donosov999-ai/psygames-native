/* psygames-pause-warmup-page · VER 1 · 27.08.2026 */
/**
 * «ЗАРЯДКА» — ПРОРАБОТАННАЯ СТРАНИЦА ЦЕЛИКОМ.
 *
 * 🔴 ЧТО ЗДЕСЬ ПРОИЗОШЛО. Ядро практик у psygames и «Умного будильника» одно
 * (`src/games/pause/core`). Разошёлся только вид: в будильнике он проработан —
 * картинки, траектория взгляда, рамка времени по фазам, параллельный режим,
 * предупреждения, — а в приложении на его месте стоял один значок.
 *
 * Сначала я переписывал рисовалки на `react-native-svg`. Так переносится
 * геометрия и теряется всё остальное: первым же замером нашлось, что гимнастика
 * глаз получила у меня фигуру дыхания вместо своей движущейся мишени. Собранное
 * по кускам не равно перенесённому.
 *
 * Поэтому показывается СТРАНИЦА БУДИЛЬНИКА ЦЕЛИКОМ, готовой сборкой. Кладёт её
 * `scripts/sync-warmup-page.mjs` в `public/warmup`, вид и итог сессии наружу
 * отдаёт `public/warmup/embed.js`.
 *
 * ⚠️ ПОЧЕМУ IFRAME, А НЕ `react-native-webview`. psygames на ВСЕХ платформах —
 * macOS, Windows, Android — это Tauri поверх веб-сборки Expo (`npx expo export
 * -p web` в каждой сборочной работе CI). Отдельного нативного рантайма нет,
 * `Platform.OS` везде `web`, а `public/` копируется в `dist/` при экспорте.
 * Значит страница доступна по обычному пути на каждой платформе, и вводить
 * зависимость `react-native-webview` не за чем.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { isGameHeld, onGameHold } from '@/src/services/gamePause';

export type WarmupOutcome = {
  /** Дошла ли сессия до конца или человек вышел без записи. */
  readonly completed: boolean;
  readonly durationMs: number;
};

type Props = {
  readonly theme: 'light' | 'dark';
  readonly locale: string;
  /** Набор из ссылки `?set=` — двери «Дыхание»/«Глаза» ведут в конкретный. */
  readonly set?: string | null;
  readonly onOutcome: (outcome: WarmupOutcome) => void;
  readonly onReady?: () => void;
};

/**
 * 🔴 КОРЕНЬ ПРИЛОЖЕНИЯ, А НЕ ТЕКУЩИЙ МАРШРУТ.
 *
 * Первая редакция считала путь от `document.baseURI` — и в собранном приложении
 * получилось `tauri://localhost/games/warmup/index.html`: маршрут «Паузы» лежит
 * в `/games/pause.html`, относительная ссылка от него уходит в `/games/`.
 * Экран открывался пустым, страница не грузилась вовсе. Замер 27.08.2026 —
 * сборка 1.242.0 на Mac, «Unmatched Route» прямо в рамке.
 *
 * Корень берётся у уже загруженного файла сборки: у Expo он всегда лежит под
 * `/_expo/static/...`, и всё, что стоит ЛЕВЕЕ `/_expo/`, и есть корень. Это
 * верно и в Tauri (`tauri://localhost`), и на GitHub Pages, где приложение
 * живёт под `/psygames-web`.
 *
 * ⚠️ СЧИТАЕМ ОТ `location.href`, А НЕ ОТ `location.origin`. У схемы `tauri://`
 * источник нестандартный, и `origin` там может оказаться пустым — адрес вышел
 * бы битым. Разрешение абсолютного пути относительно текущего адреса работает
 * при любой схеме.
 */
function кореньПриложения(): string {
  if (typeof document === 'undefined') return '/';
  const метки = Array.from(document.querySelectorAll('script[src], link[href]'));
  for (const метка of метки) {
    const ссылка = метка.getAttribute('src') ?? метка.getAttribute('href') ?? '';
    const место = ссылка.indexOf('/_expo/');
    if (место >= 0) {
      const корень = ссылка.slice(0, место);
      // Ссылка бывает и абсолютной, и от корня источника — обе годятся как база.
      return `${корень}/`;
    }
  }
  return '/';
}

/** Адрес встроенной страницы «Зарядки» с темой и языком приложения. */
function страницаЗарядки(theme: string, locale: string, набор?: string | null): string {
  if (typeof location === 'undefined') return '';
  const адрес = new URL(`${кореньПриложения()}warmup/index.html`, location.href);
  адрес.searchParams.set('embed', '1');
  адрес.searchParams.set('theme', theme);
  адрес.searchParams.set('lang', locale.slice(0, 2));
  if (набор) адрес.searchParams.set('set', набор);
  return адрес.toString();
}

export default function WarmupPage({ theme, locale, set, onOutcome, onReady }: Props) {
  const рамка = useRef<HTMLIFrameElement | null>(null);
  /**
   * 🔴 ДВА ПРОХОДА РАДИ ГИДРАЦИИ. Экспорт Expo пререндерит маршрут статикой,
   * и в этом HTML рамки НЕТ (`location` в Node отсутствует). Если клиент
   * нарисует рамку первым же проходом, дерево не совпадёт с серверным и React
   * уронит гидрацию — смоук ловил её как «Minified React error #419» на
   * каждом открытии экрана. Поэтому первый клиентский проход тоже пустой, а
   * рамка появляется эффектом — после сверки деревьев.
   */
  const [готов, поднять] = useState(false);
  useEffect(() => { поднять(true); }, []);
  const адрес = useMemo(
    () => (Platform.OS === 'web' ? страницаЗарядки(theme, locale, set) : ''),
    [theme, locale, set],
  );
  /**
   * ⚠️ Свежие обработчики держим в ссылках, но обновляем их В ЭФФЕКТЕ, а не в
   * теле отрисовки: правка `current` во время отрисовки — ошибка `react-hooks/refs`.
   * Подписка на сообщения ставится один раз и обязана видеть последний обработчик.
   */
  const итог = useRef(onOutcome);
  const готово = useRef(onReady);
  useEffect(() => {
    итог.current = onOutcome;
    готово.current = onReady;
  }, [onOutcome, onReady]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    function приняли(событие: MessageEvent) {
      // Сообщения приходят строкой: тот же формат уходит и в нативную обёртку.
      if (typeof событие.data !== 'string') return;
      let разобрано: { type?: string; durationMs?: number };
      try {
        разобрано = JSON.parse(событие.data);
      } catch {
        return;
      }
      if (разобрано.type === 'warmup:ready') готово.current?.();
      if (разобрано.type === 'warmup:done') итог.current({ completed: true, durationMs: разобрано.durationMs ?? 0 });
      if (разобрано.type === 'warmup:exit') итог.current({ completed: false, durationMs: разобрано.durationMs ?? 0 });
    }
    window.addEventListener('message', приняли);
    return () => window.removeEventListener('message', приняли);
  }, []);

  /**
   * 🔴 ПАУЗА ПРИЛОЖЕНИЯ ГАСИТ ЧАСЫ СТРАНИЦЫ. У psygames часы игровые
   * (`gameNow`): свернули приложение или открыли вопрос при выходе — партия
   * стоит. Часы встроенной страницы свои, настенные, и подменить их снаружи
   * нечем. Поэтому пауза ПЕРЕДАЁТСЯ внутрь, и там нажимается собственная кнопка
   * паузы страницы. Без этого десятиминутная практика доигрывала бы себя, пока
   * человек её не видит, — ровно то, против чего заведён гейт `module-games`.
   */
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    function передать(держим: boolean) {
      рамка.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'warmup:hold', held: держим }),
        '*',
      );
    }
    передать(isGameHeld());
    return onGameHold((держим) => передать(держим));
  }, []);

  if (Platform.OS !== 'web') {
    // Сюда попасть нельзя: все сборки идут через веб-экспорт. Но если рантайм
    // однажды появится — пусть говорит прямо, а не показывает пустоту.
    return (
      <View style={styles.заглушка}>
        <Text style={styles.текстЗаглушки}>Зарядка доступна в сборке приложения</Text>
      </View>
    );
  }

  if (!готов) return <View style={styles.заглушка} />;

  return React.createElement('iframe', {
    ref: рамка,
    src: адрес,
    title: 'Зарядка',
    /**
     * ⚠️ БЕЗ `minHeight: 100vh`. С ним рамка занимала ВСЮ высоту окна и лезла
     * под шапку каркаса: заголовок «Глаза и дыхание» оказывался за страницей.
     * Рамка обязана занимать ровно то место, что ей оставил каркас, — отсюда
     * `flex: 1` и высота от родителя.
     */
    style: {
      border: 'none',
      width: '100%',
      height: '100%',
      flex: 1,
      display: 'block',
      background: 'transparent',
    },
    allow: 'autoplay; fullscreen',
  });
}

const styles = StyleSheet.create({
  заглушка: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  текстЗаглушки: { fontSize: 16, textAlign: 'center', opacity: 0.7 },
});
