/**
 * cleanRun — серия чистых раундов подряд (errors === 0), per-profile, персист.
 * Тикается из saveSession (единая точка «раунд завершён»). Бонус за серию
 * начисляется там же, но вне зарядки — у зарядки свой comboBonus ×1.5
 * (warmup-complete), не задваиваем.
 *
 * Module-кэш держит синхронно-консистентное значение: в играх setPhase('cleared')
 * стоит ДО await saveSession, поэтому LevelCleared может читать серию в гонке
 * с тиком — кэш отдаёт последнее значение без ожидания AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CLEAN_RUN_MIN = 3;
const KEY_PREFIX = 'psygames_clean_run_';

let mem: { pid: string; run: number } | null = null;

async function load(pid: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + pid);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch { return 0; }
}

export async function getCleanRun(pid: string): Promise<number> {
  if (mem?.pid === pid) return mem.run;
  const run = await load(pid);
  mem = { pid, run };
  return run;
}

/** Раунд завершён: чистый → серия+1, грязный → сброс. Возвращает новую длину серии. */
export async function tickCleanRun(pid: string, clean: boolean): Promise<number> {
  const prev = await getCleanRun(pid);
  const run = clean ? prev + 1 : 0;
  mem = { pid, run };
  try { await AsyncStorage.setItem(KEY_PREFIX + pid, String(run)); } catch {}
  return run;
}

/** Бонус токенов за чистую серию: с CLEAN_RUN_MIN-го чистого подряд, растёт до +15. */
export function cleanRunBonus(run: number): number {
  return run >= CLEAN_RUN_MIN ? 5 + Math.min(run, 10) : 0;
}
