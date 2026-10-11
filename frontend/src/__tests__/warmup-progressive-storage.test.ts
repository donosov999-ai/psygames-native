/** Behavioral hook + real local API/AsyncStorage. No remote calls and no source-text assertions. */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersistentLevel, type PersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { getMaxLevelFromSessions, getSessions, saveSession, setSessionListener } from '@/src/services/api';
import { cachedLevelValue, rememberLevelValue, resetLevelCacheForTests } from '@/src/services/levelCache';
import { __hostSessionsTest, markHostSession } from '@/src/services/hostSessions';

declare function require(id: string): any;
const { LocalRouteParamsContext } = require('expo-router/build/Route');
const { act, create } = require('react-test-renderer');

// Keep Expo's real local-param hook, with explicit per-screen context. A single
// global mock of search params would hide route leakage between mounted screens.
jest.mock('expo-router', () => ({
  useLocalSearchParams: require('expo-router/build/hooks/useLocalSearchParams').useLocalSearchParams,
}));
let mockProfileId = 'alice';
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: mockProfileId } }) }));
jest.mock('@/src/services/supabase', () => ({ getSupabase: () => null, SUPABASE_TABLE: 'unused' }));
jest.mock('@/src/services/earn', () => ({ recordRound: async () => {} }));
jest.mock('@/src/services/cleanRun', () => ({ tickCleanRun: async () => {} }));

const g = globalThis as any;
const w = window as any;
const progressive = { wu: '1', progress: '1', auto: '1' };
const levelKey = (game = 'digit_span', profile = mockProfileId, training = true) =>
  `psygames_${game}${training ? '_warmup' : ''}_level_${profile}`;
let trees: any[] = [];
let oldLocation: PropertyDescriptor | undefined;

function location(search = '?wu=1&progress=1&auto=1', pathname = '/games/digit-span') {
  Object.defineProperty(w, 'location', { configurable: true, value: { search, pathname, origin: 'http://localhost' } });
}

async function mount(game = 'digit_span', params: Record<string, string> = progressive) {
  const result: { current: PersistentLevel; preset: ReturnType<typeof useGamePreset> } = {} as any;
  function Probe({ id }: { id: string }) {
    result.current = usePersistentLevel(id);
    result.preset = useGamePreset();
    return null;
  }
  const element = (id: string, q: Record<string, string>) => React.createElement(
    LocalRouteParamsContext.Provider, { value: q }, React.createElement(Probe, { id }),
  );
  let tree: any;
  await act(async () => { tree = create(element(game, params)); });
  trees.push(tree);
  return {
    get current() { return result.current; },
    get preset() { return result.preset; },
    update: async (id = game, q = params) => { await act(async () => { tree.update(element(id, q)); }); },
    unmount: async () => { await act(async () => { tree.unmount(); }); trees = trees.filter(t => t !== tree); },
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetLevelCacheForTests();
  __hostSessionsTest.reset();
  mockProfileId = 'alice';
  g.__psygames_active_profile_id = mockProfileId;
  delete g.__psygames_active_person;
  delete g.__psygames_active_themed;
  delete w.__psyNativeOver;
  delete w.__psyHostNativeRoutes;
  delete w.PsyBridge;
  oldLocation = Object.getOwnPropertyDescriptor(w, 'location');
  location();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  setSessionListener(null);
  delete w.__psyNativeOver;
  delete w.__psyHostNativeRoutes;
  delete w.PsyBridge;
  delete g.__psygames_active_profile_id;
  if (oldLocation) Object.defineProperty(w, 'location', oldLocation); else delete w.location;
  jest.restoreAllMocks();
});

test('first counted success L1 -> reopen L2; duplicate callbacks advance only once', async () => {
  const first = await mount();
  expect(first.current.loaded).toBe(true);
  expect(first.current.level).toBe(1);
  expect(first.preset).toMatchObject({ isPreset: false, autostart: true, progressive: true });
  let advanced: boolean[] = [];
  await act(async () => {
    advanced = [first.current.reach(2), first.current.reach(2), first.current.reach(3)];
  });
  expect(advanced).toEqual([true, false, false]);
  await act(async () => { expect(first.current.reach(3)).toBe(false); });
  expect(await AsyncStorage.getItem(levelKey())).toBe('2');
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'alice', false))).toBeNull();
  await first.unmount();
  resetLevelCacheForTests(); // actual storage, not merely warm in-memory state
  const reopened = await mount();
  expect(reopened.current.level).toBe(2);
  await act(async () => { expect(reopened.current.reach(3)).toBe(true); });
  expect(await AsyncStorage.getItem(levelKey())).toBe('3');
});

test.each([
  [{ wu: '1' }, true, true, false],
  [{ wu: '1', progress: '1' }, true, false, true],
  [{ auto: '1' }, true, false, false],
  [{ progress: '1' }, false, false, false],
  [{}, false, false, false],
] as const)('real entry flags %j preserve autostart and fixed/training separation', async (params, autostart, isPreset, isProgressive) => {
  const entry = await mount('digit_span', params as Record<string, string>);
  expect(entry.preset).toMatchObject({ autostart, isPreset, progressive: isProgressive });
});

test('normal replay neither reduces the ceiling nor storage; actual new success advances it', async () => {
  location('');
  const key = levelKey('digit_span', 'alice', false);
  await AsyncStorage.setItem(key, '10');
  const normal = await mount('digit_span', {});
  await act(async () => { normal.current.pick(3); });
  expect(normal.current.level).toBe(3);
  expect(normal.current.best).toBe(10);
  await act(async () => { expect(normal.current.reach(4)).toBe(false); });
  expect(normal.current.level).toBe(10);
  expect(await AsyncStorage.getItem(key)).toBe('10');
  await act(async () => { normal.current.pick(3); expect(normal.current.fail()).toBe(false); });
  expect(normal.current.level).toBe(10);
  expect(await AsyncStorage.getItem(key)).toBe('10');
  await act(async () => { expect(normal.current.reach(11)).toBe(true); });
  expect(normal.current.level).toBe(11);
  expect(await AsyncStorage.getItem(key)).toBe('11');
  expect(await AsyncStorage.getItem(levelKey())).toBeNull();
});

test('failed attempts never demote training; skip/unmount does not advance', async () => {
  await AsyncStorage.setItem(levelKey(), '5');
  const attempt = await mount();
  const before = await AsyncStorage.getItem(levelKey());
  await act(async () => { for (let i = 0; i < 8; i++) expect(attempt.current.fail()).toBe(false); });
  expect(attempt.current.level).toBe(5);
  expect(await AsyncStorage.getItem(`psygames_digit_span_warmup_failstreak_alice`)).toBeNull();
  await attempt.unmount(); // skip/teardown has no success callback
  expect(await AsyncStorage.getItem(levelKey())).toBe(before);
  expect((await mount()).current.level).toBe(5);
});

test('bootstrap from same-profile, same-mode personal key once (including L1)', async () => {
  await AsyncStorage.setItem(levelKey('digit_span_audio', 'alice', false), '7');
  await AsyncStorage.setItem(levelKey('digit_span', 'alice', false), '13');
  const audio = await mount('digit_span_audio');
  expect(audio.current.level).toBe(7);
  await act(async () => { audio.current.reach(100); });
  expect(await AsyncStorage.getItem(levelKey('digit_span_audio'))).toBe('8');
  expect(await AsyncStorage.getItem(levelKey('digit_span_audio', 'alice', false))).toBe('7');
  const absent = await mount('digit_span_reverse');
  expect(absent.current.level).toBe(1);
  await absent.unmount();
  await AsyncStorage.setItem(levelKey('digit_span_reverse', 'alice', false), '9');
  resetLevelCacheForTests();
  expect((await mount('digit_span_reverse')).current.level).toBe(1);
});

test('profile and mode switches isolate state and reject stale callbacks', async () => {
  await AsyncStorage.setItem(levelKey(), '6');
  const attempt = await mount();
  const aliceSuccess = attempt.current.reach;
  mockProfileId = 'bob';
  g.__psygames_active_profile_id = mockProfileId;
  await attempt.update();
  expect(attempt.current.level).toBe(1);
  await act(async () => { expect(aliceSuccess(7)).toBe(false); attempt.current.reach(2); });
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'alice'))).toBe('6');
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'bob'))).toBe('2');
  const oldModeSuccess = attempt.current.reach;
  await attempt.update('digit_span_audio');
  expect(attempt.current.level).toBe(1);
  await act(async () => { expect(oldModeSuccess(3)).toBe(false); attempt.current.reach(2); });
  expect(await AsyncStorage.getItem(levelKey('digit_span_audio', 'bob'))).toBe('2');
  mockProfileId = 'alice';
  g.__psygames_active_profile_id = mockProfileId;
  await attempt.update('digit_span');
  await act(async () => { expect(aliceSuccess(7)).toBe(false); });
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'alice'))).toBe('6');
});

test('simultaneously mounted route contexts do not leak progress=1 into normal play', async () => {
  await AsyncStorage.setItem(levelKey('digit_span', 'alice', false), '9');
  const training = await mount();
  const normal = await mount('digit_span', { auto: '1' });
  const assessment = await mount('schulte_table', { wu: '1', trials: '2' });
  expect(training.preset.progressive).toBe(true);
  expect(normal.preset).toMatchObject({ progressive: false, isPreset: false, autostart: true });
  expect(assessment.preset).toMatchObject({ progressive: false, isPreset: true });
  await act(async () => { training.current.reach(10); });
  expect(normal.current.level).toBe(9);
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'alice', false))).toBe('9');
  await act(async () => { normal.current.reach(10); });
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'alice', false))).toBe('10');
});

test.each(['signal', 'native-route'] as const)('native underlay (%s) writes neither bootstrap nor success/failure/session', async kind => {
  await AsyncStorage.setItem(levelKey('digit_span', 'alice', false), '8');
  if (kind === 'signal') w.__psyNativeOver = '1 /games/digit-span';
  else { w.PsyBridge = { postMessage: jest.fn() }; w.__psyHostNativeRoutes = ['/games/digit-span']; }
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockClear();
  const underlay = await mount();
  expect(underlay.current.level).toBe(8);
  await act(async () => {
    expect(underlay.current.reach(9)).toBe(false);
    underlay.current.setLevel(42);
    expect(underlay.current.fail()).toBe(false);
    await saveSession({ id: 'ghost', game_type: 'digit_span', score: 10, time_seconds: 30, passed: true });
  });
  expect(await AsyncStorage.getItem(levelKey())).toBeNull();
  expect(cachedLevelValue(levelKey())).not.toBe('9');
  expect(await getSessions()).toEqual([]);
  expect(spy).not.toHaveBeenCalled();
});

test('overlay appearing after load is checked live without a render; unmounted callbacks are inert', async () => {
  const attempt = await mount();
  const success = attempt.current.reach;
  w.__psyNativeOver = '1 /games/digit-span';
  await act(async () => { expect(success(2)).toBe(false); });
  expect(await AsyncStorage.getItem(levelKey())).toBe('1');
  delete w.__psyNativeOver;
  await attempt.unmount();
  await act(async () => { expect(success(2)).toBe(false); });
  expect(await AsyncStorage.getItem(levelKey())).toBe('1');
});

test('warm-cache success cannot be overwritten by the pending storage snapshot', async () => {
  await AsyncStorage.setItem(levelKey(), '4');
  rememberLevelValue(levelKey(), '4');
  // AsyncStorage's official adapter already uses jest.fn: capture its underlying
  // implementation, not the wrapper that mockImplementation will replace.
  const realGet = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async key => {
    const snapshot = await realGet(key);
    if (key === levelKey()) await pending;
    return snapshot;
  });
  try {
    const attempt = await mount();
    expect(attempt.current.loaded).toBe(true);
    await act(async () => { expect(attempt.current.reach(5)).toBe(true); });
    await act(async () => { release(); await pending; });
    expect(attempt.current.level).toBe(5);
    expect(await AsyncStorage.getItem(levelKey())).toBe('5');
  } finally {
    release();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(realGet);
  }
});

test.each([
  { lesson: true }, { solver_used: true }, { skipped: true }, { errors: 9 },
])('saving non-counted training report %j never advances a mounted ladder', async details => {
  const attempt = await mount();
  const saved = await saveSession({
    game_type: 'digit_span', score: 0, time_seconds: 20, passed: false, details: { level: 12, ...details },
  });
  expect(saved.details).toMatchObject({ warmup_progress: true, level: 12, ...details });
  expect(attempt.current.level).toBe(1);
  expect(await AsyncStorage.getItem(levelKey())).toBe('1');
  expect(await getMaxLevelFromSessions('digit_span')).toBe(1);
});

test('session tag is captured before async navigation; restore excludes new training but keeps personal history', async () => {
  location('');
  await saveSession({ id: 'personal', game_type: 'digit_span', score: 1, time_seconds: 10, details: { level: 4 } });
  location();
  const pending = saveSession({ id: 'training', game_type: 'digit_span', score: 1, time_seconds: 10, passed: true, details: { level: 80 } });
  location('');
  const tagged = await pending;
  expect(tagged.details?.warmup_progress).toBe(true);
  expect((await getSessions()).find(s => s.id === 'personal')?.details?.warmup_progress).toBeUndefined();
  expect(await getMaxLevelFromSessions('digit_span')).toBe(4);
  resetLevelCacheForTests();
  const normal = await mount('digit_span', {});
  expect(normal.current.level).toBe(4);
  expect(await AsyncStorage.getItem(levelKey('digit_span', 'alice', false))).toBe('4');
});

test.each(['?wu=1', '?progress=1', '?wu=1&progress=0', ''])('non-progressive URL %s is not tagged', async search => {
  location(search);
  const saved = await saveSession({ game_type: 'digit_span', score: 1, time_seconds: 10, details: { level: 3 } });
  expect(saved.details?.warmup_progress).toBeUndefined();
});

test('native reports retain their own launch tag even when the underlay URL belongs to training', async () => {
  w.__psyNativeOver = '1 /games/digit-span';
  markHostSession('host-normal');
  markHostSession('host-training');
  await saveSession({ id: 'host-normal', game_type: 'digit_span', score: 1, time_seconds: 10, details: { level: 3 } });
  await saveSession({ id: 'host-training', game_type: 'digit_span', score: 1, time_seconds: 10, details: { level: 90, warmup_progress: true } });
  expect(await getMaxLevelFromSessions('digit_span')).toBe(3);
  expect(await getSessions()).toHaveLength(2);
});
