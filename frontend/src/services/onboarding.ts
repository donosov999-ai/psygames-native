import AsyncStorage from '@react-native-async-storage/async-storage';
import { GAMES, GameConfig } from '@/src/constants/games';

const PICKED_PREFIX = 'psygames_onboarding_picked_';
const LEGACY_ONBOARDED_KEY = 'psygames_onboarded';

/** Три простые игры из бесплатного профиля: память / внимание / логика. */
export const ONBOARDING_GAME_IDS = ['picture_pairs', 'schulte_table', 'hanoi'] as const;

export function onboardingPickedKey(profileId: string): string {
  return `${PICKED_PREFIX}${profileId}`;
}

export function getOnboardingGames(catalog: GameConfig[] = GAMES): GameConfig[] {
  return ONBOARDING_GAME_IDS
    .map((id) => catalog.find((game) => game.id === id))
    .filter((game): game is GameConfig => !!game);
}

export type OnboardingGate = 'show' | 'hide' | 'migrate-legacy';

/** Чистая часть гейта — отдельно тестируется без AsyncStorage. */
export function resolveOnboardingGate(input: {
  pickedForProfile: boolean;
  legacyOnboarded: boolean;
  hasAnyPickerFlag: boolean;
}): OnboardingGate {
  if (input.pickedForProfile) return 'hide';
  // Старого пользователя не встречаем новым экраном внезапно после обновления.
  // Один раз переносим глобальный флаг на его текущий профиль; для следующего
  // впервые выбранного профиля уже покажется собственный picker.
  if (input.legacyOnboarded && !input.hasAnyPickerFlag) return 'migrate-legacy';
  return 'show';
}

export async function markOnboardingPicked(profileId: string): Promise<void> {
  await AsyncStorage.multiSet([
    [onboardingPickedKey(profileId), '1'],
    [LEGACY_ONBOARDED_KEY, 'true'],
  ]);
}

/**
 * Показывать ли picker на главной. Ошибка локального storage не должна
 * запирать человека в онбординге — в этом случае безопасно открываем главную.
 */
export async function shouldOpenOnboardingPicker(profileId: string): Promise<boolean> {
  try {
    const key = onboardingPickedKey(profileId);
    const [values, allKeys] = await Promise.all([
      AsyncStorage.multiGet([key, LEGACY_ONBOARDED_KEY]),
      AsyncStorage.getAllKeys(),
    ]);
    const picked = values[0]?.[1];
    const legacy = values[1]?.[1];
    const gate = resolveOnboardingGate({
      pickedForProfile: picked === '1',
      legacyOnboarded: legacy === 'true',
      hasAnyPickerFlag: allKeys.some((storedKey) => storedKey.startsWith(PICKED_PREFIX)),
    });
    if (gate === 'migrate-legacy') {
      await markOnboardingPicked(profileId);
      return false;
    }
    return gate === 'show';
  } catch {
    return false;
  }
}

export async function hasPickedOnboarding(profileId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(onboardingPickedKey(profileId))) === '1'; }
  catch { return false; }
}
