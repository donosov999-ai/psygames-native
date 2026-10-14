import { postScreenModel, registerScreenActions } from '@/src/services/hostScreens';

const g = globalThis as unknown as {
  PsyBridge?: { postMessage: (s: string) => void };
  __psyHostScreens?: string[];
  __psyScreenUi?: Record<string, unknown>;
  __psyRequestScreenModel?: (route: string) => boolean;
  location?: { pathname: string; search: string };
};
const originalLocation = g.location;

describe('screen model retry is a read-only replay, not navigation or an action', () => {
  const sent: object[] = [];
  let unmount: () => void;
  beforeEach(() => {
    sent.length = 0;
    g.location = { pathname: '/friends', search: '' };
    g.__psyHostScreens = ['/friends', '/shop'];
    const bridge = { postMessage(this: unknown, s: string) {
      if (this !== bridge) throw new Error('unbound Android bridge');
      sent.push(JSON.parse(s));
    } };
    g.PsyBridge = bridge;
    unmount = registerScreenActions('/friends', { add: jest.fn() });
  });
  afterEach(() => {
    unmount();
    delete g.PsyBridge;
    delete g.__psyHostScreens;
    delete g.__psyScreenUi;
    delete g.__psyRequestScreenModel;
    g.location = originalLocation;
  });
  it('replays the newest model after the first bridge send failed', () => {
    const goodBridge = g.PsyBridge;
    g.PsyBridge = { postMessage: () => { throw new Error('temporarily disconnected'); } };
    expect(postScreenModel('/friends', { revision: 1 })).toBe(false);
    expect(postScreenModel('/friends', { revision: 2 })).toBe(false);
    g.PsyBridge = goodBridge;
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(true);
    expect(sent).toEqual([{ op: 'screenUi', route: '/friends', model: { revision: 2 } }]);
    expect((g.__psyScreenUi?.['/friends'] as { add: jest.Mock }).add).not.toHaveBeenCalled();
  });
  it('does not replay a model for another path, including a late old request', () => {
    postScreenModel('/friends', { title: 'Friends' });
    sent.length = 0;
    g.location = { pathname: '/shop', search: '' };
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(false);
    expect(sent).toEqual([]);
  });
  it('supports the static export path and query without changing its URL', () => {
    postScreenModel('/friends', { title: 'Friends' });
    sent.length = 0;
    g.location = { pathname: '/friends/index.html', search: '?lang=en' };
    const url = JSON.stringify(g.location);
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(true);
    expect(JSON.stringify(g.location)).toBe(url);
    expect(sent).toHaveLength(1);
  });
  it('does not deliver a stale model after the screen unmounts', () => {
    postScreenModel('/friends', { title: 'Friends' });
    sent.length = 0;
    unmount();
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(false);
    expect(sent).toEqual([]);
  });
  it('replays a snapshot, not later mutation of the caller object', () => {
    const model = { count: 1 };
    postScreenModel('/friends', model);
    model.count = 99;
    sent.length = 0;
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(true);
    expect(sent).toEqual([{ op: 'screenUi', route: '/friends', model: { count: 1 } }]);
  });
  it('old registration cleanup cannot erase its replacement', () => {
    const fresh = registerScreenActions('/friends', { add: jest.fn() });
    postScreenModel('/friends', { revision: 3 });
    unmount();
    sent.length = 0;
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(true);
    expect(sent).toEqual([{ op: 'screenUi', route: '/friends', model: { revision: 3 } }]);
    fresh();
  });
  it('replacement cannot inherit a snapshot of the previous registration', () => {
    postScreenModel('/friends', { owner: 'old' });
    const fresh = registerScreenActions('/friends', { add: jest.fn() });
    unmount();
    sent.length = 0;
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(false);
    expect(sent).toEqual([]);
    fresh();
  });
  it('first post before first registration remains retryable', () => {
    unmount();
    postScreenModel('/friends', { owner: 'first' });
    const fresh = registerScreenActions('/friends', { add: jest.fn() });
    sent.length = 0;
    expect(g.__psyRequestScreenModel?.('/friends')).toBe(true);
    expect(sent).toEqual([{ op: 'screenUi', route: '/friends', model: { owner: 'first' } }]);
    fresh();
  });
});
