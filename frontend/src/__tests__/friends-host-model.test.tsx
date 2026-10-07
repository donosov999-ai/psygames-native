/* psygames-friends-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 «ДРУЗЬЯ» ПОД ОБОЛОЧКОЙ ОТДАЮТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЮТ САМИ (задача 7bb8035b; приём —
 * `services/hostScreens.ts`).
 *
 * Экран монтируется целиком на настоящих провайдерах; сервер друзей подменён, правило «что
 * рисовать» (`friendsView`) и нормализация кода — настоящие.
 *   Таблица: пять состояний — пять разных подписей, строки — в единицах игры, «я» помечен.
 *   Добавление: набор нормализует веб, кнопка живёт только на полном коде, исходы — разные фразы.
 *   Разрыв: крестик только открывает подтверждение со словами о взаимности; рвёт — `drop`.
 * Образец модели — для проб Flutter (`flutter/test/fixtures/friends_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  const nav = { addListener: () => () => {}, setOptions: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/friends',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },
    useNavigation: () => nav,
    Stack: { Screen: () => null },
    router,
  };
});
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(insets) },
    initialWindowMetrics: { insets, frame },
  };
});
const mockSrv = {
  code: 'K7M2QX' as string | null,
  friends: [] as any[] | null,
  top: [] as any[] | null,
  add: { kind: 'not-found' } as any,
  removed: true,
};
jest.mock('@/src/services/friends', () => {
  const real = jest.requireActual('@/src/services/friends');
  return {
    ...real,
    getMyInviteCode: jest.fn(async () => mockSrv.code),
    listFriends: jest.fn(async () => mockSrv.friends),
    friendsTop: jest.fn(async () => mockSrv.top),
    addFriendByCode: jest.fn(async () => mockSrv.add),
    removeFriend: jest.fn(async () => mockSrv.removed),
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const srv = require('@/src/services/friends');
const { LEADERBOARD_GAMES } = require('@/src/services/leaderboard');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE = '/friends';
const GAMES = Object.keys(LEADERBOARD_GAMES);
const АНЯ = { id: 'u-anya', name: 'Аня', since: '2026-09-01' };
const БОРЯ = { id: 'u-borya', name: 'Боря', since: '2026-09-03' };

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.clearAllMocks();
});

const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};

async function смонтировать(host = true) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', ROUTE];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/friends').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  const act = async (name: string, ...args: any[]) => {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE][name](...args); });
    await осесть();
  };
  return { sent, last, act };
}

/** Тексты веб-экрана — те, что он рисует сам: модель обязана нести их же. */
function тексты(r: any): string[] {
  return r.root.findAllByType(require('react-native').Text).map((n: any) => [n.props.children].flat().join(''));
}

function образец(name: string, m: object) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const file = path.resolve(__dirname, `../../../flutter/test/fixtures/${name}`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(m, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'nzt48');
  await AsyncStorage.setItem('language', 'ru');
  Object.assign(mockSrv, { code: 'K7M2QX', friends: [АНЯ, БОРЯ], top: [], add: { kind: 'not-found' }, removed: true });
});

describe('«Друзья» под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать(false);
    expect(sent).toEqual([]);
  });

  it('🔴 код группами, девять чипов (включена первая игра), строки — в единицах игры, «я» помечен', async () => {
    mockSrv.top = [
      { id: 'u-anya', name: 'Аня', score: 21.37, isMe: false },
      { id: 'me', name: 'Денис', score: 24.5, isMe: true },
    ];
    const { last } = await смонтировать();
    const m = last();
    expect(m.my).toMatchObject({ state: 'code', code: 'K7M2QX', shown: 'K7M 2QX' });
    expect(m.table.chips.map((c: any) => c.id)).toEqual(GAMES);
    expect(m.table.chips.filter((c: any) => c.on).map((c: any) => c.id)).toEqual([GAMES[0]]);
    expect(m.table.kind).toBe('rows');
    // schulte_table_5x5 — секунды с десятыми, как в его лидерборде.
    expect(m.table.rows.map((r: any) => [r.rank, r.score, r.me])).toEqual([['1', '21.4s', false], ['2', '24.5s', true]]);
    expect(m.table.rows[1].name).toMatch(/^Денис · /);
    expect(m.circle.rows.map((r: any) => r.name)).toEqual(['Аня', 'Боря']);
    expect(m.circle.rows.every((r: any) => r.pending === false)).toBe(true);
    expect(m.my.label).toBe(m.my.label.toUpperCase());
    образец('friends_model.json', m);
  });

  it('🔴 пять состояний таблицы — пять разных подписей, те же, что рисует веб', async () => {
    const пустоты: Record<string, string | null> = {};
    const случаи: [string, Partial<typeof mockSrv>][] = [
      ['offline', { friends: null }],
      ['no-friends', { friends: [] }],
      ['nobody-played', { friends: [АНЯ], top: [] }],
    ];
    for (const [kind, srvState] of случаи) {
      Object.assign(mockSrv, srvState);
      const { last } = await смонтировать();
      const r = поднятые[поднятые.length - 1];
      expect(last().table.kind).toBe(kind);
      пустоты[kind] = last().table.empty;
      expect(тексты(r)).toContain(last().table.empty);
      expect(last().circle === null).toBe(kind !== 'nobody-played');
      TestRenderer.act(() => { r.unmount(); });
      поднятые.pop();
    }
    expect(new Set(Object.values(пустоты)).size).toBe(3);
    expect(пустоты['nobody-played']).not.toContain('{game}');
  });

  it('🔴 набор нормализует веб; кнопка оживает только на полном коде; исходы — разные фразы', async () => {
    const { last, act } = await смонтировать();
    await act('draft', 'k7-m2', 1);
    expect(last().add).toMatchObject({ draft: 'K7M2', seq: 1, ready: false });
    // Знак, который нормализация выбросит, всё равно даёт ответ с новым номером — поле оболочки
    // вернёт в себя нормализованный код, а не застрянет на «K7M2-».
    await act('draft', 'K7M2-', 2);
    expect(last().add).toMatchObject({ draft: 'K7M2', seq: 2 });
    await act('add');
    expect(srv.addFriendByCode).not.toHaveBeenCalled();
    const фразы: string[] = [];
    for (const add of [
      { kind: 'not-found' }, { kind: 'self' }, { kind: 'full', max: 30 }, { kind: 'offline' },
      { kind: 'added', friend: { id: 'u-vera', name: 'Вера', since: '2026-10-07' } },
    ]) {
      mockSrv.add = add;
      await act('draft', 'abc 12x9', 3);
      expect(last().add).toMatchObject({ draft: 'ABC12X', ready: true, note: null });
      await act('add');
      expect(srv.addFriendByCode).toHaveBeenLastCalledWith('ABC12X');
      фразы.push(last().add.note.text);
      expect(last().add.note.ok).toBe(add.kind === 'added');
    }
    expect(new Set(фразы).size).toBe(5);
    expect(фразы[2]).toContain('30');
    expect(фразы[4]).toContain('Вера');
    // Добавленный — поле очищено, круг перечитан.
    expect(last().add.draft).toBe('');
    expect(srv.listFriends.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('🔴 чип игры — запрос таблицы этой игры; чужой адрес игры молча отброшен', async () => {
    const { last, act } = await смонтировать();
    await act('game', 'choice_rt');
    expect(srv.friendsTop).toHaveBeenLastCalledWith('choice_rt');
    expect(last().table.chips.find((c: any) => c.on).id).toBe('choice_rt');
    const calls = srv.friendsTop.mock.calls.length;
    await act('game', 'not_a_game');
    expect(srv.friendsTop.mock.calls.length).toBe(calls);
    expect(last().table.chips.find((c: any) => c.on).id).toBe('choice_rt');
  });

  it('🔴 крестик открывает подтверждение о взаимности; рвёт только drop; отказ сервера — фраза', async () => {
    const { last, act } = await смонтировать();
    await act('ask', 'u-borya');
    const боря = last().circle.rows.find((r: any) => r.id === 'u-borya');
    expect(боря.pending).toBe(true);
    expect(боря.warn).toContain('Боря');
    expect(srv.removeFriend).not.toHaveBeenCalled();
    await act('cancel');
    expect(last().circle.rows.every((r: any) => !r.pending)).toBe(true);
    mockSrv.removed = false;
    await act('ask', 'u-borya');
    await act('drop', 'u-borya');
    expect(srv.removeFriend).toHaveBeenCalledWith('u-borya');
    expect(last().circle.failed).toEqual(expect.any(String));
  });

  it('🔴 код скопирован оболочкой — веб показывает итог; «назад» — goBackOrHome', async () => {
    const { last, act } = await смонтировать();
    expect(last().my.copied).toBe(null);
    await act('copied', true);
    const ok = last().my.copied;
    await act('copied', false);
    const fail = last().my.copied;
    expect([ok.ok, fail.ok]).toEqual([true, false]);
    expect(ok.text).not.toBe(fail.text);
    await act('back');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('нет связи — код не показан, вместо него фраза о связи', async () => {
    mockSrv.code = null;
    const { last } = await смонтировать();
    expect(last().my).toMatchObject({ state: 'offline', code: null, shown: null });
    expect(last().my.offline).toEqual(expect.any(String));
  });
});
