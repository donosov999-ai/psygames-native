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
// Вход сборщика модели — для эталона Dart (вариант Б, d6a60b02): последний вызов запоминается.
jest.mock('@/src/services/homeModel', () => {
  const a = jest.requireActual('@/src/services/homeModel');
  return { ...a, buildHomeModel: (i: any) => { (globalThis as any).__psyHomeInput = i; return a.buildHomeModel(i); } };
});
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

/**
 * 🔴 ЭТАЛОН СБОРЩИКА МОДЕЛИ ДЛЯ DART (задача d6a60b02, вариант Б, Главная — шаг «сборщик»).
 *
 * `buildHomeModel` чистый: вход → модель. Вход снимается с живого экрана (что он прочитал и посчитал),
 * а модель считается тем же сборщиком с НАСТОЯЩИМ словарём (`translateFor`, здесь подставка отдаёт
 * ключ) на RU и EN. Второй случай — тот же вход, где включено всё: лестница, сундук, «продолжить»,
 * цель на проверке, строк «Сегодня» больше потолка, рекомендация «уже сегодня», зарядка, вызов дня
 * сделан, любимые разделы с «ещё N», окно цели, тосты, обновление, фото фона. Картинки — адресами
 * (`assetUri`), игры — по id (Dart берёт их из `assets/catalog.json`).
 */
describe('сборщик модели Главной — эталон для Dart', () => {
  const ПОКАЗ = ['цель_дня', 'сегодня', 'рекомендации', 'практики', 'любимые_разделы'];
  function вход(i: any) {
    const { assetUri } = require('@/src/services/hostScreens');
    const onPhoto = i.profileBg !== undefined && i.profileBg !== null;
    return {
      profile: i.profile, colors: i.colors,
      showBlock: Object.fromEntries(ПОКАЗ.map((k) => [k, !!i.showBlock(k)])),
      images: { onPhoto, profileBg: onPhoto ? assetUri(i.profileBg) : null, logo: assetUri(i.logo), chip: assetUri(i.chipImage),
        warmup: i.warmup ? assetUri(i.warmup.image) : null },
      logoPlate: i.logoPlate, tokens: i.tokens, level: i.level, streak: i.streak, pet: i.pet,
      frameColor: i.frameColor, titleLabel: i.titleLabel, achievementsCount: i.achievementsCount, update: i.update,
      streakToast: i.streakToast, wagerToast: i.wagerToast, levelUp: i.levelUp, ladder: i.ladder, chest: i.chest,
      resume: i.resume ? i.resume.id : null, goalCard: i.goalCard, goalMaxLen: i.goalMaxLen, goalExampleKeys: [...i.goalExampleKeys],
      today: i.today, todayRowsMax: i.todayRowsMax, dayStreakForMult: i.dayStreakForMult,
      reco: i.reco.map((r: any) => ({ pick: r.pick, gameId: r.game.id })), recoParams: i.recoParams,
      warmup: i.warmup ? { gradient: i.warmup.gradient, slotKey: i.warmup.slotKey } : null, pause: i.pause,
      challenge: { gameId: i.challenge.game.id, difficultyKey: i.challenge.difficultyKey, done: i.challenge.done, streak: i.challenge.streak },
      favourites: i.favourites, goalSheet: i.goalSheet,
    };
  }

  /**
   * 🔴 Картинки в jest — относительные пути до файла (`../../…/<рабочая папка>/frontend/assets/…`): в
   * образец публичного репо попало бы имя локальной папки. Приводим к адресу сборки `/assets/…` —
   * глубоко, вместе с кадрами питомца; функции и прочее — как есть.
   */
  const чистый = (v: any): any => {
    // На CI `node_modules` лежит в самом frontend/, и путь — `../../../assets/…` без `frontend/`
    // (в рабочей копии со ссылкой на общий node_modules — `../…/<папка>/frontend/assets/…`).
    if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
    if (Array.isArray(v)) return v.map(чистый);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, чистый(x)]));
    }
    return v;
  };

  it('живой вход и «всё включено» → модель RU и EN; образцы для Dart', async () => {
    const { r, TestRenderer } = await смонтировать(true);
    const живой = чистый((globalThis as any).__psyHomeInput);
    expect(живой?.profile?.id).toBe('nzt48');
    const { GAMES } = require('@/src/constants/games');
    const { SLOT_TINT } = require('@/src/constants/homeHero');
    const игра = (id: string) => GAMES.find((g: any) => g.id === id);
    const всё = {
      ...живой,
      showBlock: () => true,
      profileBg: '/assets/backgrounds/nzt48.webp', logo: { uri: '/assets/logos/nzt48.png' }, chipImage: '/assets/avatars/fox.png',
      frameColor: '#fbbf24', titleLabel: 'Мастер', achievementsCount: 7, update: '2.57.0',
      streakToast: 15, wagerToast: { kind: 'won', amount: 120 }, levelUp: 4,
      level: { level: 4, span: 400, progress: 0.25, titleKey: 'levelTitle4' }, tokens: 800, streak: 6,
      ladder: { n: 120, titleKey: 'ladderUndo' },
      chest: { face: '🦊', left: 35, have: 3, all: 12, ratio: 0.6 },
      resume: игра('schulte_table'),
      goalCard: { state: 'review', goal: { text: 'Пройти три судоку', outcome: null, reward: 30 } },
      today: { rows: [
        { game: 'schulte_table', rounds: 3, doubled: true, total: 40 }, { game: 'sudoku', rounds: 1, doubled: false, total: 15 },
        { game: 'corsi', rounds: 2, doubled: false, total: 10 }, { game: 'retired_game', rounds: 1, doubled: false, total: 5 },
      ], total: 70, rounds: 7, dayStreak: 5 },
      reco: [
        { pick: { gameId: 'sudoku', reasonKey: 'recoWhyGrowth' }, game: игра('sudoku') },
        { pick: { gameId: 'corsi', reasonKey: 'recoWhyComeback', doneToday: true }, game: игра('corsi') },
      ],
      recoParams: { calm: '1' },
      warmup: { gradient: SLOT_TINT.evening, image: { uri: '/assets/icons/warmup.png' }, slotKey: 'slotEvening' },
      challenge: { game: игра('n_back'), difficultyKey: 'hard', done: true, streak: 9 },
      favourites: [
        { category: 'memory', total: 9, routes: ['/games/corsi', '/games/n-back'], hidden: 7 },
        { category: 'logic', total: 2, routes: ['/games/sudoku', '/games/hanoi'], hidden: 0 },
      ],
      goalSheet: { line: 'Возьмём серию?', petState: живой.pet, options: [7, 14, 30], chosen: 14,
        whyKey: 'goalSuggest_best_streak', basis: 9, games: 7, tokens: 70, streak: 5 },
    };
    const { translateFor } = jest.requireActual('@/src/contexts/LanguageContext');
    const { buildHomeModel } = jest.requireActual('@/src/services/homeModel');
    const fs = require('fs');
    const path = require('path');
    const dir = path.resolve(__dirname, '../../../flutter/test/fixtures');
    const записать = (name: string, v: unknown) => {
      if (process.env.WRITE === '1') fs.writeFileSync(path.join(dir, name), `${JSON.stringify(v, null, 1)}\n`, 'utf8');
      expect(fs.existsSync(path.join(dir, name))).toBe(true);
    };
    for (const [имя, i] of [['live', живой], ['rich', всё]] as const) {
      записать(`home_builder_input_${имя}.json`, вход(i));
      for (const lang of ['ru', 'en']) {
        const t = (k: string) => translateFor(lang, k);
        // `gameName` экрана замкнут на `t` экрана (здесь подставка, отдающая ключ) — собираем тем же
        // правилом на настоящем словаре.
        const gameName = (id: string) => { const g = игра(id); return g ? t(g.nameKey) : null; };
        const m = buildHomeModel({ ...i, t, gameName });
        if (lang === 'en') expect(/[А-Яа-яЁё]/.test(JSON.stringify({ ...m, blocks: m.blocks.filter((b: any) => b.kind !== 'goal'), header: { ...m.header, title: null }, goalSheet: null }))).toBe(false);
        записать(`home_builder_model_${имя}_${lang}.json`, m);
      }
    }
    expect(вход(всё).images.onPhoto).toBe(true);
    expect(JSON.stringify(вход(живой))).not.toMatch(/\.\.\/|frontend\//);
    await TestRenderer.act(async () => r.unmount());
  });
});
