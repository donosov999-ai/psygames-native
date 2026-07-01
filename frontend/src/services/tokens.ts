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

// Сколько токенов даёт сессия: счёт (победа) добавляет, ошибки вычитают. Может быть отрицательным.
export function tokenDelta(score: number, errors: number): number {
  return Math.round((score || 0) / 20) - (errors || 0);
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
const LEVEL_TITLE_RU = ['Новичок', 'Ученик', 'Игрок', 'Боец', 'Эксперт', 'Мастер', 'Гроссмейстер', 'Виртуоз', 'Гуру', 'Легенда', 'Кибермозг'];
const LEVEL_TITLE_EN = ['Rookie', 'Student', 'Player', 'Fighter', 'Expert', 'Master', 'Grandmaster', 'Virtuoso', 'Guru', 'Legend', 'Cyberbrain'];

export interface LevelInfo { level: number; titleRu: string; titleEn: string; intoLevel: number; span: number | null; progress: number; }

export function levelInfo(tokens: number): LevelInfo {
  let lvl = 0;
  for (let i = 0; i < LEVEL_THRESH.length; i++) if (tokens >= LEVEL_THRESH[i]) lvl = i;
  const base = LEVEL_THRESH[lvl];
  const nextBase = lvl + 1 < LEVEL_THRESH.length ? LEVEL_THRESH[lvl + 1] : null;
  const span = nextBase !== null ? nextBase - base : null;
  const intoLevel = tokens - base;
  const progress = span ? Math.min(1, intoLevel / span) : 1;
  return { level: lvl, titleRu: LEVEL_TITLE_RU[lvl], titleEn: LEVEL_TITLE_EN[lvl], intoLevel, span, progress };
}

// ── Дневной стрик (T2): заходи каждый день → бонус токенов + 🔥. Per-profile. ──
const STREAK_KEY = 'psygames_streak_v1';
function dayStr(d: Date): string { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

/** Отметка дня: идемпотентно за сутки. Возвращает стрик + начисленный бонус (0 если уже заходил сегодня). */
export async function dailyCheckIn(profileId: string): Promise<{ streak: number; awarded: number; isNew: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    const data: Record<string, { last: string; streak: number }> = raw ? JSON.parse(raw) : {};
    const rec = data[profileId] || { last: '', streak: 0 };
    const today = dayStr(new Date());
    if (rec.last === today) return { streak: rec.streak, awarded: 0, isNew: false };
    const y = new Date(); y.setDate(y.getDate() - 1);
    const streak = rec.last === dayStr(y) ? rec.streak + 1 : 1;   // вчера → продолжаем, иначе сброс
    const awarded = 10 + Math.min(streak, 7) * 5;                 // бонус растёт со стриком (cap на 7 дне)
    data[profileId] = { last: today, streak };
    AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data)).catch(() => {});
    await addTokens(profileId, awarded);
    return { streak, awarded, isNew: true };
  } catch { return { streak: 0, awarded: 0, isNew: false }; }
}

export async function getStreak(profileId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return (data[profileId]?.streak) || 0;
  } catch { return 0; }
}
