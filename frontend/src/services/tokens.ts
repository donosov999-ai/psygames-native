// Очки-геймификация для ЦЕНТРА (общий счёт профиля) — отдельно от внутриигровых очков сессии.
// Победы добавляют, ошибки вычитают. Копится со всех игр. Хранится локально (AsyncStorage), per-profile.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'psygames_tokens_v1';
let cache: Record<string, number> | null = null;

async function load(): Promise<Record<string, number>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch { cache = {}; }
  return cache;
}

export async function getTokens(profileId: string): Promise<number> {
  const c = await load();
  return c[profileId] ?? 0;
}

export async function addTokens(profileId: string, delta: number): Promise<number> {
  if (!profileId || !delta) return getTokens(profileId);
  const c = await load();
  const next = Math.max(0, (c[profileId] ?? 0) + Math.round(delta));
  c[profileId] = next;
  AsyncStorage.setItem(KEY, JSON.stringify(c)).catch(() => {});
  return next;
}

// Сколько токенов даёт сессия: счёт (победа) добавляет, ошибки вычитают. Может быть отрицательным.
export function tokenDelta(score: number, errors: number): number {
  return Math.round((score || 0) / 20) - (errors || 0);
}
