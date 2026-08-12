import { describe, expect, it } from 'vitest';
import {
  canMoveDisc,
  hanoiOptimalMoves,
  makeFlankerTrial,
  makeNBackSequence,
  makeStroopTrial,
  moveDisc,
  mulberry32,
  pickUnique,
  scoreBrainCheck,
  shuffle,
} from './engine';

describe('shared game engine', () => {
  it('creates deterministic permutations without losing values', () => {
    const first = shuffle([1, 2, 3, 4, 5], mulberry32(42));
    const second = shuffle([1, 2, 3, 4, 5], mulberry32(42));
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(pickUnique(25, 7, mulberry32(7))).size).toBe(7);
  });

  it('generates valid Stroop and Flanker trials', () => {
    const stroop = makeStroopTrial(() => 0, 1);
    expect(stroop.ink).not.toBe(stroop.word);
    const flanker = makeFlankerTrial(() => 0.42, 0.4, 0.45);
    expect(flanker.kind).toBe('incongruent');
    expect(flanker.flankers?.every((direction) => direction !== flanker.center)).toBe(true);
  });

  it('marks N-back targets and protects non-targets', () => {
    const n = 2;
    const sequence = makeNBackSequence(40, n, mulberry32(19), 0.45);
    sequence.targets.forEach((target, index) => {
      if (index < n) expect(target).toBe(false);
      else if (target) expect(sequence.positions[index]).toBe(sequence.positions[index - n]);
      else expect(sequence.positions[index]).not.toBe(sequence.positions[index - n]);
    });
  });

  it('enforces Hanoi moves and optimal counts', () => {
    expect(hanoiOptimalMoves(3)).toBe(7);
    expect(canMoveDisc([3, 2, 1], [])).toBe(true);
    expect(canMoveDisc([3], [2, 1])).toBe(false);
    expect(moveDisc([[3, 2, 1], [], []], 0, 2)).toEqual([[3, 2], [], [1]]);
    expect(moveDisc([[3], [2, 1], []], 0, 1)).toBeNull();
  });

  it('keeps the Brain Check profile inside a 0–100 scale', () => {
    expect(scoreBrainCheck({ reactionMs: 220, memoryAccuracy: 0.8, stroopAccuracy: 0.75, controlAccuracy: 0.9 })).toEqual({
      speed: 100,
      memory: 80,
      attention: 75,
      control: 90,
      total: 86,
    });
    expect(scoreBrainCheck({ reactionMs: 2_000, memoryAccuracy: -1, stroopAccuracy: 2, controlAccuracy: 0 })).toEqual({
      speed: 0,
      memory: 0,
      attention: 100,
      control: 0,
      total: 25,
    });
  });
});
