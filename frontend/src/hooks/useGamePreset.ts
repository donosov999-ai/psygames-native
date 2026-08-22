import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';

/**
 * Хук для игр, запускаемых из зарядки/комплекса с пресетом.
 *
 * warmup-bridge / WarmupContext передают настройки шага через URL-params
 * (см. `stepToParams` в `src/services/warmup.ts`): `wu=1`, `diff`, `mode`,
 * `trials`, + произвольные `settings`. Игра читает их и:
 *   1) инициализирует свой config-state из params (через `useState(() => ...)`),
 *   2) авто-стартует на mount (пропуск intro/config-экрана) — см. `useAutostart`.
 *
 * Игры БЕЗ этого хука просто игнорируют лишние params — обратная совместимость.
 *
 * Пример:
 *   const { isPreset, str, num } = useGamePreset();
 *   const [difficulty] = useState<Difficulty>(() => (str('diff','medium') as Difficulty));
 *   const [pairCount]  = useState(() => num('pairCount', 10));
 *   useAutostart(isPreset, startGame);   // startGame() один раз на mount
 */
export function useGamePreset() {
  const params = useLocalSearchParams<Record<string, string>>();
  /**
   * wu=1 — шаг ПЛЕЙЛИСТА зарядки. В этом режиме игры намеренно не двигают уровень:
   * `passed = !isPreset && …` стоит в 36 экранах.
   *
   * ⚠️ Ежедневный вызов раньше тоже слался с wu=1 (challengeToParams звал stepToParams,
   * а тот всегда ставит wu). Из-за этого он молча не засчитывал уровни: «я не сделала ни
   * одной ошибки, почему не открывается следующий уровень?», «уровней 15, но дальше
   * первого я не ухожу» — два репорта Вали на v1.185.0, вызов дня как раз был Choice RT.
   * Теперь вызов шлёт auto=1: игра стартует сама, но считается обычным раундом.
   */
  const isPreset = params?.wu === '1';
  /** Стартовать сразу, минуя intro/config: и шаг зарядки, и вызов дня. */
  const autostart = isPreset || params?.auto === '1';

  const str = (key: string, def = ''): string => {
    const v = (params as Record<string, unknown>)?.[key];
    return typeof v === 'string' && v.length > 0 ? v : def;
  };
  const num = (key: string, def: number): number => {
    const v = (params as Record<string, unknown>)?.[key];
    const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : def;
  };
  const bool = (key: string, def = false): boolean => {
    const v = (params as Record<string, unknown>)?.[key];
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
    return def;
  };

  /**
   * Вечерний шаг зарядки: без гонки. Ставится в stepToParams по СЛОТУ.
   * Игра, у которой есть обратный отсчёт или видимый секундомер, обязана
   * убрать их при isCalm — см. репорт «нельзя таймер» от 18.08.2026.
   */
  const isCalm = params?.calm === '1';
  return { isPreset, isCalm, autostart, params, str, num, bool };
}

/**
 * Вызывает `start()` ровно один раз, когда `enabled` впервые становится true.
 * Обычно это mount зарядки; отложенное true позволяет дождаться обязательной
 * асинхронной готовности (например, языка) и не стартовать с временным EN.
 */
/**
 * Автостарт, ждущий готовности — ЛЕНИВО.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ФОРМА. Уровень грузится асинхронно, и `useAutostart(autostart, …)`
 * стартовал раньше, чем он приезжал: «Вызов дня» играл ПЕРВЫЙ уровень человеку с
 * двенадцатым. Тот безупречно проходил чужую лёгкую задачу, а уровень не двигался —
 * `reach(2)` при достигнутом 12 не делает ничего. Дословный репорт: «уровней 15, но
 * дальше первого я не ухожу». Лекарство `autostart && lvl.loaded` было написано и
 * стояло в двух играх из шестидесяти шести.
 *
 * ⚠️ ПОЧЕМУ ГОТОВНОСТЬ — ФУНКЦИЯ, А НЕ ЗНАЧЕНИЕ. Вызов автостарта в экранах стоит ВЫШЕ
 * объявления уровня: значение там ещё не существует, а замыкание — можно (ровно так
 * работал прежний `useEffect`). Функция позволяет вылечить все экраны на месте, не
 * перетасовывая их код и не рискуя порядком хуков.
 *
 * Эффект без списка зависимостей — нарочно: готовность приходит позже, и её нужно
 * перепроверить на следующем кадре. Один булев вызов на рендер до первого старта.
 */
export function useAutostartWhenReady(ready: () => boolean, start: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready()) return;
    done.current = true;
    start();
  });
}

export function useAutostart(enabled: boolean, start: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (enabled && !done.current) {
      done.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
