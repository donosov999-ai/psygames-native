/* psygames-puzzle-where-error · VER 1 · 17.09.2026 */
/**
 * 🔴 «ГДЕ ОШИБКА?»: ЛИШНИЕ ЛИНИИ ОБВЕДЕНЫ, СТУПЕНЬ НЕ СДАНА, РАМКИ ГАСНУТ С ПЕРВЫМ ХОДОМ.
 *
 * 📍 Отзывы Дениса 16–17.09.2026 (28a9d55c, 0b70eff2, d6dd7d66, dd4cda8a; задача 9022b6ff): «решил, порезал —
 * не засчитано, а почему, не видно». У «Галактик» своей подсветки ошибок нет. Проба меряет:
 *   · снимок моста (`scripts/capture-where-error.mjs`, привязан к md5): цвет поставленной границы = `ЦВЕТ_ЛИНИИ`,
 *     решить → отменить возвращает рисунок и позицию;
 *   · `лишниеЛинии` на НАСТОЯЩИХ рисунках: неверная граница — одна рамка точно на шве, верная — ни одной;
 *   · смонтированный экран: кнопка только у режимов из реестра, рамки и строка после нажатия, ступень не сдана,
 *     ход гасит рамки, отказ решателя и невернувшаяся доска — молчание, а не ложная рамка.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PuzzlesScreen from '@/app/games/puzzles';
import { разобрать, указатель, сверитьСРешением, решить } from '@/src/games/tatham-bridge/play';
import { ЦВЕТ_ЛИНИИ, лишниеЛинии } from '@/src/games/tatham-bridge/whereError';
import снимок from './tatham-where-error.generated.json';

declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
/* eslint-enable @typescript-eslint/no-require-imports */

const галактики = (снимок as any).режимы.Galaxies;
const неверная = разобрать(галактики.неверная.доска);
const верная = разобрать(галактики.верная.доска);
const решение = разобрать(галактики.неверная.решение);

let mockMode = 'Galaxies';
let mockCanvas: any = null;
let mockДоска: any[] = [];
let mockРешение: any[] = [];
let mockСверка: 'да' | 'отказ' | 'не вернулась' = 'да';

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => Promise.resolve(['Galaxies', 'Singles', 'Palisade'].map((имя, индекс) => ({ индекс, имя, умеетТекстом: false, решаем: true, ступени: [{ индекс: 0, имя: 'Easy', параметры: имя === 'Galaxies' ? '7x7dn' : имя === 'Palisade' ? '5x5n5' : '5x5de' }] }))),
  доскаСтрок: () => [],
}));
const mockПартия = (примитивы: any[]) => ({ ширина: 300, высота: 300, палитра: ['rgb(255,255,255)'], примитивы, статус: 0, ход: null, подорвался: false, тупик: false });
jest.mock('@/src/games/tatham-bridge/play', () => ({
  разобрать: jest.requireActual('@/src/games/tatham-bridge/play').разобрать,
  ходЗаЖест: jest.requireActual('@/src/games/tatham-bridge/play').ходЗаЖест,
  открыть: jest.fn(async () => mockПартия(mockДоска)),
  сверитьСРешением: jest.fn(async () => (mockСверка === 'отказ' ? null
    : { партия: mockПартия(mockДоска), решение: mockПартия(mockРешение), вернулась: mockСверка === 'да' })),
  указатель: jest.fn(), клавиша: jest.fn(), стрелка: jest.fn(), отменить: jest.fn(), решить: jest.fn(), стеретьВвод: jest.fn(),
}));
jest.mock('@/src/components/PuzzleCanvas', () => ({ __esModule: true, default: (p: any) => { if (p.onЖест && p.onЖест.length) mockCanvas = p; return null; } }));
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
  jest.mocked(указатель).mockReset();
  jest.mocked(сверитьСРешением).mockClear();
  jest.mocked(решить).mockClear();
});

const дождаться = async () => { for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); }); };
async function экран(режим: string, доска: any[], реш: any[] = решение, сверка: typeof mockСверка = 'да') {
  mockMode = режим; mockCanvas = null; mockДоска = доска; mockРешение = реш; mockСверка = сверка;
  let дерево: any;
  await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
  деревья.push(дерево);
  await дождаться();
  return дерево;
}
const кнопка = (дерево: any) => дерево.root.findAll((n: any) => n.props?.accessibilityLabel === 'puzzleWhereError' && typeof n.props?.onPress === 'function')[0];
const слот = (дерево: any) => {
  const узлы = дерево.root.findAll((n: any) => n.props?.testID === 'puzzle-error-hint' && typeof n.type === 'string');
  return узлы.length ? String([].concat(узлы[0].props.children).join('')) : null;
};
const нажать = async (дерево: any) => { await TestRenderer.act(async () => { кнопка(дерево).props.onPress(); }); await дождаться(); };

describe('«Где ошибка?» — снимок моста', () => {
  it('🔴 снимок снят с ЭТОГО моста: пересобрали мост — пересними scripts/capture-where-error.mjs', () => {
    const md5 = createHash('md5').update(readFileSync(join(__dirname, '../games/tatham-bridge/tatham.js'))).digest('hex');
    expect((снимок as any).мост).toBe(md5);
  });

  it('🔴 цвет поставленной границы — ровно ЦВЕТ_ЛИНИИ, а решить → отменить возвращает доску и позицию', () => {
    expect(галактики.неверная.цветаНовых).toEqual([ЦВЕТ_ЛИНИИ.Galaxies]);
    expect(галактики.верная.цветаНовых).toEqual([ЦВЕТ_ЛИНИИ.Galaxies]);
    for (const проба of [галактики.верная, галактики.неверная]) {
      expect({ рисунок: проба.вернулосьРисунком, позиция: проба.вернулосьПозицией }).toEqual({ рисунок: true, позиция: true });
    }
  });
});

describe('«Где ошибка?» — лишниеЛинии на настоящих рисунках «Галактик»', () => {
  it('🔴 неверная граница — одна рамка, и она накрывает шов, куда ставили', () => {
    const рамки = лишниеЛинии('Galaxies', неверная, решение)!;
    expect(рамки).toHaveLength(1);
    const { x, y, клетка } = галактики.неверная.шов;
    const [р] = рамки;
    expect(р!.x <= x && x <= р!.x + р!.ш).toBe(true);
    expect(р!.y <= y && y + клетка <= р!.y + р!.в).toBe(true);
    // Рамка — вокруг шва, а не вокруг клетки: уже клетки поперёк шва.
    expect(Math.min(р!.ш, р!.в)).toBeLessThan(клетка);
  });

  it('🔴 верная граница и сама решённая доска — ни одной рамки (ложной тревоги нет)', () => {
    expect(лишниеЛинии('Galaxies', верная, разобрать(галактики.верная.решение))).toEqual([]);
    expect(лишниеЛинии('Galaxies', решение, решение)).toEqual([]);
  });

  it('режим не из реестра — null: сверять нечего, кнопки нет', () => {
    expect(лишниеЛинии('Singles', неверная, решение)).toBeNull();
  });
});

describe('«Где ошибка?» — экран', () => {
  it('🔴 «Галактики»: нажал — лишняя граница обведена красным, строка говорит сколько, ступень НЕ сдана', async () => {
    const дерево = await экран('Galaxies', неверная);
    expect(кнопка(дерево)).toBeTruthy();
    expect(слот(дерево)).toBe(' ');
    await нажать(дерево);
    expect(сверитьСРешением).toHaveBeenCalledTimes(1);
    expect(решить).not.toHaveBeenCalled();
    expect(mockCanvas.подсветка).toHaveLength(1);
    expect(mockCanvas.подсветка[0].цвет).toBe('#dc2626');
    expect(слот(дерево)).toBe('puzzleWrongLines');
    // Ступень не сдана: кнопка сверки на месте (после «Показать решение» её нет).
    expect(кнопка(дерево)).toBeTruthy();
  });

  it('🔴 первый же ход гасит рамки: они относятся к доске, на которой спрашивали', async () => {
    const дерево = await экран('Galaxies', неверная);
    await нажать(дерево);
    expect(mockCanvas.подсветка).toHaveLength(1);
    jest.mocked(указатель).mockResolvedValue({ партия: mockПартия(неверная) as any, подействовало: true, сдвинул: true });
    await TestRenderer.act(async () => { mockCanvas.onЖест(10, 10, 'нажал', false); });
    await дождаться();
    expect(mockCanvas.подсветка).toBeUndefined();
    expect(слот(дерево)).toBe(' ');
  });

  it('лишних нет — серая строка «дорисуйте», рамок нет', async () => {
    const дерево = await экран('Galaxies', верная, разобрать(галактики.верная.решение));
    await нажать(дерево);
    expect(mockCanvas.подсветка).toEqual([]);
    expect(слот(дерево)).toBe('puzzleNoWrongLines');
  });

  it('🔴 решатель отказал или доска не вернулась — молчание, а не ложная рамка', async () => {
    for (const сверка of ['отказ', 'не вернулась'] as const) {
      const дерево = await экран('Galaxies', неверная, решение, сверка);
      await нажать(дерево);
      expect(mockCanvas.подсветка).toBeUndefined();
      expect(слот(дерево)).toBe(' ');
    }
  });

  it('у режима не из реестра кнопки нет', async () => {
    const дерево = await экран('Singles', неверная);
    expect(кнопка(дерево)).toBeUndefined();
  });

  it('🔴 пять команд — одной строкой значков: у «Галактик» переключатель без подписи, у «Частокола» подпись на месте', async () => {
    const переключатель = (д: any) => д.root.findAll((n: any) => n.props?.testID === 'puzzle-second-action' && typeof n.props?.onPress === 'function')[0];
    const тексты = (узел: any) => узел.findAll((n: any) => n.type === 'Text').map((n: any) => [].concat(n.props.children).join('')).filter((т: string) => /[\p{L}\p{N}]/u.test(т));  // значок — Text с глифом шрифта, не слово
    const экранГалактик = await экран('Galaxies', неверная);
    expect(переключатель(экранГалактик).props.accessibilityLabel).toBe('puzzleSecondMark');
    expect(тексты(переключатель(экранГалактик))).toEqual([]);
    // После сверки и после «Показать решение» (кнопка сверки прячется) переключатель не разворачивается:
    // ряд не меняет высоту, доска не прыгает на последнем ходе.
    await нажать(экранГалактик);
    expect(тексты(переключатель(экранГалактик))).toEqual([]);
    jest.mocked(решить).mockResolvedValue(mockПартия(решение) as any);
    const лампочка = экранГалактик.root.findAll((n: any) => n.props?.accessibilityLabel === 'puzzleShowSolution' && typeof n.props?.onPress === 'function')[0];
    await TestRenderer.act(async () => { лампочка.props.onPress(); });
    await дождаться();
    expect(кнопка(экранГалактик)).toBeUndefined();
    expect(тексты(переключатель(экранГалактик))).toEqual([]);
    const частокол = await экран('Palisade', неверная);
    expect(кнопка(частокол)).toBeUndefined();
    expect(тексты(переключатель(частокол))).toEqual(['puzzleSecondMark']);
  });

  it('🔴 три строки есть на всех двенадцати языках, без английского фолбэка', () => {
    const { LANGUAGES, translateFor } = jest.requireActual('@/src/contexts/LanguageContext');
    const языки = (LANGUAGES as { code: string }[]).map((l) => l.code);
    expect(языки).toHaveLength(12);
    const пропуски = языки.flatMap((я) => ['puzzleWhereError', 'puzzleWrongLines', 'puzzleNoWrongLines'].flatMap((ключ) => {
      const текст = translateFor(я, ключ);
      if (текст === ключ) return [`${я}/${ключ}: нет ключа`];
      if (ключ === 'puzzleWrongLines' && !текст.includes('{n}')) return [`${я}/${ключ}: нет {n}`];
      return я !== 'en' && текст === translateFor('en', ключ) ? [`${я}/${ключ}: английский фолбэк`] : [];
    }));
    expect(пропуски).toEqual([]);
    expect(translateFor('ru', 'puzzleWhereError')).toBe('Где ошибка?');
  });
});
