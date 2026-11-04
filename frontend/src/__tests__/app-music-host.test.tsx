import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AppMusicHost from '@/src/components/AppMusicHost';
import { getMusicEnabled, startMusic, stopMusic } from '@/src/services/feedback';
import { disposeMusic, setMusicSuspended } from '@/src/services/music';

let mockPathname = '/';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('react-native', () => ({ Platform: { OS: 'web' }, AppState: { addEventListener: jest.fn() } }));
jest.mock('@/src/services/feedback', () => ({ getMusicEnabled: jest.fn(async () => true), startMusic: jest.fn(), stopMusic: jest.fn() }));
jest.mock('@/src/services/music', () => ({ disposeMusic: jest.fn(), setMusicSuspended: jest.fn() }));

describe('root music host', () => {
  const docBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const winBefore = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new Map<string, () => void>();
  let tree: TestRenderer.ReactTestRenderer | null = null;
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    events.clear();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      visibilityState: 'visible', addEventListener: (n: string, f: () => void) => events.set(n, f), removeEventListener: (n: string) => events.delete(n),
    } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: jest.fn(), removeEventListener: jest.fn() } });
  });
  afterEach(async () => {
    if (tree) await act(async () => { tree!.unmount(); });
    tree = null;
    if (docBefore) Object.defineProperty(globalThis, 'document', docBefore); else Reflect.deleteProperty(globalThis, 'document');
    if (winBefore) Object.defineProperty(globalThis, 'window', winBefore); else Reflect.deleteProperty(globalThis, 'window');
  });
  it('switching tabs does not stop/dispose/reload music; unmount does', async () => {
    await act(async () => { tree = TestRenderer.create(<AppMusicHost />); });
    for (const path of ['/games', '/warmup-picker', '/statistics', '/pet', '/settings', '/']) {
      mockPathname = path;
      await act(async () => { tree!.update(<AppMusicHost />); });
    }
    expect(getMusicEnabled).toHaveBeenCalledTimes(1);
    expect(startMusic).toHaveBeenCalledTimes(1);
    expect(stopMusic).not.toHaveBeenCalled();
    expect(disposeMusic).not.toHaveBeenCalled();
    expect(setMusicSuspended).toHaveBeenLastCalledWith('route', false);
    mockPathname = '/games/sudoku';
    await act(async () => { tree!.update(<AppMusicHost />); });
    expect(setMusicSuspended).toHaveBeenLastCalledWith('route', true);
    await act(async () => { tree!.unmount(); tree = null; });
    expect(disposeMusic).toHaveBeenCalledTimes(1);
  });
  it('gesture retries synchronously; root cleans its listeners', async () => {
    await act(async () => { tree = TestRenderer.create(<AppMusicHost />); });
    const count = (startMusic as jest.Mock).mock.calls.length;
    events.get('pointerdown')!();
    expect(startMusic).toHaveBeenCalledTimes(count + 1);
    await act(async () => { tree!.unmount(); tree = null; });
    expect(events.size).toBe(0);
  });
});
