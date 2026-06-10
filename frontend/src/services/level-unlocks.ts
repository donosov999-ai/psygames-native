/**
 * Level unlocks service — gamification for themed profiles.
 *
 * - Personal profiles (Денис/Алекс/Валя/Юля/Гость): everything unlocked.
 * - Themed profiles (chess/kids/.../free): first level unlocked,
 *   subsequent levels open via meeting thresholds (see LEVEL_PROGRESSION).
 *
 * Storage: localStorage `psygames_level_unlocks_<personId>` = JSON array
 * of `"<gameId>:<levelKey>"` strings.
 *
 * To check, the api.saveSession() call automatically passes the result
 * through `checkAndMaybeUnlock()` after every game finish. New unlocks
 * trigger a global event for the toast handler.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import {
  LEVELS_BY_GAME, LevelDef, UnlockCondition, hasLevelProgression,
} from '@/src/constants/level-progression';
import type { GameSession } from '@/src/services/api';

const KEY_PREFIX = 'psygames_level_unlocks_';
const PROGRESS_KEY_PREFIX = 'psygames_level_progress_';   // consecutive counter per (gameId:levelKey)

// ─── Helpers ─────────────────────────────────────────────────────────────

function keyFor(person: string): string {
  return KEY_PREFIX + person;
}
function progressKeyFor(person: string): string {
  return PROGRESS_KEY_PREFIX + person;
}
function entryKey(gameId: string, levelKey: string): string {
  return `${gameId}:${levelKey}`;
}

async function loadUnlockSet(person: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(person));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveUnlockSet(person: string, set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(person), JSON.stringify(Array.from(set)));
  } catch {}
}

async function loadProgress(person: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(progressKeyFor(person));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveProgress(person: string, p: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(progressKeyFor(person), JSON.stringify(p));
  } catch {}
}

// ─── Public API ──────────────────────────────────────────────────────────

/** Is this level unlocked for this person? Always true for personal profiles. */
export async function isLevelUnlocked(
  person: string,
  isThemedProfile: boolean,
  gameId: string,
  levelKey: string,
): Promise<boolean> {
  if (!isThemedProfile) return true;        // personal → no gating
  if (!hasLevelProgression(gameId)) return true;
  const game = LEVELS_BY_GAME[gameId];
  const idx = game.levels.findIndex(l => l.key === levelKey);
  if (idx <= 0) return true;                // first level always unlocked
  const set = await loadUnlockSet(person);
  return set.has(entryKey(gameId, levelKey));
}

/** List of unlocked level-keys for one game. */
export async function getUnlockedLevels(
  person: string,
  isThemedProfile: boolean,
  gameId: string,
): Promise<string[]> {
  if (!isThemedProfile || !hasLevelProgression(gameId)) {
    return LEVELS_BY_GAME[gameId]?.levels.map(l => l.key) ?? [];
  }
  const set = await loadUnlockSet(person);
  const all = LEVELS_BY_GAME[gameId].levels;
  return all.filter((l, i) => i === 0 || set.has(entryKey(gameId, l.key))).map(l => l.key);
}

/** What's the next level to unlock + what's the threshold? */
export async function getNextLockedLevel(
  person: string,
  isThemedProfile: boolean,
  gameId: string,
): Promise<{ level: LevelDef; condition: UnlockCondition; consecutiveDone: number } | null> {
  if (!isThemedProfile || !hasLevelProgression(gameId)) return null;
  const set = await loadUnlockSet(person);
  const progress = await loadProgress(person);
  const all = LEVELS_BY_GAME[gameId].levels;
  for (let i = 1; i < all.length; i++) {
    const lvl = all[i];
    if (!set.has(entryKey(gameId, lvl.key)) && lvl.unlock) {
      return {
        level: lvl,
        condition: lvl.unlock,
        consecutiveDone: progress[entryKey(gameId, lvl.key)] ?? 0,
      };
    }
  }
  return null;
}

/**
 * Extracts the metric value from a finished session that maps to the
 * unlock condition's metric type.
 */
function extractMetric(session: GameSession, metric: UnlockCondition['metric']): number | null {
  const d = session.details ?? {};
  switch (metric) {
    case 'time_seconds_max':
    case 'time_seconds_min':
      return typeof session.time_seconds === 'number' ? session.time_seconds : null;
    case 'score_min':
      return typeof session.score === 'number' ? session.score : null;
    case 'accuracy_min': {
      const acc = (d as any).accuracy ?? (d as any).hit_accuracy ?? (d as any).correct_pct;
      return typeof acc === 'number' ? acc : null;
    }
    case 'max_span_min': {
      const s = (d as any).max_span ?? (d as any).span ?? (d as any).maxSpan;
      return typeof s === 'number' ? s : null;
    }
    case 'd_prime_min': {
      const dp = (d as any).d_prime ?? (d as any).dPrime;
      return typeof dp === 'number' ? dp : null;
    }
    case 'hits_min': {
      const h = (d as any).hits ?? (d as any).correct_count ?? session.score;
      return typeof h === 'number' ? h : null;
    }
    case 'mean_rt_max': {
      const rt = (d as any).mean_rt ?? (d as any).avgRT;
      return typeof rt === 'number' ? rt : null;
    }
  }
  return null;
}

/** Check threshold direction. */
function passesThreshold(value: number, condition: UnlockCondition): boolean {
  switch (condition.metric) {
    case 'time_seconds_max':   // lower-is-better
    case 'mean_rt_max':
      return value <= condition.threshold;
    case 'time_seconds_min':
    case 'score_min':
    case 'accuracy_min':
    case 'max_span_min':
    case 'd_prime_min':
    case 'hits_min':
      return value >= condition.threshold;
  }
}

/** Find which level was played in this session (matches by difficulty/mode). */
function detectLevelPlayed(session: GameSession): { gameId: string; levelKey: string } | null {
  if (!hasLevelProgression(session.game_type)) return null;
  const game = LEVELS_BY_GAME[session.game_type];
  const matchValue = game.match_by === 'mode' ? session.mode : session.difficulty;
  if (!matchValue) return null;
  const lvl = game.levels.find(l => l.key === matchValue);
  return lvl ? { gameId: session.game_type, levelKey: lvl.key } : null;
}

/**
 * Called automatically after every saveSession(). If the result passes
 * a threshold AND that level was the highest currently unlocked AND the
 * NEXT level is gated by exactly that threshold → unlock it.
 *
 * Returns: { unlocked: LevelDef | null, progress?: number, needed?: number }
 * to allow the UI to show a toast.
 */
export async function checkAndMaybeUnlock(
  person: string,
  isThemedProfile: boolean,
  session: GameSession,
): Promise<{ unlocked: LevelDef | null; consecutiveDone?: number; consecutiveNeeded?: number }> {
  if (!isThemedProfile) return { unlocked: null };
  const played = detectLevelPlayed(session);
  if (!played) return { unlocked: null };

  const game = LEVELS_BY_GAME[played.gameId];
  const playedIdx = game.levels.findIndex(l => l.key === played.levelKey);
  // We can potentially unlock the NEXT level (playedIdx + 1)
  const nextLvl = game.levels[playedIdx + 1];
  if (!nextLvl || !nextLvl.unlock) return { unlocked: null };

  const set = await loadUnlockSet(person);
  if (set.has(entryKey(played.gameId, nextLvl.key))) {
    return { unlocked: null };  // already unlocked
  }

  const value = extractMetric(session, nextLvl.unlock.metric);
  if (value === null) return { unlocked: null };

  if (!passesThreshold(value, nextLvl.unlock)) {
    // Reset consecutive counter for this transition
    if (nextLvl.unlock.consecutive && nextLvl.unlock.consecutive > 1) {
      const progress = await loadProgress(person);
      progress[entryKey(played.gameId, nextLvl.key)] = 0;
      await saveProgress(person, progress);
    }
    return { unlocked: null };
  }

  // Threshold met. Handle consecutive requirement.
  const needed = nextLvl.unlock.consecutive ?? 1;
  if (needed > 1) {
    const progress = await loadProgress(person);
    const done = (progress[entryKey(played.gameId, nextLvl.key)] ?? 0) + 1;
    progress[entryKey(played.gameId, nextLvl.key)] = done;
    await saveProgress(person, progress);
    if (done < needed) {
      return { unlocked: null, consecutiveDone: done, consecutiveNeeded: needed };
    }
  }

  // 🎉 Unlock!
  set.add(entryKey(played.gameId, nextLvl.key));
  await saveUnlockSet(person, set);

  // Emit global event for UI toast (cross-platform: RN DeviceEventEmitter — native + web/Tauri)
  try {
    DeviceEventEmitter.emit('psygames:level-unlocked', {
      gameId: played.gameId, levelKey: nextLvl.key, label: nextLvl.label,
    });
  } catch {}

  return { unlocked: nextLvl };
}
