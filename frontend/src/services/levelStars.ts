/**
 * levelStars — лучшие звёзды (1-3) по каждому пройденному уровню, per-game per-profile.
 * Ключ AsyncStorage: `psygames_<gameId>_stars_<profileId>` → JSON {level: stars}.
 * Пишется из LevelCleared (единая точка авто-потока — уже знает level+stars).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type StarsMap = Record<number, number>;

function key(gameId: string, profileId: string): string {
  return `psygames_${gameId}_stars_${profileId}`;
}

export async function saveLevelStars(gameId: string, profileId: string, level: number, stars: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(key(gameId, profileId));
    const map: StarsMap = raw ? JSON.parse(raw) : {};
    if ((map[level] || 0) < stars) {
      map[level] = stars;
      await AsyncStorage.setItem(key(gameId, profileId), JSON.stringify(map));
    }
  } catch {}
}

export async function getLevelStars(gameId: string, profileId: string): Promise<StarsMap> {
  try {
    const raw = await AsyncStorage.getItem(key(gameId, profileId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
