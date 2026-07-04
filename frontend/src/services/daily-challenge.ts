/**
 * Ежедневный вызов — РОТАЦИЯ ИГР (согласовано с Денисом 2026-07-01): каждый день
 * ОДНА конкретная игра из каталога с фиксированной сложностью — «Сегодня: Шульте».
 * Детерминированный выбор по дате (не Math.random) — все игроки видят ОДНУ игру в день.
 * Запуск — через тот же URL-preset механизм, что и зарядка (useGamePreset/stepToParams).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GAMES, GameConfig } from '@/src/constants/games';
import { stepToParams, PlaylistStep, Difficulty } from '@/src/services/warmup';

// Восстановление (дыхание) — не «вызов», исключаем из ротации.
// Хабы-группы — не игры: не сохраняют сессию (стрик не закоммитится) и не принимают сложность.
const GROUP_HUBS = ['span_group', 'attention_conflict'];
function eligibleGames(): GameConfig[] {
  return GAMES.filter((g) => !g.hideFromMenu && g.category !== 'recovery' && !GROUP_HUBS.includes(g.id));
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Стабильный числовой сид по дате (НЕ Math.random — все игроки должны увидеть одно и то же).
function dateSeed(date: Date): number {
  return date.getFullYear() * 372 + (date.getMonth() + 1) * 31 + date.getDate();
}

export interface DailyChallenge {
  game: GameConfig;
  difficulty: Difficulty;
  dateStr: string;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

export function getTodayChallenge(date: Date = new Date()): DailyChallenge {
  const games = eligibleGames();
  const seed = dateSeed(date);
  const game = games[seed % games.length];
  const difficulty = DIFFS[Math.floor(seed / games.length) % DIFFS.length];
  return { game, difficulty, dateStr: dayKey(date) };
}

export function challengeToParams(c: DailyChallenge): Record<string, string> {
  const step: PlaylistStep = {
    game_id: c.game.id, game_route: c.game.route,
    difficulty: c.difficulty, est_duration_sec: 90,
  };
  return stepToParams(step);
}

// ─── стрик ежедневного вызова (отдельный от общего app-open стрика) ───
// Засчитывается за ЗАВЕРШЕНИЕ раунда, не за старт: старт пишет pending-маркер,
// saveSession при совпадении игры и даты коммитит день (иначе «тапнул и вышел» = день зачтён).
const STREAK_KEY_PREFIX = 'psygames_daily_challenge_streak_';
const PENDING_KEY_PREFIX = 'psygames_daily_challenge_pending_';

export interface ChallengeStreak { streak: number; total: number; last: string }
interface PendingChallenge { date: string; gameId: string }

export async function loadChallengeStreak(profileId: string): Promise<ChallengeStreak> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY_PREFIX + profileId);
    return raw ? JSON.parse(raw) : { streak: 0, total: 0, last: '' };
  } catch { return { streak: 0, total: 0, last: '' }; }
}

/** Старт вызова: запомнить «ждём завершения этой игры сегодня». Стрик здесь НЕ трогаем. */
export async function setPendingChallenge(profileId: string, gameId: string): Promise<void> {
  try {
    const pending: PendingChallenge = { date: dayKey(new Date()), gameId };
    await AsyncStorage.setItem(PENDING_KEY_PREFIX + profileId, JSON.stringify(pending));
  } catch {}
}

/**
 * Завершение раунда любой игры (зовётся из saveSession): если сегодняшний pending
 * совпал с завершённой игрой — коммитим день вызова. Идемпотентно за сутки.
 */
export async function commitChallengeIfPending(profileId: string, gameType: string): Promise<ChallengeStreak | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY_PREFIX + profileId);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingChallenge;
    if (pending.date !== dayKey(new Date()) || pending.gameId !== gameType) return null;
    await AsyncStorage.removeItem(PENDING_KEY_PREFIX + profileId);
    return await commitChallengeDay(profileId);
  } catch { return null; }
}

/** Засчитать сегодняшний вызов выполненным. Идемпотентно за сутки. */
async function commitChallengeDay(profileId: string): Promise<ChallengeStreak> {
  const today = dayKey(new Date());
  const rec = await loadChallengeStreak(profileId);
  if (rec.last === today) return rec;
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const streak = rec.last === dayKey(yest) ? rec.streak + 1 : 1;
  const next: ChallengeStreak = { streak, total: rec.total + 1, last: today };
  await AsyncStorage.setItem(STREAK_KEY_PREFIX + profileId, JSON.stringify(next));
  return next;
}

export function isChallengeDoneToday(rec: ChallengeStreak): boolean {
  return rec.last === dayKey(new Date());
}
