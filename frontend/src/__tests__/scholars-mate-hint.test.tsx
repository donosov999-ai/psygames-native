/* psygames-scholars-mate-hint · VER 1 · 12.09.2026 */
/**
 * 🔴 ПОДСКАЗКА, КОГДА ЗАСТРЯЛ — И ОНА СТОИТ ЗВЕЗДЫ.
 *
 * Замер 12.09.2026: подсказок в разделе не было ни одной (грепом по обеим играм),
 * а у всех шести соседей по нише они есть (`chess-chat/COMPETITORS.md`). Человек, не
 * увидевший решения, досиживал до таймаута и получал промах — игра наказывала за
 * незнание, ничему не научив.
 *
 * Три вещи, которые здесь стерегутся, и каждая может сломаться отдельно:
 *   1. кнопки НЕТ до половины отпущенного времени — иначе это не подсказка застрявшему,
 *      а способ играть;
 *   2. нажатие ПОКАЗЫВАЕТ поле, с которого начинается решение, а не просто меняет флаг;
 *   3. взял подсказку — три звезды не твои.
 *
 * ⚠️ ВРЕМЯ ДО ПЕРВОГО КАСАНИЯ НЕ ТРОГАЕТСЯ. Нажатие «Подсказка» — не ход рукой, и
 * `msFirst` остаётся тем же, чем был. Иначе главная величина игры начала бы мерить у
 * разных людей разное.
 *
 * ⚠️ Новых ключей словаря НЕТ: `btn_hint` («Подсказка») и `hintUsed` уже переведены.
 */
import React from 'react';

import ScholarsMateScreen from '@/app/games/scholars-mate';
import { buildDeck } from '@/src/games/scholars-mate/core/deck';
import { starsFor, звёздыПодхода } from '@/src/games/scholars-mate/core/run';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

const mockУровень = { n: 1 };
jest.mock('@/src/hooks/usePersistentLevel', () => ({
  usePersistentLevel: () => ({
    level: mockУровень.n, best: mockУровень.n, loaded: true,
    reach: () => {}, fail: () => {}, pick: () => {},
  }),
}));
jest.mock('@/src/hooks/useGamePreset', () => ({
  useGamePreset: () => ({ isPreset: false, autostart: false, num: (_k: string, d: number) => d, isCalm: false }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/hooks/useGameMode', () => ({
  useGameMode: () => 'levels',
  shouldChainNextLevel: (m: string) => m === 'levels',
}));
jest.mock('@/src/hooks/useCalmHush', () => ({ useCalmHush: () => {} }));
jest.mock('@/src/hooks/useScreenWidth', () => ({ useScreenWidth: () => 390, useScreenSize: () => ({ w: 390, h: 844 }) }));
jest.mock('@/src/services/api', () => ({ saveSession: () => Promise.resolve() }));
/**
 * ⚠️ ИГРОВЫЕ ЧАСЫ ПОДВИЖНЫ, И БЕЗ ЭТОГО ПРОБА НЕ РАБОТАЕТ ВОВСЕ. Секундомер модуля
 * считает по `now()` из пропа, а он приходит из `gameNow`. С константой время
 * стоит: «осталось» навсегда равно окну уровня, и кнопка подсказки не появится
 * никогда — проба покраснеет на исправном коде.
 */
const mockЧасы = { t: 1_000_000 };
jest.mock('@/src/services/gamePause', () => ({
  gameNow: () => mockЧасы.t, holdGame: () => () => {}, isGameHeld: () => false, onGameHold: () => () => {},
}));
jest.mock('@/src/utils/nav', () => ({ goBackOrHome: () => {} }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/scholars-mate', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ active: false, stopWarmup: () => {}, next: () => {}, step: 0, total: 0 }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
  useProfileOptional: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => `${k}·т`, language: 'ru' }),
}));
jest.mock('@/src/components/GameShell', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/GradientSurface', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/GameSetupBar', () => {
  const R = require('react'); const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    SETUP_BAR_SPACE: 0,
    default: ({ onStart }: any) => R.createElement(
      Pressable, { accessibilityRole: 'button', accessibilityLabel: 'НАЧАТЬ', onPress: onStart },
      R.createElement(Text, null, 'НАЧАТЬ'),
    ),
  };
});
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));

let mounted: any[] = [];
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = []; mockУровень.n = 1; mockЧасы.t = 1_000_000;
  jest.useRealTimers();
});



beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = []; mockУровень.n = 1;
  jest.useRealTimers();
});

function нажать(tree: any, метка: string) {
  const у = tree.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function'
      && String(n.props.accessibilityLabel ?? '').split(',')[0] === метка,
    { deep: true },
  )[0];
  if (!у) throw new Error(`нет кнопки «${метка}»`);
  TestRenderer.act(() => { у.props.onPress(); });
}

const естьКнопка = (tree: any, метка: string) => tree.root.findAll(
  (n: any) => typeof n.props?.onPress === 'function'
    && String(n.props.accessibilityLabel ?? '').split(',')[0] === метка,
  { deep: true },
).length > 0;

/** Цвет клетки на доске — по нему видно, что подсказка ПОКАЗАНА, а не только записана. */
function цветКлетки(tree: any, имя: string): string {
  const у = tree.root.findAll(
    (n: any) => String(n.props?.accessibilityLabel ?? '').split(',')[0] === имя && n.props?.style,
    { deep: false },
  )[0];
  const s = у?.props?.style;
  return String((Array.isArray(s) ? Object.assign({}, ...s) : s)?.backgroundColor ?? '');
}

function начать() {
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
    mounted.push(tree);
  });
  нажать(tree, 'НАЧАТЬ');
  return tree;
}

describe('«Детский мат»: подсказка застрявшему стоит звезды', () => {
  it('🔴 до половины времени кнопки НЕТ, после половины — есть', () => {
    const tree = начать();
    expect(`сразу после старта кнопка подсказки: ${естьКнопка(tree, 'btn_hint·т')}`)
      .toBe('сразу после старта кнопка подсказки: false');

    // Уровень 1 даёт 20 секунд; половина — десятая.
    TestRenderer.act(() => { mockЧасы.t += 9_000; jest.advanceTimersByTime(9_000); });
    expect(`на девятой секунде: ${естьКнопка(tree, 'btn_hint·т')}`)
      .toBe('на девятой секунде: false');

    TestRenderer.act(() => { mockЧасы.t += 2_000; jest.advanceTimersByTime(2_000); });
    expect(`на одиннадцатой секунде: ${естьКнопка(tree, 'btn_hint·т')}`)
      .toBe('на одиннадцатой секунде: true');
  });

  it('🔴 нажатие ПОКАЗЫВАЕТ поле, с которого начинается решение', () => {
    const tree = начать();
    TestRenderer.act(() => { mockЧасы.t += 11_000; jest.advanceTimersByTime(11_000); });

    const откуда = buildDeck(1, 2)[0]!.solutions[0]!.slice(0, 2);
    const доНажатия = цветКлетки(tree, откуда);
    нажать(tree, 'btn_hint·т');
    const после = цветКлетки(tree, откуда);

    expect(`клетка «${откуда}» сменила цвет от подсказки: ${доНажатия !== после && после !== ''}`)
      .toBe(`клетка «${откуда}» сменила цвет от подсказки: true`);
    expect(`кнопка сменилась на «использована»: ${!естьКнопка(tree, 'btn_hint·т')}`)
      .toBe('кнопка сменилась на «использована»: true');
  });

  it('🔴 взял подсказку — три звезды не твои', () => {
    /**
     * Чистое правило ядра: та же медиана, тот же уровень, разница только в подсказке.
     * ⚠️ Проверяется на медиане, которая БЕЗ подсказки даёт три звезды, — иначе
     * утверждение прошло бы и на сломанном правиле.
     */
    const быстро = 800;
    expect(`без подсказки на медиане ${быстро} мс: ${starsFor(быстро, 1)} звезды`)
      .toBe(`без подсказки на медиане ${быстро} мс: 3 звезды`);
    expect(`с подсказкой: ${звёздыПодхода(быстро, 1, 1)} звезды`)
      .toBe('с подсказкой: 2 звезды');
    expect(`без подсказки правило не трогает шкалу: ${звёздыПодхода(быстро, 1, 0)} === ${starsFor(быстро, 1)}`)
      .toBe(`без подсказки правило не трогает шкалу: 3 === 3`);
    // И на медленной медиане потолок ничего не портит: было и так мало.
    expect(`медленно и с подсказкой: ${звёздыПодхода(9_000, 1, 2)}`)
      .toBe('медленно и с подсказкой: 1');
  });
});
