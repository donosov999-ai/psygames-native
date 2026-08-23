/* psygames-service-fresh-pool · VER 1 · 23.08.2026 */
/**
 * НЕ ПОКАЗЫВАТЬ ТО, ЧТО ЧЕЛОВЕК УЖЕ ВИДЕЛ, ПОКА НЕ КОНЧИЛСЯ ЗАПАС.
 *
 * ЗАЧЕМ. Словесные игры раздают материал из фиксированного списка обычным
 * `shuffle(ВСЕ).slice(0, n)` — без памяти между сессиями. Замер 23.08.2026 по
 * `reading-span` (62 предложения, выборка симуляцией 400 прогонов):
 *
 *   уровень 3 (5 предложений за сессию): к 5-й сессии уже виденных 14%, к 10-й 30%
 *   уровень 5 (7):                       20% / 38%
 *   уровень 8 (10):                      27% / 49%
 *   уровень 12 (14):                     36% / 59%
 *
 * 🔴 Для `reading-span` это не «скучновато», а порча самой задачи. Игрок судит,
 * осмысленно ли предложение. Увидев «Солнце светит ночью на крыше» второй раз, он
 * уже не понимает предложение, а ВСПОМИНАЕТ вердикт: проверка понимания под нагрузкой
 * незаметно превращается в проверку узнавания. По времени и по очкам это не видно —
 * человек отвечает быстрее и точнее, и выглядит как рост.
 *
 * ЧТО ДЕЛАЕТ. Запоминает показанные ключи по профилю и выдаёт сначала НЕВИДАННОЕ.
 * Запас кончился — круг сбрасывается, и отсчёт начинается заново.
 *
 * ⚠️ ЭТО НЕ РАСШИРЕНИЕ КОРПУСА. Шестьдесят два предложения так и остаются
 * шестьюдесятью двумя: сервис убирает ПРЕЖДЕВРЕМЕННЫЙ повтор, а не повтор вообще.
 * При семи за сессию первый честный круг — девять сессий, дальше материал пойдёт по
 * второму разу. Настоящее лечение — больше материала, и оно требует перевода
 * (у `reading-span` сейчас два языка из двенадцати), поэтому здесь не делается.
 *
 * ⚠️ ХРАНИМ КЛЮЧИ, А НЕ НОМЕРА. Номер в списке переезжает при любой правке контента,
 * и человек получил бы «уже виденным» то, чего не видел. Ключ задаёт вызывающий —
 * для предложения это его текст на опорном языке.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Rng = () => number;

const PREFIX = 'psygames_fresh_';

/** Ключ хранилища: свой запас у каждой игры и каждого профиля. */
export function poolKey(pool: string, profileId: string | undefined): string {
  return `${PREFIX}${pool}_${profileId ?? 'guest'}`;
}

export async function readSeen(pool: string, profileId: string | undefined): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(poolKey(pool, profileId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }   // порченая запись не должна ронять игру — считаем, что не видел ничего
}

export async function writeSeen(pool: string, profileId: string | undefined, seen: string[]): Promise<void> {
  try { await AsyncStorage.setItem(poolKey(pool, profileId), JSON.stringify(seen)); } catch { /* запас — удобство, не данные: потеря не ломает партию */ }
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Чистый отбор — вся логика здесь, без хранилища, чтобы её можно было проверить.
 * Возвращает и выбранное, и НОВЫЙ список виденного (вызывающий его сохраняет).
 *
 * Порядок: сначала невиданное; не хватило — круг сброшен, добираем из остального,
 * но НИКОГДА не берём одно и то же дважды в одной раздаче.
 */
export function pickFreshFrom<T>(
  items: readonly T[], count: number, seen: readonly string[], keyOf: (item: T) => string, rng: Rng = Math.random,
): { picked: T[]; seen: string[]; wrapped: boolean } {
  const n = Math.max(0, Math.min(count, items.length));
  if (n === 0) return { picked: [], seen: [...seen], wrapped: false };

  const seenSet = new Set(seen);
  const unseen = shuffled(items.filter((it) => !seenSet.has(keyOf(it))), rng);
  const picked = unseen.slice(0, n);

  if (picked.length === n) {
    return { picked, seen: [...seen, ...picked.map(keyOf)], wrapped: false };
  }

  // Запас кончился: круг сбрасываем и добираем из того, что в эту раздачу ещё не попало.
  const takenKeys = new Set(picked.map(keyOf));
  const rest = shuffled(items.filter((it) => !takenKeys.has(keyOf(it))), rng);
  const filled = [...picked, ...rest.slice(0, n - picked.length)];
  return { picked: filled, seen: filled.map(keyOf), wrapped: true };
}

/** Обёртка с хранилищем: читает запас, отбирает, записывает обратно. */
export async function pickFresh<T>(
  pool: string, profileId: string | undefined, items: readonly T[], count: number,
  keyOf: (item: T) => string, rng: Rng = Math.random,
): Promise<{ picked: T[]; wrapped: boolean }> {
  const seen = await readSeen(pool, profileId);
  const res = pickFreshFrom(items, count, seen, keyOf, rng);
  await writeSeen(pool, profileId, res.seen);
  return { picked: res.picked, wrapped: res.wrapped };
}
