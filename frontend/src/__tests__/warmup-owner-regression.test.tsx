/** ac96: durable behavioral regressions. Real provider/API/native bridge;
 * storage is the official in-memory adapter, transport/rewards/history IO stubbed. */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WarmupProvider, useWarmup } from '@/src/contexts/WarmupContext';
import { saveSession, getSessions } from '@/src/services/api';
import { installNativeSessionBridge, __test as bridge } from '@/src/services/nativeSessionBridge';

const mockReplace = jest.fn();
let mockEarnGate: Promise<void> | null = null;
let mockHistoryGate: Promise<void> | null = null;
const mockHistory = jest.fn(async (_entry: any) => { if (mockHistoryGate) await mockHistoryGate; });
const mockEarn = jest.fn(async (_input: any) => { if (mockEarnGate) await mockEarnGate; });
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'p' } }) }));
jest.mock('@/src/services/feedback', () => ({ fbCorrect() {}, fbComplete() {} }));
jest.mock('@/src/services/supabase', () => ({ getSupabase: () => null, SUPABASE_TABLE: 'unused' }));
jest.mock('@/src/services/earn', () => ({ recordRound: (input: any) => mockEarn(input) }));
jest.mock('@/src/services/cleanRun', () => ({ tickCleanRun: async () => {} }));
jest.mock('@/src/services/warmup', () => ({
  ...jest.requireActual('@/src/services/warmup'), saveWarmupHistory: (entry: any) => mockHistory(entry),
}));

const w = window as any;
const g = globalThis as any;
let ctx: any;
let tree: TestRenderer.ReactTestRenderer;
let originalLocation: PropertyDescriptor | undefined;
const posted: any[] = [];
const meta: any = {
  duration_min: 5, weekday: 1, weekday_name: 'Mon', track: 'training', slot: 'morning', est_total_sec: 180,
  steps: ['n_back', 'n_back', 'schulte_table'].map(game_id => ({
    game_id, game_route: game_id === 'n_back' ? '/games/n-back' : '/games/schulte', est_duration_sec: 60,
  })),
};
function Probe() {
  const value = useWarmup();
  React.useEffect(() => { ctx = value; });
  return null;
}
// Fallback lets the same five assertions execute (and turn RED) on pre-contract main.
const owner = () => ctx.owner?.() ?? { run_id: ctx.warmupId, step_idx: ctx.currentIdx, attempt_id: `attempt-${ctx.currentIdx}` };
const start = async () => { await act(async () => { ctx.startPlaylist(meta); }); };
const report = async (id: string, captured = owner()) => {
  await act(async () => { await bridge.accept({
    id, game_type: 'n_back', score: 10, time_seconds: 20, errors: 0,
    details: { level: 1, warmup_owner: captured },
  }); });
};
beforeEach(async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  await AsyncStorage.clear(); bridge.reset();
  mockReplace.mockClear(); mockHistory.mockClear(); mockEarn.mockClear(); posted.length = 0;
  mockEarnGate = null; mockHistoryGate = null;
  g.__psygames_active_profile_id = 'p';
  delete w.__psyNativeOver;
  w.PsyBridge = { postMessage: (s: string) => posted.push(JSON.parse(s)) };
  w.__psyHostNativeRoutes = ['/games/n-back', '/games/schulte'];
  originalLocation = Object.getOwnPropertyDescriptor(w, 'location');
  Object.defineProperty(w, 'location', { configurable: true, value: { pathname: '/games/n-back', search: '', origin: 'http://localhost' } });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => { tree = TestRenderer.create(<WarmupProvider><Probe /></WarmupProvider>); });
  installNativeSessionBridge();
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  bridge.reset(); delete w.PsyBridge; delete w.__psyHostNativeRoutes; delete g.__psygames_active_profile_id;
  if (originalLocation) Object.defineProperty(w, 'location', originalLocation); else delete w.location;
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});

test('RED-1: duplicate terminal reports append one result, post one transition', async () => {
  await start(); const captured = owner();
  await report('A', captured); await report('B', captured);
  expect(posted).toHaveLength(1);
  expect(ctx.results.map((r: any) => r.шаг)).toEqual([0]);
  expect(await getSessions()).toHaveLength(1);
  expect(mockEarn).toHaveBeenCalledTimes(1);
});
test('RED-2: delayed real API save cannot become the next same-game step', async () => {
  await start(); const captured = owner();
  let release!: () => void;
  mockEarnGate = new Promise(resolve => { release = resolve; });
  const saving = report('late', captured);
  try {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await act(async () => { w.__psyWarmupHost.goTo(1, captured); });
    release(); await saving;
    expect(ctx.currentIdx).toBe(1);
    expect(ctx.results).toHaveLength(0);
  } finally { release(); await saving; }
});
test('RED-3: old native advance and ownerless mutators cannot advance a new run', async () => {
  await start(); const old = owner();
  await act(async () => { jest.advanceTimersByTime(1000); });
  await start();
  await act(async () => { w.__psyWarmupHost.advance(0, old); });
  expect(ctx.currentIdx).toBe(0);
  await act(async () => { w.__psyWarmupHost.advance(0); w.__psyWarmupHost.goTo(1); w.__psyWarmupHost.skip(); w.__psyWarmupHost.stop(); });
  expect(ctx.currentIdx).toBe(0); expect(ctx.active).toBe(true);
});
test('RED-4: old WEB completion timer cannot advance or navigate a new run', async () => {
  w.__psyHostNativeRoutes = [];
  await start(); const captured = owner();
  await act(async () => { await saveSession({
    id: 'web-old', game_type: 'n_back', score: 10, time_seconds: 20, details: { warmup_owner: captured },
  }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  await start(); mockReplace.mockClear();
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(ctx.currentIdx).toBe(0); expect(mockReplace).not.toHaveBeenCalled();
});
test('RED-5: delayed stop/history cannot erase or navigate a new run', async () => {
  await start();
  let release!: () => void;
  mockHistoryGate = new Promise(resolve => { release = resolve; });
  let stopped!: Promise<unknown>;
  await act(async () => { stopped = ctx.stopWarmup(false); await Promise.resolve(); });
  await start(); const newRun = ctx.warmupId;
  await act(async () => { release(); await stopped; });
  expect(ctx.warmupId).toBe(newRun); expect(ctx.active).toBe(true);
});

test('legacy ordinary saves remain ordinary when no warmup launch owner exists', async () => {
  await saveSession({ id: 'ordinary', game_type: 'n_back', score: 1, time_seconds: 5, details: { level: 4 } });
  expect((await getSessions())[0].details?.warmup_owner).toBeUndefined();
  expect(ctx.results).toEqual([]);
});

test('old owner arriving after a new run is rejected before persistence/rewards', async () => {
  await start(); const old = owner(); await start();
  await report('old-origin', old);
  expect(await getSessions()).toEqual([]); expect(mockEarn).not.toHaveBeenCalled(); expect(ctx.results).toEqual([]);
});

test('owned host report after Provider unmount is rejected before persistence/rewards', async () => {
  await start(); const captured = owner();
  await act(async () => { tree.unmount(); });
  await report('disposed-owner', captured);
  expect(await getSessions()).toEqual([]);
  expect(mockEarn).not.toHaveBeenCalled();
});

test('goTo claims atomically and returns a new owned URL before React commits', async () => {
  await start(); const old = owner(); let info: any;
  await act(async () => {
    info = w.__psyWarmupHost.goTo(1, old);
    expect(w.__psyWarmupHost.owner()).toEqual(info.owner);
    expect(w.__psyWarmupHost.goTo(1, old)).toBeNull();
  });
  expect(info.owner).toMatchObject({ run_id: old.run_id, step_idx: 1 });
  expect(info.owner.attempt_id).not.toBe(old.attempt_id);
  const params = new URLSearchParams(info.url.split('?')[1]);
  expect(params.get('wuRun')).toBe(info.owner.run_id);
  expect(params.get('wuStep')).toBe('1'); expect(params.get('wuAttempt')).toBe(info.owner.attempt_id);
  expect(w.__psyWarmupHost.info(old)).toBeNull();
});

test('retry returns fresh same-step owner without route emission; stale reports/holds cannot affect it', async () => {
  await start(); const old = owner(); let release!: () => void; let info: any;
  await act(async () => { release = ctx.holdAutoAdvance(); });
  mockReplace.mockClear();
  await act(async () => { info = w.__psyWarmupHost.retry(old); });
  expect(info.owner.step_idx).toBe(0); expect(info.owner.attempt_id).not.toBe(old.attempt_id);
  await act(async () => { release(); jest.advanceTimersByTime(10); });
  expect(mockReplace).not.toHaveBeenCalled();
  await report('old-retry-origin', old); expect(await getSessions()).toEqual([]);
  await report('fresh-retry', info.owner);
  expect(ctx.results).toHaveLength(1);
  expect(w.__psyWarmupHost.retry(info.owner)).toBeNull();
});

test('ownerless host report on a native warmup step receives no storage/reward credit', async () => {
  await start(); await bridge.accept({ id: 'unowned-host', game_type: 'n_back', score: 10, time_seconds: 10 });
  expect(await getSessions()).toEqual([]); expect(mockEarn).not.toHaveBeenCalled();
});

test.each(['read', 'write'] as const)('owned %s failure rolls back reservation and permits a fresh retry', async operation => {
  await start(); const captured = owner();
  const method = operation === 'read' ? 'getItem' : 'setItem';
  const fn = AsyncStorage[method] as jest.Mock;
  const original = fn.getMockImplementation()!;
  fn.mockImplementation(async (...args: any[]) => {
    if (args[0] === 'psygames_sessions') throw new Error(`owned-${operation}-failure`);
    return original(...args);
  });
  try {
    await expect(bridge.accept({ id: `failed-${operation}`, game_type: 'n_back', score: 10, time_seconds: 10,
      details: { warmup_owner: captured },
    })).rejects.toThrow(`owned-${operation}-failure`);
    expect(ctx.results).toEqual([]); expect(mockEarn).not.toHaveBeenCalled();
  } finally { fn.mockImplementation(original); }
  let retry: any;
  await act(async () => { retry = w.__psyWarmupHost.retry(captured); });
  expect(retry).not.toBeNull();
  await report(`retry-${operation}`, retry.owner);
  expect(await getSessions()).toHaveLength(1); expect(ctx.results).toHaveLength(1);
});

test('durable same-id replay settles a reservation without awarding twice or stranding retry', async () => {
  await start(); const captured = owner();
  await AsyncStorage.setItem('psygames_sessions', JSON.stringify([{ id: 'already-durable', game_type: 'n_back', score: 7,
    time_seconds: 10, details: { warmup_owner: captured } }]));
  await report('already-durable', captured);
  expect(ctx.results).toHaveLength(1); expect(ctx.results[0].score).toBe(7);
  expect(mockEarn).not.toHaveBeenCalled();
  expect(posted).toHaveLength(1);
});

test('history failure logs a warning but cannot strand stop or navigate a newer run', async () => {
  await start();
  mockHistory.mockRejectedValueOnce(new Error('history-failed'));
  await act(async () => { w.__psyWarmupHost.stop(owner()); await Promise.resolve(); });
  expect(ctx.active).toBe(false); expect(mockReplace).toHaveBeenLastCalledWith('/');
  expect(console.warn).toHaveBeenCalledWith('Warmup history save failed:', expect.any(Error));
  await start(); const old = owner();
  let reject!: (e: Error) => void;
  mockHistoryGate = new Promise((_, no) => { reject = no; });
  await act(async () => { w.__psyWarmupHost.stop(old); await Promise.resolve(); });
  await start(); mockReplace.mockClear();
  await act(async () => { reject(new Error('late-history-failed')); await Promise.resolve(); });
  expect(ctx.active).toBe(true); expect(mockReplace).not.toHaveBeenCalled();
});

test('malformed owned journal cannot be overwritten; failed reservation is retryable', async () => {
  await start(); const captured = owner();
  await AsyncStorage.setItem('psygames_sessions', '{"not":"an array"}');
  await expect(bridge.accept({ id: 'bad-journal', game_type: 'n_back', score: 1, time_seconds: 5,
    details: { warmup_owner: captured },
  })).rejects.toThrow('not an array');
  expect(await AsyncStorage.getItem('psygames_sessions')).toBe('{"not":"an array"}');
  let retry: any;
  await act(async () => { retry = w.__psyWarmupHost.retry(captured); });
  expect(retry).not.toBeNull();
  expect(mockEarn).not.toHaveBeenCalled();
});

test('late old write failure cannot release a newly reserved run/step', async () => {
  await start(); const old = owner();
  const set = AsyncStorage.setItem as jest.Mock;
  const original = set.getMockImplementation()!;
  let reject!: (e: Error) => void;
  const blocked = new Promise<void>((_, no) => { reject = no; });
  let intercepted = false;
  set.mockImplementation(async (...args: any[]) => {
    if (args[0] === 'psygames_sessions' && !intercepted) { intercepted = true; await blocked; }
    return original(...args);
  });
  const failing = bridge.accept({ id: 'old-failing', game_type: 'n_back', score: 1, time_seconds: 5,
    details: { warmup_owner: old },
  }).catch(e => e);
  try {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await start(); const fresh = owner();
    const saved = bridge.accept({ id: 'new-reserved', game_type: 'n_back', score: 1, time_seconds: 5,
      details: { warmup_owner: fresh },
    });
    reject(new Error('late-write-failed')); await failing;
    expect(w.__psyWarmupHost.retry(fresh)).toBeNull();
    await act(async () => { await saved; });
    expect((await getSessions()).map(s => s.id)).toEqual(['new-reserved']);
    expect(ctx.results).toHaveLength(1);
  } finally { reject(new Error('cleanup')); set.mockImplementation(original); }
});

test('owned metadata persists its captured run/profile before rewards yield', async () => {
  await start(); const captured = owner();
  let release!: () => void;
  mockEarnGate = new Promise(resolve => { release = resolve; });
  const saving = report('captured-metadata', captured);
  try {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    g.__psygames_active_profile_id = 'different-global-profile';
    await act(async () => { ctx.startPlaylist({ ...meta, weekday: 6, duration_min: 10, track: 'assessment' }); });
    release(); await saving;
    expect((await getSessions())[0]).toMatchObject({
      warmup_id: captured.run_id, profile_id: 'p', session_tag: 'warmup', weekday: 1, duration_preset: 5,
      details: { warmup_owner: captured },
    });
    expect(ctx.results).toEqual([]);
    expect(mockEarn.mock.calls[0][0].profileId).toBe('p');
  } finally { release(); await saving; }
});

test('core score requires exact step indices even when skipped and played games share a name', async () => {
  const baseline = { ...meta, steps: meta.steps.map((step: any, i: number) => ({ ...step, is_fixed_baseline: i < 2 })) };
  await act(async () => { ctx.startPlaylist(baseline); ctx.skipCurrent(); });
  await report('only-second-core-step');
  await act(async () => { await ctx.stopWarmup(true); });
  expect(mockHistory.mock.calls[0][0].core_score).toBeUndefined();
});
