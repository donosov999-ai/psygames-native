import AsyncStorage from '@react-native-async-storage/async-storage';

/** Explicit opt-in, shared with Flutter. Missing/corrupt/unreadable means OFF. */
export const CLOUD_CONSENT_KEY = 'psygames_cloud_consent_v1';
export async function cloudConsentGranted(): Promise<boolean> {
  try { return await AsyncStorage.getItem(CLOUD_CONSENT_KEY) === '1'; }
  catch { return false; }
}
