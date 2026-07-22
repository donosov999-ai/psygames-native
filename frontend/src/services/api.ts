/**
 * Local-storage replacement for the original axios-based API client.
 * Replicates `/sessions` and `/sessions/stats/{type}` entirely on the client
 * via AsyncStorage (which on web is `localStorage`). All public function
 * signatures match the original `api.ts`, so callers don't need changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GAMES } from '@/src/constants/games';
import { getSupabase, SUPABASE_TABLE } from '@/src/services/supabase';
import { IS_WEB_DEMO } from '@/src/services/buildTarget';

const STORAGE_KEY = 'psygames_sessions';
// v2 (v1.107.0): форс-ребэкфилл. Синк был мёртв ~2 месяца: клиентский upsert
// (ON CONFLICT) под anon-ролью всегда бился об RLS — у anon нет SELECT-политики,
// а ON CONFLICT обязан читать конфликтующую строку. Теперь plain insert
// (23505 = дубликат = успех), и все локальные сессии заливаются заново.
const MIGRATION_FLAG_KEY = 'psygames_supabase_migrated_v2';

export interface GameSession {
  id?: string;
  game_type: string;
  score: number;
  time_seconds: number;
  difficulty?: string;
  mode?: string;
  errors?: number;
  details?: Record<string, any>;
  timestamp?: string;

  // Supabase sync metadata (added in F2 integration).
  // session_tag: 'warmup' | 'peak' | 'baseline' | 'pre_roll' | 'episodic' | 'training' | 'manual'
  session_tag?: string;
  weekday?: number;             // 0-6 (Sun-Sat)
  duration_preset?: number;     // 5 / 10 / 15 (for warmup sessions)
  warmup_id?: string;           // shared UUID across all games in one warmup series
  stack_active?: boolean;       // NZT stack active at time of session (Денис will toggle in settings later)
  person?: string;              // 'Денис' / 'Алекс' / 'Валя' / 'Юлия' / 'Гость' (for E1)
}

export interface GameStats {
  game_type: string;
  total_sessions: number;
  total_time: number;
  average_time: number;
  best_results: GameSession[];
  total_score: number;
  average_score: number;
}

// Build the canonical list of game IDs from the GAMES catalog so any new game
// auto-appears in stats. Also union with whatever's actually been stored, so
// legacy/renamed sessions still show up.
async function listGameTypes(): Promise<string[]> {
  const fromCatalog = GAMES.map((g) => g.id);
  const stored = await readAll();
  const fromStored = Array.from(new Set(stored.map((s) => s.game_type)));
  // Union, catalog order first, then any extras from storage
  const seen = new Set(fromCatalog);
  const extras = fromStored.filter((id) => !seen.has(id));
  return [...fromCatalog, ...extras];
}

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Legacy game_type aliases — old sessions are auto-mapped on read.
// (mnemonics used to write 'word_mnemonics' / 'number_mnemonics' as separate game_types.)
const LEGACY_GAME_TYPE_MAP: Record<string, string> = {
  word_mnemonics: 'mnemonics',
  number_mnemonics: 'mnemonics',
};

function migrateSession(s: GameSession): GameSession {
  if (s.game_type && LEGACY_GAME_TYPE_MAP[s.game_type]) {
    return {
      ...s,
      game_type: LEGACY_GAME_TYPE_MAP[s.game_type],
      mode: s.mode || (s.game_type === 'word_mnemonics' ? 'words' : 'numbers'),
    };
  }
  return s;
}

async function readAll(): Promise<GameSession[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as GameSession[]).map(migrateSession);
  } catch (err) {
    console.warn('Failed to read sessions from storage:', err);
    return [];
  }
}

async function writeAll(sessions: GameSession[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn('Failed to persist sessions to storage:', err);
  }
}

// External hook for Warmup flow — set by WarmupContext at mount time.
// When set, every saveSession() also fires this callback so the warmup
// context can record the result and advance to the next game without
// any per-game patching.
type SessionListener = (s: GameSession) => Promise<void> | void;
let _sessionListener: SessionListener | null = null;
export function setSessionListener(fn: SessionListener | null) {
  _sessionListener = fn;
}

// Web bridge for the marketing site. Every trainer already saves its real
// completed round through saveSession(), so this is the single trustworthy
// place to notify the parent SEO page without patching dozens of games.
function notifyWebHost(s: GameSession): void {
  if (typeof window === 'undefined') return;
  try {
    const game = GAMES.find((item) => item.id === s.game_type);
    const detail = {
      source: 'psygames-web',
      version: 1,
      session: {
        gameType: s.game_type,
        category: game?.category,
        score: Number(s.score) || 0,
        timeSeconds: Number(s.time_seconds) || 0,
        errors: Number(s.errors) || 0,
        difficulty: s.difficulty,
        mode: s.mode,
        timestamp: s.timestamp,
        // Web-demo: помечаем сессию для сайта-хоста (demo=true + эфемерный sessionId).
        // ТОЛЬКО в демо-сборке — полный web-контракт события не меняется.
        ...(IS_WEB_DEMO
          ? { demo: true, sessionId: (globalThis as any).crypto?.randomUUID?.() ?? s.id }
          : {}),
      },
    };
    window.dispatchEvent(new CustomEvent('psygames:training-complete', { detail }));
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'psygames:training-complete', ...detail }, window.location.origin);
    }
  } catch { /* связь с хостом не должна мешать сохранению результата */ }
}

// ───────────────────────────────────────────────────────────────────────
// Session schema runtime validation — non-blocking, console.warn only.
// Catches contract drift if a game starts writing wrong types into details.

type FieldType = 'number' | 'string' | 'array' | 'optional_number' | 'optional_string';

const DETAILS_SCHEMAS: Record<string, Record<string, FieldType>> = {
  // Round 6 — biomarker games
  flanker:           { mean_rt: 'number', flanker_effect_ms: 'number' },
  switching_task:    { mean_rt: 'number', switch_cost_ms: 'number' },
  posner:            { mean_rt: 'number', validity_effect_ms: 'number' },
  ant:               { mean_rt: 'number', alerting_ms: 'number', orienting_ms: 'number', executive_ms: 'number' },
  iowa:              { adv_minus_disadv: 'number', last_block_adv: 'number', final_bank: 'number' },
  bart:              { adj_avg_pumps: 'number', total_balloons: 'number', popped_count: 'number' },
  wcst:              { perseverative: 'number' },
  corsi:             { span: 'number' },
  spatial_span:      { span: 'number' },
  digit_span:        { maxSpan: 'optional_number' },
  ospan:             { math_hits: 'number', math_errors: 'number' },
  reading_span:      { recalled: 'number' },
  tower_london:      { extra_moves: 'number', optimal_moves: 'number' },
  sdmt:              { rate_per_min: 'number' },
  stop_signal:       { hits: 'number', correct_stops: 'number', mean_rt: 'number' },
  stroop_emotional:  { mean_rt: 'number', interference_threat_ms: 'number', interference_positive_ms: 'number' },
  visual_search:     { mean_rt: 'number', n_distractors: 'number' },
  go_no_go:          { hits: 'number', misses: 'number', falseAlarms: 'number', correctRej: 'number' },
  picture_pairs:     { moves: 'number', optimal: 'number' },
  hanoi:             { moves: 'number', optimal: 'number' },
  memory_matrix:     { finalRound: 'number' },
  math_sprint:       { correct: 'number', bestStreak: 'number' },
  choice_rt:         { hits: 'number', mean_rt: 'number' },

  // Round 7 (pakeg A) — newly biomarker'd games
  stroop:            { hits: 'number', errors: 'number', mean_rt_congruent: 'number', mean_rt_incongruent: 'number', interference_ms: 'number' },
  schulte_table:     { hits: 'number', errors: 'number', total_cells: 'number', mean_rt_per_cell: 'number' },
  n_back:            { hits: 'number', misses: 'number', falseAlarms: 'number', correctRejections: 'number', d_prime: 'number', hit_rate: 'number', false_alarm_rate: 'number' },
  targets:           { hits: 'number', mean_rt: 'number', std_rt: 'number' },
  mental_rotation:   { hits: 'number', errors: 'number', mean_rt: 'number', angle_response_slope: 'number' },

  // Round 7 / C1 — CPT (Conners Not-X)
  cpt: {
    hits: 'number', omission_errors: 'number', commission_errors: 'number',
    n_targets: 'number', n_nontargets: 'number',
    mean_rt: 'number', rt_std: 'number', rt_variability: 'number',
    vigilance_decrement: 'number',
  },

  // Round 7 / C3 — PRL (Probabilistic Reversal Learning)
  prl: {
    hits: 'number', errors: 'number', n_trials: 'number', n_reversals: 'number',
    reversal_errors: 'number', perseverative_errors: 'number',
    win_stay_rate: 'number', lose_shift_rate: 'number',
    mean_post_reversal_acc: 'number', accuracy: 'number', final_bank: 'number',
  },

  // Round 7 / C2 — Phonemic Fluency (COWAT)
  phonemic_fluency: {
    word_count: 'number', repetitions: 'number',
    wrong_letter: 'number', too_short: 'number',
    mean_inter_word_sec: 'number',
    first_half_count: 'number', second_half_count: 'number',
    letter: 'string',
  },

  // Round 7 / C4 — Story Recall (Wechsler Logical Memory)
  story_recall: {
    n_keywords: 'number',
    immediate_recall_count: 'number', delayed_recall_count: 'number',
    immediate_recall_pct: 'number', delayed_recall_pct: 'number',
    retention_rate: 'number',
    distractor_score: 'number',
  },

  // Round 7 / C5 — RMET (Reading the Mind in the Eyes)
  rmet: {
    hits: 'number', errors: 'number', n_trials: 'number',
    accuracy: 'number', mean_rt: 'number',
  },

  // Pakeg A — score-only games now have hits/errors breakdown
  mnemonics:         { hits: 'optional_number', errors: 'optional_number' },
  anagrams:          { hits: 'number', errors: 'number' },
  counter:           { hits: 'number', errors: 'number' },
  find_differences:  { hits: 'number', errors: 'number' },
  number_bonds:      { hits: 'number', errors: 'number' },
  pattern:           { hits: 'number', errors: 'number' },
  proofreading:      { hits: 'number', errors: 'number' },
  set_game:          { hits: 'number', errors: 'number' },
  sudoku:            { errors: 'number' },
  trail_making:      { hits: 'number', errors: 'number' },
  word_pairs:        { hits: 'number', errors: 'number' },
  mahjong:           { level: 'number', pairs: 'optional_number', layers: 'optional_number' },
};

function validateSession(s: GameSession): void {
  if (!s.game_type) {
    console.warn('saveSession: missing game_type');
    return;
  }
  const schema = DETAILS_SCHEMAS[s.game_type];
  if (!schema) return;       // no schema = no validation, fine
  if (!s.details) {
    console.warn(`saveSession[${s.game_type}]: schema requires details but none provided`);
    return;
  }
  for (const [key, expected] of Object.entries(schema)) {
    const v = (s.details as any)[key];
    const isOptional = expected.startsWith('optional_');
    const expectedType = expected.replace('optional_', '');
    if (v === undefined) {
      if (!isOptional) console.warn(`saveSession[${s.game_type}]: missing details.${key} (expected ${expectedType})`);
      continue;
    }
    if (expectedType === 'array') {
      if (!Array.isArray(v)) console.warn(`saveSession[${s.game_type}]: details.${key} expected array, got ${typeof v}`);
    } else {
      if (typeof v !== expectedType) console.warn(`saveSession[${s.game_type}]: details.${key} expected ${expectedType}, got ${typeof v}`);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────
// F2 — Cloud sync to Supabase cognitive_sessions
// Fire-and-forget: localStorage is source of truth for offline UX,
// Supabase is long-term storage. Failed inserts log warning but don't block UI.

function buildCloudRow(s: GameSession): Record<string, any> {
  // Pull active person from global (set by ProfileContext on every profile change).
  // Falls back to session field, then to 'Денис' as ultimate default.
  const activePerson = (globalThis as any).__psygames_active_person as string | undefined;
  return {
    id: s.id,                                           // PK; ON CONFLICT DO NOTHING avoids duplicates
    person: s.person || activePerson || 'Денис',        // E1: from active profile
    game_type: s.game_type,
    score: s.score,
    time_seconds: s.time_seconds,
    difficulty: s.difficulty || null,
    mode: s.mode || null,
    errors: s.errors ?? 0,
    details: s.details ?? {},
    session_tag: s.session_tag || 'manual',
    weekday: s.weekday ?? null,
    duration_preset: s.duration_preset ?? null,
    warmup_id: s.warmup_id ?? null,
    stack_active: s.stack_active ?? null,
    client_timestamp: s.timestamp,
  };
}

// ВАЖНО: НЕ upsert/ON CONFLICT — под anon-ролью RLS требует SELECT-политику для
// чтения конфликтующей строки, которой нет (и не должно быть — чужие сессии приватны).
// Дубликат первичного ключа (23505) означает «строка уже в облаке» = успех.
function isDuplicate(error: any): boolean {
  return error?.code === '23505' || /duplicate key/i.test(error?.message || '');
}

// ─── Outbox: упавшие пуши не теряются, ретраятся при старте и следующем успехе ───
const OUTBOX_KEY = 'psygames_sessions_outbox';
const OUTBOX_CAP = 500;
let outboxNonEmpty = false;   // module-флаг: не читать storage на каждый пуш
let outboxFlushing = false;

async function readOutbox(): Promise<Record<string, any>[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function enqueueOutbox(row: Record<string, any>): Promise<void> {
  try {
    const list = await readOutbox();
    if (!list.some((r) => r.id === row.id)) {
      list.push(row);
      while (list.length > OUTBOX_CAP) list.shift();   // старейшие жертвуем последними
      await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
    }
    outboxNonEmpty = true;
  } catch {}
}

/** Дослать накопившееся. Настоящая ошибка (не дубликат) → стоп, остаток ждёт следующего раза. */
export async function flushOutbox(): Promise<void> {
  if (outboxFlushing) return;
  outboxFlushing = true;
  try {
    const list = await readOutbox();
    if (list.length === 0) { outboxNonEmpty = false; return; }
    const supabase = getSupabase();
    const remaining = [...list];
    for (const row of list) {
      const { error } = await supabase.from(SUPABASE_TABLE).insert(row);
      if (error && !isDuplicate(error)) break;   // сеть/сервер лёг — не молотим дальше
      remaining.shift();
    }
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
    outboxNonEmpty = remaining.length > 0;
    if (list.length !== remaining.length) console.log(`[F2] Outbox: дослано ${list.length - remaining.length}, осталось ${remaining.length}`);
  } catch {}
  finally { outboxFlushing = false; }
}

async function pushToCloud(s: GameSession): Promise<void> {
  const row = buildCloudRow(s);
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from(SUPABASE_TABLE).insert(row);
    if (error && !isDuplicate(error)) {
      console.warn('[F2] Supabase insert failed, → outbox:', error.message);
      await enqueueOutbox(row);
      return;
    }
    if (outboxNonEmpty) flushOutbox();   // связь есть — дошлём хвост
  } catch (e: any) {
    console.warn('[F2] Supabase sync error, → outbox:', e?.message || e);
    await enqueueOutbox(row);
  }
}

// One-shot migration: on first load after F2 deploy, backfill existing
// localStorage sessions to cloud. Sets a flag so it only runs once.
async function maybeMigrateLegacy(): Promise<void> {
  try {
    const flag = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (flag === 'done') return;
    const all = await readAll();
    if (all.length === 0) {
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'done');
      return;
    }
    const supabase = getSupabase();
    const rows = all.map(buildCloudRow);
    // Insert in batches of 100 (не upsert — см. isDuplicate). Батч с дубликатом
    // падает целиком (23505) → доотправляем его по одной строке, глотая дубли.
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from(SUPABASE_TABLE).insert(batch);
      if (error && isDuplicate(error)) {
        for (const row of batch) {
          const { error: rowErr } = await supabase.from(SUPABASE_TABLE).insert(row);
          if (rowErr && !isDuplicate(rowErr)) {
            console.warn('[F2] Migration row failed:', rowErr.message);
            return;  // stop on real error, retry next time
          }
        }
      } else if (error) {
        console.warn(`[F2] Migration batch ${i / 100} failed:`, error.message);
        return;  // stop on error, retry next time
      }
    }
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'done');
    console.log(`[F2] Migrated ${rows.length} legacy sessions to Supabase`);
  } catch (e: any) {
    console.warn('[F2] Migration error:', e?.message || e);
  }
}

// Trigger migration on module load — runs once per session, async, non-blocking.
// Web-demo: миграция/outbox выключены — демо вообще не пишет в облако
// (на /play/ могли остаться localStorage-сессии от прежней полной web-версии).
if (!IS_WEB_DEMO) {
  maybeMigrateLegacy();
  // Дослать outbox с прошлого запуска (упавшие пуши), тоже non-blocking
  flushOutbox();
}

export const saveSession = async (session: GameSession): Promise<GameSession> => {
  const stored: GameSession = {
    ...session,
    id: session.id || makeId(),
    timestamp: session.timestamp || new Date().toISOString(),
  };
  // Web-demo: НЕ пишем в storage/облако (ни сессий, ни токенов, ни ачивок) —
  // только уведомляем сайт-хост о завершённом демо-раунде (событие-канон
  // psygames:training-complete, в detail.session добавлены demo/sessionId).
  if (IS_WEB_DEMO) {
    notifyWebHost(stored);
    return stored;
  }
  validateSession(stored);   // non-blocking schema check (warnings only)
  const all = await readAll();
  all.push(stored);
  await writeAll(all);
  // Геймификация: начислить токены в ЦЕНТР (победы +, ошибки −), per-profile.
  // Плюс серия чистых раундов: с 3-го подряд errors===0 — бонус (вне зарядки,
  // у зарядки свой comboBonus ×1.5 в warmup-complete).
  try {
    const pid = (globalThis as any).__psygames_active_profile_id as string | undefined;
    if (pid) {
      const { addTokens, tokenDelta } = await import('@/src/services/tokens');
      const { tickCleanRun, cleanRunBonus } = await import('@/src/services/cleanRun');
      const clean = (stored.errors ?? 0) === 0 && (stored.score ?? 0) > 0;
      const run = await tickCleanRun(pid, clean);
      const warmupActive = (globalThis as any).__psygames_warmup_active === true;
      const bonus = clean && !warmupActive ? cleanRunBonus(run) : 0;
      addTokens(pid, tokenDelta(stored.score, stored.errors ?? 0) + bonus).catch(() => {});
    }
  } catch { /* токены некритичны */ }
  // Вызов дня: стрик коммитится за завершённый раунд игры вызова (pending пишет
  // startDailyChallenge). Await — чтобы чек ачивок ниже видел свежий стрик.
  try {
    const pid = (globalThis as any).__psygames_active_profile_id as string | undefined;
    if (pid) {
      const { commitChallengeIfPending } = await import('@/src/services/daily-challenge');
      await commitChallengeIfPending(pid, stored.game_type);
    }
  } catch { /* стрик некритичен */ }
  // Ачивки: единая точка проверки — любой завершённый раунд (не только зарядка).
  try {
    const { runAchievementsCheck } = await import('@/src/services/achievements');
    runAchievementsCheck(all).catch(() => {});
  } catch { /* ачивки некритичны */ }
  // Notify warmup context FIRST so it enriches the session with metadata,
  // then push to cloud with the enriched version.
  if (_sessionListener) {
    try { await _sessionListener(stored); }
    catch (e) { console.warn('Session listener failed:', e); }
  }
  // Fire-and-forget cloud sync (intentionally not awaited)
  pushToCloud(stored);

  // Level progression check (themed profiles only).
  // Globals are set by ProfileContext on every profile switch.
  try {
    const person = (globalThis as any).__psygames_active_person as string | undefined;
    const isThemed = (globalThis as any).__psygames_active_themed as boolean | undefined;
    if (person && isThemed) {
      // Lazy import to avoid circular dep
      const { checkAndMaybeUnlock } = await import('@/src/services/level-unlocks');
      checkAndMaybeUnlock(person, true, stored).catch((e) =>
        console.warn('level-unlock check failed:', e)
      );
    }
  } catch (e) {
    console.warn('level-unlock dispatch failed:', e);
  }

  notifyWebHost(stored);

  return stored;
};

export const getSessions = async (): Promise<GameSession[]> => readAll();

/**
 * Восстановить достигнутый уровень из durable-истории сессий (details.level).
 * Нужно, когда локальный ключ уровня (usePersistentLevel, AsyncStorage) пропал —
 * переустановка / сброс профиля / смена профиля, — а сессии-очки уцелели.
 * Уровень реконструируется как max(details.level) по игре. Default 1 (нет истории).
 * gameType здесь = gameId хука (совпадает с game_type сессий; при расхождении → 1, безопасно).
 */
export const getMaxLevelFromSessions = async (gameType: string): Promise<number> => {
  const all = await readAll();
  let max = 0;
  for (const s of all) {
    if (s.game_type !== gameType) continue;
    const lv = Number((s.details as any)?.level);
    if (Number.isFinite(lv) && lv > max) max = lv;
  }
  return max >= 1 ? max : 1;
};

export const getBestResults = async (gameType: string): Promise<GameSession | null> => {
  const all = await readAll();
  const filtered = all.filter((s) => s.game_type === gameType);
  if (!filtered.length) return null;
  filtered.sort((a, b) => a.time_seconds - b.time_seconds);
  return filtered[0];
};

export const getStats = async (gameType: string): Promise<GameStats> => {
  const all = await readAll();
  const sessions = all.filter((s) => s.game_type === gameType);

  if (!sessions.length) {
    return {
      game_type: gameType,
      total_sessions: 0,
      total_time: 0,
      average_time: 0,
      best_results: [],
      total_score: 0,
      average_score: 0,
    };
  }

  const total_sessions = sessions.length;
  // время считаем ТОЛЬКО по валидным сессиям: исключаем мусор (таймстамп-баг time_seconds≈1.78e9, NaN, <0, >24ч),
  // чтобы одна битая сессия не ломала best/average навсегда. Счётчик игр и очки — по всем.
  const validTime = sessions.filter((s) => isFinite(s.time_seconds) && s.time_seconds > 0 && s.time_seconds <= 86400);
  const total_time = validTime.reduce((sum, s) => sum + s.time_seconds, 0);
  const total_score = sessions.reduce((sum, s) => sum + (s.score || 0), 0);
  const sorted = [...validTime].sort((a, b) => a.time_seconds - b.time_seconds);

  return {
    game_type: gameType,
    total_sessions,
    total_time,
    average_time: validTime.length > 0 ? total_time / validTime.length : 0,
    best_results: sorted.slice(0, 5),
    total_score,
    average_score: total_sessions > 0 ? total_score / total_sessions : 0,
  };
};

export const getAllStats = async (): Promise<GameStats[]> => {
  const types = await listGameTypes();
  return Promise.all(types.map((type) => getStats(type)));
};

export default {
  saveSession,
  getSessions,
  getBestResults,
  getStats,
  getAllStats,
};
