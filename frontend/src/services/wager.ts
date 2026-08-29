/* psygames-wager · VER 1 · 29.08.2026 */
/**
 * СТАВКА «ВСЁ ИЛИ НИЧЕГО» — решение Дениса по чек-листу экономики 28.08 (С3),
 * механика Duolingo double-or-nothing: ставишь 300 ⭐ — семь дней подряд с отметкой
 * дня → забираешь 600. Пропустил день — ставка сгорает.
 *
 * ЗАЧЕМ. Сток жетонов + ретеншн: у ядра тестеров (замер 28.08: 400–500 ⭐/день,
 * магазин выкуплен) жетонам некуда деваться, а ставка превращает излишек в
 * ежедневный повод открыть приложение с риском на кону.
 *
 * 🔴 ЩИТ СЕРИИ СТАВКУ НЕ СПАСАЕТ — намеренно. Щит чинит стрик чек-ина, а ставка
 * ведёт СВОЙ счёт дней (lastSeen ниже): восстановленный щитом стрик не воскрешает
 * сгоревшую ставку, иначе связка «щит + ставка» убила бы сам риск, ради которого
 * ставка существует. Это закреплено тестом.
 *
 * Дни считаются той же dayStr-логикой, что и стрик (календарные сутки устройства):
 * день ставки — день 1 (отметка дня в момент ставки уже случилась или случится
 * этим же днём), выплата — на седьмом подряд.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addTokens, spendTokens } from '@/src/services/tokens';

export const WAGER_STAKE = 300;
export const WAGER_DAYS = 7;
export const WAGER_PRIZE = WAGER_STAKE * 2;

const WAGER_KEY = 'psygames_wager_v1';

function dayStr(d: Date): string { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function yesterdayStr(now: Date): string { const y = new Date(now); y.setDate(y.getDate() - 1); return dayStr(y); }

interface WagerRec {
  stake: number;
  /** День ставки (день 1). */
  start: string;
  /** Последний засчитанный день. */
  lastSeen: string;
  /** Сколько дней подряд уже засчитано (1..WAGER_DAYS). */
  daysDone: number;
}

export type WagerState =
  | { kind: 'none' }
  | { kind: 'active'; daysDone: number; daysTotal: number; prize: number }
  | { kind: 'won'; prize: number }
  | { kind: 'lost'; stake: number };

async function readAll(): Promise<Record<string, WagerRec>> {
  try { const raw = await AsyncStorage.getItem(WAGER_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
async function writeAll(data: Record<string, WagerRec>): Promise<void> {
  try { await AsyncStorage.setItem(WAGER_KEY, JSON.stringify(data)); } catch {}
}

/**
 * Поставить. Списывает ставку сразу (как покупку способности); false — не хватило
 * жетонов или ставка уже стоит.
 */
export async function placeWager(profileId: string, now: Date = new Date()): Promise<boolean> {
  if (!profileId) return false;
  const data = await readAll();
  if (data[profileId]) return false;                     // одна ставка за раз
  const paid = await spendTokens(profileId, WAGER_STAKE);
  if (!paid) return false;
  const today = dayStr(now);
  data[profileId] = { stake: WAGER_STAKE, start: today, lastSeen: today, daysDone: 1 };
  await writeAll(data);
  return true;
}

/**
 * Тик дня — зовётся рядом с dailyCheckIn (idempotent за сутки). Продолжение —
 * день засчитан; разрыв — ставка сгорает; седьмой день — выплата ×2.
 */
export async function wagerTick(profileId: string, now: Date = new Date()): Promise<WagerState> {
  if (!profileId) return { kind: 'none' };
  const data = await readAll();
  const rec = data[profileId];
  if (!rec) return { kind: 'none' };
  const today = dayStr(now);
  if (rec.lastSeen === today) {
    return { kind: 'active', daysDone: rec.daysDone, daysTotal: WAGER_DAYS, prize: WAGER_PRIZE };
  }
  if (rec.lastSeen !== yesterdayStr(now)) {
    delete data[profileId];                              // пропуск дня — сгорела
    await writeAll(data);
    return { kind: 'lost', stake: rec.stake };
  }
  const daysDone = rec.daysDone + 1;
  if (daysDone >= WAGER_DAYS) {
    delete data[profileId];
    await writeAll(data);
    await addTokens(profileId, WAGER_PRIZE);
    return { kind: 'won', prize: WAGER_PRIZE };
  }
  data[profileId] = { ...rec, lastSeen: today, daysDone };
  await writeAll(data);
  return { kind: 'active', daysDone, daysTotal: WAGER_DAYS, prize: WAGER_PRIZE };
}

/** Состояние для витрины: читает и при разрыве честно показывает «сгорела» (не списывая молча). */
export async function peekWager(profileId: string, now: Date = new Date()): Promise<WagerState> {
  if (!profileId) return { kind: 'none' };
  const data = await readAll();
  const rec = data[profileId];
  if (!rec) return { kind: 'none' };
  const today = dayStr(now);
  if (rec.lastSeen === today || rec.lastSeen === yesterdayStr(now)) {
    return { kind: 'active', daysDone: rec.daysDone, daysTotal: WAGER_DAYS, prize: WAGER_PRIZE };
  }
  delete data[profileId];
  await writeAll(data);
  return { kind: 'lost', stake: rec.stake };
}
