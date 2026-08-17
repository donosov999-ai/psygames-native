export type Rng = () => number;

/** FNV-1a followed by mulberry32: same seed means the same sequence everywhere. */
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

export function normalizeSeed(seed: string): string {
  const normalized = seed
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'math-slider';
}

export function randomInt(rng: Rng, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`Invalid integer range: ${min}..${max}`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) throw new RangeError('Cannot pick from an empty list');
  return values[Math.floor(rng() * values.length)] as T;
}
