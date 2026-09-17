/* psygames-warmup-result-stop-asks-first · VER 1 · 17.09.2026 */
/**
 * КАРТОЧКА ИТОГА В ЗАРЯДКЕ: «СТОП» ПЕРЕСПРАШИВАЕТ И ДЕРЖИТ АВТОПЕРЕХОД.
 *
 * 📍 Задача 1436bcdd, отчёт a0b6d77f (2.54.4, Android): «на второй игре зарядка вылетела,
 * скинулось всё». В хронологии отчёта игра → мост → главная в одну секунду. На карточке
 * итога «Стоп» стоит под «Дальше» и стирал серию одним касанием, а через 2 с после итога
 * зарядка сама уводит на мост. Мост переспрашивает с 2.54.14; здесь — сама карточка.
 *
 * Проверяется поведением на настоящем компоненте с подменённой зарядкой:
 *   · «Стоп» зарядку не останавливает, а показывает вопрос и придерживает автопереход;
 *   · «Остановить» в вопросе — останавливает и уводит домой, держание отпущено;
 *   · «Продолжить зарядку» — идёт дальше, зарядка не остановлена, держание отпущено;
 *   · ушли с экрана посреди вопроса — держание отпущено (иначе зарядка встала бы навсегда).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import GameResult from '@/src/components/GameResult';

declare function require(id: string): any;

const mockStop = jest.fn(async () => {});
const mockAdvance = jest.fn();
const mockHolds = { взято: 0, отпущено: 0 };
const mockHold = jest.fn(() => { mockHolds.взято += 1; return () => { mockHolds.отпущено += 1; }; });

jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    active: true,
    meta: { steps: [{ game_id: 'find_differences' }, { game_id: 'goods_sort' }, { game_id: 'mahjong' }], slot: 'morning', track: 'daily', duration_min: 5 },
    currentIdx: 1,
    stopWarmup: mockStop,
    advanceToNext: mockAdvance,
    holdAutoAdvance: mockHold,
  }),
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0', card: '#eee' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/services/feedback', () => ({ sndWin: () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
jest.mock('@/src/services/earn', () => ({ freshEarn: () => null, onEarn: () => () => {}, earnReasonKey: () => '' }));
jest.mock('@/src/services/share', () => ({ shareResult: async () => 'copied' }));
jest.mock('@/src/components/GradientSurface', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...p }: any) => R.createElement(View, p, children) };
});
jest.mock('@/src/components/juice/Act', () => {
  const R = require('react');
  return { __esModule: true, default: ({ children }: any) => R.createElement(R.Fragment, null, children) };
});

beforeEach(() => {
  mockStop.mockClear(); mockAdvance.mockClear(); mockHold.mockClear();
  mockHolds.взято = 0; mockHolds.отпущено = 0;
});

const onGoHome = jest.fn();
function карточка(): TestRenderer.ReactTestRenderer {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameResult time={19} score={120} errors={0} gradient={['#7c6cf0', '#4f46e5']} onPlayAgain={() => {}} onGoHome={onGoHome} />,
    );
  });
  return tr;
}
const нажать = (tr: TestRenderer.ReactTestRenderer, id: string) => {
  const узел = tr.root.findAll((n: any) => n.props?.testID === id && typeof n.props.onPress === 'function')[0];
  if (!узел) throw new Error(`нет кнопки ${id}`);
  act(() => { узел.props.onPress(); });
};
const есть = (tr: TestRenderer.ReactTestRenderer, id: string) => (tr.root.findAll((n: any) => n.props?.testID === id).length > 0 ? 'да' : 'нет');

describe('карточка итога в зарядке: «Стоп» переспрашивает', () => {
  it('🔴 «Стоп» не останавливает зарядку, а спрашивает и держит автопереход', () => {
    const tr = карточка();
    нажать(tr, 'result-warmup-stop');
    expect(`вопрос: ${есть(tr, 'result-warmup-stop-ask')}, стоп: ${mockStop.mock.calls.length}, держим: ${mockHolds.взято - mockHolds.отпущено}`)
      .toBe('вопрос: да, стоп: 0, держим: 1');
    act(() => { tr.unmount(); });
  });

  it('🔴 «Остановить» в вопросе — стоп и домой, держание отпущено', () => {
    onGoHome.mockClear();
    const tr = карточка();
    нажать(tr, 'result-warmup-stop');
    нажать(tr, 'result-warmup-stop-confirm');
    expect(`стоп: ${JSON.stringify(mockStop.mock.calls)}, домой: ${onGoHome.mock.calls.length}, держим: ${mockHolds.взято - mockHolds.отпущено}`)
      .toBe('стоп: [[false]], домой: 1, держим: 0');
    act(() => { tr.unmount(); });
  });

  it('🔴 «Продолжить зарядку» — дальше, без остановки, держание отпущено', () => {
    const tr = карточка();
    нажать(tr, 'result-warmup-stop');
    нажать(tr, 'result-warmup-stop-keep');
    expect(`дальше: ${mockAdvance.mock.calls.length}, стоп: ${mockStop.mock.calls.length}, вопрос: ${есть(tr, 'result-warmup-stop-ask')}, держим: ${mockHolds.взято - mockHolds.отпущено}`)
      .toBe('дальше: 1, стоп: 0, вопрос: нет, держим: 0');
    act(() => { tr.unmount(); });
  });

  it('🔴 ушли с экрана посреди вопроса — держание отпущено', () => {
    const tr = карточка();
    нажать(tr, 'result-warmup-stop');
    act(() => { tr.unmount(); });
    expect(`держим после ухода: ${mockHolds.взято - mockHolds.отпущено}`).toBe('держим после ухода: 0');
  });
});
