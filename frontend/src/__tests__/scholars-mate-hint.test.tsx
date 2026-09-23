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
import ScholarsMateGame from '@/src/games/scholars-mate/ScholarsMateGame';
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
  /* `bool`/`str` — часть настоящего API хука: экран читает ими `?flow=1`,
     `?mix=1` и `?motif=`. Урезанный мок падал на первом же чтении. */
  useGamePreset: () => ({ isPreset: false, autostart: false, num: (_k: string, d: number) => d, isCalm: false, bool: (_k: string, d = false) => d, str: (_k: string, d = '') => d }),
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
/**
 * ⚠️ ПОДДЕЛКА КАРКАСА РИСУЕТ `headerActions`. Настоящий каркас ставит их рядом значков под
 * полем; подделка, которая их выбрасывает, сделала бы пробу слепой ровно к тому, что экран
 * туда кладёт, — и «подсказка есть» зеленело бы при любом коде.
 */
jest.mock('@/src/components/GameShell', () => {
  const R = require('react'); const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, headerActions }: any) => R.createElement(View, null, headerActions ?? null, children),
  };
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

/**
 * Подпись кнопки без хвостов. С 23.09.2026 подсказка живёт значком в ряду под полем
 * (GameAuxAction), и цена приписана к подписи: «Подсказка −1⭐». Требование пробы не
 * изменилось — изменился путь к кнопке, поэтому подпись режется до слова.
 */
const подпись = (n: any) => String(n.props?.accessibilityLabel ?? '').split(',')[0]!.split(' −')[0]!.trim();

function нажать(tree: any, метка: string) {
  const у = tree.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && подпись(n) === метка,
    { deep: true },
  )[0];
  if (!у) throw new Error(`нет кнопки «${метка}»`);
  TestRenderer.act(() => { у.props.onPress(); });
}

const естьКнопка = (tree: any, метка: string) => tree.root.findAll(
  (n: any) => typeof n.props?.onPress === 'function' && подпись(n) === метка
    && n.props?.disabled !== true,
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

/**
 * 🔴 ФЛАГ ПОДСКАЗКИ В ПОПЫТКЕ ОБЯЗАН БЫТЬ ПРАВДОЙ, А НЕ УКРАШЕНИЕМ.
 *
 * 📍 НАШЁЛ ЛИНТЕР, А НЕ ПРОБА, 12.09.2026. `ответить` мемоизирован и не
 * пересоздаётся при взятии подсказки — замыкание держало `подсказкаПоле` таким,
 * каким оно было при создании колбэка, и в попытку писался `false` даже там, где
 * подсказку брали. Потолок звёзд при этом работал (он считает по счётчику-ref), то
 * есть дефект был НЕВИДИМ снаружи и жил бы, пока кто-нибудь не начал читать поле.
 *
 * Здесь модуль монтируется НАПРЯМУЮ, без экрана: нужен `onComplete` с попытками,
 * а экран его наружу не отдаёт.
 */
describe('«Детский мат»: подсказка отмечена в той позиции, где её взяли', () => {
  it('🔴 hinted стоит там, где нажимали, и не стоит там, где нет', () => {
    let итог: any = null;
    let служебное: any = null;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateGame as any, {
        level: 1, seed: 2, size: 390,
        theme: { surface: '#fff', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#07c', success: '#0a0', danger: '#a00' },
        now: () => mockЧасы.t,
        onComplete: (r: any) => { итог = r; },
        labels: {
          mate: 'мат', defend: 'защита', threat: 'угроза', sacrifice: 'жертва',
          yes: 'да', no: 'нет', best: 'лучше', timeUp: 'время', sec: 'с',
          hint: 'подсказка', hintUsed: 'использована',
        },
        /**
         * ⚠️ ПОСЫЛКА ИЗМЕНИЛАСЬ 23.09.2026, И ЭТО НЕ ПОСЛАБЛЕНИЕ. Своей кнопки у модуля
         * больше нет: он отдаёт состояние наверх, а значок рисует экран в ряду каркаса
         * (решение Дениса 17.09). Проба ловит это состояние и нажимает то же действие —
         * требование прежнее: подсказка отмечается в той позиции, где её взяли.
         */
        onServiceState: (ряд: any) => { служебное = ряд; },
      }));
      mounted.push(tree);
    });

    // Первая позиция: доживаем до половины, берём подсказку, дальше молчим до таймаута.
    TestRenderer.act(() => { mockЧасы.t += 11_000; jest.advanceTimersByTime(11_000); });
    expect(`подсказка предложена на первой позиции: ${!!служебное?.hint.visible}`)
      .toBe('подсказка предложена на первой позиции: true');
    TestRenderer.act(() => { служебное.hint.onPress(); });

    // Досиживаем все восемь позиций до таймаута — отвечать не нужно, нужен итог.
    for (let i = 0; i < 9; i += 1) {
      TestRenderer.act(() => { mockЧасы.t += 21_000; jest.advanceTimersByTime(21_000); });
      TestRenderer.act(() => { mockЧасы.t += 2_000; jest.advanceTimersByTime(2_000); });
    }

    expect(`подход закончился: ${итог !== null}`).toBe('подход закончился: true');
    const сФлагом = (итог.attempts as any[]).filter((a) => a.hinted).length;
    expect(`попыток с отмеченной подсказкой: ${сФлагом} (нажимали на одной)`)
      .toBe('попыток с отмеченной подсказкой: 1 (нажимали на одной)');
    expect(`подсказок в итоге подхода: ${итог.hints}`).toBe('подсказок в итоге подхода: 1');
  });

  /**
   * Модуль напрямую, с рисовальщиком ряда — как его зовёт экран. Так проверяются правила
   * самой подсказки, а не путь до кнопки.
   */
  function модуль(доп: Record<string, unknown> = {}) {
    let итог: any = null;
    let служебное: any = null;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateGame as any, {
        level: 1, seed: 2, size: 390,
        theme: { surface: '#fff', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#07c', success: '#0a0', danger: '#a00' },
        now: () => mockЧасы.t,
        onComplete: (r: any) => { итог = r; },
        labels: {
          mate: 'мат', defend: 'защита', threat: 'угроза', sacrifice: 'жертва',
          yes: 'да', no: 'нет', best: 'лучше', timeUp: 'время', sec: 'с',
          hint: 'подсказка', hintUsed: 'использована',
        },
        onServiceState: (ряд: any) => { служебное = ряд; },
        ...доп,
      }));
      mounted.push(tree);
    });
    /** Действие подсказки так, как его видит экран: есть ли оно и что делает нажатие. */
    const действие = () => (служебное?.hint.visible ? служебное.hint : null);
    return { tree, действие, итог: () => итог };
  }

  it('🔴 на вопросе «грозит ли мат» подсказки нет и во второй половине времени', () => {
    /**
     * Правило Дениса, записанное в задаче 5f6a909d: подсказывать там нечего, ответ
     * двоичный. Мутацией 23.09.2026 выяснилось, что правило держалось только кодом: снимаешь
     * условие — ни одна проба не краснеет. Вопрос ставится напрямую (`onlyKind`), иначе
     * пришлось бы угадывать зерно, на котором угроза выпадет первой.
     */
    const угроза = модуль({ onlyKind: 'threat' });
    TestRenderer.act(() => { mockЧасы.t += 11_000; jest.advanceTimersByTime(11_000); });
    expect(`подсказка предложена на вопросе про угрозу: ${!!угроза.действие()}`)
      .toBe('подсказка предложена на вопросе про угрозу: false');

    // И это не потому, что подсказки нет вообще: на обычном вопросе она в этот же момент есть.
    const обычный = модуль({ onlyKind: 'mate', seed: 3 });
    TestRenderer.act(() => { mockЧасы.t += 11_000; jest.advanceTimersByTime(11_000); });
    expect(`подсказка предложена на вопросе про мат: ${!!обычный.действие()}`)
      .toBe('подсказка предложена на вопросе про мат: true');
  });

  it('🔴 подсказку в одной позиции нельзя взять дважды — цена уплачена один раз', () => {
    /**
     * Тоже находка мутации: защита «второй раз не берём» стояла в коде, а проба на неё
     * отсутствовала. Без неё двойное нажатие молча удваивало бы счёт подсказок подхода, то
     * есть цену звёзд.
     */
    const { действие, итог } = модуль();
    TestRenderer.act(() => { mockЧасы.t += 11_000; jest.advanceTimersByTime(11_000); });
    const взять = действие()!.onPress;
    TestRenderer.act(() => { взять(); });
    TestRenderer.act(() => { взять(); });

    for (let i = 0; i < 9; i += 1) {
      TestRenderer.act(() => { mockЧасы.t += 21_000; jest.advanceTimersByTime(21_000); });
      TestRenderer.act(() => { mockЧасы.t += 2_000; jest.advanceTimersByTime(2_000); });
    }
    expect(`подход закончился: ${итог() !== null}`).toBe('подход закончился: true');
    expect(`подсказок в итоге после двух нажатий: ${итог().hints}`)
      .toBe('подсказок в итоге после двух нажатий: 1');
  });
});
