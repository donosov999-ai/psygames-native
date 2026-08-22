/**
 * СТЫКОВКА «ОДНОЙ ЛИНИИ» С ПРИЛОЖЕНИЕМ — ПРОВЕРЯЕТСЯ ПОВЕДЕНИЕМ, А НЕ ТЕКСТОМ.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Модуль G3 пришёл из лаборатории самодостаточным: у него
 * своё ядро, свой словарь и СВОЙ экран итога. Ровно на этом уже обжигались: игра
 * показывает собственное поздравление, приложение об этом не знает, и звёзды по
 * уровням, серия чистых прохождений и глаз-разрядка молча не пишутся. Общий гейт
 * `game-standard` ловит это только у игр, ЗАРЕГИСТРИРОВАННЫХ в каталоге, а пока
 * запись в каталог не сделана (её вносят одним заходом вместе с шестью
 * соседними играми), «Одна линия» для него невидима. Здесь — то же требование,
 * но адресно и по существу.
 *
 * ⚠️ ВТОРАЯ ЛОВУШКА, РАДИ КОТОРОЙ ЗДЕСЬ НАСТОЯЩИЙ РЕНДЕР. В SET бейдж отсчёта
 * был написан, переведён на двенадцать языков, покрыт проверкой — и не
 * показывался ни разу: проверка стерегла РАЗМЕТКУ, а элемент был мёртв.
 * Поэтому ключевые утверждения ниже сделаны на живом дереве: партия играется
 * до конца нажатиями по настоящим кнопкам, и утверждения касаются того, что
 * реально нарисовано и реально вызвано.
 */
import React from 'react';
import {
  LEVELS,
  ONE_LINE_PASS_ACCURACY,
  createOneLineSession,
  generateOneLinePuzzle,
  isPassed,
  scoreOneLineCompletion,
  validateEulerGraph,
  type OneLineMetrics,
} from '@/src/games/one-line/core/index';
import { AUTHORED_LEVEL_COUNT } from '@/src/games/one-line/core/authored';
import { totalEdgeUses } from '@/src/games/one-line/core/validator';
import { oneLineScoreAt, oneLineTimeLimitMs } from '@/src/games/one-line/core/scoring';
import OneLineGame from '@/src/games/one-line/OneLineGame';
import { onGradientText, contrastRatio, AA_NORMAL } from '@/src/services/onGradientText';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const TestRenderer = require('react-test-renderer');

const SCREEN = join(__dirname, '../../app/games/one-line.tsx');
const src: string = readFileSync(SCREEN, 'utf8');
/** Комментарии режем: гейт не должен ловить собственные объяснения в шапке экрана. */
const code: string = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// ЖИВОЕ ДЕРЕВО. Хелперы ходят по тому, что реально нарисовано.
// ─────────────────────────────────────────────────────────────────────────────

/** Все строки-подписи из отрисованного дерева, склеенные в одну. */
/**
 * ⚠️ СМОНТИРОВАННОЕ СНИМАЕМ. Счёт партии сползает сам, по таймеру, — значит экран
 * продолжает тикать и после того, как случай закончился. Незакрытый тик стучит уже
 * в свёрнутое окружение Jest и валит весь набор посторонней ошибкой.
 */
let mounted: { unmount: () => void }[] = [];
afterEach(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* уже снят */ } }); mounted = []; });

function renderedText(node: any, acc: string[] = []): string[] {
  if (node == null || node === false) return acc;
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (typeof node === 'number') { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((n) => renderedText(n, acc)); return acc; }
  if (node.children) renderedText(node.children, acc);
  return acc;
}

/** Узлы отрисованного дерева, у которых есть a11y-подпись. */
function labelled(node: any, acc: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { node.forEach((n) => labelled(n, acc)); return acc; }
  if (node.props?.accessibilityLabel) acc.push(node);
  if (node.children) labelled(node.children, acc);
  return acc;
}

/** Плоский стиль узла: RN отдаёт массив, объект или ничего. */
function flatStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce((a, s) => ({ ...a, ...flatStyle(s) }), {});
  return style;
}

const THEME = {
  background: '#000000', surface: '#1C1C1E', card: '#2C2C2E',
  text: '#FFFFFF', textSecondary: '#8E8E93', primary: '#4338ca',
  border: '#38383A', success: '#30D158', error: '#FF453A', warning: '#FF9F0A',
};

/**
 * Играет партию ЧЕРЕЗ ИНТЕРФЕЙС: правила → тренировочный круг → основной граф.
 * Ходы берём из решения, посчитанного ядром независимо от UI.
 */
function playThroughUi(opts: { seed: string; level: number; showOwnResults: boolean }) {
  const results: OneLineMetrics[] = [];
  const plan = createOneLineSession({ seed: opts.seed, level: opts.level });
  let tree: any;
  let clock = 1_000_000;

  const press = (label: string) => {
    const target = labelled(tree.toJSON()).find(
      (n: any) => n.props.accessibilityLabel === label || String(n.props.accessibilityLabel).startsWith(`${label}.`),
    );
    if (!target) throw new Error(`нет кнопки «${label}»; на экране: ${labelled(tree.toJSON()).map((n: any) => n.props.accessibilityLabel).join(' | ')}`);
    TestRenderer.act(() => { target.props.onClick ? target.props.onClick() : pressComposite(label); });
  };

  /** Нажатие через композит: у host-узла onPress нет, он живёт на Pressable. */
  const pressComposite = (label: string) => {
    const node = tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && (n.props.accessibilityLabel === label || String(n.props.accessibilityLabel).startsWith(`${label}.`)),
      { deep: true },
    )[0];
    if (!node) throw new Error(`нет нажимаемого «${label}»`);
    node.props.onPress();
  };

  const tap = (label: string) => { clock += 500; TestRenderer.act(() => { pressComposite(label); }); };

  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(OneLineGame as any, {
      seed: opts.seed,
      level: opts.level,
      locale: 'ru',
      theme: THEME,
      gameGradient: ['#4338ca', '#db2777'],
      gameGradientText: '#ffffff',
      showOwnResults: opts.showOwnResults,
      now: () => clock,
      onComplete: (m: OneLineMetrics) => results.push(m),
    }));
    mounted.push(tree);
  });

  const vertexLabel = (puzzle: any, id: string) =>
    `Вершина ${puzzle.vertices.findIndex((v: any) => v.id === id) + 1}`;

  tap('Попробовать тренировку');
  plan.trainingPuzzle.solution.vertexIds.forEach((id: string) => tap(vertexLabel(plan.trainingPuzzle, id)));
  tap('Начать партию');
  /**
   * Снимок делаем ИМЕННО СЕЙЧАС, посреди партии. Первая версия этого хелпера
   * смотрела на дерево после финала — а после финала модуль со сцены уходит и
   * дерево пусто, поэтому «вершин мельче 48 не найдено» читалось как успех.
   * Ровно та ошибка, от которой этот гейт и заведён: пустота похожа на чистоту.
   */
  const duringPlay = tree.toJSON();
  plan.puzzle.solution.vertexIds.forEach((id: string) => tap(vertexLabel(plan.puzzle, id)));

  return {
    tree,
    results,
    plan,
    duringPlay,
    textDuringPlay: renderedText(duringPlay).join(' '),
    textAfter: renderedText(tree.toJSON()).join(' '),
  };
}

/** Доводит до основного графа и делает заданные ходы, не доигрывая партию. */
function playPartial(opts: { seed: string; level: number; moves: string[] }) {
  const plan = createOneLineSession({ seed: opts.seed, level: opts.level });
  let tree: any;
  let clock = 1_000_000;
  const pressComposite = (label: string) => {
    const node = tree.root.findAll(
      (n: any) => typeof n.props?.onPress === 'function'
        && (n.props.accessibilityLabel === label || String(n.props.accessibilityLabel).startsWith(`${label}.`)),
      { deep: true },
    )[0];
    if (!node) throw new Error(`нет нажимаемого «${label}»`);
    node.props.onPress();
  };
  const tap = (label: string) => { clock += 500; TestRenderer.act(() => { pressComposite(label); }); };
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(OneLineGame as any, {
      seed: opts.seed, level: opts.level, locale: 'ru', theme: THEME,
      gameGradient: ['#4338ca', '#db2777'], gameGradientText: '#ffffff',
      showOwnResults: false, now: () => clock, onComplete: () => undefined,
    }));
    mounted.push(tree);
  });
  const label = (puzzle: any, id: string) =>
    `Вершина ${puzzle.vertices.findIndex((v: any) => v.id === id) + 1}`;
  tap('Попробовать тренировку');
  plan.trainingPuzzle.solution.vertexIds.forEach((id: string) => tap(label(plan.trainingPuzzle, id)));
  tap('Начать партию');
  opts.moves.forEach((id) => tap(label(plan.puzzle, id)));
  return { tree, plan, text: renderedText(tree.toJSON()).join(' ') };
}

// ─────────────────────────────────────────────────────────────────────────────



describe('«Одна линия»: партия действительно доигрывается через интерфейс', () => {
  it('🔴 полный обход графа доводит партию до результата ровно один раз', () => {
    const run = playThroughUi({ seed: 'one-line-5', level: 5, showOwnResults: false });
    expect(run.results).toHaveLength(1);
    const m = run.results[0];
    // Раз результат случился — все рёбра пройдены одной линией; ходов было
    // ровно столько же, значит ни одного лишнего нажатия не потребовалось.
    expect(m.specific.edgeCount).toBe(run.plan.puzzle.edges.length);
    expect(m.specific.invalidMoves).toBe(0);
    expect(m.specific.undoCount).toBe(0);
    expect(m.accuracy).toBe(1);
    expect(m.details.level).toBe(5);
    expect(isPassed(m)).toBe(true);
  });

  it('🔴 свой экран итога модуля при showOwnResults=false не рисуется', () => {
    const off = playThroughUi({ seed: 'one-line-5', level: 5, showOwnResults: false });
    // Модуль ушёл со сцены — поздравлять будет LevelCleared приложения.
    expect(off.textAfter).not.toContain('Линия завершена');
    expect(off.textAfter).not.toContain('Повторить с тем же seed');

    // Контрольный опыт: с включённым флагом экран итога есть. Без него первая
    // половина проверки была бы зелена и на мёртвом модуле.
    const on = playThroughUi({ seed: 'one-line-5', level: 5, showOwnResults: true });
    expect(on.textAfter).toContain('Линия завершена');
  });

  it('🔴 строка «что делать» и счётчик рёбер РИСУЮТСЯ во время партии, а не лежат в исходнике', () => {
    const run = playThroughUi({ seed: 'one-line-7', level: 7, showOwnResults: false });
    expect(run.textDuringPlay).toContain('Пройдено рёбер');
    expect(run.textDuringPlay).toContain(`из ${run.plan.puzzle.edges.length}`);
    /**
     * Правило игры видно НА ПОЛЕ, а не только на экране правил перед партией.
     * В поставке лаборатории эта строка жила исключительно в accessibilityHint
     * доски: скринридер её читал, глазами не видел никто. Поймано этим гейтом
     * при первом же прогоне, строка выведена в вёрстку модуля.
     */
    expect(run.textDuringPlay).toContain('уже пройденное ребро использовать нельзя');
  });

  it('🔴 отвергнутый ход не штрафует молча — цена видна на поле', () => {
    /**
     * Порог прохождения уровня стоит на accuracy, а её режут именно отвергнутые
     * ходы и отмены. Пока их число не показано, человека штрафуют, не сказав за
     * что: линия просто не пошла. Проверяем ПОВЕДЕНИЕМ — делаем заведомо
     * несоседний ход и требуем, чтобы счётчик появился на экране.
     */
    const plan = createOneLineSession({ seed: 'one-line-2', level: 2 });
    const puzzle = plan.puzzle;
    const start = puzzle.solution.vertexIds[0];
    const adjacent = new Set(puzzle.edges.flatMap((e: any) => (
      e.a === start ? [e.b] : e.b === start ? [e.a] : []
    )));
    const far = puzzle.vertices.find((v: any) => v.id !== start && !adjacent.has(v.id));
    expect(far).toBeTruthy();

    const run = playPartial({
      seed: 'one-line-2',
      level: 2,
      moves: [start, (far as any).id],
    });
    expect(run.text).toContain('Исправления: 1');
  });

  it('🔴 в вершину пальцем попасть можно: цель не мельче 48 pt', () => {
    const run = playThroughUi({ seed: 'one-line-9', level: 9, showOwnResults: false });
    const vertices = labelled(run.duringPlay)
      .filter((n: any) => String(n.props.accessibilityLabel).startsWith('Вершина'));
    expect(vertices.length).toBeGreaterThan(3);
    const small = vertices
      .map((n: any) => flatStyle(n.props.style))
      .filter((s: any) => !(s.width >= 48 && s.height >= 48))
      .length;
    expect(`мельче 48: ${small}`).toBe('мельче 48: 0');
  });
});

describe('«Одна линия»: сложность растёт содержанием, а не таймером', () => {
  it('уровней 48, и число берётся из ядра', () => {
    expect(LEVELS).toBe(48);
    // Экран не вбивает его руками — растянут прогрессию, вырастет и тропинка.
    expect(code).toContain('maxLevel={LEVELS}');
  });

  /**
   * ⚠️ РОСТ ГЕНЕРАТОРА МЕРЯЕТСЯ НА ЕГО УРОВНЯХ. Первые двенадцать теперь рисованные,
   * и требовать от них «чистой раскладки» бессмысленно: конверт пересекается ПО
   * ОПРЕДЕЛЕНИЮ — этим он и конверт. Прежняя редакция брала второй уровень и упала
   * на песочных часах, у которых диагонали крестом: верное срабатывание не на том
   * материале. Поэтому проверка разведена надвое.
   */
  it('🔴 граф генератора растёт по уровням: вершины, рёбра, обманки-пересечения', () => {
    const at = (lv: number) => generateOneLinePuzzle(`one-line-${lv}`, lv);
    const small = at(AUTHORED_LEVEL_COUNT + 1);
    const mid = at(20);
    const big = at(40);
    /**
     * ⚠️ ЧИСЛО ВЕРШИН УПИРАЕТСЯ В ПОТОЛОК (VERTEX_PROGRESSION кончается на 12), и это
     * НАРОЧНО: пятнадцать точек на телефоне уже не разглядеть. Поэтому дальше растут
     * рёбра и запутанность раскладки, а не число точек — сравниваем то, что реально
     * обязано расти, а не то, что удобно написать.
     */
    expect(small.vertices.length).toBeLessThan(mid.vertices.length);
    expect(mid.vertices.length).toBeLessThanOrEqual(big.vertices.length);
    expect(mid.edges.length).toBeLessThan(big.edges.length);
    expect(small.edges.length).toBeLessThan(big.edges.length);
    expect(small.visualCrossings).toBeLessThan(big.visualCrossings);
    expect(big.visualCrossings).toBeGreaterThan(0);
  });

  /**
   * 🔴 РИСОВАННАЯ ДЮЖИНА — СВОЯ ЛЕСТНИЦА. Она ВЕДЁТ, а не просто растёт: сначала
   * восемь уровней чистого росчерка, потом двойное ребро, потом одностороннее.
   * Так же устроен образец — приправа работает, пока её мало.
   */
  it('🔴 рисованные уровни: приправа появляется поздно и остаётся редкой', () => {
    const kinds = (lv: number) => generateOneLinePuzzle('x', lv).edges.map((e) => e.kind ?? 'single');
    for (let lv = 1; lv <= 8; lv += 1) {
      expect(kinds(lv).every((k) => k === 'single')).toBe(true);
    }
    const all = Array.from({ length: AUTHORED_LEVEL_COUNT }, (_, i) => kinds(i + 1)).flat();
    expect(all).toContain('double');
    expect(all).toContain('oneway');
    // Не больше трети — иначе это уже не приправа, а другая игра.
    expect(all.filter((k) => k !== 'single').length).toBeLessThan(all.length / 3);
  });

  /** Один номер уровня — одна фигура у всех, иначе «тот, где звезда» ничего не значит. */
  it('🔴 рисованная фигура не зависит от зерна', () => {
    for (let lv = 1; lv <= AUTHORED_LEVEL_COUNT; lv += 1) {
      const a = generateOneLinePuzzle('seed-one', lv);
      const b = generateOneLinePuzzle('seed-two', lv);
      expect(a.vertices).toEqual(b.vertices);
      expect(a.edges).toEqual(b.edges);
    }
  });

  it('🔴 подсказка старта гаснет после третьего уровня — иначе ступени нет', () => {
    expect(generateOneLinePuzzle('one-line-3', 3).startHintVertexId).not.toBeNull();
    expect(generateOneLinePuzzle('one-line-4', 4).startHintVertexId).toBeNull();
  });

  /**
   * 🔴 ЭТА ПРОВЕРКА РАНЬШЕ ЗАПРЕЩАЛА ТАЙМЕР ВОВСЕ, И ЭТО БЫЛО ОБОСНОВАННОЕ РЕШЕНИЕ:
   * сложность должна расти содержанием задачи, а не спешкой. 22.08.2026 Денис его
   * ОТМЕНИЛ, разобрав игру-образец: там одно число делает две работы сразу — торопит
   * и уходит в рекорд уровня. Прежний довод бил не по таймеру как таковому, а по
   * таймеру КАК ОСИ СЛОЖНОСТИ: когда трудность уровня растёт сокращением времени, а
   * задача остаётся прежней.
   *
   * Поэтому запрет заменён, а не снят. Правила теперь такие:
   *   · счёт сползает по ЧАСАМ, а не накоплением по кадрам (на слабом телефоне
   *     накопление шло бы медленнее — игра становилась бы легче там, где и так тяжелее);
   *   · доска не перерисовывается каждый кадр ради целой цифры;
   *   · время не является осью сложности: лимит ОДИН на все уровни, сорок восьмой
   *     не душат теми же секундами, что и первый;
   *   · истёкшее время НЕ понижает уровень — иначе наказывали бы за раздумье.
   */
  it('🔴 счёт сползает по часам, а не накоплением по кадрам', () => {
    const scoring: string = readFileSync(join(__dirname, '../games/one-line/core/scoring.ts'), 'utf8');
    // Величина выводится из времени: одно и то же время даёт один и тот же счёт,
    // сколько бы раз ни спросили и сколько бы кадров ни прошло.
    const a = oneLineScoreAt(30_000);
    const b = oneLineScoreAt(30_000);
    expect(a).toBe(b);
    expect(oneLineScoreAt(0)).toBeGreaterThan(oneLineScoreAt(30_000));
    expect(scoring).not.toMatch(/requestAnimationFrame/);
  });

  it('🔴 доска не перерисовывается каждый кадр ради целой цифры', () => {
    const mod: string = readFileSync(join(__dirname, '../games/one-line/OneLineGame.tsx'), 'utf8');
    expect(mod).not.toMatch(/requestAnimationFrame/);
    const tick = /setInterval\([^,]+,\s*(\d+)\)/.exec(mod);
    expect(tick).not.toBeNull();
    // Реже раза в 10 мс — то есть не покадрово; и не реже секунды, иначе цифра дёргается.
    expect(Number((tick as RegExpExecArray)[1])).toBeGreaterThanOrEqual(100);
    expect(Number((tick as RegExpExecArray)[1])).toBeLessThanOrEqual(1000);
  });

  it('🔴 время НЕ ось сложности: лимит один и тот же на первом и на последнем уровне', () => {
    // Лимит вообще не зависит от уровня — функция его не принимает.
    expect(oneLineTimeLimitMs.length).toBe(0);
    expect(oneLineTimeLimitMs()).toBeGreaterThan(0);
  });

  it('🔴 истёкшее время уровень не понижает', () => {
    const screen: string = readFileSync(join(__dirname, '../../app/games/one-line.tsx'), 'utf8');
    const body = screen.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // Понижение обязано быть обусловлено признаком «время вышло».
    expect(body).toMatch(/timedOut/);
    expect(body).toMatch(/!passed && !timedOut\) lvl\.fail\(\)/);
  });

  it('любой уровень собирается в один непрерывный росчерк — иначе задача нерешаема', () => {
    for (const lv of [1, 2, 3, 8, 17, 25, 33, 48]) {
      const p = generateOneLinePuzzle(`one-line-${lv}`, lv);
      const v = validateEulerGraph(p);
      expect(`уровень ${lv}: связен=${v.connected}, нечётных=${v.oddVertexIds.length}`)
        .toBe(`уровень ${lv}: связен=true, нечётных=${p.isCircuit ? 0 : 2}`);
      /**
       * Решение съедает все ПРОХОДЫ, а не рёбра: двойное ребро проходится
       * дважды, и с 18-го уровня генератор их ставит. Прежнее сравнение с числом
       * рёбер покраснело ровно на этом (25-й уровень, 22.08.2026).
       */
      expect(p.solution.edgeIds.length).toBe(totalEdgeUses(p.edges));
    }
  });
});

describe('«Одна линия»: решения стыковки', () => {
  it('🔴 экран не показывает свой экран итога модуля и заканчивает раунд общим', () => {
    expect(code).toContain('showOwnResults={false}');
    expect(code).toContain('<LevelCleared');
    expect(code).toContain('<LevelProgressMap');
    expect(code).toContain("usePersistentLevel('one_line')");
  });

  it('🔴 primary в теме модуля — цвет ИГРЫ, а не акцент профиля', () => {
    const theme = code.slice(code.indexOf('theme={{'), code.indexOf('gameGradient='));
    expect(theme).toMatch(/primary:\s*GRADIENT\[0\]/);
    // Акцент профиля в игру не просачивается ни одной строкой: иначе внутри
    // игры одна схема, а снаружи, на экране настроек, другая.
    expect(code).not.toContain('colors.primary');
  });

  it('🔴 порог прохождения берётся из ядра, а не заводится свой', () => {
    expect(code).toMatch(/const passed = isPassed\(m\)/);
    expect(code).toContain("from '@/src/games/one-line/core/index'");
    // Смысл порога записан в ядре вместе с формулой accuracy — здесь только
    // сверяем, что он не разъехался с тем, под что писалась игра.
    expect(ONE_LINE_PASS_ACCURACY).toBe(0.8);
    const clean = scoreOneLineCompletion(generateOneLinePuzzle('one-line-6', 6), {
      durationMs: 1000, undoCount: 0, hintsUsed: 0, invalidMoves: 0,
    });
    expect(isPassed(clean)).toBe(true);
    // Четверть рёбер, потраченная на исправления, — ещё зачёт; больше — нет.
    const edges = generateOneLinePuzzle('one-line-6', 6).edges.length;
    const costly = scoreOneLineCompletion(generateOneLinePuzzle('one-line-6', 6), {
      durationMs: 1000, undoCount: Math.ceil(edges / 3), hintsUsed: 0, invalidMoves: 0,
    });
    expect(isPassed(costly)).toBe(false);
  });

  it('🔴 поздравляем за СЫГРАННЫЙ уровень, а не за следующий', () => {
    /**
     * Ошибка на единицу, пойманная глазами: `lvl.reach()` поднимает сохранённый
     * уровень ДО показа баннера, поэтому «текущий уровень» экрана к этому
     * моменту уже про следующую ступень. Отдать его в LevelCleared — значит
     * поздравить не с тем и положить звёзды на неигранный уровень.
     * Требуем ровно одного: баннер получает число, снятое с метрики модуля.
     */
    expect(code).toMatch(/<LevelCleared[\s\S]{0,80}level=\{playedLevel\}/);
    expect(code).toMatch(/setPlayedLevel\(doneLevel\)/);
    expect(code).not.toMatch(/<LevelCleared[\s\S]{0,80}level=\{level\}/);
  });

  it('🔴 уровень уезжает в сессию — иначе прогресс не переживёт сброс профиля', () => {
    // Ровно та форма записи, которую узнаёт единый стандарт: не литерал, а
    // переменная, посчитанная из метрики модуля.
    expect(code).toMatch(/const doneLevel = m\.details\.level/);
    expect(code).toMatch(/level:\s*doneLevel/);
    expect(code).toContain("game_type: 'one_line'");
  });

  it('🔴 время партии идёт по общим часам, а не по настенным', () => {
    expect(code).not.toContain('Date.now()');
    expect(code).toContain("from '@/src/services/gamePause'");
    expect(code).toMatch(/gameNow\(\)/);
    // Часы отдаются модулю СТАБИЛЬНОЙ ссылкой: новая стрелка на каждый рендер
    // переподписывала бы его слушатель AppState.
    expect(code).toMatch(/React\.useCallback\(\(\) => gameNow\(\), \[\]\)/);
  });

  it('🔴 пресет и шаг зарядки уровень не двигают, а адрес важнее сохранённого', () => {
    expect(code).toMatch(/const level = num\('level', lvl\.level\)/);
    expect(code).toMatch(/if \(!isPreset && passed && shouldChainNextLevel\(mode\)\)/);
    expect(code).toContain('useCalmHush(isCalm)');
  });

  it('🔴 надпись на плашке игры читается: AA по ОБОИМ концам градиента', () => {
    const g = (code.match(/const GRADIENT = \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/) || []).slice(1);
    expect(g).toHaveLength(2);
    const on = onGradientText(g[0], g[1]);
    const ends = (on as any).ends as [string, string];
    expect(Number(contrastRatio(on.color, ends[0]).toFixed(2))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(Number(contrastRatio(on.color, ends[1]).toFixed(2))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('кнопка «Назад» — 48×48, а не отступ вокруг иконки', () => {
    // Настоящая проверка попадания пальцем — scripts/tap-target-audit.mjs на
    // живой странице; здесь стережём ровно ту строчку стиля, из-за которой
    // у G1 появилась единственная запись в долге того аудита.
    const back = src.slice(src.indexOf('back: {'), src.indexOf('back: {') + 120);
    expect(back).toMatch(/width:\s*48/);
    expect(back).toMatch(/height:\s*48/);
  });

  it('🔴 подпись игры переедет в словарь, как только ключ там появится', () => {
    /**
     * САМООЧИЩАЮЩЕЕСЯ НАПОМИНАНИЕ, А НЕ ПУНКТ В СПИСКЕ ДЕЛ.
     *
     * Сейчас имя и описание берутся из словаря МОДУЛЯ (ru/en): ключей приложения
     * ещё нет, а звать `t()` на несуществующий ключ — это надпись «oneLine» на
     * экране. Но как только заход-интегратор внесёт ключи, экран обязан перейти
     * на них: иначе десять языков из двенадцати останутся с английской подписью,
     * и заметит это не разработчик, а японец или кореец.
     *
     * Поэтому проверка зеркальная: пока ключа нет — требуем словарь модуля,
     * появился ключ — требуем `t()`. Забыть переключение физически нельзя.
     */
    const dict: string = readFileSync(join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');
    const keyExists = /^\s{2}oneLine:\s*\{/m.test(dict);
    if (keyExists) {
      expect(`ключ в словаре есть, экран зовёт t('oneLine'): ${code.includes("t('oneLine')")}`)
        .toBe("ключ в словаре есть, экран зовёт t('oneLine'): true");
    } else {
      expect(code).toContain('own.title');
      expect(code).not.toContain("t('oneLine')");
    }
  });

  it('модуль ничего не тянет из лаборатории: импорты без .js и без путей вверх', () => {
    const mod: string = readFileSync(join(__dirname, '../games/one-line/OneLineGame.tsx'), 'utf8');
    expect(mod).not.toMatch(/from '\.{1,2}\/[^']*\.js'/);
    expect(mod).toContain("from './core/index'");
  });
});
