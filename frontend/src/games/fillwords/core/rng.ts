/* psygames-fillwords-rng · VER 1 · 22.08.2026 */
/**
 * ДЕТЕРМИНИРОВАННЫЙ ГПСЧ ФИЛВОРДОВ.
 *
 * ЗАЧЕМ СВОЙ, А НЕ `Math.random()`. Поле собирается перебором с откатами
 * (гамильтонов путь, набор длин слов). Отладить такое на `Math.random()`
 * нельзя: упавший случай не воспроизвести, и гейт «поле покрыто целиком» ловил
 * бы плавающую редкость раз в сотню прогонов, ничего не сообщая о том, КАКОЕ
 * поле сломалось. С зерном каждый случай именуем: `seed` в отчёте — и раскладка
 * восстанавливается один в один.
 *
 * ⚠️ ЭТО НЕ КРИПТОГРАФИЯ. mulberry32 — быстрый счётчик с хорошим перемешиванием
 * младших битов, ровно то, что нужно для раскладки. Использовать его для чего-то,
 * что нужно защищать, нельзя.
 */

export interface FillwordsRng {
  /** Дробное в [0, 1). */
  next(): number;
  /** Целое в [0, max). При max <= 0 отдаёт 0 — вызывающему не нужно сторожить. */
  int(max: number): number;
  /** Случайный элемент; пустой массив → undefined (проверяет вызывающий). */
  pick<T>(items: readonly T[]): T | undefined;
  /** Перемешивание НА МЕСТЕ (Фишер–Йетс) — возвращает тот же массив. */
  shuffle<T>(items: T[]): T[];
}

/** Зерно приводим к целому 32 бита: NaN, дроби и отрицательные не должны рвать поток. */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const n = Math.floor(Math.abs(seed)) % 0xffffffff;
  return n === 0 ? 1 : n;
}

export function createRng(seed: number): FillwordsRng {
  let state = normalizeSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number): number => (max <= 0 ? 0 : Math.floor(next() * max) % max);
  return {
    next,
    int,
    pick: <T,>(items: readonly T[]): T | undefined => (items.length === 0 ? undefined : items[int(items.length)]),
    shuffle: <T,>(items: T[]): T[] => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    },
  };
}
