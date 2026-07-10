// Роллинг-история последних сессий на игру (для спарклайна на экране результата, v1.116.0).
// Паттерн freefocusgames (progress-history) — но локально, без бэкенда, макс 8 записей.
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_ENTRIES = 8;

function key(gameId: string, profileId: string): string {
  return `psygames_history_${gameId}_${profileId}`;
}

/** Записать результат сессии (score — та же метрика, что показывается в GameResult). */
export async function recordSessionScore(gameId: string, profileId: string, score: number): Promise<void> {
  try {
    const k = key(gameId, profileId);
    const raw = await AsyncStorage.getItem(k);
    const arr: number[] = raw ? JSON.parse(raw) : [];
    arr.push(score);
    while (arr.length > MAX_ENTRIES) arr.shift();
    await AsyncStorage.setItem(k, JSON.stringify(arr));
  } catch {}
}

/** Прочитать историю (без текущей сессии — записывать ПОСЛЕ чтения, не до). */
export async function getSessionHistory(gameId: string, profileId: string): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(key(gameId, profileId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
