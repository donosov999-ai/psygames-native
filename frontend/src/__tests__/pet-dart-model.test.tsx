/* psygames-pet-dart-model · VER 1 · 20.10.2026 */
/**
 * 🔴 «ПИТОМЕЦ» — ЭТАЛОН МОДЕЛИ ДЛЯ DART (задача d6a60b02, вариант Б).
 *
 * Настоящий экран `app/pet.tsx` с настоящими провайдерами — профиль, тема, язык и уровень игрока
 * (`PlayerLevelProvider`, как в `_layout.tsx`: он запирает облики) — на ПОДГОТОВЛЕННОМ хранилище при
 * замороженных часах. Образец — модель вместе со всем хранилищем после монтирования, мигом и поясом:
 * Dart (`lib/shell/pet_model.dart`) обязан собрать из того же хранилища ту же модель. Реплика в
 * пузыре случайна (`pickSimpleLine`) — Dart сверяет её с пулом, а не строкой. Три случая:
 *   · `fresh` — EN, ничего не сыграно, 0 очков: голоден, облики заперты, «нужно больше очков»;
 *   · `rich` — RU, свой профиль с закрытыми играми, облик и вещь, имя, давно не мыт, совет;
 *   · `fed` — RU, покормлен и вымыт сегодня, облик «авто», третья стадия, облики открыты.
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/pet-dart-model.test.tsx`.
 */

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/pet',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
  };
});
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

const ROUTE = '/pet';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const { r, TestRenderer } = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.useRealTimers();
});

const ч = 3600000;
const д = 24 * ч;
// Местное время конструктором Date: час суток в образце один на любой машине.
const NOW = new Date(2026, 9, 20, 14, 25, 9).getTime();
const сутки = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const iso = (ms: number) => new Date(ms).toISOString();

/** Партии из списка «игра × сколько», по одной в час назад от «сейчас». */
const партии = (pid: string, plan: [string, number][]) => {
  const out: any[] = [];
  for (const [game, n] of plan) for (let i = 0; i < n; i += 1) out.push({ profile_id: pid, game_type: game, score: 10, time_seconds: 60, timestamp: '' });
  return out.map((s, i) => ({ ...s, timestamp: iso(NOW - (out.length - i) * ч) }));
};

async function снять(name: string, o: { profile: string; language: string; prep: Record<string, unknown> }) {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
  });
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
  const { PlayerLevelProvider } = require('@/src/contexts/PlayerLevelContext');
  const Screen = require('../../app/pet').default;
  const ReactNow = require('react');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const TestRenderer = require('react-test-renderer');   // eslint-disable-line @typescript-eslint/no-require-imports
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(ReactNow.createElement(ProfileProvider, null, ReactNow.createElement(ThemeProvider, null,
      ReactNow.createElement(LanguageProvider, null, ReactNow.createElement(PlayerLevelProvider, null, ReactNow.createElement(Screen))))));
  });
  for (let n = 0; n < 4; n += 1) {
    await TestRenderer.act(async () => {
      for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
    });
  }
  поднятые.push({ r, TestRenderer });
  const raw = [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  // Пути кадров в jest — файловой системы; в образец (публичный репозиторий) — адресом сборки `/assets/…`,
  // тем же правилом, что выгрузка `flutter-pet-asset-fresh` (сервер приложения отдаёт файл по нему).
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
  const out = { now: NOW, tzOffsetMinutes: new Date(NOW).getTimezoneOffset(), language: o.language, storage, model };
  const file = path.resolve(__dirname, '../../../flutter/test/fixtures', `pet_dart_${name}.json`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/\.\.\/|frontend\//);
  return model;
}

describe('«Питомец» — эталон модели для Dart', () => {
  it('fresh: EN, ничего не сыграно', async () => {
    const m = await снять('fresh', { profile: 'nzt48', language: 'en', prep: {} });
    expect(m.total).toBe('0');
    expect(m.feed.needMore).not.toBeNull();
    expect(m.skins.filter((s: any) => s.locked).map((s: any) => s.id)).toEqual(['robot', 'constellation']);
  });

  it('rich: RU, свой профиль, облик, вещь, имя, давно не мыт', async () => {
    const m = await снять('rich', {
      profile: 'women', language: 'ru',
      prep: {
        psygames_sessions: [
          ...партии('women', [['schulte_table', 7], ['memory_matrix', 5], ['sudoku', 3], ['flanker', 4]]),
          ...партии('nzt48', [['corsi', 2]]),
        ],
        psygames_tokens_v1: { women: 120, nzt48: 999 },
        psygames_pet_skin: 'robot',
        psygames_pet_acc: 'bow',
        psygames_pet_name: '  Мурзик  ',
        psygames_pet_washed_at: String(NOW - 3 * д),
        psygames_pet_fed_log: [сутки(NOW - 2 * д), сутки(NOW - 5 * д), сутки(NOW - 20 * д)],
        psygames_schulte_table_stars_women: { 1: 3, 2: 3, 3: 2, 4: 1, 5: 2 },
        psygames_sudoku_stars_women: { 1: 1, 2: 1, 3: 1, 4: 0 },
      },
    });
    expect(m.name).toBe('Мурзик');
    expect(m.care[0].enabled).toBe(true);
    expect(m.advice).not.toBeNull();
  });

  it('fed: RU, покормлен и вымыт сегодня, облик «авто», третья стадия', async () => {
    const m = await снять('fed', {
      profile: 'nzt48', language: 'ru',
      prep: {
        psygames_sessions: партии('nzt48', [['schulte_table', 12], ['digit_span', 12], ['sudoku', 10], ['go_no_go', 8]]),
        psygames_tokens_v1: { nzt48: 15 },
        psygames_pet_skin: 'auto',
        psygames_pet_fed: сутки(NOW),
        psygames_pet_fed_log: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => сутки(NOW - k * д)),
        psygames_pet_washed_at: String(NOW - 2 * ч),
        psygames_schulte_table_stars_nzt48: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
        psygames_corsi_stars_nzt48: { 1: 2, 2: 2, 3: 1 },
      },
    });
    expect(m.feed.fed).toBe(true);
    expect(m.care[0].enabled).toBe(false);
    expect(m.skins.some((s: any) => s.locked)).toBe(false);
  });
});
