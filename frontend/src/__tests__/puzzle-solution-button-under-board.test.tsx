/* psygames-puzzle-solution-button-under-board · VER 3 · 17.09.2026 */
/**
 * «ПОКАЗАТЬ РЕШЕНИЕ» — НЕ ТОЛЬКО В ПАУЗЕ, А ЗНАЧКОМ ПОД ПОЛЕМ.
 *
 * 📍 Отзыв Дениса 67dbd7a8 (16.09.2026, iOS 2.54.12): «вынести не только в паузу, чтобы
 * была доступна: если не понимаешь, как играть, ткнёшь раз-два и уйдёшь без шансов».
 *
 * Проба монтирует настоящий экран головоломок в партии (зарядка стартует сама —
 * `autostart`) и смотрит, есть ли в ряду под полем кнопка с подписью
 * `puzzleShowSolution`. Условие то же, что у пункта паузы:
 *   · у режима с решателем кнопка есть;
 *   · у «Сапёра» до первого хода её нет — раскладка мин рождается от первого щелчка,
 *     решатель заведомо откажет;
 *   · у режима без решателя её нет вовсе.
 */
import React from 'react';
import PuzzlesScreen from '@/app/games/puzzles';

let mockMode = 'Magnets';
const mockEngines = [
  { индекс: 0, имя: 'Magnets', умеетТекстом: false, решаем: true, ступени: [{ индекс: 0, имя: '6x6', параметры: '6x6dtS' }] },
  { индекс: 1, имя: 'Mines', умеетТекстом: false, решаем: true, ступени: [{ индекс: 0, имя: '9x9', параметры: '9x9n10' }] },
  { индекс: 2, имя: 'Cube', умеетТекстом: false, решаем: false, ступени: [{ индекс: 0, имя: 'c4x4', параметры: 'c4x4' }] },
  { индекс: 3, имя: 'Net', умеетТекстом: false, решаем: true, ступени: [{ индекс: 0, имя: '5x5', параметры: '5x5' }] },
];

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => Promise.resolve(mockEngines),
  доскаСтрок: () => [],
}));
jest.mock('@/src/games/tatham-bridge/play', () => ({
  открыть: jest.fn(async () => ({ ширина: 100, высота: 100, палитра: ['rgb(255,255,255)'], примитивы: [], статус: 0, ход: null, подорвался: false, тупик: false })),
  указатель: jest.fn(), стрелка: jest.fn(), клавиша: jest.fn(), отменить: jest.fn(), решить: jest.fn(),
}));
jest.mock('@/src/hooks/useGamePreset', () => ({
  useGamePreset: () => ({ isPreset: false, isCalm: false, autostart: true }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', bg: '#fff', text: '#000', textSecondary: '#666', card: '#eee', border: '#ccc', primary: '#7c6cf0', surface: '#fff' }, isDark: false }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ mode: mockMode }),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/**
 * Каркас подменён: нужен ряд под полем, который экран кладёт в детей каркаса, и пропсы,
 * с которыми экран каркас зовёт (запас под кнопку отзыва — флаг экрана, VER 3).
 */
const mockShellProps: Record<string, unknown>[] = [];
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...p }: any) => { mockShellProps.push(p); return React.createElement(View, null, children); } };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Кнопка ряда подменена узлом с теми же пропсами: замок лестницы здесь не предмет пробы. */
jest.mock('@/src/components/GameAuxAction', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { GameAuxAction: (p: any) => React.createElement('GameAuxAction', p) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => д.unmount()); });
});

async function партияРежима(режим: string): Promise<any> {
  mockMode = режим;
  let дерево: any;
  await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
  // Опись движков, раздача и переход в партию — три обещания подряд.
  for (let i = 0; i < 4; i += 1) {
    await TestRenderer.act(async () => { await Promise.resolve(); });
  }
  деревья.push(дерево);
  return дерево;
}

const кнопкиРяда = (дерево: any): string[] =>
  дерево.root.findAll((n: any) => n.type === 'GameAuxAction').map((n: any) => String(n.props.label));

describe('«Показать решение» под полем головоломки', () => {
  it('🔴 режим с решателем — лампочка в ряду под полем рядом с «Отменить» и «Заново»', async () => {
    const д = await партияРежима('Magnets');
    expect(кнопкиРяда(д)).toEqual(['btn_undo', 'restart', 'puzzleShowSolution']);
  });

  it('🔴 «Сапёр» до первого хода — лампочки нет: решатель заведомо откажет', async () => {
    const д = await партияРежима('Mines');
    expect(кнопкиРяда(д)).toEqual(['btn_undo', 'restart']);
  });

  /**
   * 🔴 У РЕЖИМА С КРЕСТОВИНОЙ ЛАМПОЧКА — В ПУСТОЙ КЛЕТКЕ РЯДОМ С «↑».
   * Замер «Пространства» 16.09.2026: четвёртой кнопкой в ряду под полем она при длинной
   * подписи переключателя уходила второй строкой, и «Взять» — на 16 pt под нижний край.
   */
  it('🔴 режим с крестовиной — лампочка в клетке рядом с «↑», а в ряду под полем её нет', async () => {
    const д = await партияРежима('Net');
    const лампочки = д.root.findAll((n: any) => n.type === 'GameAuxAction' && n.props.label === 'puzzleShowSolution');
    const вКрестовине = (n: any): boolean => {
      for (let p = n.parent; p; p = p.parent) if (p.props?.testID === 'arrow-pad-with-solution') return true;
      return false;
    };
    expect(`лампочек: ${лампочки.length}, у крестовины: ${лампочки.filter(вКрестовине).length}`)
      .toBe('лампочек: 1, у крестовины: 1');
  });

  it('режим без решателя — лампочки нет', async () => {
    const д = await партияРежима('Cube');
    expect(кнопкиРяда(д)).toEqual(['btn_undo', 'restart']);
  });

  /**
   * 🔴 ЭКРАН ПРОСИТ У КАРКАСА ЗАПАС ПОД КНОПКУ ОТЗЫВА (задача 2fb25cbc).
   * Без него на 360×640 угловая клетка «Лишних чисел» 10×10 и 12×12 лежит под кнопкой
   * при любой прокрутке. Сам запас сторожит game-field-scrolls-above-feedback-button;
   * здесь — что экран головоломок его включает.
   */
  it('🔴 поле головоломки прокручивается с запасом под кнопку отзыва', async () => {
    mockShellProps.length = 0;
    await партияРежима('Magnets');
    const последний = mockShellProps[mockShellProps.length - 1] ?? {};
    expect(`прокрутка: ${последний.scrollableField === true}, запас: ${последний.reserveUnderFab === true}`)
      .toBe('прокрутка: true, запас: true');
  });
});
