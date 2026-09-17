/* psygames-dots-service-row-screen · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · решение Дениса 17.09.2026 */
/**
 * 🔴 «СОЕДИНИ ТОЧКИ»: ПОДСКАЗКИ — ЗНАЧКАМИ ПОД ДОСКОЙ В ОДНОМ РЯДУ С «ОТМЕНИТЬ» И «НАЧАТЬ ЗАНОВО».
 *
 * Денис 17.09.2026 по кадру 375×667: «„Открыть одну пару“ и „Показать решение“ ты нахуя раздул в два ряда?
 * Их место снизу иконками под окном упражнения, рядом с „Отменить“ и „Начать заново“. Это надо везде такое
 * правило делать». До этого обе подсказки стояли в шапке каркаса двумя подписанными рядами (~130 px).
 *
 * Экранная половина договора (модульная — dots-service-row-under-board):
 *  · модуль — при `renderServiceRow` рисует ряд экрана ПОД ДОСКОЙ вместо своих текстовых кнопок и отдаёт
 *    живые действия (настоящий модуль, настоящая партия);
 *  · экран — отдаёт четыре служебных значка `GameAuxAction` (compact) и ничего не кладёт в шапку каркаса
 *    (модуль подменён узлом с пропами, ряд разбирается как дерево элементов).
 */
import React from 'react';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', bg: '#000', text: '#fff', textSecondary: '#999', card: '#222', border: '#333', primary: '#7c6cf0', surface: '#111', success: '#0c0', error: '#c00', warning: '#fa0' }, isDark: true }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'service-row' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, PAD_H: 16, БЕЗ_ЖЕСТА_ПРОКРУТКИ: {}, default: (p: any) => React.createElement('GameShell', p, p.children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/LevelCleared', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/GameResult', () => ({ __esModule: true, default: () => null }));

jest.mock('@/src/games/dots-connect/DotsConnectGame', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, default: (p: any) => React.createElement('DotsConnectGame', p) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDotsStrings } = require('@/src/games/dots-connect/core');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GameAuxAction } = require('@/src/components/GameAuxAction');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DotsScreen = require('@/app/games/dots-connect').default;

const стр = getDotsStrings('ru');

describe('экран: четыре служебных значка под доской, шапка каркаса пуста', () => {
  async function экранВПартии(): Promise<any> {
    let д: any;
    await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(DotsScreen)); });
    for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
    const старт = д.root.findAll((n: any) => typeof n.props?.onPress === 'function' && n.findAll((m: any) => m.props?.children === 'start').length > 0)[0];
    await TestRenderer.act(async () => { старт.props.onPress(); });
    for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
    return д;
  }
  /** Все элементы-потомки (без отрисовки): ряд разбирается как дерево React-элементов. */
  const элементы = (el: any): any[] => {
    if (!el || typeof el !== 'object') return [];
    const дети = React.Children.toArray(el.props?.children ?? []);
    return [el, ...дети.flatMap(элементы)];
  };
  const ряд = (канал: Partial<Record<string, unknown>>) => ({
    undo: () => {}, canUndo: true, restart: () => {}, hintPair: () => {}, toggleSolution: () => {}, solutionVisible: false, canReveal: true, ...канал,
  });

  it('🔴 в шапке каркаса служебного нет; модулю отдан рисовальщик ряда из четырёх compact-значков по порядку', async () => {
    const д = await экранВПартии();
    const каркас = д.root.findAll((n: any) => n.type === 'GameShell')[0];
    expect(каркас.props.headerActions).toBeUndefined();
    const модуль = д.root.findAll((n: any) => n.type === 'DotsConnectGame')[0];
    expect(typeof модуль.props.renderServiceRow).toBe('function');
    const значки = элементы(модуль.props.renderServiceRow(ряд({}))).filter((e) => e.type === GameAuxAction);
    expect(значки.map((e) => `${e.props.icon}:${e.props.compact}`)).toEqual(['arrow-undo:true', 'refresh:true', 'bulb-outline:true', 'eye:true']);
    expect(значки.map((e) => e.props.label)).toEqual([стр.undo, стр.restart, стр.hintPair, стр.showSolution]);
  });

  it('значки гаснут по положению партии: нечего отменять / некого открыть / показ запрещён; «скрыть» при видимом решении', async () => {
    const д = await экранВПартии();
    const модуль = д.root.findAll((n: any) => n.type === 'DotsConnectGame')[0];
    const погасшие = (канал: Partial<Record<string, unknown>>) => элементы(модуль.props.renderServiceRow(ряд(канал)))
      .filter((e) => e.type === GameAuxAction).map((e) => Boolean(e.props.disabled));
    expect(погасшие({})).toEqual([false, false, false, false]);
    expect(погасшие({ canUndo: false })).toEqual([true, false, false, false]);
    expect(погасшие({ hintPair: null })).toEqual([false, false, true, false]);
    expect(погасшие({ canReveal: false })).toEqual([false, false, true, true]);
    const видно = элементы(модуль.props.renderServiceRow(ряд({ solutionVisible: true }))).filter((e) => e.type === GameAuxAction)[3];
    expect(`${видно.props.icon} · ${видно.props.label}`).toBe(`eye-off · ${стр.hideSolution}`);
  });
});
