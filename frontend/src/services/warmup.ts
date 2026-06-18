/**
 * Утренняя Зарядка — сервис подбора плейлиста.
 *
 * Архитектура (3 трека):
 *   - ТРЕНИРОВКА: ПН/ВТ/ПТ/СБ — короткие лёгкие игры из разных категорий
 *   - ЗАМЕР:      ЧТ peak (после BOOST) + ВС baseline (до BOOST) — фиксированный набор
 *   - ЭПИЗОДИЧ.:  Iowa/BART/WCST/ANT — 1×/мес каждая, отдельный слот (НЕ в утренней рутине)
 *
 * Вызов:
 *   const playlist = buildMorningWarmupPlaylist({ duration: 5|10|15, weekday: 0..6 })
 */

import { GameSession } from '@/src/services/api';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ...

export interface PlaylistStep {
  game_id: string;        // matches GAMES[].id
  game_route: string;     // /games/<slug>
  difficulty: Difficulty;
  trials?: number;        // override default trials count
  mode?: string;          // override default mode (game-specific)
  settings?: Record<string, string | number>;  // arbitrary preset для игры (напр. {targetLang:'en', pairCount:10, modality:'single'}) — передаётся в URL-params, игра применяет через useGamePreset
  est_duration_sec: number;
  is_fixed_baseline?: boolean; // marker for ЧТ peak / ВС baseline trials
}

export interface PlaylistMeta {
  duration_min: number;
  weekday: Weekday;
  weekday_name: string;
  track: 'training' | 'measure-peak' | 'measure-baseline' | 'rest' | 'financial-battery' | 'assessment';
  track_label: string;
  steps: PlaylistStep[];
  est_total_sec: number;
  slot?: 'morning' | 'evening';   // утренняя зарядка vs вечерний комплекс (перед сном)
}

/**
 * Конвертирует шаг плейлиста в URL-params для маршрута игры.
 * Игры с хуком useGamePreset() применяют их (конфиг + авто-старт); остальные игнорят.
 * `wu:'1'` — флаг «запущено из зарядки/комплекса».
 */
export function stepToParams(step: PlaylistStep): Record<string, string> {
  const p: Record<string, string> = { wu: '1', diff: step.difficulty };
  if (step.trials != null) p.trials = String(step.trials);
  if (step.mode) p.mode = step.mode;
  if (step.settings) {
    for (const k of Object.keys(step.settings)) p[k] = String(step.settings[k]);
  }
  return p;
}

/**
 * Строит PlaylistMeta из фиксированного набора шагов (для per-profile утро/вечер,
 * где порядок задан в profiles.ts, а не вычисляется по дню недели).
 */
export function buildFixedPlaylist(
  steps: PlaylistStep[],
  slot: 'morning' | 'evening',
  weekday: Weekday,
): PlaylistMeta {
  const total = steps.reduce((s, x) => s + x.est_duration_sec, 0);
  return {
    duration_min: Math.max(1, Math.round(total / 60)),
    weekday,
    weekday_name: WEEKDAY_NAMES[weekday],
    track: 'training',
    track_label: slot === 'evening' ? 'перед сном' : 'тренировка',
    steps: steps.map((s) => ({ ...s })),
    est_total_sec: total,
    slot,
  };
}

const WEEKDAY_NAMES = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

// FIXED MEASUREMENT BATTERY — same setup for ЧТ peak and ВС baseline (allows lifelong comparison).
const FIXED_BATTERY: PlaylistStep[] = [
  { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'medium', mode: '5x5',          est_duration_sec: 60, is_fixed_baseline: true },
  { game_id: 'n_back',         game_route: '/games/n-back',          difficulty: 'medium', trials: 20, mode: '2-back', est_duration_sec: 90, is_fixed_baseline: true },
  { game_id: 'flanker',        game_route: '/games/flanker',         difficulty: 'medium', trials: 20,           est_duration_sec: 90, is_fixed_baseline: true },
  { game_id: 'switching_task', game_route: '/games/switching-task',  difficulty: 'medium', trials: 20,           est_duration_sec: 120, is_fixed_baseline: true },
  { game_id: 'sdmt',           game_route: '/games/sdmt',            difficulty: 'medium', mode: '60s',          est_duration_sec: 70, is_fixed_baseline: true },
  { game_id: 'digit_span',     game_route: '/games/digit-span',      difficulty: 'medium', mode: 'forward',      est_duration_sec: 90, is_fixed_baseline: true },
];

// PER-WEEKDAY TRAINING playlists (5-min default), tuned per the agreed schedule.
// СР is a REST day (Brain Workshop slot externally), so empty playlist.
const TRAINING_BY_WEEKDAY: Record<Weekday, PlaylistStep[]> = {
  // ПН — мягкий вход после выходных
  1: [
    { game_id: 'choice_rt',    game_route: '/games/choice-rt',    difficulty: 'easy',   trials: 15, mode: '2dir', est_duration_sec: 50 },
    { game_id: 'picture_pairs',game_route: '/games/picture-pairs',difficulty: 'easy',   mode: '6 pairs',          est_duration_sec: 90 },
    { game_id: 'math_sprint',  game_route: '/games/math-sprint',  difficulty: 'easy',   mode: '30s',              est_duration_sec: 35 },
    { game_id: 'pattern',      game_route: '/games/pattern',      difficulty: 'easy',   trials: 5,                est_duration_sec: 90 },
  ],
  // ВТ — фокус + spatial training (Mental Rotation 1× из 3×/нед для слабого места)
  2: [
    { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'medium', mode: '5x5',  est_duration_sec: 60 },
    { game_id: 'flanker',        game_route: '/games/flanker',         difficulty: 'medium', trials: 20,    est_duration_sec: 90 },
    { game_id: 'mental_rotation',game_route: '/games/mental-rotation', difficulty: 'easy',   trials: 5,     est_duration_sec: 90 },
    { game_id: 'posner',         game_route: '/games/posner',          difficulty: 'medium', trials: 20,    est_duration_sec: 90 },
    { game_id: 'sdmt',           game_route: '/games/sdmt',            difficulty: 'medium', mode: '60s',   est_duration_sec: 70 },
  ],
  // СР — rest day (Brain Workshop)
  3: [],
  // ЧТ — PEAK MEASUREMENT (after BOOST)
  4: FIXED_BATTERY,
  // ПТ — Inhibition Stack (D3) + Mental Rotation (2× из 3×/нед для слабого места)
  //   flanker    = spatial interference
  //   stroop     = lexical interference
  //   switching  = rule-based interference
  //   mental_rotation = spatial cooldown (medium difficulty — повышение от ВТ easy)
  5: [
    { game_id: 'flanker',         game_route: '/games/flanker',         difficulty: 'medium', trials: 20,                     est_duration_sec: 90 },
    { game_id: 'stroop',          game_route: '/games/stroop',          difficulty: 'medium', trials: 20, mode: 'classic',    est_duration_sec: 70 },
    { game_id: 'switching_task',  game_route: '/games/switching-task',  difficulty: 'medium', trials: 20,                     est_duration_sec: 120 },
    { game_id: 'mental_rotation', game_route: '/games/mental-rotation', difficulty: 'medium', trials: 5,                      est_duration_sec: 90 },
  ],
  // СБ — logic + verbal touch (Mental Rotation в 3-й раз/нед остаётся; Word Pairs добавлен
  // как 6-я игра — следствие коллегиного решения 2: умеренная вербалка раз в неделю
  // без выкидывания SET, который Денис любит за абстрактный attribute-mapping)
  6: [
    { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'hard',   mode: '6x6',           est_duration_sec: 90 },
    { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'medium', trials: 10,            est_duration_sec: 120 },
    { game_id: 'tower_london',   game_route: '/games/tower-london',    difficulty: 'medium', trials: 5,             est_duration_sec: 150 },
    { game_id: 'set_game',       game_route: '/games/set-game',        difficulty: 'medium', trials: 6,             est_duration_sec: 120 },
    { game_id: 'mental_rotation',game_route: '/games/mental-rotation', difficulty: 'medium', trials: 10,            est_duration_sec: 120 },
    { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy',   mode: '6 pairs',       est_duration_sec: 90 },
  ],
  // ВС — BASELINE MEASUREMENT (before BOOST)
  0: FIXED_BATTERY,
};

const TRACK_LABEL: Record<string, string> = {
  training:           'тренировка',
  'measure-peak':     'ЗАМЕР · PEAK (после стека)',
  'measure-baseline': 'ЗАМЕР · BASELINE (до стека)',
  rest:               'отдых (Brain Workshop)',
  'financial-battery':'FINANCIAL · vmPFC чекап',
  'assessment':       'ОЦЕНКА ПРОФИЛЯ · 12 доменов',
};

function getTrack(weekday: Weekday): PlaylistMeta['track'] {
  if (weekday === 4) return 'measure-peak';
  if (weekday === 0) return 'measure-baseline';
  if (weekday === 3) return 'rest';
  return 'training';
}

/**
 * Build a morning warmup playlist for the given duration and current weekday.
 *
 * - duration === 5  → first N steps fitting into ~5 min
 * - duration === 10 → up to ~10 min (full ЧТ/ВС battery exactly fits here)
 * - duration === 15 → all available steps + an extra "cool-down" round
 *
 * For ЧТ/ВС this returns the FIXED battery regardless of duration request
 * (you cannot half-measure a baseline — either you do it or you don't).
 */
export function buildMorningWarmupPlaylist(opts: {
  duration: 5 | 10 | 15;
  weekday: Weekday;
  history?: GameSession[];
  profilePlaylists?: Partial<Record<Weekday, PlaylistStep[]>>;  // E1: per-profile override
}): PlaylistMeta {
  const { duration, weekday, profilePlaylists } = opts;
  const track = getTrack(weekday);
  let steps: PlaylistStep[];

  if (track === 'rest') {
    steps = [];
  } else if (track === 'measure-peak' || track === 'measure-baseline') {
    // Fixed battery — duration is essentially always 10 min (~9 actually)
    steps = FIXED_BATTERY.map((s) => ({ ...s }));
  } else {
    // Training — adjust by duration. If profile has custom playlist for this weekday, use it.
    const allSteps = (profilePlaylists && profilePlaylists[weekday]) || TRAINING_BY_WEEKDAY[weekday];
    const targetSec = duration * 60;
    if (duration === 5) {
      steps = pickSteps(allSteps, targetSec);
    } else if (duration === 10) {
      // 10-min: include all base steps + 1-2 cooldown.
      // For CPT_DAYS: replace cooldown with CPT-4min (sustained attention finale).
      steps = [...allSteps];
      const remaining = targetSec - sumDuration(steps);
      if (CPT_DAYS.has(weekday) && remaining >= CPT_STEP.est_duration_sec - 30) {
        steps.push(CPT_STEP);
      } else {
        steps.push(...pickCooldown(weekday, remaining));
      }
    } else {
      // 15-min: all base + cooldown + CPT (if attention/logic day)
      steps = [...allSteps];
      const remainingFor = (s: PlaylistStep[]) => targetSec - sumDuration(s);
      if (CPT_DAYS.has(weekday)) {
        steps.push(CPT_STEP);
      }
      const cooldownExtras = pickCooldown(weekday, remainingFor(steps));
      steps.push(...cooldownExtras);
    }
  }

  return {
    duration_min: duration,
    weekday,
    weekday_name: WEEKDAY_NAMES[weekday],
    track,
    track_label: TRACK_LABEL[track],
    steps,
    est_total_sec: sumDuration(steps),
    slot: 'morning',
  };
}

function sumDuration(steps: PlaylistStep[]): number {
  return steps.reduce((s, x) => s + x.est_duration_sec, 0);
}

function pickSteps(steps: PlaylistStep[], targetSec: number): PlaylistStep[] {
  // Greedy: take steps in order until target reached
  const out: PlaylistStep[] = [];
  let acc = 0;
  for (const s of steps) {
    if (acc >= targetSec * 0.85) break;
    out.push(s);
    acc += s.est_duration_sec;
  }
  return out.length > 0 ? out : steps.slice(0, 1); // at least 1 step
}

const COOLDOWN_POOL: PlaylistStep[] = [
  { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy', mode: '6 pairs', est_duration_sec: 90 },
  { game_id: 'math_sprint',   game_route: '/games/math-sprint',   difficulty: 'easy', mode: '30s',     est_duration_sec: 35 },
  { game_id: 'memory_matrix', game_route: '/games/memory-matrix', difficulty: 'easy', mode: '4x4',     est_duration_sec: 100 },
  { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy', mode: '4 diffs', est_duration_sec: 120 },
];

// CPT — sustained attention test. Берём только для длинных пресетов (10/15 мин)
// и только в дни внимания (ВТ) или logic-day (СБ). НЕ в peak/baseline (ЧТ/ВС)
// чтобы не ломать фиксированную замерную батарею.
//
// CPT 4-min ≈ 240 сек — это полноценная самостоятельная сессия, ставится в КОНЕЦ
// серии после "разогрева" — измеряет sustained attention уже в утомлённом состоянии,
// что и есть цель: "упадёт ли внимание на 4-м часу NZT".
const CPT_STEP: PlaylistStep = {
  game_id: 'cpt',
  game_route: '/games/cpt',
  difficulty: 'medium',
  mode: '4min',
  est_duration_sec: 240,
};
const CPT_DAYS: Set<Weekday> = new Set([2, 6]); // ВТ, СБ — attention/logic days, не measurement

function pickCooldown(weekday: Weekday, secAvailable: number): PlaylistStep[] {
  const used = new Set(TRAINING_BY_WEEKDAY[weekday].map((s) => s.game_id));
  const available = COOLDOWN_POOL.filter((s) => !used.has(s.game_id));
  const out: PlaylistStep[] = [];
  let acc = 0;
  for (const s of available) {
    if (acc + s.est_duration_sec > secAvailable + 30) break;
    out.push(s);
    acc += s.est_duration_sec;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// D1 — Financial Brain Day
// vmPFC measurement battery: Iowa Gambling + BART + PRL in one session.
// Recommended frequency: 1×/2 weeks (cooldown enforced in UI).
// Direct correlate of financial decision-making for Денис's business context.

const FINANCIAL_BATTERY_PLAYLIST: PlaylistStep[] = [
  { game_id: 'iowa', game_route: '/games/iowa', difficulty: 'medium', mode: '60t',          est_duration_sec: 600, is_fixed_baseline: true },
  { game_id: 'bart', game_route: '/games/bart', difficulty: 'medium', mode: '15 balloons',  est_duration_sec: 240, is_fixed_baseline: true },
  { game_id: 'prl',  game_route: '/games/prl',  difficulty: 'medium', mode: '60t-80%',      est_duration_sec: 600, is_fixed_baseline: true },
];

export function buildFinancialBatteryPlaylist(): PlaylistMeta {
  const wd = getCurrentWeekday();
  return {
    duration_min: Math.round(FINANCIAL_BATTERY_PLAYLIST.reduce((s, x) => s + x.est_duration_sec, 0) / 60),
    weekday: wd,
    weekday_name: WEEKDAY_NAMES[wd],
    track: 'financial-battery',
    track_label: TRACK_LABEL['financial-battery'],
    steps: FINANCIAL_BATTERY_PLAYLIST.map(s => ({ ...s })),
    est_total_sec: FINANCIAL_BATTERY_PLAYLIST.reduce((s, x) => s + x.est_duration_sec, 0),
  };
}

// G1 — Initial Skill Assessment battery (12 short tests, ~12 min)
export function buildAssessmentPlaylist(): PlaylistMeta {
  // Lazy import to avoid circular dependency
  const { ASSESSMENT_PLAYLIST } = require('@/src/services/assessment');
  const wd = getCurrentWeekday();
  return {
    duration_min: Math.round(ASSESSMENT_PLAYLIST.reduce((s: number, x: PlaylistStep) => s + x.est_duration_sec, 0) / 60),
    weekday: wd,
    weekday_name: WEEKDAY_NAMES[wd],
    track: 'assessment',
    track_label: TRACK_LABEL['assessment'],
    steps: ASSESSMENT_PLAYLIST.map((s: PlaylistStep) => ({ ...s })),
    est_total_sec: ASSESSMENT_PLAYLIST.reduce((s: number, x: PlaylistStep) => s + x.est_duration_sec, 0),
  };
}

// Cooldown logic: показывать кнопку «можно сейчас» только если прошло 14+ дней
// со последней FINANCIAL сессии. Иначе — показываем сколько ещё ждать.
export const FINANCIAL_COOLDOWN_DAYS = 14;

export async function getFinancialCooldown(): Promise<{ ready: boolean; daysLeft: number; lastDate: string | null }> {
  const history = await loadWarmupHistory();
  const fin = history.filter(h => h.track === 'financial-battery' && h.completed);
  if (fin.length === 0) return { ready: true, daysLeft: 0, lastDate: null };
  const last = fin[fin.length - 1];
  const lastTime = new Date(last.date).getTime();
  const now = Date.now();
  const daysSince = Math.floor((now - lastTime) / (24 * 60 * 60 * 1000));
  const daysLeft = Math.max(0, FINANCIAL_COOLDOWN_DAYS - daysSince);
  return { ready: daysLeft <= 0, daysLeft, lastDate: last.date };
}

// ────────────────────────────────────────────────────────────────────────────
// Streak + analytics utils

const WARMUP_HISTORY_KEY = 'psygames_warmup_history';

export interface WarmupHistoryEntry {
  date: string;            // YYYY-MM-DD
  weekday: Weekday;
  duration_min: number;
  track: PlaylistMeta['track'];
  total_score: number;
  completed: boolean;      // finished all steps vs aborted
  steps_done: number;
  steps_total: number;
}

export async function loadWarmupHistory(): Promise<WarmupHistoryEntry[]> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(WARMUP_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveWarmupHistory(entry: WarmupHistoryEntry): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const cur = await loadWarmupHistory();
    cur.push(entry);
    await AsyncStorage.setItem(WARMUP_HISTORY_KEY, JSON.stringify(cur));
  } catch (e) { console.warn('Failed to save warmup history', e); }
}

// Streak with 1-day grace: ОДИН пропуск подряд не ломает streak.
// (Жизнь случается; одна суббота в командировке не должна обнулять 30 дней.)
// Два пропуска подряд = streak обрывается.
export function computeStreak(history: WarmupHistoryEntry[]): number {
  if (history.length === 0) return 0;
  const dates = new Set(history.filter((h) => h.completed).map((h) => h.date));
  let streak = 0;
  let graceUsed = false;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) {
      streak++;
      // Reset grace when day is hit — grace only saves a single isolated miss
      if (i > 0) graceUsed = false;
    } else if (i === 0) {
      // today not yet done — don't penalize
      continue;
    } else if (!graceUsed) {
      // 1-day grace
      graceUsed = true;
    } else {
      // 2nd miss in a row — streak ends
      break;
    }
  }
  return streak;
}

export function getCurrentWeekday(): Weekday {
  return new Date().getDay() as Weekday;
}

export function todayDateKey(): string {
  // ЛОКАЛЬНАЯ дата, НЕ UTC. toISOString() возвращает UTC → у UTC+5 (Екб) вечерние/ночные
  // сессии «уезжали» в соседний день и ломали стрик и счёт «сегодня» («вечер не считает»).
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * "Brain today" verdict — compares last warmup score vs the median of last 10.
 * Returns null if not enough history.
 */
export function brainTodayVerdict(history: WarmupHistoryEntry[]): {
  delta_pct: number;
  message: string;
} | null {
  const completed = history.filter((h) => h.completed);
  if (completed.length < 5) return null;        // need baseline
  const last = completed[completed.length - 1];
  const prev = completed.slice(-11, -1);        // 10 before last
  if (prev.length < 3) return null;
  const sorted = [...prev.map((h) => h.total_score)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return null;
  const delta = ((last.total_score - median) / median) * 100;
  const sign = delta >= 0 ? '+' : '';
  let msg = '';
  if (delta > 10) msg = `Сегодня на ${sign}${delta.toFixed(0)}% выше среднего — ты в форме.`;
  else if (delta < -10) msg = `Сегодня на ${delta.toFixed(0)}% ниже среднего — возможно недосып или стресс.`;
  else msg = `Сегодня в твоей норме (${sign}${delta.toFixed(0)}%).`;
  return { delta_pct: delta, message: msg };
}
