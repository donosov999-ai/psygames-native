/* psygames-progress-pages-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 КАЛЕНДАРЬ СЕРИИ И ИТОГ ОЦЕНКИ ПОД ОБОЛОЧКОЙ ОТДАЮТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЮТ САМИ
 * (задачи cd77367d, 455d71b1; приём — `services/hostScreens.ts`).
 *
 * Экраны монтируются целиком на настоящих провайдерах; оболочка подменена (`window.PsyBridge`,
 * `__psyHostScreens`).
 *   Календарь: дни зарядки — те же, что считает `completedWarmupDateKeys`; полоски серии по правилу
 *   экрана; `month(-1)` листает назад, вперёд дальше текущего месяца нельзя; `back` — `goBackOrHome`.
 *   Итог оценки: 12 доменов с цветом уровня, радар — `radarGeometry` (12 точек и подписей);
 *   итог сохранён и батарея остановлена ЗДЕСЬ, а не в нативе; `apply` пишет профиль и отмечает
 *   «сохранено», `home` — на Главную.
 * Образцы моделей — для проб Flutter (`flutter/test/fixtures/*_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

const mockRouter = { canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => {
  const params = {};
  const nav = { addListener: () => () => {}, setOptions: () => {} };
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => params,
    useGlobalSearchParams: () => params,
    usePathname: () => '/streak-calendar',
    // Фокус экрана — один раз при монтировании, как у настоящего роутера.
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    useNavigation: () => nav,
    Redirect: () => null,
    router: mockRouter,
  };
});
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
jest.mock('@/src/services/aiInsight', () => ({
  getAiInsight: async () => null, toneForProfile: () => 'neutral', isoWeekKey: () => '2026-W41',
}));
// История зарядок: в jest её чтение через динамический import хранилища не видит пробного
// AsyncStorage (замер 07.10: loadWarmupHistory → [] при заполненном ключе). Подставляем только
// чтение; дни серии, рекорд и раскладку считают настоящие функции warmup.ts.
let mockHistory: any[] = [];
jest.mock('@/src/services/warmup', () => ({ ...jest.requireActual('@/src/services/warmup'), loadWarmupHistory: async () => mockHistory }));
// Результаты батареи: два сильных домена, два слабых — остальные «нет данных» (средние).
const mockWarmup = {
  results: [
    { game_type: 'digit_span', score: 9, time_seconds: 60, errors: 0, details: { maxSpan: 9 }, difficulty: 'medium', mode: 'forward' },
    { game_type: 'corsi', score: 4, time_seconds: 60, errors: 2, details: { span: 4 }, difficulty: 'medium', mode: 'forward' },
    { game_type: 'n_back', score: 10, time_seconds: 70, errors: 5, details: { d_prime: 0.9 }, difficulty: 'medium', mode: '2-back' },
    { game_type: 'flanker', score: 14, time_seconds: 70, errors: 1, details: { flanker_effect_ms: 20 } },
  ],
  stopWarmup: jest.fn(async () => {}),
  startAssessment: jest.fn(),
};
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
  jest.clearAllMocks();
});

// История зарядок читается через динамический import хранилища — ждём и микрозадачи, и таймеры.
const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};
const ключ = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const зарядка = (date: string) => ({ date, completed: true, weekday: 1, duration_min: 5, track: 'training', total_score: 10, steps_done: 1, steps_total: 1 });

async function смонтировать(path: string, host: boolean) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', '#switcher', '/statistics', '/streak-calendar', '/assessment-result'];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = path === '/streak-calendar' ? require('../../app/streak-calendar').default : require('../../app/assessment-result').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === path)?.model;
  return { sent, last };
}

function образец(name: string, m: object) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const file = path.resolve(__dirname, `../../../flutter/test/fixtures/${name}`);
  // Даты в образцах — от дня прогона: для пробы Flutter важна форма, а не число.
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(m, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'nzt48');
  await AsyncStorage.setItem('language', 'ru');
});

describe('Календарь серии под оболочкой', () => {
  const now = new Date();
  // 1, 2, 3, 5 — серия и разрыв; плюс воскресенье и понедельник на стыке недель: полоска НЕ тянется
  // через край ряда (понедельник в первой колонке).
  const пн = [...Array(8)].map((_, i) => i + 2).find((d) => new Date(now.getFullYear(), now.getMonth(), d).getDay() === 1)!;
  const числа = [...new Set([1, 2, 3, 5, пн - 1, пн])].sort((a, b) => a - b);
  const дни = числа.map((d) => new Date(now.getFullYear(), now.getMonth(), d));

  beforeEach(async () => {
    mockHistory = дни.map((d) => зарядка(ключ(d)));
  });

  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать('/streak-calendar', false);
    expect(sent).toEqual([]);
  });

  it('🔴 дни зарядки, полоски серии и «сегодня» — по правилу экрана', async () => {
    const { last } = await смонтировать('/streak-calendar', true);
    const m = last();
    expect(m ? 'модель есть' : 'модели нет').toBe('модель есть');
    expect(m.metrics.map((x: any) => x.value)[2]).toBe(String(числа.length));
    const клетки = m.cells as any[];
    expect(клетки.filter((c) => c?.trained).map((c) => c.day)).toEqual(числа);
    expect(клетки.find((c) => c?.day === пн).left).toBe(false);
    клетки.forEach((c, i) => {
      if (!c) return;
      const слева = c.trained && i % 7 > 0 && клетки[i - 1]?.trained === true;
      const справа = c.trained && i % 7 < 6 && клетки[i + 1]?.trained === true;
      expect([c.day, c.left, c.right]).toEqual([c.day, слева, справа]);
    });
    expect(клетки.filter((c) => c?.today).map((c) => c.day)).toEqual([now.getDate()]);
    expect(m.month.canNext).toBe(false);
    expect(клетки.find((c) => c?.day === 1).a11y.length).toBeGreaterThan(5);
    образец('calendar_model.json', m);
    // Входы эталона — для сверки расчёта на Dart (вариант Б): «сегодня» календарной датой, без пояса.
    образец('calendar_input.json', { today: { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, history: mockHistory });
  });

  it('эталон правила серии для Dart: пропуски, «не спится», незавершённые, повторы', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeStreak, computeLongestStreak } = jest.requireActual('@/src/services/warmup');
    const назад = (n: number, extra: object = {}) => ({ ...зарядка(ключ(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))), ...extra });
    const случаи = [
      [назад(0), назад(1), назад(2)],
      [назад(1), назад(2), назад(4), назад(5)],
      [назад(1), назад(4), назад(5), назад(6)],
      [назад(0), назад(1, { track: 'rest' }), назад(2), назад(3, { completed: false }), назад(5)],
      [назад(9), назад(7), назад(6), назад(3), назад(3), назад(1)],
    ].map((history) => ({ history, streak: computeStreak(history), longest: computeLongestStreak(history) }));
    expect(случаи.some((c) => c.streak !== c.longest)).toBe(true);
    образец('streak_oracle.json', { today: { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, cases: случаи });
  });

  it('эталоны для Dart: прошлый месяц (RU) и этот месяц на EN', async () => {
    const { last } = await смонтировать('/streak-calendar', true);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/streak-calendar'].month(-1); });
    образец('calendar_model_prev.json', last());
    await AsyncStorage.setItem('language', 'en');
    const en = await смонтировать('/streak-calendar', true);
    expect(/[А-Яа-яЁё]/.test(JSON.stringify(en.last()))).toBe(false);
    образец('calendar_model_en.json', en.last());
  });

  it('🔴 month листает назад и обратно, вперёд текущего — нельзя; back — goBackOrHome', async () => {
    const { last } = await смонтировать('/streak-calendar', true);
    const этот = last().month.title;
    const ui = () => (globalThis as any).__psyScreenUi['/streak-calendar'];
    await TestRenderer.act(async () => { ui().month(1); });
    expect(last().month.title).toBe(этот);
    await TestRenderer.act(async () => { ui().month(-1); });
    expect(last().month.title === этот ? 'тот же месяц' : 'листнул').toBe('листнул');
    expect(last().month.canNext).toBe(true);
    expect(last().cells.filter((c: any) => c?.trained)).toEqual([]);
    await TestRenderer.act(async () => { ui().month(1); });
    expect(last().month.title).toBe(этот);
    await TestRenderer.act(async () => { ui().back(); });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('Итог оценки под оболочкой', () => {
  it('без оболочки модели нет; итог всё равно сохранён', async () => {
    const { sent } = await смонтировать('/assessment-result', false);
    expect(sent).toEqual([]);
    expect(mockWarmup.stopWarmup).toHaveBeenCalledWith(true);
  });

  it('🔴 12 доменов с цветом уровня, радар из radarGeometry; сохранение и остановка — на вебе', async () => {
    const { last } = await смонтировать('/assessment-result', true);
    const m = last();
    expect(m ? 'модель есть' : 'модели нет').toBe('модель есть');
    expect(m.loading).toBe(null);
    expect(m.domains.length).toBe(12);
    const цвет = Object.fromEntries(m.domains.map((d: any) => [d.id, d.color]));
    expect([цвет.wm_verbal, цвет.wm_spatial, цвет.wm_load, цвет.inhibition, цвет.reasoning])
      .toEqual(['#22c55e', '#f43f5e', '#f43f5e', '#22c55e', '#fbbf24']);
    expect([m.radar.poly.length, m.radar.points.length, m.radar.labels.length, m.radar.rings.length]).toEqual([12, 12, 12, 5]);
    // Точка радара — того же цвета, что строка домена.
    expect(m.radar.points.map((p: any) => p.color)).toEqual(m.domains.map((d: any) => d.color));
    expect(m.recs.length).toBeGreaterThan(0);
    expect(mockWarmup.stopWarmup).toHaveBeenCalledWith(true);
    expect(JSON.parse((await AsyncStorage.getItem('psygames_assessment_history'))!).length).toBe(1);
    expect(m.applied).toBe(false);
    образец('assessment_model.json', m);
  });

  it('🔴 apply пишет профиль и отмечает «сохранено»; home — на Главную', async () => {
    const { last } = await смонтировать('/assessment-result', true);
    const ui = () => (globalThis as any).__psyScreenUi['/assessment-result'];
    await TestRenderer.act(async () => { ui().apply(); });
    await осесть();
    expect(last().applied).toBe(true);
    const профиль = JSON.parse((await AsyncStorage.getItem('psygames_user_profile'))!);
    expect(профиль.weak_domains.sort()).toEqual(['wm_load', 'wm_spatial']);
    await TestRenderer.act(async () => { ui().home(); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
