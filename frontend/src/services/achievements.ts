/**
 * Achievement system — milestone badges for engagement.
 *
 * Conditions evaluated against:
 *  - localStorage.psygames_sessions (all GameSession[])
 *  - localStorage.psygames_warmup_history (WarmupHistoryEntry[])
 *  - localStorage.psygames_assessment_history (AssessmentResult[])
 *
 * Newly unlocked achievements get fbAchievement() chime + toast.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameSession } from '@/src/services/api';
import { localDateKey } from '@/src/services/warmup';

export interface Achievement {
  id: string;
  name_ru: string;
  name_en: string;
  desc_ru: string;
  desc_en: string;
  emoji: string;
  category: 'volume' | 'streak' | 'quality' | 'breadth' | 'milestone';
}

export const ACHIEVEMENTS: Achievement[] = [
  // VOLUME
  { id: 'first_session',  name_ru: 'Первая игра',     name_en: 'First Game',    desc_ru: 'Сыграй любую игру', desc_en: 'Play any game', emoji: '🎯', category: 'volume' },
  { id: 'sessions_10',    name_ru: '10 сессий',       name_en: '10 sessions',   desc_ru: 'Сыграй 10 игр',     desc_en: 'Play 10 games', emoji: '🎮', category: 'volume' },
  { id: 'sessions_50',    name_ru: '50 сессий',       name_en: '50 sessions',   desc_ru: 'Сыграй 50 игр',     desc_en: 'Play 50 games', emoji: '💪', category: 'volume' },
  { id: 'sessions_100',   name_ru: 'Сотня',           name_en: 'Century',       desc_ru: 'Сыграй 100 игр',    desc_en: 'Play 100 games', emoji: '💯', category: 'volume' },
  { id: 'sessions_500',   name_ru: 'Полтысячи',       name_en: '500',           desc_ru: 'Сыграй 500 игр',    desc_en: 'Play 500 games', emoji: '🏆', category: 'volume' },
  // STREAK
  { id: 'streak_3',       name_ru: '3 дня подряд',    name_en: '3-day streak',  desc_ru: '3 дня Зарядки подряд', desc_en: '3 days warmup in a row', emoji: '🔥', category: 'streak' },
  { id: 'streak_7',       name_ru: 'Неделя',          name_en: '7-day streak',  desc_ru: 'Неделя без пропуска',   desc_en: '7 days no skip',   emoji: '🔥🔥', category: 'streak' },
  { id: 'streak_30',      name_ru: 'Месяц',           name_en: '30-day streak', desc_ru: 'Месяц подряд',          desc_en: '30 days in a row', emoji: '🔥🔥🔥', category: 'streak' },
  { id: 'streak_100',     name_ru: 'Сто дней',        name_en: '100-day streak',desc_ru: '100 дней без пропуска', desc_en: '100 days no skip', emoji: '🌟', category: 'streak' },
  // BREADTH
  { id: 'all_categories', name_ru: 'Все категории',   name_en: 'All categories',desc_ru: 'Сыграй из всех 6 категорий', desc_en: 'Play from all 6 categories', emoji: '🌈', category: 'breadth' },
  { id: 'twenty_unique',  name_ru: '20 разных игр',   name_en: '20 unique games',desc_ru: 'Попробуй 20 разных игр',    desc_en: 'Try 20 different games', emoji: '🎲', category: 'breadth' },
  { id: 'all_44_games',   name_ru: 'Все игры',        name_en: 'All games',     desc_ru: 'Хотя бы по разу — весь каталог',  desc_en: 'At least once — the whole catalog', emoji: '🎖️', category: 'breadth' },
  // MILESTONE
  { id: 'first_warmup',   name_ru: 'Первая Зарядка',  name_en: 'First Warmup',  desc_ru: 'Заверши Утреннюю Зарядку',  desc_en: 'Complete Morning Warmup', emoji: '⚡', category: 'milestone' },
  { id: 'first_assessment',name_ru: 'Первый профиль', name_en: 'First Profile', desc_ru: 'Пройди оценку профиля',     desc_en: 'Complete Skill Assessment', emoji: '📊', category: 'milestone' },
  { id: 'first_financial',name_ru: 'vmPFC чекап',     name_en: 'Financial Day', desc_ru: 'Заверши Financial Brain Day',desc_en: 'Complete Financial Brain Day', emoji: '💰', category: 'milestone' },
  // QUALITY
  { id: 'perfect_warmup', name_ru: 'Идеальная Зарядка',name_en: 'Perfect Warmup', desc_ru: 'Завершить серию без ошибок', desc_en: 'Complete a warmup with 0 errors', emoji: '⭐', category: 'quality' },
  { id: 'fast_schulte',   name_ru: 'Скорость Шульте', name_en: 'Schulte Speed', desc_ru: 'Schulte 5×5 < 30 сек',      desc_en: 'Schulte 5×5 under 30s', emoji: '🚀', category: 'quality' },
  { id: 'flanker_low',    name_ru: 'Тормоз стальной', name_en: 'Iron inhibition',desc_ru: 'flanker_effect < 30мс',     desc_en: 'flanker_effect under 30ms', emoji: '🛡️', category: 'quality' },
  { id: 'corsi_7',        name_ru: 'Span 7 Corsi',    name_en: 'Span 7 Corsi',  desc_ru: 'Достигни Corsi span = 7',   desc_en: 'Reach Corsi span 7', emoji: '🧠', category: 'quality' },
  { id: 'cpt_no_omission',name_ru: 'CPT 0 пропусков', name_en: 'CPT no misses', desc_ru: 'Заверши CPT без omission errors', desc_en: 'Complete CPT with 0 omissions', emoji: '👁️', category: 'quality' },
  // v1.108.0 — за фичи июня-июля: вызов дня, дыхание, слепые шахматы, полиглот, чистые серии
  { id: 'challenge_7',      name_ru: 'Неделя вызовов',    name_en: 'Challenge week',   desc_ru: '7 вызовов дня подряд',            desc_en: '7 daily challenges in a row',   emoji: '🎲', category: 'streak' },
  { id: 'challenge_30',     name_ru: 'Месяц вызовов',     name_en: 'Challenge month',  desc_ru: '30 вызовов дня подряд',           desc_en: '30 daily challenges in a row',  emoji: '🗓️', category: 'streak' },
  { id: 'challenge_20_total',name_ru: 'Двадцатка',        name_en: 'Twenty',           desc_ru: '20 вызовов дня всего',            desc_en: '20 daily challenges total',     emoji: '🎯', category: 'volume' },
  { id: 'breathing_10',     name_ru: 'Дыхание ×10',       name_en: 'Breathing ×10',    desc_ru: '10 дыхательных сессий',           desc_en: '10 breathing sessions',         emoji: '🌬️', category: 'volume' },
  { id: 'breathing_30',     name_ru: 'Дыхание ×30',       name_en: 'Breathing ×30',    desc_ru: '30 дыхательных сессий',           desc_en: '30 breathing sessions',         emoji: '🧘', category: 'volume' },
  { id: 'breathing_streak_7',name_ru: 'Неделя дыхания',   name_en: 'Breath week',      desc_ru: '7 дней дыхания подряд',           desc_en: '7 days of breathing in a row',  emoji: '🌊', category: 'streak' },
  { id: 'chess_blind_5',    name_ru: 'Слепой взгляд',     name_en: 'Blind eye',        desc_ru: 'Слепые шахматы: пройди уровень 5', desc_en: 'Blind chess: clear level 5',   emoji: '♟️', category: 'quality' },
  { id: 'chess_blind_10',   name_ru: 'Гроссмейстер памяти',name_en: 'Memory grandmaster',desc_ru: 'Слепые шахматы: пройди уровень 10', desc_en: 'Blind chess: clear level 10', emoji: '👑', category: 'quality' },
  { id: 'polyglot_100',     name_ru: 'Полиглот-сотня',    name_en: 'Polyglot century', desc_ru: '100 языковых сессий',             desc_en: '100 language sessions',         emoji: '🌍', category: 'volume' },
  { id: 'clean_run_5',      name_ru: 'Чистая пятёрка',    name_en: 'Clean five',       desc_ru: '5 чистых раундов подряд (0 ошибок)', desc_en: '5 clean rounds in a row (0 errors)', emoji: '🔥', category: 'quality' },
];

// Языковые игры для polyglot_100 (вербальный + аудио TIER2 стек).
const POLYGLOT_GAMES = new Set([
  'word_pairs', 'vocab_srs', 'semantic_sort', 'cloze', 'lexical_decision',
  'phoneme_pairs', 'pseudoword_echo', 'listening_span', 'phonemic_fluency',
]);

const UNLOCKED_KEY = 'psygames_achievements_unlocked';

// A2: награда токенами за разблокировку бейджа — по категории (редкое/сложное → больше).
const ACHIEVEMENT_REWARD: Record<Achievement['category'], number> = {
  volume: 50, breadth: 75, milestone: 60, streak: 100, quality: 100,
};

export interface UnlockedRecord { id: string; date: string; }

export async function getUnlocked(): Promise<UnlockedRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(UNLOCKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveUnlocked(list: UnlockedRecord[]) {
  try { await AsyncStorage.setItem(UNLOCKED_KEY, JSON.stringify(list)); } catch {}
}

// ─── condition evaluators ─────────────────────────────────────────────

interface Context {
  sessions: GameSession[];
  warmupHistory: any[];
  assessmentHistory: any[];
  currentStreak: number;
  // v1.108.0 — per-profile данные для новых ачивок (прелоад в checkNewAchievements)
  challengeStreak?: { streak: number; total: number };
  breathingStreak?: number;
  chessBlindMaxLevel?: number;
  cleanRun?: number;
}

function evalCondition(id: string, ctx: Context): boolean {
  const { sessions, warmupHistory, assessmentHistory, currentStreak } = ctx;
  const uniqueGames = new Set(sessions.map(s => s.game_type));
  const categories = new Set<string>();
  // crude: derive category from common game ids (will use GAMES catalog in real check)
  // But for now just count distinct game_types as proxy
  switch (id) {
    case 'challenge_7':        return (ctx.challengeStreak?.streak ?? 0) >= 7;
    case 'challenge_30':       return (ctx.challengeStreak?.streak ?? 0) >= 30;
    case 'challenge_20_total': return (ctx.challengeStreak?.total ?? 0) >= 20;
    case 'breathing_10':       return sessions.filter(s => s.game_type === 'breathing').length >= 10;
    case 'breathing_30':       return sessions.filter(s => s.game_type === 'breathing').length >= 30;
    case 'breathing_streak_7': return (ctx.breathingStreak ?? 0) >= 7;
    case 'chess_blind_5':      return (ctx.chessBlindMaxLevel ?? 0) >= 5;
    case 'chess_blind_10':     return (ctx.chessBlindMaxLevel ?? 0) >= 10;
    case 'polyglot_100':       return sessions.filter(s => POLYGLOT_GAMES.has(s.game_type)).length >= 100;
    case 'clean_run_5':        return (ctx.cleanRun ?? 0) >= 5;
    case 'first_session':       return sessions.length >= 1;
    case 'sessions_10':         return sessions.length >= 10;
    case 'sessions_50':         return sessions.length >= 50;
    case 'sessions_100':        return sessions.length >= 100;
    case 'sessions_500':        return sessions.length >= 500;
    case 'streak_3':            return currentStreak >= 3;
    case 'streak_7':            return currentStreak >= 7;
    case 'streak_30':           return currentStreak >= 30;
    case 'streak_100':          return currentStreak >= 100;
    case 'twenty_unique':       return uniqueGames.size >= 20;
    case 'all_44_games':        return uniqueGames.size >= 44;
    case 'all_categories': {
      // need GAMES list — done in checkNewAchievements with proper import
      return false;  // overridden below
    }
    case 'first_warmup':        return warmupHistory.some(h => h.completed && h.track === 'training');
    case 'first_assessment':    return assessmentHistory.length >= 1;
    case 'first_financial':     return warmupHistory.some(h => h.completed && h.track === 'financial-battery');
    case 'perfect_warmup':      return warmupHistory.some(h => h.completed && h.track === 'training' && (h as any).errors === 0);
    case 'fast_schulte':
      return sessions.some(s => s.game_type === 'schulte_table' && s.difficulty === '5x5' && s.time_seconds > 0 && s.time_seconds < 30);
    case 'flanker_low':
      return sessions.some(s => s.game_type === 'flanker' && (s.details as any)?.flanker_effect_ms !== undefined && (s.details as any).flanker_effect_ms < 30);
    case 'corsi_7':
      return sessions.some(s => s.game_type === 'corsi' && (s.details as any)?.span >= 7);
    case 'cpt_no_omission':
      return sessions.some(s => s.game_type === 'cpt' && (s.details as any)?.omission_errors === 0 && (s.details as any)?.hits >= 10);
    default: return false;
  }
}

export async function checkNewAchievements(ctx: Context): Promise<Achievement[]> {
  const unlocked = await getUnlocked();
  const unlockedIds = new Set(unlocked.map(u => u.id));
  const newly: Achievement[] = [];
  // Special handling for 'all_categories' / 'all_44_games'
  const { GAMES, CATEGORY_ORDER } = await import('@/src/constants/games');
  const playedCategories = new Set<string>();
  const playedIds = new Set(ctx.sessions.map(s => s.game_type));
  for (const s of ctx.sessions) {
    const g = GAMES.find(x => x.id === s.game_type);
    if (g) playedCategories.add(g.category);
  }
  // Хабы-группы не сохраняют сессий — «весь каталог» = все остальные записи GAMES.
  const HUBS = new Set(['span_group', 'attention_conflict']);
  for (const a of ACHIEVEMENTS) {
    if (unlockedIds.has(a.id)) continue;
    let pass = false;
    if (a.id === 'all_categories') {
      pass = CATEGORY_ORDER.every(c => playedCategories.has(c));
    } else if (a.id === 'all_44_games') {
      pass = GAMES.filter(g => !HUBS.has(g.id)).every(g => playedIds.has(g.id));
    } else {
      pass = evalCondition(a.id, ctx);
    }
    if (pass) {
      newly.push(a);
      unlocked.push({ id: a.id, date: localDateKey(new Date()) });
    }
  }
  if (newly.length > 0) {
    await saveUnlocked(unlocked);
    // A2: начислить токены за каждый новый бейдж — ИДЕМПОТЕНТНО: newly даёт бейдж лишь однажды
    // (дальше он в UNLOCKED_KEY и исключается на след. проверках). Профиль — тот же глобал, что в api.ts.
    try {
      const pid = (globalThis as any).__psygames_active_profile_id as string | undefined;
      if (pid) {
        const reward = newly.reduce((sum, a) => sum + (ACHIEVEMENT_REWARD[a.category] ?? 50), 0);
        if (reward > 0) {
          const { addTokens } = await import('@/src/services/tokens');
          await addTokens(pid, reward);
        }
      }
    } catch { /* токены некритичны */ }
  }
  return newly;
}

/**
 * v1.108.0 — единая точка проверки ачивок: вызывается из saveSession на КАЖДЫЙ
 * завершённый раунд (раньше — только из зарядки, и ачивки за вызов дня/дыхание/
 * шахматы вне зарядки не проверялись; warmup-стрик передавался нулём).
 * Сама собирает контекст (включая per-profile данные) и эмитит звук+тост.
 */
export async function runAchievementsCheck(sessions: GameSession[]): Promise<Achievement[]> {
  const pid = (globalThis as any).__psygames_active_profile_id as string | undefined;
  const [warmupMod, assessMod] = await Promise.all([
    import('@/src/services/warmup'),
    import('@/src/services/assessment'),
  ]);
  const warmupHistory = await warmupMod.loadWarmupHistory();
  const assessmentHistory = await assessMod.loadAssessmentHistory();
  const currentStreak = warmupMod.computeStreak(warmupHistory);

  let challengeStreak: Context['challengeStreak'];
  let breathingStreak = 0;
  let chessBlindMaxLevel = 0;
  let cleanRun = 0;
  if (pid) {
    try {
      const dc = await import('@/src/services/daily-challenge');
      challengeStreak = await dc.loadChallengeStreak(pid);
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(`psygames_breathing_streak_${pid}`);
      if (raw) breathingStreak = JSON.parse(raw).streak || 0;
    } catch {}
    try {
      const { getLevelStars } = await import('@/src/services/levelStars');
      const stars = await getLevelStars('chess_blind', pid);
      chessBlindMaxLevel = Math.max(0, ...Object.keys(stars).map(Number).filter(n => (stars as any)[n] > 0));
    } catch {}
    try {
      const { getCleanRun } = await import('@/src/services/cleanRun');
      cleanRun = await getCleanRun(pid);
    } catch {}
  }

  const newly = await checkNewAchievements({
    sessions, warmupHistory, assessmentHistory, currentStreak,
    challengeStreak, breathingStreak, chessBlindMaxLevel, cleanRun,
  });
  if (newly.length > 0) {
    try {
      const { fbAchievement } = await import('@/src/services/feedback');
      fbAchievement();
      (globalThis as any).__psygames_new_achievement = newly[0];
      const { DeviceEventEmitter } = await import('react-native');
      DeviceEventEmitter.emit('psygames:achievement', newly[0]);
    } catch {}
  }
  return newly;
}
