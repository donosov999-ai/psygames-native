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
