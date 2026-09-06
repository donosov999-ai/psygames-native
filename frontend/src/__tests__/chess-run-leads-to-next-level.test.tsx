/**
 * ПРОЙДЕННЫЙ ПОДХОД ВЕДЁТ ДАЛЬШЕ — ПРОВЕРКА ИГРОЙ ДО КОНЦА.
 *
 * 🔴 ОТЧЁТ ДЕНИСА 05.09.2026 (`67eade4e`), дословно: «партию прошёл, завершилось
 * всё и всё висит, где следующий уровень». Помечен fixed в 2.43.0.
 *
 * ⚠️ ПОЧЕМУ ПРОБА ИМЕННО СКВОЗНАЯ. Дыра здесь — не в одном файле: подход
 * заканчивает МОДУЛЬ (`ScholarsMateGame` зовёт `onComplete`), а «дальше» рисует
 * ЭКРАН (`LevelCleared`). Между ними — порог 0,75, `levelOutcome` и признак
 * потока. Проверка любой из половин по отдельности зеленеет, а человек упирается
 * в стык. Поэтому здесь настоящий экран и настоящие восемь позиций, решённые
 * нажатиями по клеткам.
 */
import React from 'react';

import { buildDeck, levelParams } from '@/src/games/scholars-mate/core/deck';
import { starsFor, ступеньПоМедиане } from '@/src/games/scholars-mate/core/run';
/**
 * ⚠️ Импорт экрана стоит ЗДЕСЬ, вместе с остальными, хотя ниже идут `jest.mock`.
 * Babel поднимает вызовы `jest.mock` выше импортов сам, поэтому моки успевают
 * встать; а импорт в теле модуля даёт предупреждение `import/first`, и потолок
 * линта поднимать нельзя.
 */
import ScholarsMateScreen from '@/app/games/scholars-mate';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

/**
 * Уровень, поднятый игрой, — за ним и следим.
 * ⚠️ Имена с приставкой `mock`: jest пускает в фабрику мока только такие
 * внешние переменные, иначе набор не собирается вовсе.
 */
const mockПоднято: number[] = [];
const mockПровалов: number[] = [];

jest.mock('@/src/hooks/usePersistentLevel', () => ({
  usePersistentLevel: () => ({
    level: 1, best: 1, loaded: true,
    reach: (n: number) => { mockПоднято.push(n); },
    fail: () => { mockПровалов.push(1); },
    pick: () => {},
  }),
}));
/** Признак «шаг зарядки» — переключаемый: без него ветка isPreset не проверяется. */
const mockПресет = { on: false };
jest.mock('@/src/hooks/useGamePreset', () => ({
  useGamePreset: () => ({ isPreset: mockПресет.on, autostart: false, num: (_k: string, d: number) => d, isCalm: false }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/hooks/useGameMode', () => ({
  useGameMode: () => 'levels',
  shouldChainNextLevel: (m: string) => m === 'levels',
}));
jest.mock('@/src/hooks/useCalmHush', () => ({ useCalmHush: () => {} }));
jest.mock('@/src/hooks/useScreenWidth', () => ({ useScreenWidth: () => 390, useScreenSize: () => ({ w: 390, h: 844 }) }));
jest.mock('@/src/services/api', () => ({ saveSession: () => Promise.resolve() }));
/** Игровые часы под управлением пробы — иначе до конца десятиминутного потока не дойти. */
const mockЧасы = { t: 1_000_000 };
jest.mock('@/src/services/gamePause', () => ({
  gameNow: () => mockЧасы.t,
  holdGame: () => () => {},
  isGameHeld: () => false,
  onGameHold: () => () => {},
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
  useLanguage: () => ({ t: (k: string) => k, language: 'ru' }),
}));
/** Оболочки — только рамка вокруг партии, содержимое пропускаем как есть. */
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
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = [];
  mockПоднято.length = 0; mockПровалов.length = 0; mockПресет.on = false;
});
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

function текст(tree: any): string {
  const out: string[] = [];
  const идти = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n.children) идти(n.children);
  };
  идти(tree.toJSON());
  return out.join(' ').replace(/\s+/g, ' ');
}

function нажать(tree: any, метка: string) {
  const у = tree.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function'
      && String(n.props.accessibilityLabel ?? '').split(',')[0] === метка,
    { deep: true },
  )[0];
  if (!у) throw new Error(`нет кнопки «${метка}»`);
  TestRenderer.act(() => { у.props.onPress(); });
}

describe('«Детский мат»: конец подхода ведёт дальше', () => {
  it('🔴 подход пройден целиком → экран «уровень взят» и следующая ступень', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
      mounted.push(tree);
    });

    нажать(tree, 'НАЧАТЬ');
    // `start()` поднимает attempt 0→1, модуль получает seed = attempt + 1 = 2.
    const колода = buildDeck(1, 2);
    expect(`позиций в подходе: ${колода.length}`).toBe('позиций в подходе: 8');
    expect(`все одноходовые маты: ${колода.every((p) => p.kind === 'mate')}`).toBe('все одноходовые маты: true');

    for (const задача of колода) {
      const uci = задача.solutions[0]!;
      нажать(tree, uci.slice(0, 2));
      нажать(tree, uci.slice(2, 4));
      // Показ «✓» ~0,55 с, дальше следующая позиция.
      TestRenderer.act(() => { jest.advanceTimersByTime(700); });
    }

    const t = текст(tree);
    expect(`ступень поднята до: ${mockПоднято.join(',') || '—'}`).toBe('ступень поднята до: 2');
    expect(`провалов засчитано: ${mockПровалов.length}`).toBe('провалов засчитано: 0');
    // Экран «уровень взят» рисуется, и на нём есть чем продолжить.
    expect(`на экране есть «уровень взят»: ${/levelCleared|уровень|level/i.test(t)}`)
      .toBe('на экране есть «уровень взят»: true');
    const кнопок = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function', { deep: true }).length;
    expect(`кнопок на экране итога: ${кнопок > 0}`).toBe('кнопок на экране итога: true');
  });

  /**
   * 🔴 И ТОТ ЖЕ ВОПРОС ПРО ПОТОК — РЕЖИМ, В КОТОРОМ ДЕНИС И СИДИТ.
   *
   * Поток намеренно без ступеней: там нет порога, который можно взять. Но
   * «нет ступени» не значит «пустой экран»: подход обязан закончиться карточкой
   * итога с живыми кнопками, иначе жалоба «завершилось всё и висит» верна
   * буквально. Проверяем, что после конца десяти минут экран не пуст.
   */
  it('🔴 поток кончается карточкой итога, а не пустым экраном', () => {
    mockЧасы.t = 1_000_000;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
      mounted.push(tree);
    });

    нажать(tree, 'scholarsFlow');     // переключатель «поток»
    нажать(tree, 'НАЧАТЬ');

    const колода = buildDeck(1, 2);   // первый набор потока — тот же, что и обычный
    // Первую позицию решаем честно: подход без единого касания не засчитывается вовсе.
    const uci = колода[0]!.solutions[0]!;
    нажать(tree, uci.slice(0, 2));
    нажать(tree, uci.slice(2, 4));

    // Десять минут прошли — следующая же смена позиции обязана закрыть подход.
    mockЧасы.t += 10 * 60 * 1000 + 5000;
    TestRenderer.act(() => { jest.advanceTimersByTime(700); });

    const кнопки = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function', { deep: true });
    expect(`кнопок на экране после конца потока: ${кнопки.length > 0}`)
      .toBe('кнопок на экране после конца потока: true');
    // Ступень поток не двигает — это его устройство, а не дефект.
    expect(`поток поднял ступень: ${mockПоднято.join(',') || '—'}`).toBe('поток поднял ступень: —');
    // Доска убрана, значит подход действительно закончился, а не замер на позиции.
    const клеток = tree.root.findAll(
      (n: any) => /^[a-h][1-8](,|$)/.test(String(n.props?.accessibilityLabel ?? '')), { deep: true }).length;
    expect(`клеток доски осталось: ${клеток}`).toBe('клеток доски осталось: 0');
  });

  /**
   * 🔴 ПОТОК ДВИГАЕТ СТУПЕНЬ ПО МЕДИАНЕ. Решение Дениса 06.09.2026: до него поток
   * был единственным режимом без лестницы, и жалоба «где следующий уровень»
   * приходила именно после него.
   */
  it('🔴 быстрый поток поднимает ступень и показывает карточку', async () => {
    mockЧасы.t = 1_000_000;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
      mounted.push(tree);
    });
    нажать(tree, 'scholarsFlow');
    нажать(tree, 'НАЧАТЬ');

    const uci = buildDeck(1, 2)[0]!.solutions[0]!;
    // Узнал быстро: 300 мс до первого касания при пороге трёх звёзд 1400 мс на ур.1.
    mockЧасы.t += 300;
    нажать(tree, uci.slice(0, 2));
    нажать(tree, uci.slice(2, 4));

    mockЧасы.t += 10 * 60 * 1000 + 5000;
    TestRenderer.act(() => { jest.advanceTimersByTime(700); });

    expect(`ступень после быстрого потока: ${mockПоднято.join(',') || '—'}`)
      .toBe('ступень после быстрого потока: 2');
    expect(`провалов: ${mockПровалов.length}`).toBe('провалов: 0');
    const клеток = tree.root.findAll(
      (n: any) => /^[a-h][1-8](,|$)/.test(String(n.props?.accessibilityLabel ?? '')), { deep: true }).length;
    expect(`доска убрана: ${клеток === 0}`).toBe('доска убрана: true');
    /**
     * 🔴 И ПОКАЗАНА ИМЕННО КАРТОЧКА СТУПЕНИ, а не сухой итог: без этой строки
     * мутация «поднимаем, но карточки не показываем» проходит насквозь — ступень
     * выросла, а человек снова не увидел, что дальше. Ровно жалоба 67eade4e.
     */
    const t = текст(tree);
    expect(`карточка ступени показана: ${t.includes('levelDone') && t.includes('nextNow')}`)
      .toBe('карточка ступени показана: true');
    // И главная цифра игры на ней есть — медиана, ради которой ступень и двинулась.
    expect(`медиана показана: ${t.includes('scholarsMedian')}`).toBe('медиана показана: true');
  });

  /**
   * 🔴 ПОТОК В ЗАРЯДКЕ ЛЕСТНИЦУ НЕ ТРОГАЕТ. Шаг плейлиста — не личная партия: он
   * короткий и идёт в заданном окружении, двигать от него персональный уровень
   * нечестно в обе стороны. Правило общее (`levelOutcome`), и поток из него не
   * выпадает.
   */
  it('🔴 быстрый поток В ЗАРЯДКЕ ступень НЕ двигает', async () => {
    mockПресет.on = true;
    mockЧасы.t = 1_000_000;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
      mounted.push(tree);
    });
    нажать(tree, 'scholarsFlow');
    нажать(tree, 'НАЧАТЬ');
    const uci = buildDeck(1, 2)[0]!.solutions[0]!;
    mockЧасы.t += 300;
    нажать(tree, uci.slice(0, 2));
    нажать(tree, uci.slice(2, 4));
    mockЧасы.t += 10 * 60 * 1000 + 5000;
    TestRenderer.act(() => { jest.advanceTimersByTime(700); });
    expect(`подъёмов в зарядке: ${mockПоднято.join(',') || '—'}`).toBe('подъёмов в зарядке: —');
    expect(`понижений в зарядке: ${mockПровалов.length}`).toBe('понижений в зарядке: 0');
  });

  it('🔴 медленный поток ступень НЕ поднимает', async () => {
    mockЧасы.t = 1_000_000;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
      mounted.push(tree);
    });
    нажать(tree, 'scholarsFlow');
    нажать(tree, 'НАЧАТЬ');

    const uci = buildDeck(1, 2)[0]!.solutions[0]!;
    // Узнал медленно: 5 с при пороге двух звёзд 2400 мс — это одна звезда.
    mockЧасы.t += 5000;
    нажать(tree, uci.slice(0, 2));
    нажать(tree, uci.slice(2, 4));

    mockЧасы.t += 10 * 60 * 1000 + 5000;
    TestRenderer.act(() => { jest.advanceTimersByTime(700); });

    expect(`подъёмов: ${mockПоднято.join(',') || '—'}`).toBe('подъёмов: —');
    expect(`понижений: ${mockПровалов.length}`).toBe('понижений: 1');
  });
});

/**
 * Порог движения ступени в потоке — та же шкала, что рисует звёзды. Отдельный
 * порог рядом означал бы, что «быстро» в звёздах и «быстро» в лестнице — разные
 * величины, и человек увидит три звезды при понижении уровня.
 */
describe('ступень по медиане', () => {
  it('🔴 три звезды — вверх, одна — вниз, две — стоит', () => {
    for (const L of [1, 8, 20, 40]) {
      const наТри = 1400 + (L - 1) * 20;
      const наДве = 2400 + (L - 1) * 25;
      expect(`ур.${L} медиана ${наТри}: ${ступеньПоМедиане(наТри, L)}`).toBe(`ур.${L} медиана ${наТри}: вверх`);
      expect(`ур.${L} медиана ${наДве}: ${ступеньПоМедиане(наДве, L)}`).toBe(`ур.${L} медиана ${наДве}: стоит`);
      expect(`ур.${L} медиана ${наДве + 1}: ${ступеньПоМедиане(наДве + 1, L)}`).toBe(`ур.${L} медиана ${наДве + 1}: вниз`);
    }
  });

  it('🔴 шкала ступени и шкала звёзд — одна и та же', () => {
    const расхождения: string[] = [];
    for (let L = 1; L <= 40; L += 1) {
      for (const м of [500, 1400, 1500, 2400, 2500, 4000, 9000]) {
        const ждём = starsFor(м, L) === 3 ? 'вверх' : starsFor(м, L) === 1 ? 'вниз' : 'стоит';
        if (ступеньПоМедиане(м, L) !== ждём) расхождения.push(`ур.${L} ${м}мс`);
      }
    }
    expect(`расхождений шкал: ${расхождения.length}`).toBe('расхождений шкал: 0');
  });

  it('🔴 нет ни одного верного ответа — молчим, а не понижаем', () => {
    expect(ступеньПоМедиане(0, 1)).toBe('стоит');
  });
});
