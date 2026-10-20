/* psygames-shop-dart-model · VER 1 · 20.10.2026 */
/**
 * 🔴 «МАГАЗИН» — ЭТАЛОН МОДЕЛИ ДЛЯ DART (задача d6a60b02, вариант Б).
 *
 * Настоящий экран `app/shop.tsx` с настоящими провайдерами профиля, темы и языка на ПОДГОТОВЛЕННОМ
 * хранилище при замороженных часах. Образец — хранилище ДО монтирования, модель и хранилище ПОСЛЕ:
 * `peekWager` сам стирает сгоревшую ставку, и Dart (`lib/shell/shop_model.dart`) обязан и показать ту же
 * модель, и стереть ту же запись. Случаи:
 *   · `fresh` — EN, ничего нет: 0 очков, всё «мало очков», ставки нет;
 *   · `rich` — RU, свой профиль: куплено и надето (акцент, рамка, титул, звук, вещь питомца), кошелёк
 *     способностей с полным и пустым, ставка идёт (вчера засчитан третий день);
 *   · `lost` — AR (справа налево): ставка сгорела (пропуск дня), запись соседнего профиля цела;
 *   · `cat` — как `rich`, но выбрана вкладка «Звуки» (действие `cat` оболочки).
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/shop-dart-model.test.tsx`.
 */

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/shop',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
  };
});
// Плагин reanimated в babel принимает `c.value` в стиле (цвет товара) за значение анимации — как в
// `shop-host-model.test.tsx`, хватает одной функции.
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

const ROUTE = '/shop';
const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const { r, TestRenderer } = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.useRealTimers();
});

const д = 24 * 3600000;
// Местное время конструктором Date: сутки ставки одни на любой машине.
const NOW = new Date(2026, 9, 20, 14, 25, 9).getTime();
const сутки = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

async function снять(name: string, o: { profile: string; language: string; prep: Record<string, unknown>; cat?: string }) {
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
  const dump = async () => {
    const keys: string[] = [...(await AsyncStorage.getAllKeys())].sort();
    const out: Record<string, string> = {};
    for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) out[k] = v;
    return out;
  };
  const storage = await dump();
  const sent: any[] = [];
  (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
  (globalThis as any).__psyHostScreens = ['/', ROUTE];
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/shop').default;
  const ReactNow = require('react');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const TestRenderer = require('react-test-renderer');   // eslint-disable-line @typescript-eslint/no-require-imports
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
  if (o.cat !== undefined) {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE].cat(o.cat); });
    await settle();
  }
  const raw = [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  // Пути картинок в jest — файловой системы; в образец (публичный репозиторий) — адресом сборки
  // `/assets/…`, тем же правилом, что выгрузка `flutter-shop-asset-fresh`.
  const clean = (v: any): any => {
    if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
    }
    return v;
  };
  const model = clean(raw);
  const after = await dump();
  const out = { now: NOW, tzOffsetMinutes: new Date(NOW).getTimezoneOffset(), language: o.language, cat: o.cat ?? null, storage, after, model };
  const file = path.resolve(__dirname, '../../../flutter/test/fixtures', `shop_dart_${name}.json`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/\.\.\/|frontend\//);
  return { model, storage, after };
}

const RICH = {
  psygames_tokens_v1: { women: 1400, nzt48: 99 },
  psygames_cosmetics_unlocked_women: ['accent_gold', 'frame_crimson', 'title_owl', 'sound_retro', 'pet_bow', 'avatar_fox', 'digits_neon', 'theme_nzt48', 'bg_kids'],
  psygames_cosmetics_equipped_women: { accent: 'accent_gold', frame: 'frame_crimson', title: 'title_owl', avatar: 'avatar_fox' },
  psygames_sound_pack: 'square',
  psygames_pet_acc: 'bow',
  psygames_abilities_v1: { women: { second_life: 5, streak_shield: 0, sudoku_hint: 3 }, nzt48: { practice_run: 2 } },
  psygames_wager_v1: { women: { stake: 300, start: сутки(NOW - 3 * д), lastSeen: сутки(NOW - д), daysDone: 3 } },
};

describe('«Магазин» — эталон модели для Dart', () => {
  it('fresh: EN, ничего нет', async () => {
    const { model: m } = await снять('fresh', { profile: 'nzt48', language: 'en', prep: {} });
    expect(m.balance).toBe('0');
    expect(m.abilities.wager.active).toBe(false);
    expect(m.sections.every((s: any) => s.items.every((i: any) => !i.owned))).toBe(true);
  });

  it('rich: RU, куплено и надето, кошелёк, ставка идёт', async () => {
    const { model: m } = await снять('rich', { profile: 'women', language: 'ru', prep: RICH });
    expect(m.primary).toBe('#f5b50a');
    expect(m.abilities.wager.active).toBe(true);
    expect(m.abilities.rows.find((a: any) => a.id === 'second_life').buy.enabled).toBe(false);
    // Свой арт профиля и свои цифры не продаются.
    expect(m.sections.flatMap((s: any) => s.items.map((i: any) => i.id))).not.toContain('bg_women');
    expect(m.sections.flatMap((s: any) => s.items.map((i: any) => i.id))).not.toContain('digits_pastel');
  });

  it('lost: AR, ставка сгорела и стёрта, соседняя цела', async () => {
    const { model: m, after } = await снять('lost', {
      profile: 'kids', language: 'ar',
      prep: {
        psygames_tokens_v1: { kids: 350 },
        psygames_wager_v1: {
          kids: { stake: 300, start: сутки(NOW - 5 * д), lastSeen: сутки(NOW - 3 * д), daysDone: 2 },
          women: { stake: 300, start: сутки(NOW), lastSeen: сутки(NOW), daysDone: 1 },
        },
        psygames_abilities_v1: { kids: { streak_shield: 2 } },
      },
    });
    expect(m.backIcon).toBe('arrow-forward');
    expect(m.abilities.wager.btn.enabled).toBe(true);
    expect(Object.keys(JSON.parse(after.psygames_wager_v1))).toEqual(['women']);
  });

  it('cat: вкладка «Звуки» — только её раздел, способностей нет', async () => {
    const { model: m } = await снять('cat', { profile: 'women', language: 'ru', prep: RICH, cat: 'sound' });
    expect(m.abilities).toBeNull();
    expect(m.sections.map((s: any) => s.type)).toEqual(['sound']);
    expect(m.sections[0].first).toBe(true);
  });
});
