/**
 * G1 — Initial Skill Assessment
 *
 * 12-game cognitive battery (~12 min) covering 12 domains. Run once at first
 * use OR every 3 months to recalibrate. Output: per-domain z-scores against
 * either population norms (where available) or personal history (after 2nd run).
 *
 * Used for:
 *   1. Radar chart visualization of strengths/weaknesses
 *   2. Personalized warmup playlist generation (weak domains get more frequent
 *      training, strong domains get maintenance frequency)
 *   3. Quarterly progress tracking via re-runs
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlaylistStep } from '@/src/services/warmup';
import type { GameSession } from '@/src/services/api';

export type Domain =
  | 'wm_verbal' | 'wm_spatial' | 'wm_load'
  | 'attention_orient' | 'attention_sustained' | 'processing_speed'
  | 'inhibition' | 'flexibility'
  | 'reasoning' | 'spatial' | 'verbal_fluency' | 'risk';

export interface DomainInfo {
  id: Domain;
  label_ru: string; label_en: string;
  game_id: string;
  metric: string;            // path into details/score
  norm_mean: number;         // population norm or personal best estimate
  norm_std: number;          // expected variability
  higher_is_better: boolean; // for some biomarkers (RT, errors), lower = better
}

// Population norms (rough estimates from psychometric literature, adjusted for
// short-version game configs in this app). Calibrate to personal history after
// 5+ assessments.
export const DOMAINS: DomainInfo[] = [
  { id: 'wm_verbal',          label_ru: 'Вербальная WM',         label_en: 'Verbal WM',        game_id: 'digit_span',     metric: 'maxSpan',                norm_mean: 6.5,  norm_std: 1.5,  higher_is_better: true },
  { id: 'wm_spatial',         label_ru: 'Пространственная WM',   label_en: 'Spatial WM',       game_id: 'corsi',          metric: 'span',                   norm_mean: 5.5,  norm_std: 1.2,  higher_is_better: true },
  { id: 'wm_load',            label_ru: 'WM под нагрузкой',      label_en: 'WM under load',    game_id: 'n_back',         metric: 'd_prime',                norm_mean: 1.5,  norm_std: 0.8,  higher_is_better: true },
  { id: 'attention_orient',   label_ru: 'Внимание-orienting',    label_en: 'Orienting',        game_id: 'posner',         metric: 'validity_effect_ms',     norm_mean: 50,   norm_std: 30,   higher_is_better: false },
  { id: 'attention_sustained',label_ru: 'Устойчивое внимание',   label_en: 'Sustained',        game_id: 'cpt',            metric: 'rt_variability',         norm_mean: 0.20, norm_std: 0.08, higher_is_better: false },
  { id: 'processing_speed',   label_ru: 'Скорость обработки',    label_en: 'Speed',            game_id: 'sdmt',           metric: 'rate_per_min',           norm_mean: 50,   norm_std: 15,   higher_is_better: true },
  { id: 'inhibition',         label_ru: 'Тормозный контроль',    label_en: 'Inhibition',       game_id: 'flanker',        metric: 'flanker_effect_ms',      norm_mean: 70,   norm_std: 30,   higher_is_better: false },
  { id: 'flexibility',        label_ru: 'Гибкость',              label_en: 'Flexibility',      game_id: 'switching_task', metric: 'switch_cost_ms',         norm_mean: 150,  norm_std: 80,   higher_is_better: false },
  { id: 'reasoning',          label_ru: 'Мышление',              label_en: 'Reasoning',        game_id: 'pattern',        metric: 'hits',                   norm_mean: 4,    norm_std: 1,    higher_is_better: true },
  { id: 'spatial',            label_ru: 'Пространств. ротация',  label_en: 'Spatial rotation', game_id: 'mental_rotation',metric: 'angle_response_slope',   norm_mean: 8,    norm_std: 4,    higher_is_better: false },
  { id: 'verbal_fluency',     label_ru: 'Беглость речи',         label_en: 'Verbal fluency',   game_id: 'phonemic_fluency',metric: 'word_count',            norm_mean: 14,   norm_std: 5,    higher_is_better: true },
  { id: 'risk',               label_ru: 'Риск/решения',          label_en: 'Risk/decisions',   game_id: 'bart',           metric: 'adj_avg_pumps',          norm_mean: 30,   norm_std: 10,   higher_is_better: true },
];

// SHORT-version playlist for the assessment battery (~12 min total).
// Uses minimum trial counts that still give a stable biomarker reading.
export const ASSESSMENT_PLAYLIST: PlaylistStep[] = [
  { game_id: 'digit_span',      game_route: '/games/digit-span',       difficulty: 'medium', mode: 'forward',   est_duration_sec: 60 },
  { game_id: 'corsi',           game_route: '/games/corsi',            difficulty: 'medium', mode: 'forward',   est_duration_sec: 60 },
  { game_id: 'n_back',          game_route: '/games/n-back',           difficulty: 'medium', trials: 15, mode: '2-back', est_duration_sec: 70 },
  { game_id: 'posner',          game_route: '/games/posner',           difficulty: 'medium', trials: 15,        est_duration_sec: 70 },
  { game_id: 'cpt',             game_route: '/games/cpt',              difficulty: 'medium', mode: '4min',      est_duration_sec: 240 },
  { game_id: 'sdmt',            game_route: '/games/sdmt',             difficulty: 'medium', mode: '60s',       est_duration_sec: 70 },
  { game_id: 'flanker',         game_route: '/games/flanker',          difficulty: 'medium', trials: 15,        est_duration_sec: 70 },
  { game_id: 'switching_task',  game_route: '/games/switching-task',   difficulty: 'medium', trials: 15,        est_duration_sec: 90 },
  { game_id: 'pattern',         game_route: '/games/pattern',          difficulty: 'medium', trials: 5,         est_duration_sec: 90 },
  { game_id: 'mental_rotation', game_route: '/games/mental-rotation',  difficulty: 'medium', trials: 5,         est_duration_sec: 90 },
  { game_id: 'phonemic_fluency',game_route: '/games/phonemic-fluency', difficulty: 'medium', mode: '60s',       est_duration_sec: 70 },
  { game_id: 'bart',            game_route: '/games/bart',             difficulty: 'medium', mode: '10 balloons', est_duration_sec: 180 },
];

export interface DomainScore {
  domain: Domain;
  raw_value: number;        // value extracted from the session
  z_score: number;          // standardized (mean=0, std=1)
  percentile: number;       // 0-100
  level: 'weak' | 'avg' | 'strong';
}

export interface AssessmentResult {
  date: string;             // YYYY-MM-DD
  timestamp: string;        // ISO
  scores: DomainScore[];
  weak: Domain[];           // z < -0.5
  strong: Domain[];         // z > +1.0
}

const ASSESSMENT_HISTORY_KEY = 'psygames_assessment_history';
const USER_PROFILE_KEY = 'psygames_user_profile';

export interface UserProfile {
  assessment_date: string;
  domain_scores: Record<Domain, number>;  // z-scores
  weak_domains: Domain[];
  strong_domains: Domain[];
  recommended_focus: string[];            // game_ids
  applied_to_playlist: boolean;
}

// ─── scoring ──────────────────────────────────────────────────────────────

export function extractMetric(session: GameSession, metricKey: string): number | null {
  if (!session) return null;
  if (session.details && metricKey in session.details) {
    const v = session.details[metricKey];
    if (typeof v === 'number') return v;
  }
  // fallback to common top-level fields
  if (metricKey === 'score' && typeof session.score === 'number') return session.score;
  if (metricKey === 'errors' && typeof session.errors === 'number') return session.errors;
  return null;
}

export function scoreSessions(sessions: GameSession[]): AssessmentResult {
  const scores: DomainScore[] = [];
  for (const dom of DOMAINS) {
    const s = sessions.find(x => x.game_type === dom.game_id);
    if (!s) {
      // missing session — assume average
      scores.push({ domain: dom.id, raw_value: dom.norm_mean, z_score: 0, percentile: 50, level: 'avg' });
      continue;
    }
    const raw = extractMetric(s, dom.metric);
    if (raw === null || raw === undefined) {
      scores.push({ domain: dom.id, raw_value: dom.norm_mean, z_score: 0, percentile: 50, level: 'avg' });
      continue;
    }
    let z = (raw - dom.norm_mean) / dom.norm_std;
    if (!dom.higher_is_better) z = -z;  // flip so higher z = better always
    z = Math.max(-3, Math.min(3, z));    // clamp to ±3σ
    const percentile = Math.round(normalCDF(z) * 100);
    let level: 'weak' | 'avg' | 'strong' = 'avg';
    if (z < -0.5) level = 'weak';
    else if (z > 1.0) level = 'strong';
    scores.push({ domain: dom.id, raw_value: raw, z_score: Number(z.toFixed(2)), percentile, level });
  }
  const weak = scores.filter(s => s.level === 'weak').map(s => s.domain);
  const strong = scores.filter(s => s.level === 'strong').map(s => s.domain);
  return {
    date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
    scores,
    weak,
    strong,
  };
}

// Standard normal CDF approximation (Abramowitz-Stegun 26.2.17)
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

// ─── recommendations ──────────────────────────────────────────────────────

const DOMAIN_TO_GAMES: Record<Domain, string[]> = {
  wm_verbal: ['digit_span', 'reading_span', 'word_pairs'],
  wm_spatial: ['corsi', 'spatial_span', 'memory_matrix'],
  wm_load: ['n_back', 'ospan'],
  attention_orient: ['posner', 'ant', 'visual_search'],
  attention_sustained: ['cpt', 'targets'],
  processing_speed: ['sdmt', 'choice_rt', 'math_sprint'],
  inhibition: ['flanker', 'stroop', 'go_no_go', 'stop_signal'],
  flexibility: ['switching_task', 'wcst', 'trail_making'],
  reasoning: ['pattern', 'set_game', 'sudoku'],
  spatial: ['mental_rotation'],
  verbal_fluency: ['phonemic_fluency', 'anagrams'],
  risk: ['bart', 'iowa', 'prl'],
};

export function buildRecommendations(result: AssessmentResult): string[] {
  // Prioritize: weak domains first, then average, then strong (rarely)
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dom of result.weak) {
    for (const g of DOMAIN_TO_GAMES[dom] || []) {
      if (!seen.has(g)) { seen.add(g); out.push(g); }
    }
  }
  // Add 1-2 from average tier for variety
  const avgDomains = result.scores.filter(s => s.level === 'avg').map(s => s.domain);
  for (const dom of avgDomains.slice(0, 2)) {
    const g = (DOMAIN_TO_GAMES[dom] || [])[0];
    if (g && !seen.has(g)) { seen.add(g); out.push(g); }
  }
  return out;
}

// ─── persistence ──────────────────────────────────────────────────────────

export async function loadAssessmentHistory(): Promise<AssessmentResult[]> {
  try {
    const raw = await AsyncStorage.getItem(ASSESSMENT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveAssessmentResult(result: AssessmentResult): Promise<void> {
  try {
    const cur = await loadAssessmentHistory();
    cur.push(result);
    await AsyncStorage.setItem(ASSESSMENT_HISTORY_KEY, JSON.stringify(cur));
  } catch (e) { console.warn('Failed to save assessment:', e); }
}

export async function loadUserProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
  } catch (e) { console.warn('Failed to save profile:', e); }
}

export async function getAssessmentStatus(): Promise<{ hasAssessment: boolean; daysSince: number | null; lastDate: string | null }> {
  const history = await loadAssessmentHistory();
  if (history.length === 0) return { hasAssessment: false, daysSince: null, lastDate: null };
  const last = history[history.length - 1];
  const lastTime = new Date(last.date).getTime();
  const daysSince = Math.floor((Date.now() - lastTime) / (24 * 60 * 60 * 1000));
  return { hasAssessment: true, daysSince, lastDate: last.date };
}
