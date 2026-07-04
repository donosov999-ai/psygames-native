/**
 * Сводка звёзд по уровням для карточек главного экрана: один AsyncStorage.multiGet
 * по всем играм вместо N getItem. Обновляется на фокусе (возврат из игры).
 * Данные пишет LevelCleared (psygames_<gameId>_stars_<profileId>) — бейдж
 * появляется у игры после первого пройденного уровня в авто-потоке.
 */
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import type { StarsMap } from '@/src/services/levelStars';

export interface LevelStarsSummary {
  completed: number;   // сколько уровней пройдено (со звёздами > 0)
  stars: number;       // сумма звёзд по пройденным уровням
}

export function useAllLevelStars(
  profileId: string | undefined,
  gameIds: string[],
): Record<string, LevelStarsSummary> {
  const [map, setMap] = useState<Record<string, LevelStarsSummary>>({});
  const idsKey = gameIds.join(',');

  useFocusEffect(useCallback(() => {
    if (!profileId || gameIds.length === 0) return;
    let alive = true;
    (async () => {
      try {
        const keys = gameIds.map((id) => `psygames_${id}_stars_${profileId}`);
        const pairs = await AsyncStorage.multiGet(keys);
        const out: Record<string, LevelStarsSummary> = {};
        pairs.forEach(([, v], i) => {
          if (!v) return;
          try {
            const m: StarsMap = JSON.parse(v);
            const levels = Object.keys(m).map(Number).filter((l) => (m[l] || 0) > 0);
            if (levels.length > 0) {
              out[gameIds[i]] = {
                completed: levels.length,
                stars: levels.reduce((s, l) => s + m[l], 0),
              };
            }
          } catch {}
        });
        if (alive) setMap(out);
      } catch {}
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, idsKey]));

  return map;
}
