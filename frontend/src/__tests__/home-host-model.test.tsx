/* eslint-disable @typescript-eslint/no-require-imports -- экран и сервисы берутся ПОСЛЕ подмен и сброса */
/**
 * 🔴 НАСТОЯЩАЯ ГЛАВНАЯ ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ И ПЕРЕЧИТЫВАЕТСЯ ПО ПРОСЬБЕ (задача 7c88c0b8).
 *
 * `home-model.test.ts` проверяет раскладку на подготовленных данных. Здесь монтируется сам экран
 * (`app/index.tsx`) с настоящим хранилищем и сервисами; профиль, тема и язык — статичные подставки
 * (как в `warmup-screens-drawn-by-host`: настоящие провайдеры в этой обвязке не монтируют даже
 * исходную Главную из main — замер 07.10, висит до тайм-аута); оболочка подменена
 * (`window.PsyBridge`, `window.__psyHostScreens`):
 *   · без оболочки модель не уходит — браузер работает как раньше;
 *   · под оболочкой уходит модель «/» с тем, что экран прочитал (монеты — из хранилища);
 *   · 🔴 `refresh` перечитывает данные: монеты в хранилище изменились — модель следует. Без него
 *     нативная Главная после игры поверх показывала бы вчерашнее (страница фокуса не теряет);
 *   · вызов дня — действием: экран сам ставит отметку и уводит на игру вызова.
 */
const mockPush = jest.fn();
const mockRouter = { push: mockPush, replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  const R = require('react');
  return {
    usePathname: () => '/',
    // ⚠️ Один объект: эффект Главной зависит от `router`, и новый объект на каждый вызов крутил его
    // вечно (замер 07.10 счётчиком сеттеров: history/streak/achievementsCount по 660 раз).
    useRouter: () => mockRouter,
    router: mockRouter,
    // Экран в фокусе всё время — эффект фокуса работает как обычный эффект по своим зависимостям.
    useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(cb, [cb]),
  };
});
jest.mock('@/src/services/appUpdates', () => ({
  checkForUpdateDaily: async () => null, updateUrl: () => 'https://psy-games.pro', currentVersion: () => '0.0.0',
}));
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmup: () => ({ startWarmup: jest.fn() }) }));
const mockProfile = (() => {
  const { PROFILES } = jest.requireActual('@/src/constants/profiles');
  return PROFILES.find((p: any) => p.id === 'nzt48');
})();
// ⚠️ Один и тот же объект на каждый вызов — как `useMemo` настоящего провайдера: новый массив
// профилей на каждый рендер крутил бы эффекты, зависящие от него (замер 07.10: нехватка памяти).
const mockCtx = { profile: mockProfile, ready: true, составИзФайла: null, allProfiles: [mockProfile],
  switchProfile: () => {}, redeemCode: async () => null, isAccessible: () => true, unlockedThemed: new Set() };
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => mockCtx,
  useProfileOptional: () => ({ profile: mockProfile }),
}));
const mockColors = { background: '#F5F5F7', surface: '#FFFFFF', card: '#FFFFFF', text: '#1C1C1E', textSecondary: '#6E6E73', primary: '#a855f7', border: '#E5E5EA' };
const mockTheme = { colors: mockColors, isDark: false };
jest.mock('@/src/contexts/ThemeContext', () => ({ useTheme: () => mockTheme }));
const mockT = (k: string) => k;
const mockLang = { t: mockT, language: 'ru' };
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => mockLang,
  translateFor: (_l: string, k: string) => k,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
// SafeAreaView в jest рисует нативный компонент, которого нет (тот же приём — warmup-screens-drawn-by-host).
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...p }: any) => R.createElement(View, p, children),
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('expo-linear-gradient', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => R.createElement(View, p, children) };
});
jest.mock('@/src/components/GradientSurface', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...p }: any) => R.createElement(View, p, children) };
});

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function смонтировать(host: boolean) {
  jest.resetModules();
  mockPush.mockClear();
  const sent: any[] = [];
  const g = globalThis as any;
  if (host) {
    g.PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    g.__psyHostScreens = ['/', '#switcher'];
  }
  const хранилище = require('@react-native-async-storage/async-storage');
  const storage = хранилище.default ?? хранилище;
  await storage.clear();
  await storage.setItem('psygames_active_profile', 'nzt48');
  await storage.setItem('psygames_onboarding_picked_nzt48', '1');
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  // ⚠️ Относительный путь: `@/app/index` после `jest.resetModules()` разрешается в `app.json` ({ expo }).
  const Home = require('../../app/index').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
      React.createElement(Home)));
  });
  for (let i = 0; i < 5; i++) await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === '/')?.model;
  return { r, sent, last, TestRenderer, storage };
}

afterEach(() => {
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
});

describe('веб-Главная под оболочкой', () => {
  it('без оболочки модель не уходит', async () => {
    const { sent, r, TestRenderer } = await смонтировать(false);
    expect(sent.filter((m) => m.op === 'screenUi')).toEqual([]);
    await TestRenderer.act(async () => r.unmount());
  });

  it('🔴 модель уходит; refresh перечитывает монеты из хранилища', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const m = last();
    expect(m?.profileId).toBe('nzt48');
    expect(m.blocks.map((b: any) => b.kind)).toContain('today');
    const было = m.header.tokens;
    const { addTokens } = require('@/src/services/tokens');
    await TestRenderer.act(async () => { await addTokens('nzt48', 100); });
    expect(last().header.tokens).toBe(было);  // страница сама не узнала — фокус не менялся
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/'].refresh(); });
    for (let i = 0; i < 5; i++) await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
    expect(last().header.tokens).toBe(было + 100);
    await TestRenderer.act(async () => r.unmount());
  });

  it('вызов дня — действием: экран уводит на игру вызова', async () => {
    const { r, TestRenderer } = await смонтировать(true);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/'].challenge(); });
    for (let i = 0; i < 3; i++) await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
    const { getTodayChallenge } = require('@/src/services/daily-challenge');
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: getTodayChallenge().game.route }));
    await TestRenderer.act(async () => r.unmount());
  });
});
