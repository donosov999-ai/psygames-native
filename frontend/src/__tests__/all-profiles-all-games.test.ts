import { GAMES, visibleInCatalog } from '@/src/constants/games';
import {
  ALL_PROFILES_ALL_GAMES,
  PROFILES,
  filterAllowedGames,
  isGameAllowed,
  profileWithAllGames,
} from '@/src/constants/profiles';
import { HUB_CONTENTS, visibleHubCards, установитьХабыИзФайла } from '@/src/constants/hubContents';
import { GAME_SUITES } from '@/src/constants/gameSuites';

declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

describe('временный полный каталог во всех профилях', () => {
  it('131 публичная игра/режим открыты каждому профилю', () => {
    expect(ALL_PROFILES_ALL_GAMES).toBe(true);
    expect(PROFILES).toHaveLength(13);
    const publicGames = GAMES.filter((g) => !g.sandbox);
    for (const profile of PROFILES) {
      const allowed = filterAllowedGames(profile);
      for (const game of publicGames) {
        expect(isGameAllowed(profile, game.id)).toBe(true);
        expect(allowed.some((g) => g.id === game.id)).toBe(true);
      }
    }
  });

  it('все первые 131 канонических маршрутов достижимы из каталога или хабов', () => {
    const canonical = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../../flutter/test/fixtures/outcome-canonical-145.json'),
      'utf8',
    )) as { route: string }[];
    const layouts = require('@/src/constants/defaultPlaylists.json').профили;
    expect(canonical.slice(0, 131)).toHaveLength(131);
    for (const profile of PROFILES) {
      установитьХабыИзФайла(layouts[profile.id]?.хабы ?? null);
      const games = filterAllowedGames(profile);
      const visibleCatalog = visibleInCatalog(games, profile.id);
      const reachable = new Set(visibleCatalog.map((g) => g.route));
      for (const hub of Object.keys(HUB_CONTENTS)) {
        const allowed = new Set(games.map((g) => g.route));
        for (const card of visibleHubCards(hub, allowed, (k) => k)) {
          reachable.add(card.route);
          if (card.card.suiteId) {
            const suite = GAME_SUITES.find((s) => s.id === card.card.suiteId);
            for (const mode of suite?.modes ?? []) reachable.add(mode.route);
          }
        }
      }
      const missing = canonical.slice(0, 131).filter((row) => {
        if (reachable.has(row.route)) return false;
        if ([...reachable].some((route) => route.startsWith(`${row.route}?`))) return false;
        return row.route !== '/games/sudoku-fractal-deep' || !reachable.has('/games/sudoku-fractal');
      });
      expect(missing.map((row) => `${profile.id}: ${row.route}`)).toEqual([]);
    }
    установитьХабыИзФайла(null);
  });

  it('временный доступ не затирает сохранённый состав профиля', () => {
    const original = PROFILES.find((p) => p.id === 'free')!;
    const before = original.allowed_games;
    const overlaid = { ...original, allowed_games: ['sudoku'], closed_games: ['chess'] };
    const opened = profileWithAllGames(overlaid);
    expect(opened.allowed_games).toBe('all');
    expect(opened.closed_games).toEqual([]);
    expect(overlaid.allowed_games).toEqual(['sudoku']);
    expect(overlaid.closed_games).toEqual(['chess']);
    expect(original.allowed_games).toBe(before);
  });
});
