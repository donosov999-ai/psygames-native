import { GAMES } from '@/src/constants/games';
import {
  getOnboardingGames,
  onboardingPickedKey,
  resolveOnboardingGate,
} from '@/src/services/onboarding';

describe('first-game onboarding picker', () => {
  it('uses three fixed diverse games and their canonical catalog routes', () => {
    const games = getOnboardingGames();
    expect(games.map((game) => game.id)).toEqual(['picture_pairs', 'schulte_table', 'hanoi']);
    expect(games.map((game) => game.category)).toEqual(['memory', 'attention', 'logic']);
    for (const game of games) {
      expect(game.route).toBe(GAMES.find((item) => item.id === game.id)?.route);
      expect(game.route.startsWith('/games/')).toBe(true);
    }
  });

  it('scopes the one-time flag to the active profile', () => {
    expect(onboardingPickedKey('free')).toBe('psygames_onboarding_picked_free');
    expect(onboardingPickedKey('kids')).toBe('psygames_onboarding_picked_kids');
  });

  it('shows once, while silently migrating a legacy onboarded user', () => {
    expect(resolveOnboardingGate({ pickedForProfile: true, legacyOnboarded: true, hasAnyPickerFlag: true })).toBe('hide');
    expect(resolveOnboardingGate({ pickedForProfile: false, legacyOnboarded: false, hasAnyPickerFlag: false })).toBe('show');
    expect(resolveOnboardingGate({ pickedForProfile: false, legacyOnboarded: true, hasAnyPickerFlag: false })).toBe('migrate-legacy');
    expect(resolveOnboardingGate({ pickedForProfile: false, legacyOnboarded: true, hasAnyPickerFlag: true })).toBe('show');
  });
});
