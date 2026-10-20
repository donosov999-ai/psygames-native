/* psygames-onboarding-dart-model · VER 1 · 20.10.2026 */
/**
 * 🔴 «ЗНАКОМСТВО» — ЭТАЛОН МОДЕЛИ ДЛЯ DART (задача d6a60b02, вариант Б).
 *
 * Настоящий экран `app/onboarding.tsx` с настоящими провайдерами профиля, темы и языка на ПОДГОТОВЛЕННОМ
 * хранилище при замороженных часах (вызов дня — от даты); ответы подбора и шаги обучения — действиями
 * оболочки. Образец — модель, хранилище, шаг и ответы: Dart (`lib/shell/onboarding_model.dart`) обязан
 * собрать ту же модель. Случаи:
 *   · `picker_en` — EN, первый запуск: подбор без ответов;
 *   · `picker_quiz` — RU, три ответа → «твои три игры» и профиль-подсказка;
 *   · `picked` — RU, подбор уже пройден этим профилем: экран ждёт перехода на Главную;
 *   · `tutorial_ru` — RU, обучение, первый слайд, профиль с зарядкой;
 *   · `tutorial_final` — EN, обучение, последний слайд, зарядка выключена файлом состава (вызов дня).
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/onboarding-dart-model.test.tsx`.
 */

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => (globalThis as any).__probeParams ?? {},
    usePathname: () => '/onboarding',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
  };
});
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmup: () => ({ startWarmup: () => {} }) }));
jest.mock('@/src/services/reminders', () => ({
  requestReminderPermission: async () => false, applyReminders: async () => {}, saveReminderSettings: async () => {}, DEFAULT_REMINDERS: {},
}));
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

const ROUTE = '/onboarding';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const { r, TestRenderer } = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  delete g.__probeParams;
  jest.useRealTimers();
});

// Местное время конструктором Date: сутки вызова дня одни на любой машине.
const NOW = new Date(2026, 9, 20, 9, 5, 0).getTime();

type Act = [string, ...unknown[]];

async function снять(name: string, o: { profile: string; language: string; tutorial?: boolean; prep?: Record<string, unknown>; acts?: Act[] }) {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
  });
  jest.resetModules();
  const mod = require('@react-native-async-storage/async-storage');   // eslint-disable-line @typescript-eslint/no-require-imports
  const AsyncStorage = mod.default ?? mod;
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', o.profile);
  await AsyncStorage.setItem('language', o.language);
  for (const [k, v] of Object.entries(o.prep ?? {})) await AsyncStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  (globalThis as any).__probeParams = o.tutorial ? { tutorial: '1' } : {};
  const sent: any[] = [];
  (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
  (globalThis as any).__psyHostScreens = ['/', ROUTE];
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/onboarding').default;
  const { SLIDES } = require('../../app/onboarding');
  const ReactNow = require('react');
  const TestRenderer = require('react-test-renderer');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const keys0: string[] = [...(await AsyncStorage.getAllKeys())].sort();
  const storage: Record<string, string> = {};
  for (const [k, v] of await AsyncStorage.multiGet(keys0)) if (v != null) storage[k] = v;
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
  // Состояние, которое держит экран: шаг обучения и ответы подбора — их Dart получает так же.
  let step = 0;
  const quiz: Record<string, number> = {};
  for (const [a, ...args] of o.acts ?? []) {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE][a](...args); });
    await settle();
    if (a === 'quiz') quiz[args[0] as string] = args[1] as number;
    if (a === 'main') step += 1;
  }
  const raw = [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  const clean = (v: any): any => {
    if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
    }
    return v;
  };
  const model = clean(raw);
  // Слайд уведомлений — только вне веба: образец хранит, был ли он (в jest `Platform.OS` — не веб).
  const notifications = SLIDES.some((s: any) => s.kind === 'notifications');
  const out = { now: NOW, tzOffsetMinutes: new Date(NOW).getTimezoneOffset(), language: o.language, tutorial: !!o.tutorial, notifications, step, quiz, storage, model };
  const file = path.resolve(__dirname, '../../../flutter/test/fixtures', `onboarding_dart_${name}.json`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/\.\.\/|frontend\//);
  return model;
}

describe('«Знакомство» — эталон модели для Dart', () => {
  it('picker_en: первый запуск, подбор без ответов', async () => {
    const m = await снять('picker_en', { profile: 'nzt48', language: 'en' });
    expect(m.mode).toBe('picker');
    expect(m.quiz.yours).toBeNull();
    expect(m.cards).toHaveLength(3);
  });

  it('picker_quiz: три ответа — три игры и профиль-подсказка', async () => {
    const m = await снять('picker_quiz', { profile: 'women', language: 'ru', acts: [['quiz', 'mood', 1], ['quiz', 'time', 2], ['quiz', 'taste', 0]] });
    expect(m.quiz.yours.cards).toHaveLength(3);
    expect(m.quiz.yours.profile).toContain('Полиглот');
  });

  it('picked: подбор пройден — экран ждёт перехода', async () => {
    // Профиль — тот, с которым контекст стартует (`free`): иначе первый рендер видит другой профиль и
    // открывает подбор, а переход на Главную приходит уже после.
    const m = await снять('picked', { profile: 'free', language: 'ru', prep: { psygames_onboarding_picked_free: '1' } });
    expect(m.mode).toBe('loading');
  });

  it('tutorial_ru: обучение, первый слайд', async () => {
    const m = await снять('tutorial_ru', { profile: 'nzt48', language: 'ru', tutorial: true });
    expect(m.mode).toBe('tutorial');
    expect(m.dots.active).toBe(0);
  });

  it('tutorial_final: последний слайд без зарядки — вызов дня', async () => {
    const m = await снять('tutorial_final', {
      profile: 'kids', language: 'en', tutorial: true,
      // Зарядку выключает файл состава — у всех профилей сборки она включена.
      prep: { psygames_playlists_override: { профили: { kids: { зарядка_включена: false } }, наборы: [], порядок: null } },
      acts: [['main'], ['main'], ['main'], ['main'], ['main'], ['main'], ['main']],
    });
    expect(m.skip).toBeNull();
    expect(m.slide.finalHint).toMatch(/^🎲 /);
  });
});
