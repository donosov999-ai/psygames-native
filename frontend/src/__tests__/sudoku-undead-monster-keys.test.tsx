/* psygames-sudoku-undead-monster-keys · VER 1 · 17.09.2026 */
/**
 * 🔴 КЛАВИШИ «НЕЖИТИ» ГОВОРЯТ, КАКОЕ ЧУДОВИЩЕ СТАВЯТ, И ШЛЮТ ДВИЖКУ ЕГО ЦИФРУ.
 *
 * 📍 ПОВОД. Проход семи сеток раздела касаниями в WebKit, окно 390×844, 17.09.2026. На доске
 * «Нежити» счётчики нарисованы значками призрака, вампира и зомби, а под доской стояли
 * голые «1 2 3». Какая цифра какое чудовище, не говорили ни клавиши, ни описание («потом
 * цифру снизу»). Человеку оставалось угадывать или ставить наугад и смотреть.
 *
 * ИСТИНА — ДВИЖОК, А НЕ ГЛАЗ: `undead.c:1931` '1' → призрак, `:1938` '2' → вампир,
 * `:1945` '3' → зомби. Проба сверяет обе половины: что видно на клавише и что уходит движку.
 * Живьём тот же порядок проверен проходом уровня, где клавиша выбиралась по ИМЕНИ чудовища.
 *
 * ⚠️ Проба смотрит на то, что экран рисует и что шлёт, а не на исходник раздела.
 */
import React from 'react';
import PuzzlesScreen from '@/app/games/puzzles';
import { клавиша } from '@/src/games/tatham-bridge/play';

let mockMode = 'Undead';
const mockSteps = [{ индекс: 0, имя: 'Easy', параметры: '4x4de' }];

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => Promise.resolve(['Undead', 'Solo'].map((имя, индекс) => ({ индекс, имя, умеетТекстом: false, решаем: true, ступени: mockSteps }))),
  доскаСтрок: () => [],
}));
const mockПартия = () => ({ ширина: 100, высота: 100, палитра: ['rgb(255,255,255)'], примитивы: [], статус: 0, ход: null, подорвался: false, тупик: false });
jest.mock('@/src/games/tatham-bridge/play', () => ({
  открыть: jest.fn(async () => mockПартия()),
  клавиша: jest.fn(async () => ({ партия: mockПартия(), подействовало: true })),
  указатель: jest.fn(), стрелка: jest.fn(), отменить: jest.fn(), решить: jest.fn(),
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
  return { __esModule: true, default: ({ children }: any) => React.createElement(View, null, children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => д.unmount()); });
  (клавиша as jest.Mock).mockClear();
});

async function партия(режим: string): Promise<any> {
  mockMode = режим;
  let дерево: any;
  await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
  деревья.push(дерево);
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
  return дерево;
}

/** Текст внутри узла — всё, что человек видит на клавише. */
function текстУзла(узел: any): string {
  const куски: string[] = [];
  const обойти = (у: any) => {
    if (у == null || typeof у === 'boolean') return;
    if (typeof у === 'string' || typeof у === 'number') { куски.push(String(у)); return; }
    if (Array.isArray(у)) { у.forEach(обойти); return; }
    обойти(у.props?.children);
  };
  обойти(узел.props.children);
  return куски.join('');
}

/**
 * Клавиши цифрового ряда — нажимаемые узлы с `onPress`, у которых кроме подписи нет своего
 * состояния. Ряд узнаётся по соседству с «Стереть»: берём все кнопки с `accessibilityLabel`,
 * кроме служебных, в порядке дерева.
 */
/** Рисунок на клавише: `monster-glyph-N` у SVG-фигуры чудовища, иначе пусто. */
function рисунокУзла(узел: any): string {
  const svg = узел.findAll((n: any) => typeof n.props?.testID === 'string'
    && /^monster-glyph-\d$/.test(n.props.testID));
  return svg.length ? svg[0].props.testID : '';
}

function рядКлавиш(дерево: any): { имя: string; видно: string; рисунок: string; нажать: () => void }[] {
  const служебные = /^(btn_|puzzle(Second|ShowSolution|Erase|Highlight)|restart|start|pause|a11y)/;
  const узлы = дерево.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityRole === 'button'
    && typeof n.type !== 'string');
  const видели = new Set<string>();
  return узлы
    .filter((n: any) => !служебные.test(n.props.accessibilityLabel))
    .filter((n: any) => { const k = n.props.accessibilityLabel; if (видели.has(k)) return false; видели.add(k); return true; })
    .map((n: any) => ({
      имя: n.props.accessibilityLabel,
      видно: текстУзла(n),
      рисунок: рисунокУзла(n),
      нажать: n.props.onPress,
    }));
}

describe('клавиши «Нежити» — чудовища, а не голые цифры', () => {
  /**
   * 🔴 23.09.2026 КЛАВИША РИСУЕТ ЧУДОВИЩЕ ДВИЖКА, А НЕ ЭМОДЗИ.
   * Отзыв Дениса `91967288` («Дизайн, нормально сделай иконки»): на доске счётчики нарисованы
   * фигурами движка, а на клавишах стояли 👻 🧛 🧟 — другой рисунок и другой стиль. Теперь клавиша
   * рисует ту же фигуру (`MonsterGlyph`, перенос `undead.c:2473`), а имя для чтеца остаётся прежним.
   */
  it('🔴 в ряду три клавиши: на каждой нарисовано своё чудовище, чтецу — его имя', async () => {
    const д = await партия('Undead');
    const ряд = рядКлавиш(д).filter((к) => /^puzzleUndead/.test(к.имя));
    expect(ряд.map((к) => `${к.рисунок} ${к.имя}`)).toEqual([
      'monster-glyph-1 puzzleUndeadGhost', 'monster-glyph-2 puzzleUndeadVampire', 'monster-glyph-3 puzzleUndeadZombie',
    ]);
    // Ни голых цифр, ни эмодзи на клавишах чудовищ не осталось.
    expect(ряд.map((к) => к.видно)).toEqual(['', '', '']);
    expect(рядКлавиш(д).filter((к) => /^[1-3]$/.test(к.видно)).map((к) => к.имя)).toEqual([]);
  });

  it('🔴 призрак шлёт движку «1», вампир «2», зомби «3» — порядок undead.c:1931–1945', async () => {
    const д = await партия('Undead');
    const коды: Record<string, number> = {};
    for (const к of рядКлавиш(д).filter((x) => /^puzzleUndead/.test(x.имя))) {
      (клавиша as jest.Mock).mockClear();
      await TestRenderer.act(async () => { к.нажать(); });
      коды[к.рисунок] = (клавиша as jest.Mock).mock.calls.at(-1)?.[0];
    }
    expect(коды).toEqual({ 'monster-glyph-1': 49, 'monster-glyph-2': 50, 'monster-glyph-3': 51 });
  });

  it('у Solo ряд остаётся цифрами 1–9 с цифрами же для чтеца — знаки только там, где заведены', async () => {
    const д = await партия('Solo');
    const цифры = рядКлавиш(д).filter((к) => /^[1-9]$/.test(к.имя));
    expect(цифры.map((к) => `${к.видно}=${к.имя}`)).toEqual(Array.from({ length: 9 }, (_, i) => `${i + 1}=${i + 1}`));
    expect(рядКлавиш(д).some((к) => /^puzzleUndead/.test(к.имя))).toBe(false);
  });
});
