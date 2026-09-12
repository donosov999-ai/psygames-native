/* psygames-number-run-adapter · VER 1 · 12.09.2026 · psygames-claude-mac */
/**
 * ЧИСЛОВОЙ ЗАБЕГ — ВЕБ-АДАПТЕР ЯДРА ЛАБОРАТОРИИ К КАРКАСУ ПРИЛОЖЕНИЯ.
 *
 * Игру собрал `psygames-codex-mac` как LOCAL 0.4 (`renderer-lab/`), передал
 * инструкцией `RUNNER_INTEGRATION_FOR_CLAUDE.md` VER 1 от 12.09.2026. Сюда
 * перенесены ТОЛЬКО перечисленные там модули; `runner.js`, `runner.html` и
 * `runner.css` — эталон поведения, а не файлы для импорта: они завязаны на
 * глобальные DOM-id и отдельную страницу.
 *
 * ━━━ ЧТО ЭТОТ ФАЙЛ ДЕЛАЕТ И ЧЕГО НАРОЧНО НЕ ДЕЛАЕТ ━━━
 *
 * Делает: контейнер под WebGL, ввод пальцем, кадровый цикл, синхронную паузу,
 * сохранение checkpoint и уборку за собой.
 * НЕ делает: шапку, HUD, меню паузы, итог — это GameShell и route. Второго
 * полного экрана внутри первого здесь нет, iframe нет.
 *
 * 🔴 СОСТОЯНИЕ ЖИВЁТ В `ref`, А НЕ В `useState`. Забег идёт 120 кадров в
 * секунду; провести через React каждый кадр значит перерисовывать весь каркас
 * вместе с шапкой и питомцем. Наружу отдаём только ЗНАЧЕНИЯ для HUD и только
 * когда они изменились.
 *
 * 🔴 ОДИН ЦИКЛ rAF НА ЭКРАН. Повторный вход в маршрут или возврат с другого
 * экрана не должен оставить второй цикл: отсюда `rafRef` и снятие в `cleanup`.
 *
 * ⚠️ ВЕБ-ТОЛЬКО ПО ИМЕНИ ФАЙЛА (`.web.tsx`). Приложение на iOS и Android — это
 * Tauri, то есть WebView, и веб-сборка там и работает; отдельной нативной ветки
 * у раннера нет и не требуется (Skia/Filament/Fabric сюда не нужны — см.
 * `PLATFORM_AND_RENDERING_FACTS.md`).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

/** Значения для шапки — единственное, что уходит в React каждый раз. */
export interface ПоказателиЗабега {
  число: number;
  этап: number;
  этапов: number;
  столкновений: number;
  секунд: number;
}

/** Итог всей партии. Одна запись на ЗАБЕГ, а не на этап (контракт адаптера). */
export interface ИтогЗабега {
  победа: boolean;
  число: number;
  этаповПройдено: number;
  столкновений: number;
  активныхСекунд: number;
  причина: 'дошёл' | 'упал' | 'вышел' | 'графика';
}

interface Props {
  /** Зерно маршрута. Одно и то же зерно даёт тот же забег. */
  зерно: number;
  /** Ручная пауза каркаса. Ядро останавливается СИНХРОННО, а не прикрывается окном. */
  пауза: boolean;
  onПоказатели: (п: ПоказателиЗабега) => void;
  onИтог: (и: ИтогЗабега) => void;
  фон: string;
  цветТекста: string;
}

type Ядро = typeof import('./runner-core.mjs');
type Кампания = typeof import('./runner-campaign.mjs');
type Сцена = typeof import('./runner-scene.mjs');

export default function NumberRunGame({ зерно, пауза, onПоказатели, onИтог, фон, цветТекста }: Props) {
  const контейнер = useRef<View | null>(null);
  const rafRef = useRef<number | null>(null);
  const состояние = useRef<any>(null);
  const маршрут = useRef<any>(null);
  const сцена = useRef<any>(null);
  const ядро = useRef<Ядро | null>(null);
  const прошлоеВремя = useRef<number | null>(null);
  const тащим = useRef<{ id: number; startX: number; target: number } | null>(null);
  const итогОтдан = useRef(false);
  const прошлыеПоказатели = useRef('');
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [готово, setГотово] = useState(false);

  /**
   * ⚠️ ПОКАЗАТЕЛИ НАРУЖУ — ТОЛЬКО ПРИ ИЗМЕНЕНИИ. Сравниваем сведённую строку, а
   * не объект: иначе каждый кадр создаёт новый объект и React перерисовывает
   * шапку 120 раз в секунду, хотя цифры те же.
   */
  const отдатьПоказатели = useCallback(() => {
    const s = состояние.current; if (!s) return;
    const п: ПоказателиЗабега = {
      число: Math.round(s.sum),
      этап: s.stage ?? 1,
      этапов: маршрут.current?.stages ?? 12,
      столкновений: s.hits ?? 0,
      секунд: Math.round(s.elapsed ?? 0),
    };
    const ключ = `${п.число}|${п.этап}|${п.столкновений}|${п.секунд}`;
    if (ключ === прошлыеПоказатели.current) return;
    прошлыеПоказатели.current = ключ;
    onПоказатели(п);
  }, [onПоказатели]);

  /* ── создание сцены и ядра: ТОЛЬКО на клиенте, после mount ──────────────── */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let живо = true;

    void (async () => {
      try {
        /**
         * 🔴 ЛЕНИВАЯ ЗАГРУЗКА. Three и сцена весят заметно, и тянуть их на
         * каждом экране приложения нельзя: импорт стоит ЗДЕСЬ, внутри эффекта
         * игрового экрана, а не в начале модуля и не в реестре игр.
         */
        const [c, k, sc] = await Promise.all([
          import('./runner-core.mjs') as Promise<Ядро>,
          import('./runner-campaign.mjs') as Promise<Кампания>,
          import('./runner-scene.mjs') as Promise<Сцена>,
        ]);
        if (!живо) return;
        ядро.current = c;
        маршрут.current = k.makeCampaign(зерно);
        состояние.current = c.initial(маршрут.current);

        const узел = контейнер.current as unknown as HTMLElement | null;
        if (!узел) { setОшибка('нет контейнера'); return; }
        сцена.current = sc.createScene(узел);
        сцена.current.load(маршрут.current);

        /**
         * ⚠️ ПОТЕРЯ WEBGL — ЭТО ОСТАНОВКА С СОХРАНЕНИЕМ, а не молча идущий
         * невидимый забег. Требование инструкции, §«Контракт адаптера».
         */
        сцена.current.canvas?.addEventListener('webglcontextlost', (e: Event) => {
          e.preventDefault();
          состояние.current = ядро.current!.pause(состояние.current, 'webgl');
          завершить('графика');
          setОшибка('Графика остановлена. Позиция сохранена.');
        });

        состояние.current = c.resume(состояние.current);
        setГотово(true);
        отдатьПоказатели();
        rafRef.current = requestAnimationFrame(кадр);
      } catch (e: any) {
        setОшибка(String(e?.message ?? e));
      }
    })();

    return () => {
      живо = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try { сцена.current?.destroy?.(); } catch { /* сцена могла не создаться */ }
      сцена.current = null;
    };
    // зерно меняется только при новой партии — экран пересоздаётся целиком
  }, [зерно]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ── ручная пауза каркаса: ядро СИНХРОННО, а не окном поверх ────────────── */
  useEffect(() => {
    const c = ядро.current, s = состояние.current;
    if (!c || !s) return;
    if (пауза && s.status === 'running') состояние.current = c.pause(s, 'manual');
    if (!пауза && s.status === 'paused') {
      состояние.current = c.resume(s);
      // 🔴 Сброс отметки времени: иначе следующий кадр получит весь простой
      // одним `dt` и забег «телепортируется» вперёд.
      прошлоеВремя.current = null;
    }
  }, [пауза]);

  const завершить = useCallback((причина: ИтогЗабега['причина']) => {
    if (итогОтдан.current) return;
    итогОтдан.current = true;
    const s = состояние.current;
    onИтог({
      победа: s?.status === 'won',
      число: Math.round(s?.sum ?? 0),
      этаповПройдено: s?.clearedStages ?? 0,
      столкновений: s?.hits ?? 0,
      активныхСекунд: Math.round(s?.elapsed ?? 0),
      причина,
    });
  }, [onИтог]);

  const кадр = useCallback((now: number) => {
    const c = ядро.current, s = состояние.current;
    if (!c || !s) return;
    /**
     * ⚠️ СКРЫТАЯ СТРАНИЦА ЗАМОРАЖИВАЕТ СИМУЛЯЦИЮ, но кадр продолжает
     * запрашиваться: иначе при возврате не с чего продолжить. Отметка времени
     * сбрасывается, чтобы не было догоняющего скачка.
     */
    if (typeof document !== 'undefined' && document.hidden) {
      прошлоеВремя.current = null;
      rafRef.current = requestAnimationFrame(кадр);
      return;
    }
    const dt = прошлоеВремя.current === null ? 0 : (now - прошлоеВремя.current) / 1000;
    прошлоеВремя.current = now;

    if (s.status === 'running') {
      // `advanceFrame` сам дробит большой dt на шаги `FIXED_DT` — большому кадру
      // нельзя попадать в `step` напрямую (контракт).
      состояние.current = c.advanceFrame(s, dt, маршрут.current);
      отдатьПоказатели();
      const st = состояние.current.status;
      if (st === 'won') завершить('дошёл');
      else if (st === 'failed') завершить('упал');
    }
    try { сцена.current?.render(состояние.current, now); } catch { /* кадр пропускаем, забег живёт */ }
    rafRef.current = requestAnimationFrame(кадр);
  }, [завершить, отдатьПоказатели]);

  /* ── ввод: относительная протяжка, как в эталоне ────────────────────────── */
  const узелЖеста = useCallback((el: any) => {
    контейнер.current = el;
    if (!el || Platform.OS !== 'web') return;
    const dom = el as HTMLElement;
    /**
     * 🔴 ЗАЩИТА ЖЕСТА СТОИТ НА САМОМ УЗЛЕ, КОТОРЫЙ ЕГО ПРИНИМАЕТ (правило 6
     * UI_LAYOUT_RULES). Запрет с предка до вложенного узла не доходит, и палец
     * начинает двигать страницу вместо руления — это уже стоило нам «Точек».
     * Своего ScrollView вокруг руления здесь нет нарочно.
     */
    dom.style.touchAction = 'none';
    (dom.style as any).overscrollBehavior = 'contain';

    dom.addEventListener('pointerdown', (e: PointerEvent) => {
      const s = состояние.current; if (!s || s.status !== 'running') return;
      тащим.current = { id: e.pointerId, startX: e.clientX, target: s.target };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e: PointerEvent) => {
      const d = тащим.current, c = ядро.current; if (!d || d.id !== e.pointerId || !c) return;
      // Делитель 0,3 ширины — из эталона: полный размах руля примерно за треть экрана.
      состояние.current = c.setTarget(состояние.current, d.target + (e.clientX - d.startX) / (dom.clientWidth * 0.3));
    });
    const отпустить = (e: PointerEvent) => {
      if (тащим.current?.id !== e.pointerId) return;
      // ⚠️ В длинном забеге x НЕ округляем: руление свободное, дорожек нет.
      тащим.current = null;
      try { dom.releasePointerCapture(e.pointerId); } catch { /* палец мог уйти за окно */ }
    };
    dom.addEventListener('pointerup', отпустить);
    dom.addEventListener('pointercancel', отпустить);
  }, []);

  return (
    <View style={styles.поле} ref={узелЖеста as any} collapsable={false}>
      {ошибка ? (
        <View style={styles.середина}>
          <Text style={[styles.сообщение, { color: цветТекста }]}>{ошибка}</Text>
        </View>
      ) : !готово ? (
        <View style={[styles.середина, { backgroundColor: фон }]}>
          <Text style={[styles.сообщение, { color: цветТекста }]}>Собираем дорогу…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Поле занимает ВСЁ оставшееся место между полосами каркаса; размер камеры
  // сцена берёт из контейнера, а не из полной высоты окна (контракт).
  поле: { flex: 1, alignSelf: 'stretch', overflow: 'hidden' },
  середина: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  сообщение: { fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
});
