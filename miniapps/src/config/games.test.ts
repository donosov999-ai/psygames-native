import { describe, expect, it } from 'vitest';
import { GAMES } from './games';

describe('mini-app catalogue', () => {
  it('contains the nine unique games in the agreed order', () => {
    expect(GAMES).toHaveLength(9);
    expect(GAMES.map((game) => game.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(GAMES.map((game) => game.slug)).size).toBe(9);
  });

  it('keeps every game mapped to at least three placements', () => {
    for (const game of GAMES) expect(game.platforms.length).toBeGreaterThanOrEqual(3);
  });

  it('matches the agreed placement matrix exactly', () => {
    expect(Object.fromEntries(GAMES.map((game) => [game.slug, game.platforms]))).toEqual({
      '3-minute-brain-check': ['vk', 'telegram', 'web', 'facebook'],
      'schulte-speed': ['vk', 'telegram', 'ok', 'web'],
      'reaction-duel': ['vk', 'telegram', 'ok', 'facebook'],
      'memory-matrix': ['vk', 'telegram', 'web', 'facebook'],
      'stroop-challenge': ['vk', 'telegram', 'ok', 'web'],
      'n-back-daily': ['telegram', 'web', 'vk'],
      'impulse-control': ['vk', 'telegram', 'web'],
      'tower-puzzle': ['vk', 'telegram', 'ok', 'facebook'],
      'focus-defender': ['vk', 'telegram', 'web', 'facebook'],
    });
  });
});
