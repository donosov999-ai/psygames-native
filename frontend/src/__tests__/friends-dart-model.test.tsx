/* psygames-friends-dart-model · VER 1 · 20.10.2026 */
/**
 * 🔴 «ДРУЗЬЯ» — ЭТАЛОН МОДЕЛИ ДЛЯ DART (задача d6a60b02, вариант Б).
 *
 * Настоящий экран `app/friends.tsx` с провайдерами темы и языка; сервер подменён — ответы сервиса
 * (`getMyInviteCode`, `listFriends`, `friendsTop`, `addFriendByCode`, `removeFriend`) задаёт случай, а
 * нормализация кода и правило «что рисовать» (`friendsView`) — настоящие. Действия — те, что шлёт оболочка.
 * Образец — ответы сервиса, состояние экрана после действий и модель: Dart (`lib/shell/friends_model.dart`)
 * обязан собрать из того же состояния ту же модель. Запросы и разбор ответов сверяет `friends-dart-service`.
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/friends-dart-model.test.tsx`.
 */

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/friends',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
  };
});
jest.mock('@/src/services/friends', () => {
  const real = jest.requireActual('@/src/services/friends');
  const s = () => (globalThis as any).__friendsServer;
  // Ответ «никогда» — экран ещё ждёт (`undefined`).
  const answer = (v: unknown) => (v === 'pending' ? new Promise(() => {}) : Promise.resolve(v));
  return {
    ...real,
    getMyInviteCode: () => answer(s().myCode),
    listFriends: () => answer(s().friends),
    friendsTop: (game: string) => answer(s().top[game] ?? s().top['*'] ?? []),
    addFriendByCode: () => answer(s().add),
    removeFriend: () => answer(s().remove),
  };
});
jest.mock('react-native-reanimated', () => ({ getUseOfValueInStyleWarning: () => '' }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');   // eslint-disable-line @typescript-eslint/no-require-imports
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(insets) },
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE = '/friends';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const { r, TestRenderer } = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  delete g.__friendsServer;
});

type Act = [string, ...unknown[]];

async function снять(name: string, o: { language: string; server: Record<string, unknown>; acts?: Act[] }) {
  jest.resetModules();
  const mod = require('@react-native-async-storage/async-storage');   // eslint-disable-line @typescript-eslint/no-require-imports
  const AsyncStorage = mod.default ?? mod;
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'nzt48');
  await AsyncStorage.setItem('language', o.language);
  (globalThis as any).__friendsServer = o.server;
  const sent: any[] = [];
  (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
  (globalThis as any).__psyHostScreens = ['/', ROUTE];
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/friends').default;
  const ReactNow = require('react');
  const TestRenderer = require('react-test-renderer');
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  const settle = async () => {
    for (let n = 0; n < 4; n += 1) {
      await TestRenderer.act(async () => {
        for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
      });
    }
  };
  await TestRenderer.act(async () => {
    r = TestRenderer.create(ReactNow.createElement(ProfileProvider, null, ReactNow.createElement(ThemeProvider, null,
      ReactNow.createElement(LanguageProvider, null, ReactNow.createElement(Screen)))));
  });
  await settle();
  поднятые.push({ r, TestRenderer });
  for (const [a, ...args] of o.acts ?? []) {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE][a](...args); });
    await settle();
  }
  const model = [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  const out = { language: o.language, server: o.server, acts: o.acts ?? [], model };
  const file = path.resolve(__dirname, '../../../flutter/test/fixtures', `friends_dart_${name}.json`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
  return model;
}

const VALYA = { id: 'f1', name: 'Валя', since: '2026-10-01' };
const PETYA = { id: 'f2', name: 'Петя', since: '2026-10-02' };

describe('«Друзья» — эталон модели для Dart', () => {
  it('loading: сервер ещё не ответил', async () => {
    const m = await снять('loading', { language: 'ru', server: { myCode: 'pending', friends: 'pending', top: { '*': 'pending' } } });
    expect(m.my.state).toBe('loading');
    expect(m.table.kind).toBe('loading');
  });

  it('offline: спросить не вышло', async () => {
    const m = await снять('offline', { language: 'en', server: { myCode: null, friends: null, top: { '*': null } } });
    expect(m.my.state).toBe('offline');
    expect(m.table.kind).toBe('offline');
  });

  it('noFriends: свой код есть, круг пуст; набор неполного кода', async () => {
    const m = await снять('noFriends', { language: 'ru', server: { myCode: 'K7Q2ZP', friends: [], top: { '*': [] } }, acts: [['draft', ' k7-q ', 3], ['copied', true]] });
    expect(m.table.kind).toBe('no-friends');
    expect(m.add.draft).toBe('K7Q');
    expect(m.add.ready).toBe(false);
  });

  it('rows: таблица другой игры, подтверждение разрыва, своя строка', async () => {
    const m = await снять('rows', {
      language: 'ru',
      server: {
        myCode: 'K7Q2ZP', friends: [VALYA, PETYA],
        top: {
          '*': [],
          choice_rt: [
            { id: 'me', name: 'Денис', score: 412.5, updatedAt: '2026-10-19', isMe: true },
            { id: 'f1', name: 'Валя', score: 388, updatedAt: '2026-10-18', isMe: false },
          ],
        },
      },
      acts: [['game', 'choice_rt'], ['ask', 'f2'], ['copied', false]],
    });
    expect(m.table.kind).toBe('rows');
    expect(m.table.rows[0].score).toBe('413 ms');
    expect(m.circle.rows[1].pending).toBe(true);
  });

  it('nobodyAdd: никто из круга не играл; добавление упёрлось в полный круг', async () => {
    const m = await снять('nobodyAdd', {
      language: 'en',
      server: { myCode: 'K7Q2ZP', friends: [VALYA], top: { '*': [{ id: 'me', name: 'Me', score: 3.25, updatedAt: '2026-10-19', isMe: true }] }, add: { kind: 'full', max: 12 } },
      acts: [['draft', 'abc123', 1], ['add']],
    });
    expect(m.table.kind).toBe('nobody-played');
    expect(m.add.note.ok).toBe(false);
  });

  it('sending: добавление ещё идёт — кнопка не жмётся второй раз', async () => {
    const m = await снять('sending', {
      language: 'ru',
      server: { myCode: 'K7Q2ZP', friends: [], top: { '*': [] }, add: 'pending' },
      acts: [['draft', 'ZZZ999', 1], ['add']],
    });
    expect(m.add.sending).toBe(true);
    expect(m.add.ready).toBe(false);
  });

  it('added: добавлен; разрыв не вышел', async () => {
    const m = await снять('added', {
      language: 'ru',
      server: { myCode: 'K7Q2ZP', friends: [VALYA, PETYA], top: { '*': [{ id: 'f1', name: 'Валя', score: 3.25, updatedAt: '2026-10-18', isMe: false }] }, add: { kind: 'added', friend: { id: 'f2', name: 'Петя' } }, remove: false },
      acts: [['draft', 'ZZZ999', 1], ['add'], ['ask', 'f1'], ['drop', 'f1']],
    });
    expect(m.add.note.ok).toBe(true);
    expect(m.circle.failed).not.toBeNull();
  });
});
