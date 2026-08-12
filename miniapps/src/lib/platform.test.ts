import { describe, expect, it } from 'vitest';
import { buildPsyGamesUrl } from './platform';
import { GAME_BY_SLUG } from '../config/games';

describe('PsyGames conversion funnel', () => {
  it('sends every mini-game to the multi-platform download page', () => {
    const url = new URL(buildPsyGamesUrl(GAME_BY_SLUG['schulte-speed'], 'web'));
    expect(url.origin + url.pathname).toBe('https://psy-games.pro/download/');
    expect(url.searchParams.get('utm_source')).toBe('web');
    expect(url.searchParams.get('utm_medium')).toBe('miniapp');
    expect(url.searchParams.get('utm_campaign')).toBe('schulte-speed');
  });
});
