/* psygames-puzzle-error-hint · VER 1 · 17.09.2026 */
/**
 * 🔴 «КРАСНЫМ ОТМЕЧЕНО, ГДЕ НАРУШЕНО ПРАВИЛО»: ПОДСКАЗКА ПОЯВЛЯЕТСЯ РОВНО ТОГДА, КОГДА ДВИЖОК КРАСИТ ОШИБКУ.
 *
 * 📍 Отзывы Дениса 16.09.2026 (28a9d55c, 0b70eff2, d6dd7d66; задача 9022b6ff): «решил — упражнение не
 * заканчивается, решение не признано; как это объяснить игроку». 26 движков сами красят нарушение в
 * момент хода — не хватало слов. Проба меряет:
 *   · номера цветов `ЦВЕТ_ОШИБКИ` против палитр САМОГО моста (снимок `scripts/capture-error-colours.mjs`);
 *   · функцию на настоящих рисунках до и после заведомо неверного хода (Singles, Towers, Palisade);
 *   · смонтированный экран: подсказка при красном, пустой слот без него, пусто после победы, у режима
 *     без своей подсветки слота нет вовсе.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PuzzlesScreen from '@/app/games/puzzles';
import { разобрать } from '@/src/games/tatham-bridge/play';
import { ЦВЕТ_ОШИБКИ, естьОшибкаНаРисунке } from '@/src/games/tatham-bridge/errorColours';
import снимок from './tatham-error-colours.generated.json';
import таблицы from './tatham-tables.generated.json';

let mockMode = 'Singles';
let mockПримитивы: any[] = [];
let mockСтатус = 0;

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => Promise.resolve(['Singles', 'Guess'].map((имя, индекс) => ({ индекс, имя, умеетТекстом: false, решаем: true, ступени: [{ индекс: 0, имя: 'Easy', параметры: '5x5de' }] }))),
  доскаСтрок: () => [],
}));
jest.mock('@/src/games/tatham-bridge/play', () => {
  const настоящий = jest.requireActual('@/src/games/tatham-bridge/play');
  const партия = () => ({ ширина: 100, высота: 100, палитра: ['rgb(255,255,255)'], примитивы: mockПримитивы, статус: mockСтатус, ход: null, подорвался: false, тупик: false });
  return {
    разобрать: настоящий.разобрать,
    открыть: jest.fn(async () => партия()),
    клавиша: jest.fn(), указатель: jest.fn(), стрелка: jest.fn(), отменить: jest.fn(), решить: jest.fn(),
  };
});
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
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, overlay }: any) => React.createElement(View, null, children, overlay) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/LevelCleared', () => ({ __esModule: true, default: () => null }));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => д.unmount()); });
  await AsyncStorage.clear();
});

async function экран(режим: string, примитивы: any[], статус = 0): Promise<string | null> {
  mockMode = режим; mockПримитивы = примитивы; mockСтатус = статус;
  let дерево: any;
  await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
  деревья.push(дерево);
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
  const слот = дерево.root.findAll((n: any) => n.props?.testID === 'puzzle-error-hint' && typeof n.type === 'string');
  return слот.length ? String([].concat(слот[0].props.children).join('')) : null;
}

const красный = (rgb: string) => { const [r, g, b] = rgb.split(',').map(Number); return r! >= 120 && r! - Math.max(g!, b!) >= 35; };

describe('подсказка «красным отмечено, где нарушено правило»', () => {
  it('🔴 номера цвета ошибки — красные в палитре САМОГО движка, у всех 26 режимов таблицы', () => {
    const режимы: string[] = (таблицы as any).режимы;
    const палитры = (снимок as any).палитры as Record<string, string>;
    expect(Object.keys(ЦВЕТ_ОШИБКИ)).toHaveLength(26);
    const плохие = Object.entries(ЦВЕТ_ОШИБКИ).flatMap(([режим, номера]) => {
      if (!режимы.includes(режим)) return [`${режим}: нет среди 42 режимов`];
      const цвета = палитры[режим]!.split(/\s+/);
      return номера.filter((н) => !цвета[н] || !красный(цвета[н]!)).map((н) => `${режим}[${н}] = ${цвета[н]}`);
    });
    expect(плохие).toEqual([]);
    // Отказы из шапки: у Flip «WRONG» серый — не ошибка; 15 движков без своей подсветки — не в таблице.
    expect(палитры.Flip!.split(/\s+/)[1]).toBe('85,85,85');
    for (const режим of ['Flip', 'Galaxies', 'Guess', 'Pegs', 'Flood', 'Same Game', 'Inertia', 'Slide', 'Sokoban', 'Netslide', 'Twiddle', 'Cube', 'Sixteen', 'Fifteen', 'Untangle', 'Rectangles']) {
      expect(ЦВЕТ_ОШИБКИ[режим]).toBeUndefined();
    }
  });

  it.each(['Singles', 'Towers', 'Palisade'])('🔴 %s: на настоящем рисунке ошибки нет до неверного хода и есть сразу после', (режим) => {
    const н = (снимок as any).нарушения[режим];
    const есть = (рисунок: string[]) => естьОшибкаНаРисунке(режим, разобрать(рисунок.join('\n')));
    expect({ до: есть(н.до), одинХод: есть(н.одна), после: есть(н.после), статус: н.статус }).toEqual({ до: false, одинХод: false, после: true, статус: 0 });
  });

  it('🔴 экран: красное на доске — подсказка; без красного — пустой слот той же строки', async () => {
    const сОшибкой = [{ вид: 'прямоугольник', x: 0, y: 0, ш: 10, в: 10, цвет: ЦВЕТ_ОШИБКИ.Singles![0] }];
    const безОшибки = [{ вид: 'прямоугольник', x: 0, y: 0, ш: 10, в: 10, цвет: 1 }];
    expect(await экран('Singles', сОшибкой)).toBe('puzzleErrorShown');
    expect(await экран('Singles', безОшибки)).toBe(' ');
  });

  it('после победы подсказки нет, а у режима без своей подсветки нет и слота', async () => {
    const сОшибкой = [{ вид: 'прямоугольник', x: 0, y: 0, ш: 10, в: 10, цвет: ЦВЕТ_ОШИБКИ.Singles![0] }];
    expect(await экран('Singles', сОшибкой, 1)).toBe(' ');
    expect(await экран('Guess', сОшибкой)).toBeNull();
  });

  it('🔴 подсказка есть на всех двенадцати языках, без английского фолбэка', () => {
    const { LANGUAGES, translateFor } = jest.requireActual('@/src/contexts/LanguageContext');
    const языки = (LANGUAGES as { code: string }[]).map((l) => l.code);
    expect(языки).toHaveLength(12);
    const пропуски = языки.flatMap((я) => {
      const текст = translateFor(я, 'puzzleErrorShown');
      if (текст === 'puzzleErrorShown') return [`${я}: нет ключа`];
      return я !== 'en' && текст === translateFor('en', 'puzzleErrorShown') ? [`${я}: английский фолбэк`] : [];
    });
    expect(пропуски).toEqual([]);
    expect(translateFor('ru', 'puzzleErrorShown')).toBe('Красным отмечено, где нарушено правило');
  });
});
