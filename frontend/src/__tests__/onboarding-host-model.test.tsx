/* psygames-onboarding-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 ЗНАКОМСТВО ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЕТ САМО (задача a8aa91e0;
 * приём — `services/hostScreens.ts`).
 *
 * Экран монтируется целиком на настоящих провайдерах; оболочка подменена.
 *   Подбор (первый запуск): три вопроса по три ответа; после трёх ответов — три игры «под себя»
 *   от `pickGames`; выбор игры отмечает знакомство и ведёт в игру с auto/easy; «Пропустить» —
 *   на Главную с той же отметкой.
 *   Обучение (?tutorial=1): слайды, счётчик, «Дальше» листает, «Пропустить» завершает.
 * Образец модели подбора — для пробы Flutter (`flutter/test/fixtures/onboarding_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

const mockRouter = { canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: jest.fn() };
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const nav = { addListener: () => () => {}, setOptions: () => {} };
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useGlobalSearchParams: () => mockParams,
    usePathname: () => '/onboarding',
    useFocusEffect: () => {},
    useNavigation: () => nav,
    Redirect: () => null,
    router: mockRouter,
  };
});
const mockWarmup = { startWarmup: jest.fn(), results: [] };
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmup: () => mockWarmup }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');   // eslint-disable-line @typescript-eslint/no-require-imports
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

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  jest.clearAllMocks();
});

const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};

async function смонтировать(host: boolean) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', '/onboarding'];
  }
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('language', 'ru');
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/onboarding').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === '/onboarding')?.model;
  const ui = () => (globalThis as any).__psyScreenUi['/onboarding'];
  return { sent, last, ui };
}

describe('Знакомство под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать(false);
    expect(sent.filter((m) => m.op === 'screenUi')).toEqual([]);
  });

  it('🔴 подбор: три вопроса, после трёх ответов — три игры от pickGames; образец для Flutter', async () => {
    const { last, ui } = await смонтировать(true);
    const m = last();
    expect(m.mode).toBe('picker');
    expect(m.quiz.questions.map((q: any) => q.opts.length)).toEqual([3, 3, 3]);
    expect(m.quiz.yours).toBe(null);
    expect(m.cards.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => { ui().quiz('mood', 1); ui().quiz('time', 0); ui().quiz('taste', 2); });
    await осесть();
    const after = last();
    expect(after.quiz.questions.map((q: any) => q.opts.findIndex((o: any) => o.on))).toEqual([1, 0, 2]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pickGames } = require('@/src/services/gamePicker');
    expect(after.quiz.yours.cards.map((c: any) => c.id)).toEqual(pickGames({ mood: 1, time: 0, taste: 2 }).games.map((g: any) => g.id));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/onboarding_model.json');
    // Картинка в jest — путь файла относительно папки проверки; приводим к адресу сборки без хеша.
    const now = `${JSON.stringify(after, null, 1)}\n`.replace(/"(?:\.\.\/)+(?:[^"]*?\/frontend\/)?(assets\/[^"]+)"/g, '"/assets/$1"');
    if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
    expect({ fresh: fs.existsSync(file) && fs.readFileSync(file, 'utf8') === now, regenerate: 'cd frontend && WRITE=1 npx jest src/__tests__/onboarding-host-model.test.tsx' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('🔴 выбор игры — отметка знакомства и переход в игру auto/easy', async () => {
    const { last, ui } = await смонтировать(true);
    const game = last().cards[0];
    await TestRenderer.act(async () => { ui().choose(game.id); });
    await осесть();
    expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({ params: { auto: '1', diff: 'easy' } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hasPickedOnboarding } = require('@/src/services/onboarding');
    expect(await hasPickedOnboarding('free')).toBe(true);
  });

  it('«Пропустить» — на Главную с той же отметкой знакомства', async () => {
    const { ui } = await смонтировать(true);
    await TestRenderer.act(async () => { ui().skipPicker(); });
    await осесть();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hasPickedOnboarding } = require('@/src/services/onboarding');
    expect(await hasPickedOnboarding('free')).toBe(true);
  });

  it('обучение (?tutorial=1): «Дальше» листает слайд, «Пропустить» — на Главную', async () => {
    mockParams.tutorial = '1';
    const { last, ui } = await смонтировать(true);
    const m = last();
    expect(m.mode).toBe('tutorial');
    expect(m.dots.active).toBe(0);
    const n = m.dots.count;
    expect(m.counter).toBe(`1 / ${n}`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/onboarding_tutorial_model.json');
    const now = `${JSON.stringify(m, null, 1)}\n`;
    if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
    expect(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === now ? 'образец свежий' : 'пересобрать: WRITE=1').toBe('образец свежий');
    await TestRenderer.act(async () => { ui().main(); });
    expect(last().counter).toBe(`2 / ${n}`);
    expect(last().slide.title === m.slide.title ? 'тот же слайд' : 'листнул').toBe('листнул');
    await TestRenderer.act(async () => { ui().skip(); });
    await осесть();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(await AsyncStorage.getItem('psygames_onboarded')).toBe('true');
  });
});
