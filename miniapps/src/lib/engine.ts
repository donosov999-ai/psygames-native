export type RandomSource = () => number;

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function mulberry32(seed: number): RandomSource {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function randomInt(min: number, max: number, random: RandomSource = Math.random): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function pickUnique(total: number, count: number, random: RandomSource = Math.random): number[] {
  return shuffle(Array.from({ length: total }, (_, index) => index), random).slice(0, Math.min(total, count));
}

export type StroopColorId = 'red' | 'blue' | 'green' | 'yellow';

export interface StroopTrial {
  word: StroopColorId;
  ink: StroopColorId;
}

export const STROOP_COLORS: StroopColorId[] = ['red', 'blue', 'green', 'yellow'];

export function makeStroopTrial(random: RandomSource = Math.random, incongruentRatio = 0.75): StroopTrial {
  const ink = STROOP_COLORS[randomInt(0, STROOP_COLORS.length - 1, random)];
  if (random() > incongruentRatio) return { word: ink, ink };
  const alternatives = STROOP_COLORS.filter((color) => color !== ink);
  return { word: alternatives[randomInt(0, alternatives.length - 1, random)], ink };
}

export interface FlankerTrial {
  center: 'left' | 'right';
  kind: 'congruent' | 'incongruent' | 'neutral';
  flankers: Array<'left' | 'right'> | null;
}

export function makeFlankerTrial(random: RandomSource = Math.random, pCongruent = 0.4, pIncongruent = 0.45): FlankerTrial {
  const center = random() < 0.5 ? 'left' : 'right';
  const roll = random();
  const kind = roll < pCongruent ? 'congruent' : roll < pCongruent + pIncongruent ? 'incongruent' : 'neutral';
  if (kind === 'neutral') return { center, kind, flankers: null };
  const flankDirection = kind === 'congruent' ? center : center === 'left' ? 'right' : 'left';
  return { center, kind, flankers: [flankDirection, flankDirection, flankDirection, flankDirection] };
}

export interface NBackSequence {
  positions: number[];
  targets: boolean[];
}

export function makeNBackSequence(length: number, n: number, random: RandomSource = Math.random, targetRate = 0.3): NBackSequence {
  const positions: number[] = [];
  const targets: boolean[] = [];
  for (let index = 0; index < length; index += 1) {
    const canTarget = index >= n;
    const target = canTarget && random() < targetRate;
    let position = target ? positions[index - n] : randomInt(0, 8, random);
    if (canTarget && !target && position === positions[index - n]) position = (position + randomInt(1, 8, random)) % 9;
    positions.push(position);
    targets.push(target);
  }
  return { positions, targets };
}

export function hanoiOptimalMoves(discs: number): number {
  return 2 ** discs - 1;
}

export function canMoveDisc(from: readonly number[], to: readonly number[]): boolean {
  if (!from.length) return false;
  const disc = from[from.length - 1];
  return !to.length || to[to.length - 1] > disc;
}

export function moveDisc(pegs: readonly number[][], from: number, to: number): number[][] | null {
  if (from === to || !pegs[from] || !pegs[to] || !canMoveDisc(pegs[from], pegs[to])) return null;
  const next = pegs.map((peg) => [...peg]);
  next[to].push(next[from].pop()!);
  return next;
}

export interface BrainInputs {
  reactionMs: number;
  memoryAccuracy: number;
  stroopAccuracy: number;
  controlAccuracy: number;
}

export function scoreBrainCheck(input: BrainInputs) {
  const speed = Math.round(clamp(110 - (input.reactionMs - 180) / 4.2));
  const memory = Math.round(clamp(input.memoryAccuracy * 100));
  const attention = Math.round(clamp(input.stroopAccuracy * 100));
  const control = Math.round(clamp(input.controlAccuracy * 100));
  const total = Math.round((speed + memory + attention + control) / 4);
  return { speed, memory, attention, control, total };
}
