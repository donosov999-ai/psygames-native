/**
 * NativeInsetBridge — мост системных отступов Android → safe-area контекст, v1.162.0.
 *
 * ЗАЧЕМ. С targetSdk 35+ Android рисует приложение ОТ КРАЯ ДО КРАЯ: системные
 * панели лежат поверх контента. Мы — WebView внутри Tauri, а
 * react-native-safe-area-context на вебе берёт отступы ТОЛЬКО из CSS
 * `env(safe-area-inset-*)`. Chromium-WebView отдаёт там вырез экрана (чёлку),
 * но НЕ статус-бар и НЕ навигацию. Итог:
 *   • телефон с чёлкой   → сверху отступ есть, всё выглядит правильно;
 *   • телефон без чёлки  → env(top)=0, шапка уезжает под системные иконки.
 * Ровно это Google Play и написал: «Отображение от края до края может работать
 * НЕ У ВСЕХ пользователей» (предупреждение к v1.157.0).
 *
 * ПОЧЕМУ ТАК, А НЕ ПАДДИНГОМ СНИЗУ НАТИВНО (как сделано для навигации).
 * Нативный setPadding сжимает WebView, и в освободившейся полосе видно фон ОКНА,
 * а не приложения. Снизу это терпимо, сверху — нет: фон светлой темы #F5F5F7,
 * тёмной #000000, одним цветом окна оба не покрыть — под статус-баром вылезет
 * чужая полоса. Поэтому сверху и по бокам контент рисуется до края (фон красит
 * само приложение), а отступ отдаём в JS.
 *
 * КАК РАБОТАЕТ. MainActivity в слушателе инсетов зовёт evaluateJavascript и
 * кладёт значения в `window.__psyInsets` (уже в CSS-пикселях). Мы их читаем и
 * переопределяем SafeAreaInsetsContext, беря максимум с тем, что дал env().
 * Максимум — потому что на устройстве с чёлкой оба источника скажут правду, и
 * складывать их нельзя (получился бы двойной отступ).
 *
 * Провайдер стоит ОДИН раз в _layout, поэтому 62 игры и все компоненты получают
 * верные отступы через свой обычный useSafeAreaInsets()/SafeAreaView — правок
 * по файлам не требуется.
 *
 * Снизу мост НИЧЕГО не добавляет: там паддинг уже наложен нативно (иначе кнопки
 * игр перекрывались навигацией — репорт Вали «кнопка "играть" не видна»), и
 * добавка сверху этого дала бы двойной зазор.
 */
import React from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

export interface NativeInsets { top: number; bottom: number; left: number; right: number }

declare global {
  // eslint-disable-next-line no-var
  var __psyInsets: NativeInsets | undefined;
}

/** Событие, которым нативный слой сообщает об изменении (поворот, смена режима навигации). */
export const PSY_INSETS_EVENT = 'psy-insets';

/** Сколько ждём первую публикацию от нативного слоя после монтирования. */
const POLL_MS = 250;
const POLL_TRIES = 12;   // ~3 секунды — с запасом на холодный старт WebView

function readNative(): NativeInsets | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const v = (window as any).__psyInsets;
  if (!v || typeof v.top !== 'number') return null;
  return { top: v.top || 0, bottom: v.bottom || 0, left: v.left || 0, right: v.right || 0 };
}

export default function NativeInsetBridge({ children }: { children: React.ReactNode }) {
  const env = useSafeAreaInsets();
  const [native, setNative] = React.useState<NativeInsets | null>(() => readNative());

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const apply = () => setNative(readNative());
    window.addEventListener(PSY_INSETS_EVENT, apply);
    // Нативный слой мог опубликовать значения ДО того, как смонтировался React
    // (слушатель инсетов срабатывает на первой же раскладке). Событие тогда уже
    // прошло мимо — поэтому ещё и опрашиваем, пока значения не появятся.
    let tries = 0;
    const id = setInterval(() => {
      if (readNative() || ++tries >= POLL_TRIES) { apply(); clearInterval(id); }
    }, POLL_MS);
    return () => { window.removeEventListener(PSY_INSETS_EVENT, apply); clearInterval(id); };
  }, []);

  const merged = React.useMemo(() => {
    if (!native) return env;
    return {
      top: Math.max(env.top, native.top),
      left: Math.max(env.left, native.left),
      right: Math.max(env.right, native.right),
      bottom: env.bottom,   // низ уже отработан нативным паддингом — не удваиваем
    };
  }, [env, native]);

  return <SafeAreaInsetsContext.Provider value={merged}>{children}</SafeAreaInsetsContext.Provider>;
}
