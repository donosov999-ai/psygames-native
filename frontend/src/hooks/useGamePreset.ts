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
  const isPreset = params?.wu === '1';

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

  return { isPreset, params, str, num, bool };
}

/**
 * Вызывает `start()` ровно один раз на mount, если `enabled` (= запущено из зарядки).
 * Конфиг-state к этому моменту уже проинициализирован из params через useState-initializers.
 */
export function useAutostart(enabled: boolean, start: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (enabled && !done.current) {
      done.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
