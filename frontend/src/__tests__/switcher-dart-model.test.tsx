/* psygames-switcher-dart-model · VER 1 · 20.10.2026 */
/**
 * 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЕЙ — ЭТАЛОН МОДЕЛИ ДЛЯ DART (задача d6a60b02, вариант Б).
 *
 * Настоящий `ProfileSwitcherModal` с настоящими провайдерами профиля, темы и языка на ПОДГОТОВЛЕННОМ
 * хранилище — модель `#switcher` вместе со всем хранилищем. Dart (`lib/shell/switcher_model.dart`)
 * обязан собрать из того же хранилища ту же модель. Случаи:
 *   · `ru` — RU, свой профиль, очки у нескольких профилей (у одного ноль), файл состава: свой порядок,
 *     свой список игр, выключенная зарядка;
 *   · `en` — EN, ничего не загружено: заводской слой состава, порядок заводской.
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/switcher-dart-model.test.tsx`.
 */
declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
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

const ROUTE = '#switcher';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const { r, TestRenderer } = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
});

async function снять(name: string, o: { profile: string; language: string; prep: Record<string, unknown> }) {
  // Модули — заново: у очков (`tokens.ts`) кэш в памяти, и случай читал бы очки прошлого случая.
  jest.resetModules();
  const mod = require('@react-native-async-storage/async-storage');   // eslint-disable-line @typescript-eslint/no-require-imports
  const AsyncStorage = mod.default ?? mod;
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', o.profile);
  await AsyncStorage.setItem('language', o.language);
  for (const [k, v] of Object.entries(o.prep)) await AsyncStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  const sent: any[] = [];
  (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
  (globalThis as any).__psyHostScreens = ['/', ROUTE];
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Switcher = require('@/src/components/ProfileSwitcherModal').default;
  const ReactNow = require('react');
  const TestRenderer = require('react-test-renderer');
  const { CODE_ENTRY_ENABLED } = require('@/src/constants/profiles');
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(ReactNow.createElement(ProfileProvider, null, ReactNow.createElement(ThemeProvider, null,
      ReactNow.createElement(LanguageProvider, null, ReactNow.createElement(Switcher, { visible: false, onClose: () => {} })))));
  });
  for (let n = 0; n < 4; n += 1) {
    await TestRenderer.act(async () => {
      for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
    });
  }
  поднятые.push({ r, TestRenderer });
  const raw = [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  // Значки в jest — пути файловой системы; в образец (публичный репозиторий) — адресом сборки `/assets/…`.
  const clean = (v: any): any => {
    if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
    }
    return v;
  };
  const model = clean(raw);
  const keys: string[] = [...(await AsyncStorage.getAllKeys())].sort();
  const storage: Record<string, string> = {};
  for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) storage[k] = v;
  // Ввод кода зависит от платформы (`CODE_ENTRY_ENABLED`): образец хранит, на какой его сняли.
  const out = { language: o.language, codeEntry: CODE_ENTRY_ENABLED, storage, model };
  const file = path.resolve(__dirname, '../../../flutter/test/fixtures', `switcher_dart_${name}.json`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/\.\.\/|frontend\//);
  return model;
}

describe('Переключатель профилей — эталон модели для Dart', () => {
  it('ru: свой порядок, свой список игр, кошельки', async () => {
    const m = await снять('ru', {
      profile: 'women', language: 'ru',
      prep: {
        psygames_tokens_v1: { women: 120, kids: 0, nzt48: 4500, polyglot: 7 },
        psygames_playlists_override: {
          профили: { women: { игры: ['schulte_table', 'sudoku', 'memory_matrix'] }, nzt48: { зарядка_включена: false } },
          наборы: [],
          порядок: ['kids', 'women', 'nzt48'],
        },
      },
    });
    expect(m.activeId).toBe('women');
    expect(m.profiles.slice(0, 3).map((p: any) => p.id)).toEqual(['kids', 'women', 'nzt48']);
    expect(m.profiles.find((p: any) => p.id === 'nzt48').wallet).toBe('⭐ 4500');
    expect(m.profiles.find((p: any) => p.id === 'kids').wallet).toBeNull();
    expect(m.details.women.games.length).toBe(3);
  });

  it('en: заводской состав и порядок', async () => {
    const m = await снять('en', { profile: 'nzt48', language: 'en', prep: { psygames_tokens_v1: { nzt48: 33 } } });
    expect(m.profiles.map((p: any) => p.id)).not.toContain('odv999');
    expect(m.profiles.find((p: any) => p.id === 'nzt48').active).toBe(true);
  });
});
