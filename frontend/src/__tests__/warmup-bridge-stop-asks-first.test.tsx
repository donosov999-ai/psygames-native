/* psygames-warmup-bridge-stop-asks-first · VER 1 · 17.09.2026 */
/**
 * МОСТ ЗАРЯДКИ: «ОСТАНОВИТЬ» НЕ СТИРАЕТ СЕРИЮ ОДНИМ КАСАНИЕМ.
 *
 * 📍 Отчёт a0b6d77f (задача 1436bcdd), 2.54.4 Android: «на второй игре зарядка вылетела,
 * скинулось всё». В хронологии отчёта игра → мост → главная в одну секунду. Мост открывается
 * сам через 2 с после итога партии, и под пальцем, тянущимся к кнопке итога, оказываются
 * «Пропустить» и красная «Остановить». Остановка стирала всю серию без вопроса.
 *
 * Проба монтирует настоящий экран моста на подменённой зарядке и проверяет поведением:
 *   · первые 800 мс «Остановить» и «Пропустить» не срабатывают — касание, начатое на
 *     прошлом экране, не должно решать за человека;
 *   · после взвода «Остановить» переспрашивает со счётом сыгранного и саму зарядку не трогает;
 *   · пока висит вопрос, отсчёт не уводит на следующую игру;
 *   · «Остановить» в вопросе — останавливает и уводит домой.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import WarmupBridge from '@/app/warmup-bridge';

const mockReplace = jest.fn();
const mockStop = jest.fn(async () => {});
const mockSkip = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const R = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...p }: any) => R.createElement(View, p, children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('expo-linear-gradient', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const R = require('react');
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => R.createElement(View, p, children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const mockSteps = [
  { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy', est_duration_sec: 60 },
  { game_id: 'goods_sort', game_route: '/games/goods-sort', difficulty: 'easy', est_duration_sec: 60 },
  { game_id: 'mahjong', game_route: '/games/mahjong', difficulty: 'easy', est_duration_sec: 60 },
];
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    active: true,
    meta: { steps: mockSteps, slot: 'morning', track: 'daily', duration_min: 5 },
    currentIdx: 2,
    currentStep: mockSteps[2],
    results: [{ game_type: 'goods_sort', score: 120, time_seconds: 19, errors: 0 }],
    overtime: false,
    stepsLeft: 1,
    dismissOvertime: jest.fn(),
    skipCurrent: mockSkip,
    stopWarmup: mockStop,
  }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockReplace.mockClear(); mockStop.mockClear(); mockSkip.mockClear();
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const поID = (tr: TestRenderer.ReactTestRenderer, id: string) =>
  tr.root.findAll((n: any) => n.props?.testID === id && typeof n.props.onPress === 'function')[0];
/** «Пропустить: <игра>» — подпись собирается из имени следующей игры, ищем по началу. */
const пропуск = (tr: TestRenderer.ReactTestRenderer) =>
  tr.root.findAll((n: any) => /^(skipGameNamed|skipStep)/.test(String(n.props?.accessibilityLabel ?? ''))
    && typeof n.props.onPress === 'function')[0];

const естьВопрос = (tr: TestRenderer.ReactTestRenderer) =>
  (tr.root.findAll((n: any) => n.props?.testID === 'warmup-stop-ask').length > 0 ? 'да' : 'нет');

async function мост(): Promise<TestRenderer.ReactTestRenderer> {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupBridge />); });
  return tr;
}

describe('мост зарядки не стирает серию одним касанием', () => {
  it('🔴 первые 800 мс «Остановить» и «Пропустить» не срабатывают', async () => {
    const tr = await мост();
    await act(async () => { jest.advanceTimersByTime(300); });
    await act(async () => { поID(tr, 'warmup-stop').props.onPress(); });
    await act(async () => { пропуск(tr).props.onPress(); });
    expect(`вопрос: ${естьВопрос(tr)}, стоп: ${mockStop.mock.calls.length}, пропуск: ${mockSkip.mock.calls.length}`)
      .toBe('вопрос: нет, стоп: 0, пропуск: 0');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 после взвода «Остановить» переспрашивает, а зарядку не трогает', async () => {
    const tr = await мост();
    await act(async () => { jest.advanceTimersByTime(900); });
    await act(async () => { поID(tr, 'warmup-stop').props.onPress(); });
    expect(`вопрос: ${естьВопрос(tr)}, стоп: ${mockStop.mock.calls.length}`).toBe('вопрос: да, стоп: 0');
    // Пока висит вопрос, отсчёт не уводит на следующую игру.
    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => { tr.unmount(); });
  });

  it('«Остановить» в вопросе останавливает и уводит домой; «Продолжить зарядку» — на следующую игру', async () => {
    const tr = await мост();
    await act(async () => { jest.advanceTimersByTime(900); });
    await act(async () => { поID(tr, 'warmup-stop').props.onPress(); });
    await act(async () => { await поID(tr, 'warmup-stop-confirm').props.onPress(); });
    expect(mockStop).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenLastCalledWith('/');
    await act(async () => { tr.unmount(); });

    mockReplace.mockClear(); mockStop.mockClear();
    const tr2 = await мост();
    await act(async () => { jest.advanceTimersByTime(900); });
    await act(async () => { поID(tr2, 'warmup-stop').props.onPress(); });
    await act(async () => { поID(tr2, 'warmup-stop-keep').props.onPress(); });
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockReplace.mock.calls[0]?.[0]?.pathname).toBe('/games/mahjong');
    await act(async () => { tr2.unmount(); });
  });
});
