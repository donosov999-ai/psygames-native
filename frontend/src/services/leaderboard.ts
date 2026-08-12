// Анонимный лидерборд (v1.116.0, пилот на 2 играх: schulte_table_5x5 / n_back).
// Без регистрации: стабильный player_id в AsyncStorage → сервер сам генерит анон-имя
// (детерминированное от player_id) → RPC валидирует правдоподобие score и хранит
// только personal best. Архитектура — паттерн freefocusgames, но на Supabase.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/src/services/supabase';

const PLAYER_ID_KEY = 'psygames_leaderboard_player_id';
const PERSONAL_BEST_KEY = 'psygames_leaderboard_personal_best';

// Cross-platform UUID (тот же паттерн, что WarmupContext.genUUID — не изобретаем заново).
function genUUID(): string {
  try {
    // @ts-ignore — crypto may be available
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedPlayerId: string | null = null;

export async function getPlayerId(): Promise<string> {
  if (cachedPlayerId) return cachedPlayerId;
  try {
    const stored = await AsyncStorage.getItem(PLAYER_ID_KEY);
    if (stored) { cachedPlayerId = stored; return stored; }
  } catch {}
  const fresh = genUUID();
  cachedPlayerId = fresh;
  try { await AsyncStorage.setItem(PLAYER_ID_KEY, fresh); } catch {}
  return fresh;
}

export type LeaderboardGameId = 'schulte_table_5x5' | 'n_back';

function personalBestKey(gameId: LeaderboardGameId): string {
  return `${PERSONAL_BEST_KEY}_${gameId}`;
}

function isBetter(gameId: LeaderboardGameId, candidate: number, current: number): boolean {
  return gameId === 'schulte_table_5x5' ? candidate < current : candidate > current;
}

async function rememberPersonalBest(gameId: LeaderboardGameId, score: number): Promise<void> {
  if (!Number.isFinite(score)) return;
  try {
    const key = personalBestKey(gameId);
    const raw = await AsyncStorage.getItem(key);
    const current = raw === null ? null : Number(raw);
    if (current === null || !Number.isFinite(current) || isBetter(gameId, score, current)) {
      await AsyncStorage.setItem(key, String(score));
    }
  } catch {}
}

/** Личный рекорд нужен как офлайн-фолбэк, когда общий лидерборд недоступен. */
export async function getPersonalBest(gameId: LeaderboardGameId): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(personalBestKey(gameId));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export interface SubmitScoreResult {
  ok: boolean;
  improved?: boolean;
  playerName?: string;
  error?: string;
}

/** Отправить результат — тихо игнорит сетевые ошибки (лидерборд необязателен для игры). */
export async function submitScore(gameId: LeaderboardGameId, score: number): Promise<SubmitScoreResult> {
  // Сначала локально: даже при отсутствии сети результат не должен потеряться.
  await rememberPersonalBest(gameId, score);
  try {
    const playerId = await getPlayerId();
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_submit_score', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_score: score,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: !!data?.ok, improved: !!data?.improved, playerName: data?.player_name, error: data?.error };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface LeaderboardEntry {
  player_name: string;
  score: number;
  updated_at: string;
}

export async function fetchTop(gameId: LeaderboardGameId, limit = 20): Promise<LeaderboardEntry[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_leaderboard_top', { p_game_id: gameId, p_limit: limit });
    if (error || !data) return [];
    return data as LeaderboardEntry[];
  } catch {
    return [];
  }
}

/** Лучший результат среди игроков; сеть/пустая таблица → null без ошибки для UI. */
export async function fetchBest(gameId: LeaderboardGameId): Promise<number | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_leaderboard_top', { p_game_id: gameId, p_limit: 1 });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const score = Number(data[0]?.score);
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}
