// Очки-геймификация для ЦЕНТРА (общий счёт профиля) — отдельно от внутриигровых очков сессии.
// Победы добавляют, ошибки вычитают. Копится со всех игр. Хранится локально (AsyncStorage), per-profile.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'psygames_tokens_v1';
let cache: Record<string, number> | null = null;

async function load(): Promise<Record<string, number>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch { cache = {}; }
  return cache;
}

export async function getTokens(profileId: string): Promise<number> {
  const c = await load();
  return c[profileId] ?? 0;
}

export async function addTokens(profileId: string, delta: number): Promise<number> {
  if (!profileId || !delta) return getTokens(profileId);
  const c = await load();
  const next = Math.max(0, (c[profileId] ?? 0) + Math.round(delta));
  c[profileId] = next;
  AsyncStorage.setItem(KEY, JSON.stringify(c)).catch(() => {});
  return next;
}

// Сколько токенов даёт сессия: счёт (победа) добавляет, ошибки штрафуют — но НИКОГДА
// не уходит в минус (v1.154, аудит: раньше формула списывала токены при провале, и
// GameResult это скрывал → «скрытое наказание»). Ошибки лишь урезают награду до 0,
// но не отнимают из кошелька. Верхний потолок 50 — чтобы high-score игры не фармили
// несопоставимо больше коротких (аудит: разные шкалы очков давали +40..+50 в одних
// и почти ноль в других). Итог: заработок за сессию всегда в [0, 50].
/**
 * Потолок начисления за партию. Вынесен в константу нарочно: на нём стоит цена
 * расходуемых способностей (`src/services/abilities.ts`) — способность обязана стоить
 * дороже, чем партия вообще способна принести, иначе её покупают ради заработка,
 * а не ради партии. Пока число было зашито в формулу литералом, эту связь нельзя
 * было ни увидеть, ни проверить.
 */
export const TOKEN_DELTA_CAP = 50;

export function tokenDelta(score: number, errors: number): number {
  const raw = Math.round((score || 0) / 20) - (errors || 0);
  return Math.max(0, Math.min(TOKEN_DELTA_CAP, raw));
}

/**
 * Комбо-множитель ×1.5 (геймификация): 3 ЧИСТЫЕ игры (errors===0) ПОДРЯД в одной
 * сессии зарядки → бонус токенов = 0.5× сумма tokenDelta этой серии (итог за
 * серию = base + bonus = ×1.5). Токены за КАЖДУЮ игру уже начислены отдельно
 * (saveSession → addTokens, см. src/services/api.ts) — это ДОБАВОЧНЫЙ бонус
 * поверх, тот же стиль, что dailyCheckIn (bonus-on-top, не мутация базовой формулы).
 * Ищет САМУЮ ДЛИННУЮ непрерывную серию (если их несколько в сессии — считается одна).
 */
export function comboBonus(results: { score: number; errors: number }[]): { bonus: number; streakLen: number } {
  let best = 0, cur = 0, bestStart = 0, curStart = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].errors === 0) {
      if (cur === 0) curStart = i;
      cur++;
      if (cur > best) { best = cur; bestStart = curStart; }
    } else {
      cur = 0;
    }
  }
  if (best < 3) return { bonus: 0, streakLen: best };
  const streakSum = results.slice(bestStart, bestStart + best)
    .reduce((s, r) => s + tokenDelta(r.score, r.errors), 0);
  return { bonus: Math.max(0, Math.round(streakSum * 0.5)), streakLen: best };
}

// Потратить токены (покупка косметики). false если не хватает — баланс НЕ уходит в минус.
export async function spendTokens(profileId: string, cost: number): Promise<boolean> {
  if (!profileId || cost <= 0) return true;
  const cur = await getTokens(profileId);
  if (cur < cost) return false;
  await addTokens(profileId, -cost);
  return true;
}

// ── Уровень профиля от накопленных токенов (геймификация T1) — токены теперь ЧТО-ТО дают ──
const LEVEL_THRESH = [0, 80, 200, 400, 700, 1100, 1700, 2500, 3600, 5000, 7000];
// Титулы («Новичок»…«Кибермозг») — в словаре LanguageContext (levelTitle0..levelTitle10),
// потребители рендерят t(lvl.titleKey).

export interface LevelInfo { level: number; titleKey: string; intoLevel: number; span: number | null; progress: number; }

export function levelInfo(tokens: number): LevelInfo {
  let lvl = 0;
  for (let i = 0; i < LEVEL_THRESH.length; i++) if (tokens >= LEVEL_THRESH[i]) lvl = i;
  const base = LEVEL_THRESH[lvl];
  const nextBase = lvl + 1 < LEVEL_THRESH.length ? LEVEL_THRESH[lvl + 1] : null;
  const span = nextBase !== null ? nextBase - base : null;
  const intoLevel = tokens - base;
  const progress = span ? Math.min(1, intoLevel / span) : 1;
  return { level: lvl, titleKey: `levelTitle${lvl}`, intoLevel, span, progress };
}

// ── Дневной стрик (T2): заходи каждый день → бонус токенов + 🔥. Per-profile. ──
const STREAK_KEY = 'psygames_streak_v1';
function dayStr(d: Date): string { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

/** Бонус за отметку дня. Отдельной функцией — на ней же считается потолок «Щита серии». */
export function checkInAward(streak: number): number {
  return 10 + Math.min(Math.max(streak, 0), 7) * 5;   // бонус растёт со стриком (cap на 7 дне)
}

/** Оборванная серия: что именно потеряно и в какой день это обнаружено. */
export interface BrokenStreak { len: number; at: string }
interface StreakRec { last: string; streak: number; broken?: BrokenStreak }

/**
 * Сколько очков стоит оборванная серия — максимум, который может вернуть «Щит серии».
 *
 * Считается ПО ТОЙ ЖЕ формуле `checkInAward`, а не числом: цена щита стоит на этой
 * величине, и разъехаться им нельзя. Смысл: серия на потолке платит `checkInAward(7)`
 * в день; после обрыва она отрастает заново, и разница за эти дни и есть потеря.
 */
export function checkInStreakMaxLoss(): number {
  const top = checkInAward(7);
  let loss = 0;
  for (let day = 1; day <= 7; day++) loss += top - checkInAward(day);
  return loss;
}

/**
 * Отметка дня: идемпотентно за сутки. Возвращает стрик + начисленный бонус (0 если
 * уже заходил сегодня).
 *
 * ⚠️ ОБРЫВ ЗАПОМИНАЕТСЯ. Раньше при пропуске дня прежняя длина серии просто
 * затиралась единицей, и восстановить её было нечем — «у меня было 24 дня» не
 * подтверждалось ничем, кроме памяти человека. Теперь потерянная длина и день, в
 * который обрыв обнаружен, ложатся в `broken`; ими и пользуется «Щит серии»
 * (`repairCheckInStreak`). Успешное продолжение серии `broken` стирает — иначе
 * щит однажды восстановил бы серию, оборванную полгода назад.
 */
export async function dailyCheckIn(profileId: string): Promise<{ streak: number; awarded: number; isNew: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    const data: Record<string, StreakRec> = raw ? JSON.parse(raw) : {};
    const rec: StreakRec = data[profileId] || { last: '', streak: 0 };
    const today = dayStr(new Date());
    if (rec.last === today) return { streak: rec.streak, awarded: 0, isNew: false };
    const y = new Date(); y.setDate(y.getDate() - 1);
    const continued = rec.last === dayStr(y);
    const streak = continued ? rec.streak + 1 : 1;                // вчера → продолжаем, иначе сброс
    const awarded = checkInAward(streak);
    // Обрыв записываем, только если было что рвать: серия из одного дня — не потеря.
    const broken: BrokenStreak | undefined = continued
      ? rec.broken
      : (rec.streak >= 2 ? { len: rec.streak, at: today } : undefined);
    data[profileId] = broken ? { last: today, streak, broken } : { last: today, streak };
    AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data)).catch(() => {});
    await addTokens(profileId, awarded);
    return { streak, awarded, isNew: true };
  } catch { return { streak: 0, awarded: 0, isNew: false }; }
}

export type StreakRepairReason = 'restored' | 'intact' | 'stale';

export interface StreakRepair { ok: boolean; streak: number; restoredFrom: number; reason: StreakRepairReason }

/**
 * Что вернёт «Щит серии», если потратить его прямо сейчас. Читает, не пишет —
 * магазину нужно ПОКАЗАТЬ человеку, что произойдёт, до того как он потратит штуку.
 */
export async function checkInStreakRepairable(profileId: string, now: Date = new Date()): Promise<BrokenStreak | null> {
  if (!profileId) return null;
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    const data: Record<string, StreakRec> = raw ? JSON.parse(raw) : {};
    const b = data[profileId]?.broken;
    return b && b.at === dayStr(now) ? b : null;
  } catch { return null; }
}

/**
 * Восстановить оборванную серию захода.
 *
 * ⚠️ ТОЛЬКО В ДЕНЬ ОБРЫВА. Иначе щит, купленный в пятницу, чинил бы серию,
 * оборванную в понедельник, — то есть дорисовывал бы четыре дня, которых не было.
 * Правило узкое нарочно: щит закрывает ОДИН пропущенный день, а не отпуск.
 *
 * ⚠️ ЩИТ ВОЗВРАЩАЕТ СЕРИЮ, А НЕ ДЕНЬГИ. Сегодняшний бонус уже начислен по сброшенной
 * серии и не пересчитывается: иначе щит стал бы способом купить очки за очки.
 */
export async function repairCheckInStreak(profileId: string, now: Date = new Date()): Promise<StreakRepair> {
  const miss: StreakRepair = { ok: false, streak: 0, restoredFrom: 0, reason: 'intact' };
  if (!profileId) return miss;
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    const data: Record<string, StreakRec> = raw ? JSON.parse(raw) : {};
    const rec = data[profileId];
    if (!rec) return miss;
    const broken = rec.broken;
    if (!broken) return { ...miss, streak: rec.streak };
    if (broken.at !== dayStr(now)) return { ...miss, streak: rec.streak, reason: 'stale' };
    // Оборванная серия + сегодняшний день: человек тренировался broken.len дней,
    // пропустил один и пришёл сегодня — честное продолжение это broken.len + 1.
    const streak = broken.len + 1;
    data[profileId] = { last: rec.last, streak };
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
    return { ok: true, streak, restoredFrom: broken.len, reason: 'restored' };
  } catch { return miss; }
}

export async function getStreak(profileId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return (data[profileId]?.streak) || 0;
  } catch { return 0; }
}

// ── Разовый возврат очков за сорванные зарядки (решение Дениса 13.08.2026) ──

/**
 * Сколько вернуть. Число задал Денис — я его не выдумываю и не округляю.
 */
export const WARMUP_COMPENSATION = 400;

const COMP_KEY = 'psygames_warmup_comp_v1';

/**
 * Разовый возврат очков тому, у кого зарядка ломалась.
 *
 * ЗАЧЕМ ТАК, А НЕ НАЧИСЛЕНИЕМ СО СТОРОНЫ. Очки живут ТОЛЬКО на устройстве
 * (`psygames_tokens_v1`, AsyncStorage) — сервера с балансом нет, начислить снаружи
 * физически некуда. Значит возврат должен произойти в приложении, один раз, сам.
 * Тот же приём, которым восстанавливались отметки календаря.
 *
 * КОМУ. Условие — на устройстве ЕСТЬ история зарядок: если человек ни одной не
 * делал, компенсировать нечего. Начисляем активному профилю: сессии и история
 * зарядок хранятся на устройство, а очки — на профиль, и связать одно с другим
 * точнее нечем. На семейном устройстве это значит «тому, кто открыл приложение»;
 * повторно тому же профилю не начислится никогда — список уже выданных хранится.
 *
 * ⚠️ ФЛАГ ПИШЕТСЯ ТОЛЬКО ПОСЛЕ УСПЕШНОГО НАЧИСЛЕНИЯ. Наоборот — и при сбое записи
 * очков человек остался бы и без возврата, и без права на него.
 */
export async function grantWarmupCompensationOnce(
  profileId: string,
  hadWarmup: () => Promise<boolean>,
): Promise<number> {
  if (!profileId) return 0;
  try {
    const raw = await AsyncStorage.getItem(COMP_KEY);
    const done: string[] = raw ? JSON.parse(raw) : [];
    if (done.includes(profileId)) return 0;
    if (!(await hadWarmup())) return 0;
    await addTokens(profileId, WARMUP_COMPENSATION);
    await AsyncStorage.setItem(COMP_KEY, JSON.stringify([...done, profileId]));
    return WARMUP_COMPENSATION;
  } catch {
    return 0;
  }
}
