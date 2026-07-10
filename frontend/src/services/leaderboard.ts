// Анонимный лидерборд (v1.116.0, пилот на 2 играх: schulte_table_5x5 / n_back).
// Без регистрации: стабильный player_id в AsyncStorage → сервер сам генерит анон-имя
// (детерминированное от player_id) → RPC валидирует правдоподобие score и хранит
// только personal best. Архитектура — паттерн freefocusgames, но на Supabase.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/src/services/supabase';

const PLAYER_ID_KEY = 'psygames_leaderboard_player_id';

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

export interface SubmitScoreResult {
  ok: boolean;
  improved?: boolean;
  playerName?: string;
  error?: string;
}

/** Отправить результат — тихо игнорит сетевые ошибки (лидерборд необязателен для игры). */
export async function submitScore(gameId: LeaderboardGameId, score: number): Promise<SubmitScoreResult> {
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
