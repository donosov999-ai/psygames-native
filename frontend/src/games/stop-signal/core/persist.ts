/* psygames-stop-signal-persist · VER 1 · 23.08.2026 */
/**
 * ЛЕСТНИЦА ПЕРЕЖИВАЕТ ПАРТИЮ — ИНАЧЕ ОНА НИКОГДА НЕ СОЙДЁТСЯ.
 *
 * 🔴 ПОЧЕМУ БЕЗ ЭТОГО ФАЙЛА ЗАМЕРА НЕТ. В партии 12…20 проб, стоп-проб из них
 * три-пять. Начиная каждый заход заново с 250 мс, лестница может уйти от старта
 * максимум на 250 мс — а медленному игроку до его точки схождения бывает и
 * 480 мс. То есть при сбросе между партиями задержка НИКОГДА не доходит туда,
 * где доля торможений равна половине, и SSRT считать не из чего. Поэтому и
 * ступень, и сами пробы хранятся между заходами.
 *
 * ⚠️ ХРАНИЛИЩЕ — ОДИН КЛЮЧ, РАЗБОР — ЧИСТАЯ ФУНКЦИЯ. `parseLadder` не ходит в
 * AsyncStorage и проверяется прогоном напрямую: мусор в хранилище (обрывок
 * JSON, чужая версия формата, отрицательная задержка) обязан давать пустую
 * лестницу, а не падение экрана посреди партии.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { POOL_MAX_TRIALS, SSD_START_MS, clampSsd } from './ladder';
import type { StopSignalTrial } from './ssrt';

export const LADDER_KEY = 'psygames_stop_signal_ladder';

export interface LadderState {
  /** Ступень, с которой пойдёт следующая стоп-проба. */
  ssdMs: number;
  /** Окно проб, по которому считается SSRT. */
  trials: StopSignalTrial[];
}

export const EMPTY_LADDER: LadderState = { ssdMs: SSD_START_MS, trials: [] };

function parseTrial(raw: unknown): StopSignalTrial | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const goWindowMs = Number(t.goWindowMs);
  if (!Number.isFinite(goWindowMs) || goWindowMs <= 0) return null;
  const rt = Number(t.rtMs);
  const ssd = Number(t.ssdMs);
  return {
    isStop: t.isStop === true,
    ssdMs: Number.isFinite(ssd) ? ssd : null,
    rtMs: t.rtMs === null || !Number.isFinite(rt) ? null : rt,
    goWindowMs,
  };
}

/** Разбор сохранённого. Любая неожиданность — пустая лестница, без исключений наружу. */
export function parseLadder(raw: string | null): LadderState {
  if (!raw) return EMPTY_LADDER;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const ssd = Number(parsed?.ssdMs);
    const list = Array.isArray(parsed?.trials) ? (parsed.trials as unknown[]) : [];
    const trials = list.map(parseTrial).filter((t): t is StopSignalTrial => t !== null);
    return {
      ssdMs: Number.isFinite(ssd) ? clampSsd(ssd) : SSD_START_MS,
      trials: trials.length > POOL_MAX_TRIALS ? trials.slice(trials.length - POOL_MAX_TRIALS) : trials,
    };
  } catch {
    return EMPTY_LADDER;
  }
}

export async function loadLadder(): Promise<LadderState> {
  try {
    return parseLadder(await AsyncStorage.getItem(LADDER_KEY));
  } catch {
    return EMPTY_LADDER;
  }
}

export async function saveLadder(state: LadderState): Promise<void> {
  try {
    await AsyncStorage.setItem(LADDER_KEY, JSON.stringify(state));
  } catch {}
}
