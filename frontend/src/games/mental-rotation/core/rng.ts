/* psygames-mental-rotation-rng · VER 1 · 23.08.2026 */
/**
 * СЛУЧАЙНОСТЬ, КОТОРУЮ МОЖНО ПОВТОРИТЬ.
 *
 * В бою пробы строятся на `Math.random`, и это правильно: одинаковые задания
 * подряд человек запоминает. Но проверить геометрию на «случайно повезло» нельзя:
 * упавшая раз в сотню проб подделка, совпавшая с правильным ответом, на прогоне
 * не воспроизведётся. Поэтому каждый строитель задания принимает `Rng`, а тесты
 * гоняют сотни проб по семени и падают на конкретном, названном в отчёте.
 *
 * Генератор — mulberry32 (тот же, что в «Соедини точки»): свой велосипед здесь
 * не нужен, нужен одинаковый ответ на одинаковое семя.
 */
import type { Rng } from './types';

export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRng(seed: string): Rng {
  let state = hashSeed(seed) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new RangeError(`пустой диапазон: ${min}..${max}`);
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) throw new RangeError('выбор из пустого набора');
  return values[randomInt(rng, 0, values.length - 1)] as T;
}

export function shuffle<T>(rng: Rng, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(rng, 0, index);
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}
