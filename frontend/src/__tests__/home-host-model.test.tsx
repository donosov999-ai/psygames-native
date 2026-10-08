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
// Профиль и состав меняет только проба входов (ниже): там профиль — с наложенным файлом состава, как
// у настоящего провайдера (`наложить`), а не голая запись из PROFILES.
const mockCtx: any = { profile: mockProfile, ready: true, составИзФайла: null, allProfiles: [mockProfile],
  switchProfile: () => {}, redeemCode: async () => null, isAccessible: () => true, unlockedThemed: new Set() };
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => mockCtx,
  useProfileOptional: () => ({ profile: mockCtx.profile }),
}));
const mockColors = { background: '#F5F5F7', surface: '#FFFFFF', card: '#FFFFFF', text: '#1C1C1E', textSecondary: '#6E6E73', primary: '#a855f7', border: '#E5E5EA' };
const mockTheme = { colors: mockColors, isDark: false };
jest.mock('@/src/contexts/ThemeContext', () => ({ useTheme: () => mockTheme }));
const mockT = (k: string) => k;
const mockLang: { t: (k: string) => string; language: string; realTranslate?: boolean } = { t: mockT, language: 'ru' };
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => mockLang,
  // Проба входов переводит по-настоящему (титул надетой вещи — `translateFor`); прочие — ключом.
  translateFor: (l: string, k: string) => (mockLang.realTranslate
    ? jest.requireActual('@/src/contexts/LanguageContext').translateFor(l, k) : k),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
// История зарядок: `readHistoryRaw` берёт хранилище динамическим `import()`, а в jest он молча падает
// (замер 08.10: `computeStreak` по истории — 4, через `loadWarmupHistory` — 0 записей; то же поймала
// `progress-pages-host-model` 07.10). Подставлено только чтение — тем же пробным хранилищем и с тем
// же правилом: нет ключа — пусто, не список — пусто; серию считает настоящий `computeStreak`.
jest.mock('@/src/services/warmup', () => ({
  ...jest.requireActual('@/src/services/warmup'),
  loadWarmupHistory: async () => {
    const m = require('@react-native-async-storage/async-storage');
    try {
      const raw = await (m.default ?? m).getItem('psygames_warmup_history');
      if (raw == null) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },
}));
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

async function смонтировать(host: boolean, prep?: (storage: any) => Promise<void>) {
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
  if (prep) await prep(storage);
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

/** Вход сборщика как JSON для Dart: картинки — адресами, игры — по id, правило показа блоков — таблицей. */
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

/**
 * 🔴 ВХОДЫ ГЛАВНОЙ ИЗ ХРАНИЛИЩА — ЭТАЛОН ДЛЯ DART (задача d6a60b02, вариант Б, Главная — шаг 7б).
 *
 * Настоящая Главная монтируется на подготовленном хранилище при замороженных часах; образец — вход
 * сборщика модели (`вход`) вместе со ВСЕМ хранилищем после монтирования, мигом «сейчас», поясом,
 * шириной окна и языком. Dart (`home_inputs.dart`) читает то же хранилище и обязан собрать тот же
 * вход. Профиль — с наложенным файлом состава, как у настоящего провайдера. Три случая:
 *   · `fresh` — первый заход утром: пусто, приветственный бонус, окно первой цели;
 *   · `rich` — днём, всё заполнено: надетые вещи, лестница, сундук, «продолжить» (свежая, старая,
 *     чужая и снятая с каталога партии), «Сегодня» сверх потолка, цель дня, вызов дня сделан,
 *     рекомендации из возврата, роста и слабого места, любимые разделы, недельный повод цели;
 *   · `evening` — вечер, EN, свой файл состава (блоки Главной, игры профиля), цель дошла, проверка
 *     цели дня, вечерний отбор рекомендаций, «авто»-облик питомца, слабое место из оценки.
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/home-host-model.test.tsx`.
 */
describe('входы Главной из хранилища — эталон для Dart', () => {
  const ч = 3600000;
  const д = 24 * ч;
  const iso = (ms: number) => new Date(ms).toISOString();
  /** Сутки журнала начислений, цели и вызова (`dayKey` веба): без ведущих нулей. */
  const сутки = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  /** Дата истории зарядок и слабого места: с ведущими нулями. */
  const дата = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Местное время — конструктором Date: час суток в образце один и тот же на любой машине.
  const УТРО = new Date(2026, 9, 8, 9, 15, 7).getTime();
  const ДЕНЬ = new Date(2026, 9, 8, 13, 40, 12).getTime();
  const ВЕЧЕР = new Date(2026, 9, 8, 21, 30, 45).getTime();

  beforeEach(() => {
    jest.useFakeTimers({
      now: ДЕНЬ,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    mockLang.language = 'ru';
    mockLang.realTranslate = false;
    mockCtx.profile = mockProfile;
    mockCtx.составИзФайла = null;
  });

  const положить = (st: any, v: Record<string, unknown>) =>
    Promise.all(Object.entries(v).map(([k, x]) => st.setItem(k, typeof x === 'string' ? x : JSON.stringify(x))));

  async function снять(name: string, o: { now: number; profile: string; language: string; prep?: (st: any) => Promise<void> }) {
    jest.setSystemTime(o.now);
    mockLang.language = o.language;
    mockLang.realTranslate = true;
    const { r, TestRenderer, storage } = await смонтировать(true, async (st) => {
      await st.setItem('psygames_active_profile', o.profile);
      await st.setItem(`psygames_onboarding_picked_${o.profile}`, '1');
      if (o.prep) await o.prep(st);
      const { PROFILES } = require('@/src/constants/profiles');
      const { загрузить, наложить } = require('@/src/services/playlistOverride');
      const состав = await загрузить();
      mockCtx.profile = наложить(PROFILES.find((p: any) => p.id === o.profile), состав?.профили ?? null);
      mockCtx.составИзФайла = состав;
    });
    // Цепочки фокуса (партии → «Сегодня» → повод цели) — даём им осесть.
    for (let i = 0; i < 8; i++) await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 20)); });
    const input = вход(чистый((globalThis as any).__psyHomeInput));
    const keys: string[] = [...(await storage.getAllKeys())].sort();
    const snapshot: Record<string, string> = {};
    for (const [k, v] of await storage.multiGet(keys)) if (v != null) snapshot[k] = v;
    const { Dimensions } = require('react-native');
    const out = {
      now: o.now, tzOffsetMinutes: new Date(o.now).getTimezoneOffset(), winW: Dimensions.get('window').width,
      language: o.language, storage: snapshot, input,
    };
    const fs = require('fs');
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures', `home_inputs_${name}.json`);
    if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/\.\.\/|frontend\//);
    await TestRenderer.act(async () => r.unmount());
    return out;
  }

  it('fresh: первый заход утром', async () => {
    const { input } = await снять('fresh', { now: УТРО, profile: 'nzt48', language: 'ru' });
    expect(input.goalSheet).not.toBeNull();
    expect(input.reco.map((x: any) => x.pick.reason)).toEqual(['start', 'start', 'start']);
  });

  it('rich: днём, всё заполнено', async () => {
    const N = ДЕНЬ;
    const партия = (game: string, ago: number, extra: Record<string, unknown> = {}) =>
      ({ profile_id: 'nzt48', game_type: game, score: 10, time_seconds: 60, timestamp: iso(N - ago), ...extra });
    const начисление = (game: string, ago: number, total: number, multiplier = 1) =>
      ({ ts: N - ago, day: сутки(N - ago), game, base: total / multiplier, multiplier, total, reason: 'round' });
    const { input } = await снять('rich', {
      now: N, profile: 'nzt48', language: 'ru',
      prep: (st) => положить(st, {
        psygames_sessions: [
          партия('schulte_table', 5 * д, { time_seconds: 40 }), партия('schulte_table', 3 * д, { time_seconds: 35 }),
          партия('schulte_table', 1 * д, { time_seconds: 30 }),
          партия('corsi', 20 * д), партия('corsi', 18 * д),
          партия('n_back', 40 * д), партия('sudoku', 2 * ч), партия('memory_matrix', 4 * д),
          { ...партия('memory_matrix', 2 * д), profile_id: 'women' },
        ],
        psygames_tokens_v1: { nzt48: 1234, women: 50 },
        psygames_streak_v1: { nzt48: { last: сутки(N - д), streak: 2 } },
        psygames_earn_v1: {
          nzt48: {
            entries: [
              начисление('sudoku', 2 * ч, 30, 2), начисление('sudoku', 1 * ч, 30, 2), начисление('schulte_table', 3 * ч, 10),
              начисление('corsi', 4 * ч, 12), начисление('hanoi', 5 * ч, 8), начисление('corsi', д + ч, 9),
            ],
            days: [...[0, 1, 2, 3, 4].map((k) => сутки(N - k * д)), ...[20, 21, 22, 23, 24, 25, 26, 27, 28].map((k) => сутки(N - k * д))],
          },
        },
        psygames_warmup_history: [1, 2, 3, 5].map((k) => ({
          date: дата(N - k * д), weekday: 'mon', duration_min: 5, track: 'core', total_score: 10, completed: true, steps_done: 3, steps_total: 3,
        })),
        psygames_achievements_unlocked: [{ id: 'first_game', date: '2026-10-01' }, { id: 'streak_3', date: '2026-10-04' }, { id: 'level_5', date: '2026-10-07' }],
        psygames_cosmetics_equipped_nzt48: { frame: 'frame_gold', title: 'title_owl', avatar: 'avatar_fox', background: 'bg_kids', badge: 'badge_kids' },
        psygames_pet_skin: 'robot',
        psygames_schulte_table_stars_nzt48: { 1: 3, 2: 2, 3: 0 },
        psygames_corsi_stars_nzt48: { 1: 1 },
        psygames_hanoi_stars_nzt48: { 1: 2 },
        psygames_earned_total_v1: { nzt48: 950 },
        psygames_resume_sudoku_nzt48: { v: 1, savedAt: N - 3 * ч, state: {} },
        psygames_resume_hanoi_nzt48: { v: 1, savedAt: N - 40 * д, state: {} },
        psygames_resume_corsi_women: { v: 1, savedAt: N - ч, state: {} },
        psygames_resume_retired_game_nzt48: { v: 1, savedAt: N - ч, state: {} },
        psygames_day_goal_nzt48: { text: 'Пройти три судоку', date: сутки(N), createdAt: iso(N - 5 * ч), outcome: null },
        psygames_streak_goal_nzt48: { days: 7, startedAt: '2026-10-1', askedAt: '2026-10-1', reachedAt: null },
        psygames_streak_goal_asked_nzt48: '2026-10-1',
        psygames_daily_challenge_streak_nzt48: { streak: 4, total: 10, last: сутки(N) },
        // Ровно неделя — край свежести (`СВЕЖЕСТЬ_ДНЕЙ`): ещё в силе.
        psygames_weak_skill_v1: { skillKey: 'skillLogic', delta: -0.3, date: дата(N - 7 * д) },
        psygames_assessment_history: [{ scores: [{ domain: 'wm_verbal', z_score: -0.2 }] }],
      }).then(() => undefined),
    });
    expect(input.today.rows.length).toBeGreaterThan(input.todayRowsMax);
    expect(input.resume).toBe('sudoku');
    expect(input.challenge.done).toBe(true);
    expect(input.goalSheet?.chosen).toBe(14);
  });

  it('evening: вечер, EN, свой файл состава', async () => {
    const N = ВЕЧЕР;
    const партия = (game: string, ago: number) =>
      ({ profile_id: 'students', game_type: game, score: 10, time_seconds: 60, timestamp: iso(N - ago) });
    const { input } = await снять('evening', {
      now: N, profile: 'students', language: 'en',
      prep: (st) => положить(st, {
        psygames_playlists_override: { профили: { students: { главная: ['сегодня', 'рекомендации', 'практики'] } } },
        psygames_sessions: [партия('schulte_table', 3 * д), партия('anagrams', 2 * д), партия('math_sprint', 26 * д), партия('math_sprint', 25 * д)],
        psygames_tokens_v1: { students: 80 },
        psygames_streak_v1: { students: { last: сутки(N), streak: 7 } },
        psygames_earn_v1: { students: { entries: [], days: [0, 1, 2, 3, 4, 5, 6].map((k) => сутки(N - k * д)) } },
        psygames_cosmetics_equipped_students: { title: 'title_focused' },
        // Единственная партия «продолжить» старше месяца — карточки нет.
        psygames_resume_hanoi_students: { v: 1, savedAt: N - 31 * д, state: {} },
        psygames_pet_skin: 'auto',
        psygames_day_goal_students: { text: 'Read for 20 minutes', date: сутки(N), createdAt: iso(N - 10 * ч), outcome: null },
        psygames_streak_goal_students: { days: 7, startedAt: '2026-9-30', askedAt: '2026-10-5', reachedAt: null },
        psygames_daily_challenge_streak_students: { streak: 1, total: 3, last: сутки(N - д) },
        psygames_weak_skill_v1: { skillKey: 'skillLogic', delta: -0.3, date: дата(N - 10 * д) },
        psygames_assessment_history: [{ scores: [{ domain: 'wm_spatial', z_score: -1.2 }, { domain: 'wm_verbal', z_score: 0.3 }] }],
      }).then(() => undefined),
    });
    expect(input.showBlock['цель_дня']).toBe(false);
    expect(input.goalCard.state).toBe('review');
    expect(input.recoParams).toEqual({ calm: '1' });
    expect(input.resume).toBeNull();
  });
});
