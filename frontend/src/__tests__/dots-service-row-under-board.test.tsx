/* psygames-dots-service-row-under-board · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · решение Дениса 17.09.2026 */
/**
 * 🔴 «СОЕДИНИ ТОЧКИ»: ПОДСКАЗКИ — ЗНАЧКАМИ ПОД ДОСКОЙ В ОДНОМ РЯДУ С «ОТМЕНИТЬ» И «НАЧАТЬ ЗАНОВО».
 *
 * Денис 17.09.2026 по кадру 375×667: «„Открыть одну пару“ и „Показать решение“ ты нахуя раздул в два ряда?
 * Их место снизу иконками под окном упражнения, рядом с „Отменить“ и „Начать заново“. Это надо везде такое
 * правило делать». До этого обе подсказки стояли в шапке каркаса двумя подписанными рядами (~130 px).
 *
 * Здесь — половина МОДУЛЯ: при `renderServiceRow` он рисует ряд экрана ПОД ДОСКОЙ вместо своих текстовых
 * кнопок и отдаёт живые действия (настоящий модуль, настоящая партия). Половина экрана (четыре значка
 * `GameAuxAction`, шапка каркаса пуста) — в dots-service-row-screen.test.tsx.
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDotsStrings } = require('@/src/games/dots-connect/core');

const ТЕМА = {
  background: '#fff', surface: '#eee', card: '#fff', text: '#000', textSecondary: '#666',
  primary: '#2563eb', border: '#ccc', success: '#0a0', error: '#a00', warning: '#fa0',
};
const стр = getDotsStrings('ru');

describe('модуль: при renderServiceRow ряд экрана — под доской вместо текстовых кнопок', () => {
  // Модуль — настоящий: GameShell из него берёт только БЕЗ_ЖЕСТА_ПРОКРУТКИ (подменено выше пустым стилем).
  const DotsConnectGame = jest.requireActual('@/src/games/dots-connect/DotsConnectGame').default;
  const смонтировать = (props: Record<string, unknown>) => {
    let д: any;
    TestRenderer.act(() => {
      д = TestRenderer.create(React.createElement(DotsConnectGame as React.ComponentType<Record<string, unknown>>, {
        seed: 'service-row', level: 3, locale: 'ru', theme: ТЕМА, skipIntro: true,
        gameGradient: ['#2563eb', '#0f766e'], gameGradientText: '#fff', now: () => 1000, ...props,
      }));
    });
    return д;
  };
  const текстыКнопок = (д: any) => д.root.findAll((n: any) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function')
    .map((n: any) => String(n.props.accessibilityLabel ?? '')).filter(Boolean);

  it('🔴 ряд экрана нарисован после доски, текстовых «Отменить / Начать заново» нет; действия живые', () => {
    const вызовы: any[] = [];
    const д = смонтировать({ renderServiceRow: (ряд: any) => { вызовы.push(ряд); return React.createElement('СлужебныйРяд', ряд); } });
    const ряд = д.root.findAll((n: any) => n.type === 'СлужебныйРяд');
    expect(ряд.length).toBe(1);
    // порядок в дереве: доска раньше ряда
    const всё = д.root.findAll(() => true);
    const iДоски = всё.findIndex((n: any) => n.props?.accessibilityRole === 'adjustable');
    const iРяда = всё.findIndex((n: any) => n.type === 'СлужебныйРяд');
    expect(`доска ${iДоски >= 0}, ряд после доски ${iРяда > iДоски}`).toBe('доска true, ряд после доски true');
    expect(текстыКнопок(д)).not.toContain(стр.undo);
    const последний = вызовы[вызовы.length - 1];
    expect(`отмена ${последний.canUndo}, показ ${последний.canReveal}, виден ${последний.solutionVisible}, пара ${typeof последний.hintPair}`)
      .toBe('отмена false, показ true, виден false, пара function');
    TestRenderer.act(() => { последний.toggleSolution(); });
    expect(вызовы[вызовы.length - 1].solutionVisible).toBe(true);
  });

  it('контроль: без renderServiceRow модуль рисует свои текстовые «Отменить» и «Начать заново»', () => {
    const д = смонтировать({});
    const подписи = д.root.findAll((n: any) => typeof n.props?.children === 'string').map((n: any) => n.props.children);
    expect(подписи).toContain(стр.undo);
    expect(подписи).toContain(стр.restart);
  });
});
