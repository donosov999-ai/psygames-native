/* psygames-earn · VER 1 · 20.08.2026 */
/**
 * ЗАРАБОТОК ЗА ПАРТИЮ — одно правило на всё приложение и журнал, по которому его видно.
 *
 * 🔴 ЧТО БЫЛО ДО. Очки начислялись в `saveSession` формулой `tokenDelta(score, errors)`
 * плюс аддитивная надбавка за серию чистых (`cleanRunBonus`, +8…+15). Чистая партия и
 * партия с ошибками отличались только тем, что ошибки УРЕЗАЛИ счёт — отдельной награды
 * за «сыграл идеально» не было, множителя не было вовсе, а сам факт начисления человек
 * нигде не видел: баланс просто однажды оказывался другим. Магазин с ценами при этом
 * работал (`app/shop.tsx`), то есть деньги были — а откуда они, не говорилось.
 *
 * ЧТО ЗДЕСЬ ТЕПЕРЬ. Одна функция считает начисление за раунд (`earnForRound`), один
 * журнал хранит, что и сколько принесло (`recordRound` / `todayEarnings`), и оба экрана
 * итога и главный экран читают ИМЕННО ЕГО, а не пересчитывают формулу у себя. Второго
 * источника правды нет нарочно: пока GameResult считал `tokenDelta` сам, любая правка
 * экономики расходилась с показанным числом молча.
 *
 * ── ПРАВИЛО МНОЖИТЕЛЯ (одно на приложение, не по игре) ──
 *
 *   база       = tokenDelta(score, errors)      — как и было, 0…50 за партию
 *   ×2 «чисто» = партия без ошибок и с результатом (errors === 0 && score > 0)
 *   ×2 «режим» = серия тренировочных дней подряд ≥ DAY_STREAK_FOR_MULT
 *
 * Множитель ОДИН и он ×2: чистая партия на серии не даёт ×4. Складывать их значило бы
 * платить вчетверо за самую дешёвую партию тому, кто и так заходит каждый день, —
 * ровно та печать монет, которой правило и должно мешать.
 *
 * ⚠️ ИГРЫ, ГДЕ ОШИБОК НЕ БЫВАЕТ. Дыхание и гимнастика для глаз пишут `errors: 0`
 * ВСЕГДА — им нечего засчитывать в ошибки. Формально они «чисты» каждый раз, и это
 * оставлено намеренно: у практики нет идеального прохождения, там «чисто» означает
 * «довёл до конца и результат записан». Бесконечных монет это не даёт по той же
 * причине, что и у остальных, — из-за суточной квоты ниже, которая одна на все игры.
 *
 * ── ЧТО ПРИНОСИТ ВАЛЮТУ (и почему не задваивается) ──
 *
 *   свободная партия  — база × множитель. Основной путь.
 *   переигровка       — база всегда; множитель — только пока не выбрана СУТОЧНАЯ КВОТА
 *                       (MULT_ROUNDS_PER_GAME_PER_DAY удвоенных партий в ОДНОЙ игре за
 *                       календарные сутки). Четвёртый прогон того же лёгкого уровня
 *                       сегодня даёт базу — повтор перестаёт быть станком.
 *   шаг зарядки       — база БЕЗ множителя: у комплекса свой бонус за серию чистых на
 *                       финише (`comboBonus` ×1.5, warmup-complete). Удваивать ещё и
 *                       каждый шаг — это платить дважды за одно и то же.
 *   достигнутая цель  — фиксированные `DAY_GOAL_REWARD`, один раз в календарные сутки и
 *                       ТОЛЬКО в день, где партии были (`goalReward` ниже). Единственное
 *                       начисление не за партию — потому и обставлено отдельно.
 *
 * ⚠️ КВОТА СЧИТАЕТСЯ ПО ЖУРНАЛУ, А НЕ ОТДЕЛЬНЫМ СЧЁТЧИКОМ. Журнал всё равно нужен для
 * блока «Сегодня» на главной; заводить рядом второй счётчик значит завести второй
 * источник правды, который однажды разойдётся с первым.
 *
 * ⚠️ АДДИТИВНАЯ НАДБАВКА ЗА СЕРИЮ УБРАНА (была `cleanRunBonus`). Иначе за одну и ту же
 * чистоту платили бы дважды — и множителем, и надбавкой. Счётчик серии (`cleanRun`)
 * остался: он показывает 🔥 на баннере уровня, но деньги идут только через множитель.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GoalOutcome } from '@/src/services/dailyGoal';
import { addTokens, tokenDelta, TOKEN_DELTA_CAP } from '@/src/services/tokens';

/** Единственный множитель в приложении. */
export const MULTIPLIER = 2;
/**
 * Сколько партий в ОДНОЙ игре за календарные сутки получают множитель.
 * Три — потому что обычный заход (авто-цепочка уровней после `LevelCleared`) в них
 * укладывается, а гринд одного лёгкого уровня — нет.
 */
export const MULT_ROUNDS_PER_GAME_PER_DAY = 3;
/** С какого дня подряд множитель даётся и за режим, а не только за чистоту. */
export const DAY_STREAK_FOR_MULT = 3;
/** Насколько свежим считается начисление, показываемое экраном итога. */
export const FRESH_MS = 10000;

const KEY = 'psygames_earn_v1';
/** Подробности держим за сегодня и вчера — блоку «Сегодня» больше не нужно. */
const ENTRY_DAYS_KEPT = 2;
/** Предохранитель на случай очень длинного дня: журнал не растёт бесконечно. */
const MAX_ENTRIES = 300;
/** Метки дней — только для подсчёта серии, поэтому их держим дольше и они дёшевы. */
const DAYS_KEPT = 60;

/**
 * Почему вышло столько. Показывается человеку словами на экране итога — начисление,
 * о котором не сказали, работы не делает.
 */
export type EarnReason =
  | 'clean'    // ×2 — сыграл без ошибок
  | 'streak'   // ×2 — серия тренировочных дней
  | 'repeat'   // ×1 — суточная квота множителя в этой игре уже выбрана
  | 'warmup'   // ×1 — шаг зарядки, множитель отдан комплексу
  | 'plain'    // ×1 — партия с ошибками и без серии
  | 'none';    // 0  — начислять нечего

export interface Earned {
  base: number;
  multiplier: number;
  total: number;
  reason: EarnReason;
  clean: boolean;
  dayStreak: number;
}

export interface EarnEntry {
  ts: number;
  day: string;
  game: string;
  base: number;
  multiplier: number;
  total: number;
  reason: EarnReason;
}

interface ProfileLog { entries: EarnEntry[]; days: string[] }
type Store = Record<string, ProfileLog>;

/** Календарные сутки МЕСТНОГО времени — тот же формат, что у стрика в tokens.ts. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ── правило (чистая функция — её и проверяет гейт) ───────────────────────────

export interface RoundInput {
  score: number | undefined;
  errors: number | undefined;
  /** Партия идёт шагом зарядки (`__psygames_warmup_active`). */
  warmupStep: boolean;
  /** Сколько партий В ЭТОЙ ЖЕ игре уже удвоено сегодня. */
  doubledToday: number;
  /** Тренировочных дней подряд, считая сегодняшний. */
  dayStreak: number;
}

/**
 * Сколько дать за раунд и за что. Порядок веток — это и есть приоритет правила:
 * сначала «нечего давать», потом «множитель отдан другому механизму», потом квота,
 * и только затем сами основания для ×2.
 */
export function earnForRound(i: RoundInput): Earned {
  const base = tokenDelta(i.score ?? 0, i.errors ?? 0);
  const clean = (i.errors ?? 0) === 0 && (i.score ?? 0) > 0;
  const flat = (reason: EarnReason): Earned =>
    ({ base, multiplier: 1, total: base, reason, clean, dayStreak: i.dayStreak });
  const doubled = (reason: EarnReason): Earned =>
    ({ base, multiplier: MULTIPLIER, total: base * MULTIPLIER, reason, clean, dayStreak: i.dayStreak });

  if (base <= 0) return flat('none');
  if (i.warmupStep) return flat('warmup');
  if (i.doubledToday >= MULT_ROUNDS_PER_GAME_PER_DAY) return flat('repeat');
  if (clean) return doubled('clean');
  if (i.dayStreak >= DAY_STREAK_FOR_MULT) return doubled('streak');
  return flat('plain');
}

// ── цель дня: единственное начисление НЕ за партию ───────────────────────────

/**
 * НАГРАДА ЗА ДОСТИГНУТУЮ ЦЕЛЬ ДНЯ.
 *
 * 🔴 ПОЧЕМУ ЭТО ОПАСНОЕ МЕСТО. Цель дня человек ставит СЛОВАМИ и сам же отмечает, как
 * вышло: это самооценка, а не измерение. Значит, награда здесь оплачивает не результат,
 * а нажатие — и ровно два правила удерживают её от того, чтобы стать раздачей монет за
 * тап и заодно платой за враньё:
 *
 *   1. ЗА «НЕ СЕГОДНЯ» НЕ СНИМАЕТСЯ НИЧЕГО — ни очков, ни серии, ни множителя. Как
 *      только честный ответ начнёт стоить денег, честных ответов не станет: карточка
 *      задумана разговором с собой, а разговор с собой не ведут за деньги. Поэтому в
 *      правиле ниже НЕТ ветки с отрицательной суммой — и появиться ей неоткуда.
 *   2. БЕЗ ЕДИНОЙ ПАРТИИ СЕГОДНЯ НЕ ПЛАТИМ. Отметка «получилось» в день, когда
 *      приложение только открыли, — это очки за одно нажатие. Факт тренировки берём из
 *      ТОГО ЖЕ журнала, что и блок «Сегодня» (`todayEarnings().rounds`): второго счёта
 *      партий в приложении нет, и заводить его ради награды значило бы завести способ
 *      разойтись с показанным числом.
 *
 * ⚠️ ПЛАТИМ РОВНО РАЗ В КАЛЕНДАРНЫЕ СУТКИ. Идемпотентность держится не таймером «24
 * часа с момента», а тем же `dayKey`, что у журнала и вызова дня: запись цели живёт
 * ровно сутки, а повторную отметку отбивает уже проставленный `outcome`
 * (см. `markGoalOutcome` в dailyGoal.ts).
 *
 * ── ОТКУДА ЧИСЛО (замер 20.08.2026, настоящий `recordRound` на настоящем хранилище) ──
 *
 *   день «только зарядка», 3 шага без множителя ............  56 ⭐
 *   день «зарядка + 3 свободные партии» ....................  174 ⭐ (≈29 ⭐ за партию)
 *   день «3 дешёвые партии со сбоями» ......................  25 ⭐ (≈8 ⭐ за партию)
 *   плотный день, 10 партий ................................  320 ⭐ (≈32 ⭐ за партию)
 *   лучшая одиночная партия (чистая, ×2) ...................  100 ⭐ — потолок
 *
 * Отсюда `TOKEN_DELTA_CAP / 2` = 25 ⭐: это средняя партия обычного дня (29 и 32 в двух
 * дневных раскладах), то есть заметно — и это ЧЕТВЕРТЬ лучшей партии, то есть сыграть
 * по-прежнему выгоднее, чем отметить. В дне 3–10 партий и ровно одна цель, поэтому
 * награда остаётся 8–14 % обычного дня и партии не обесценивает.
 *
 * ⚠️ ЧИСЛО ПРИВЯЗАНО К ПОТОЛКУ ПАРТИИ, А НЕ НАПИСАНО ЛИТЕРАЛОМ. Связь «награда за
 * отметку строго меньше, чем за лучшую партию» должна пережить правку экономики: пока
 * стояло бы 25, поднятый вдвое потолок оставил бы награду прежней молча, а опущенный
 * втрое сделал бы отметку выгоднее игры — тоже молча.
 */
export const DAY_GOAL_REWARD = Math.round(TOKEN_DELTA_CAP / 2);

/** Почему вышло столько. Показывается человеку словами — как и причина за партию. */
export type GoalRewardReason =
  | 'paid'        // цель достигнута в день с партиями — платим
  | 'notToday'    // честный ответ «не сегодня»: ноль, и ничего не отнимаем
  | 'noRounds'    // цель отмечена, но сегодня не сыграно ни одной партии
  | 'alreadyPaid';// исход за эти сутки уже отмечен — второй раз не платим

export interface GoalRewardDecision { amount: number; reason: GoalRewardReason }

/**
 * Сколько дать за отметку цели. Порядок веток — приоритет правила: сначала «сутки уже
 * закрыты», потом «ответ не тот», потом «не играл», и только затем плата.
 */
export function goalReward(i: {
  outcome: GoalOutcome;
  /** Партий в журнале за СЕГОДНЯ у этого профиля. */
  roundsToday: number;
  /** Исход за эти сутки уже отмечен. */
  alreadyMarked: boolean;
}): GoalRewardDecision {
  if (i.alreadyMarked) return { amount: 0, reason: 'alreadyPaid' };
  if (i.outcome !== 'done') return { amount: 0, reason: 'notToday' };
  if (i.roundsToday <= 0) return { amount: 0, reason: 'noRounds' };
  return { amount: DAY_GOAL_REWARD, reason: 'paid' };
}

/**
 * Сколько партий сыграно сегодня — тот же журнал, что у блока «Сегодня».
 * Отдельной функцией, чтобы у награды и у карточки был один и тот же счёт.
 */
export async function roundsToday(profileId: string, now: Date = new Date()): Promise<number> {
  return (await todayEarnings(profileId, now)).rounds;
}

/**
 * Серия тренировочных дней по меткам журнала.
 *
 * ⚠️ Считается от СЕГОДНЯ, а если сегодня партий ещё не было — от вчера: иначе утром,
 * до первой партии, честная серия показывалась бы нулём и обрывалась на глазах.
 */
export function streakFromDays(days: string[], now: Date = new Date()): number {
  const have = new Set(days);
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!have.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (have.has(dayKey(cur))) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

// ── журнал ───────────────────────────────────────────────────────────────────

let lastEarn: EarnEntry | null = null;
const listeners = new Set<(e: EarnEntry) => void>();

/** Последнее начисление этой сессии приложения — экран итога читает его без ожидания. */
export function getLastEarn(): EarnEntry | null { return lastEarn; }

/**
 * Оно же, но только пока свежее. Экраны итога монтируются РЯДОМ с `saveSession`, а не
 * строго после него, поэтому им нужны обе половины: то, что уже записано (здесь), и
 * подписка на то, что запишется через мгновение (`onEarn`). Без окна свежести карточка
 * следующего уровня показывала бы начисление за предыдущий.
 */
export function freshEarn(now: number = Date.now()): EarnEntry | null {
  return lastEarn && now - lastEarn.ts <= FRESH_MS ? lastEarn : null;
}

export function onEarn(cb: (e: EarnEntry) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Только для проверок: сбросить память модуля между случаями. */
export function __resetEarnMemory(): void { lastEarn = null; }

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch { return {}; }
}

function recentDays(now: Date, count: number): Set<string> {
  const out = new Set<string>();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < count; i++) { out.add(dayKey(d)); d.setDate(d.getDate() - 1); }
  return out;
}

export interface RecordInput {
  profileId: string;
  game: string;
  score: number | undefined;
  errors: number | undefined;
  warmupStep: boolean;
  now?: Date;
}

const ZERO: Earned = { base: 0, multiplier: 1, total: 0, reason: 'none', clean: false, dayStreak: 0 };

/**
 * Записать партию в журнал и начислить за неё.
 *
 * ⚠️ ДЕНЬ ОТМЕЧАЕТСЯ ДО ПОДСЧЁТА СЕРИИ. Иначе третий день подряд начинал бы давать
 * множитель только со второй партии — человек за одинаковые партии в один день получал
 * бы разное, и объяснить это было бы нечем.
 *
 * ⚠️ ПАРТИЯ ПОПАДАЕТ В ЖУРНАЛ ДАЖЕ ПРИ НУЛЕ. Блок «Сегодня» показывает, ЧТО сыграно,
 * а не только что оплачено: партия, которая ничего не принесла, — это тоже ответ.
 * Квоту множителя такие партии не тратят (считаются только удвоенные).
 */
export async function recordRound(input: RecordInput): Promise<Earned> {
  const { profileId, game, score, errors, warmupStep } = input;
  if (!profileId || !game) return ZERO;
  const now = input.now ?? new Date();
  const today = dayKey(now);
  try {
    const store = await readStore();
    const log: ProfileLog = store[profileId] ?? { entries: [], days: [] };
    const days = Array.isArray(log.days) ? log.days : [];
    const entries = Array.isArray(log.entries) ? log.entries : [];

    if (!days.includes(today)) days.push(today);
    const dayStreak = streakFromDays(days, now);
    const doubledToday = entries.filter(
      (e) => e.day === today && e.game === game && e.multiplier > 1,
    ).length;

    const earned = earnForRound({ score, errors, warmupStep, doubledToday, dayStreak });
    const entry: EarnEntry = {
      ts: now.getTime(), day: today, game,
      base: earned.base, multiplier: earned.multiplier, total: earned.total, reason: earned.reason,
    };

    const keepDays = recentDays(now, ENTRY_DAYS_KEPT);
    const nextEntries = [...entries.filter((e) => keepDays.has(e.day)), entry].slice(-MAX_ENTRIES);
    const keepDayMarks = recentDays(now, DAYS_KEPT);
    store[profileId] = { entries: nextEntries, days: days.filter((d) => keepDayMarks.has(d)) };
    await AsyncStorage.setItem(KEY, JSON.stringify(store));

    if (earned.total > 0) await addTokens(profileId, earned.total);
    lastEarn = entry;
    listeners.forEach((cb) => { try { cb(entry); } catch { /* слушатель не ломает начисление */ } });
    return earned;
  } catch {
    return ZERO;
  }
}

// ── что сегодня ──────────────────────────────────────────────────────────────

/**
 * Каким словом объяснить начисление. Ключ словаря, а не готовый текст: в приложении
 * двенадцать языков, и строка, выбранная в компоненте, знала бы из них два.
 * `null` — объяснять нечего (обычная партия либо ноль).
 */
export function earnReasonKey(reason: EarnReason): string | null {
  switch (reason) {
    case 'clean':  return 'earnWhyClean';
    case 'streak': return 'earnWhyStreak';
    case 'repeat': return 'earnWhyRepeat';
    case 'warmup': return 'earnWhyWarmup';
    default:       return null;
  }
}

export interface TodayRow {
  game: string;
  rounds: number;
  total: number;
  /** Была ли хоть одна удвоенная партия — блоку «Сегодня» есть что подсветить. */
  doubled: boolean;
  /** Когда играли последний раз — по нему строки и упорядочены. */
  lastTs: number;
}

export interface TodaySummary {
  rows: TodayRow[];
  total: number;
  rounds: number;
  dayStreak: number;
}

/**
 * Итог за КАЛЕНДАРНЫЕ сутки ЭТОГО профиля. И то и другое существенно: журнал разложен
 * по профилям, поэтому чужие партии на семейном устройстве сюда не попадают, а границей
 * дня служит местная полночь, а не «последние 24 часа» — иначе вчерашний вечер утром
 * всё ещё числился бы сегодняшним.
 */
export async function todayEarnings(profileId: string, now: Date = new Date()): Promise<TodaySummary> {
  const empty: TodaySummary = { rows: [], total: 0, rounds: 0, dayStreak: 0 };
  if (!profileId) return empty;
  const store = await readStore();
  const log = store[profileId];
  if (!log) return empty;
  const today = dayKey(now);
  const mine = (log.entries ?? []).filter((e) => e.day === today);
  const byGame = new Map<string, TodayRow>();
  for (const e of mine) {
    const row = byGame.get(e.game) ?? { game: e.game, rounds: 0, total: 0, doubled: false, lastTs: 0 };
    row.rounds += 1;
    row.total += e.total;
    row.doubled = row.doubled || e.multiplier > 1;
    row.lastTs = Math.max(row.lastTs, e.ts);
    byGame.set(e.game, row);
  }
  const rows = [...byGame.values()].sort((a, b) => b.lastTs - a.lastTs);
  return {
    rows,
    total: mine.reduce((s, e) => s + e.total, 0),
    rounds: mine.length,
    dayStreak: streakFromDays(log.days ?? [], now),
  };
}
