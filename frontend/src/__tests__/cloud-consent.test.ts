import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLOUD_CONSENT_KEY, cloudConsentGranted } from '@/src/services/cloudConsent';
import { flushOutbox, saveSession } from '@/src/services/api';

const mockInsert = jest.fn(async (_row?: unknown) => ({ error: null }));
jest.mock('@/src/services/supabase', () => ({
  getSupabase: () => ({ from: () => ({ insert: mockInsert }) }),
  SUPABASE_TABLE: 'cognitive_sessions',
  currentSupabaseBase: () => 'direct',
}));

beforeEach(async () => { await AsyncStorage.clear(); mockInsert.mockClear(); });
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('missing, disabled and malformed consent are OFF', async () => {
  expect(await cloudConsentGranted()).toBe(false);
  for (const value of ['0', 'true', 'false', '', 'null']) {
    await AsyncStorage.setItem(CLOUD_CONSENT_KEY, value);
    expect(await cloudConsentGranted()).toBe(false);
  }
  await AsyncStorage.setItem(CLOUD_CONSENT_KEY, '1');
  expect(await cloudConsentGranted()).toBe(true);
});

test('a local game still saves without sending or enqueueing it', async () => {
  const saved = await saveSession({ game_type: 'sudoku', score: 3, time_seconds: 5 });
  await tick();
  expect(saved.id).toBeTruthy();
  expect(JSON.parse((await AsyncStorage.getItem('psygames_sessions'))!)).toHaveLength(1);
  expect(mockInsert).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('psygames_sessions_outbox')).toBeNull();
});

test('opt-in sends results; revocation prevents the next upload', async () => {
  await AsyncStorage.setItem(CLOUD_CONSENT_KEY, '1');
  await saveSession({ game_type: 'sudoku', score: 3, time_seconds: 5 });
  await tick();
  expect(mockInsert).toHaveBeenCalledTimes(1);
  await AsyncStorage.setItem(CLOUD_CONSENT_KEY, '0');
  await saveSession({ game_type: 'sudoku', score: 4, time_seconds: 6 });
  await tick();
  expect(mockInsert).toHaveBeenCalledTimes(1);
});

test('outbox is preserved when consent is OFF', async () => {
  const pending = JSON.stringify([{ id: 'pending', game_type: 'sudoku' }]);
  await AsyncStorage.setItem('psygames_sessions_outbox', pending);
  await flushOutbox();
  expect(mockInsert).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('psygames_sessions_outbox')).toBe(pending);
});

test('revocation between outbox entries stops sending the remaining entries', async () => {
  await AsyncStorage.setItem(CLOUD_CONSENT_KEY, '1');
  await AsyncStorage.setItem('psygames_sessions_outbox', JSON.stringify([{ id: 'one' }, { id: 'two' }]));
  mockInsert.mockImplementationOnce(async () => {
    await AsyncStorage.setItem(CLOUD_CONSENT_KEY, '0');
    return { error: null };
  });
  await flushOutbox();
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await AsyncStorage.getItem('psygames_sessions_outbox'))!)).toEqual([{ id: 'two' }]);
});
