/**
 * ТЁПЛЫЙ КЭШ УРОВНЕЙ — чтобы «на чём играть» было известно уже на первом кадре.
 *
 * 🔴 ЗАЧЕМ. `usePersistentLevel` читает уровень из хранилища асинхронно. Промис не
 * может разрешиться раньше, чем React прогонит эффекты монтирования, — значит любой
 * автостарт («Вызов дня», онбординг) видел `level = 1` и играл первый уровень
 * человеку с двенадцатым. Тот безупречно проходил чужую лёгкую задачу, а уровень
 * не двигался: `reach(2)` при достигнутом 12 не делает ничего. Дословный репорт:
 * «уровней 15, но дальше первого я не ухожу».
 *
 * Гонку можно закрывать в каждом экране («не стартуй, пока не загрузилось») — и это
 * тоже сделано, потому что доказуемость важнее. Но лечить причину лучше здесь: один
 * пакетный чтение всех уровней на старте приложения, и дальше хук отвечает СРАЗУ,
 * без промиса. Заодно исчезает вторая беда того же корня — обработчики, захватившие
 * первый рендер (в «Гимнастике для глаз» длительность упражнения бралась из него, и
 * упражнение обрывалось победой на четверти полосы).
 *
 * ⚠️ Кэш — не источник истины, а опережение. Запись всегда идёт в хранилище, кэш
 * обновляется вместе с ней; расхождение невозможно по построению.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Ключи вида `psygames_<gameId>_level_<pid>` и `psygames_<gameId>_failstreak_<pid>`. */
const KEY_RE = /^psygames_.+_(level|failstreak)_.+$/;

const cache = new Map<string, string | null>();
let warming: Promise<void> | null = null;
let warm = false;

/** Прогрет ли кэш: если да, значение по ключу известно синхронно. */
export const levelsWarm = (): boolean => warm;

/** Значение из кэша. `undefined` = не знаем (кэш холодный или ключа не читали). */
export const cachedLevelValue = (key: string): string | null | undefined =>
  (warm || cache.has(key) ? cache.get(key) ?? null : undefined);

/** Держим кэш в согласии с хранилищем при каждой записи. */
export function rememberLevelValue(key: string, value: string): void {
  cache.set(key, value);
}

/**
 * Прочитать все уровни одним заходом. Зовётся на старте приложения; повторный вызов
 * возвращает тот же промис, поэтому дёргать безопасно откуда угодно.
 */
export function warmLevelCache(): Promise<void> {
  if (warming) return warming;
  warming = (async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => KEY_RE.test(k));
      if (keys.length) {
        for (const [k, v] of await AsyncStorage.multiGet(keys)) cache.set(k, v);
      }
      warm = true;
    } catch {
      // Не прогрелся — не беда: хук честно уйдёт в асинхронное чтение, как раньше.
      warm = false;
    }
  })();
  return warming;
}

/** Только для проверок: вернуть кэш в исходное состояние. */
export function resetLevelCacheForTests(): void {
  cache.clear();
  warming = null;
  warm = false;
}
