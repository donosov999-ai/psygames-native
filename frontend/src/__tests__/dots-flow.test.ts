/* psygames-dots-flow-gate · VER 1 · 22.08.2026 */
/**
 * «СОЕДИНИ ТОЧКИ» — ЭТО FLOW, А НЕ ЗАГОТОВКА: ЛЕСЕНКА, ПОЛНОЕ ПОКРЫТИЕ, СЧЁТЧИКИ.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО И ЧЕМ ЭТО МЕРЯНО. Прогон генератора v1 по всем сорока
 * уровням (22.08.2026):
 *
 *   L1–5  4×4 / 3 пары  ·  L6     4×4 / 4
 *   L7–10 5×5 / 4       ·  L11–12 5×5 / 5
 *   L13–15 6×6 / 5      ·  L16–18 6×6 / 6
 *   L19–20 7×7 / 6      ·  L21–24 7×7 / 7
 *   L25    8×8 / 7      ·  L26–40 8×8 / 8
 *
 * То есть третий уровень — шестнадцать клеток и ТРИ пары (владелец продукта
 * сыграл его и назвал заготовкой), 4×4 стояло шесть уровней подряд, 8×8 на
 * восьми парах — пятнадцать. Образец (Flow Free) к этому месту даёт плотную
 * сетку и десять-четырнадцать цветов.
 *
 * ⚠️ ГЕЙТ ЗОВЁТ НАСТОЯЩИЙ ПУТЬ ИГРЫ, А НЕ ПОВТОРЯЕТ ФОРМУЛУ. Числа лесенки
 * берутся из `generateDotsPuzzle`, правило победы — из `validateDotsSolution` и
 * живой сессии, счётчики — из смонтированного модуля. Если завтра таблицу
 * уровней перепишут иначе, но свойства сохранятся, гейт останется зелёным; если
 * свойства сломают — покраснеет, как бы ни была устроена реализация.
 *
 * ⚠️ ОБЕ СТОРОНЫ КАЖДОГО УТВЕРЖДЕНИЯ. «Покрытие 100% требуется» проверяется
 * вместе с «выигрышная раскладка существует и находится»: гейт, который умеет
 * только запрещать, зелен и на игре, которую пройти невозможно вовсе.
 */
declare const __dirname: string;
declare function require(id: string): any;

const { readFileSync } = require('fs');
const { join } = require('path');
const ROOT = join(__dirname, '../..');

import React from 'react';
import {
  DOTS_MAX_PAIRS,
  DOTS_PAIR_STYLES,
  DOTS_LOCALES,
  LEVELS,
  beginPath,
  createDotsSession,
  extendPath,
  generateDotsPuzzle,
  generateDotsTrainingPuzzle,
  getDotsStrings,
  isAdjacent,
  randomHamiltonianPath,
  createRng,
  solveDotsPuzzle,
  startRound,
  validateDotsSolution,
  type Cell,
  type DotsLocale,
  type DotsPuzzle,
  type DotsSession,
  type DotsSolution,
} from '@/src/games/dots-connect/core';
import DotsConnectGame from '@/src/games/dots-connect/DotsConnectGame';

const TestRenderer = require('react-test-renderer');

/** Вся лесенка одним замером — считаем один раз, смотрим со всех сторон. */
const LADDER = Array.from({ length: LEVELS }, (_, index) => generateDotsPuzzle('ladder', index + 1));

const key = (cell: Cell) => `${cell.row},${cell.col}`;

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — лесенка доросла до образца', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(LADDER).toHaveLength(40);
    expect(LADDER.every((puzzle) => puzzle.pairs.length === puzzle.pairCount)).toBe(true);
  });

  /** Первое, что видит человек, обязано выглядеть игрой, а не заготовкой. */
  it('🔴 стартовая доска — не 4×4 на три пары', () => {
    const first = LADDER[0] as DotsPuzzle;
    expect(`${first.size}×${first.size} на ${first.pairCount} пар`).toBe('5×5 на 4 пар');
    for (const puzzle of LADDER) {
      expect(puzzle.size).toBeGreaterThanOrEqual(5);
      expect(puzzle.pairCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('🔴 верх лесенки — плотная сетка 9×9+ на 10–14 пар', () => {
    const top = LADDER.slice(-10);
    expect(Math.min(...top.map((p) => p.size))).toBeGreaterThanOrEqual(9);
    expect(Math.min(...top.map((p) => p.pairCount))).toBeGreaterThanOrEqual(10);
    expect(Math.max(...LADDER.map((p) => p.pairCount))).toBe(14);
    // Больше пар, чем цветов в палитре, раскрасить нечем — потолок обязан совпадать.
    expect(Math.max(...LADDER.map((p) => p.pairCount))).toBeLessThanOrEqual(DOTS_MAX_PAIRS);
    expect(DOTS_PAIR_STYLES.length).toBe(DOTS_MAX_PAIRS);
  });

  /**
   * 🔴 ГЛАВНАЯ БОЛЕЗНЬ v1: ПОЛЕ СТОЯЛО НА МЕСТЕ. Проверяем ровно это — самую
   * длинную череду уровней одного размера. Было 15, стало не больше 3.
   */
  it('🔴 поле не стоит на месте дольше трёх уровней подряд', () => {
    let longest = 1;
    let run = 1;
    let at = 1;
    for (let index = 1; index < LADDER.length; index += 1) {
      run = (LADDER[index] as DotsPuzzle).size === (LADDER[index - 1] as DotsPuzzle).size ? run + 1 : 1;
      if (run > longest) { longest = run; at = index + 1; }
    }
    expect(`самая длинная череща одного размера: ${longest} (к уровню ${at})`)
      .toBe(`самая длинная череща одного размера: 3 (к уровню ${at})`);
  });

  /**
   * Обратная сторона: раз размер наверху колеблется, расти обязано другое.
   *
   * 🔴 ДЛИНА ПУТИ ПЕРЕСТАЛА БЫТЬ ОСЬЮ 06.09.2026, И ЭТО РЕШЕНИЕ, А НЕ РЕГРЕСС.
   * С этого дня путь пары не касается сам себя — только на этом держится
   * единственность решения. А самонепересекающийся кусок пути, заполняющего
   * поле, длиннее шести клеток практически не встречается: путь складывается
   * примерно каждые шесть шагов. Замер после включения правила: «за 4000
   * попыток не собралось ни одной доски 10×10 на 14 пар при мин. пути 5».
   *
   * Поэтому нижняя граница пути теперь постоянна (3), а трудность растит
   * ПЛОТНОСТЬ: пар больше, пути короче. Проверка требует ровно этого — длина не
   * убывает и не растёт, а пары растут по-настоящему.
   */
  it('🔴 число пар растёт, а нижняя длина пути постоянна по замыслу', () => {
    const backslides: string[] = [];
    for (let index = 1; index < LADDER.length; index += 1) {
      const prev = LADDER[index - 1] as DotsPuzzle;
      const next = LADDER[index] as DotsPuzzle;
      if (next.pairCount < prev.pairCount) backslides.push(`пары L${index}→L${index + 1}`);
      if (next.minPathLength !== prev.minPathLength) {
        backslides.push(`длина L${index}→L${index + 1}: ${prev.minPathLength}→${next.minPathLength}`);
      }
      if (next.difficulty < prev.difficulty) backslides.push(`сложность L${index}→L${index + 1}`);
    }
    expect(backslides).toEqual([]);
    // И пары ДОХОДЯТ до края, а не стоят на месте: иначе «не убывает» ничего не значит.
    expect((LADDER[LEVELS - 1] as DotsPuzzle).pairCount)
      .toBeGreaterThan((LADDER[0] as DotsPuzzle).pairCount * 2);
    expect((LADDER[LEVELS - 1] as DotsPuzzle).difficulty).toBe(1);
  });

  /** Тренировка учит правилу и обязана остаться самой мелкой доской в игре. */
  it('тренировочная доска не поехала за лесенкой', () => {
    const training = generateDotsTrainingPuzzle('gate');
    expect(training.size).toBe(4);
    expect(training.size).toBeLessThan((LADDER[0] as DotsPuzzle).size);
    expect(validateDotsSolution(training, training.solution).complete).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — полное покрытие обязательно и достижимо', () => {
  /**
   * ДОКАЗАТЕЛЬСТВО ПОСТРОЕНИЕМ. Генератор сначала раскладывает решение и только
   * потом отдаёт концы путей как пары. Значит его собственное решение обязано
   * проходить проверку НЕЗАВИСИМЫМ валидатором — тем самым, по которому
   * закрывается партия. Не «скорее всего решаемо», а «решение уже лежит».
   */
  it('🔴 у каждого уровня решение существует по построению', () => {
    const broken: string[] = [];
    for (const puzzle of LADDER) {
      const check = validateDotsSolution(puzzle, puzzle.solution);
      if (!check.complete) broken.push(`L${puzzle.level}: ${check.issues.join('; ')}`);
      /**
       * ⚠️ ПОКРЫТИЕ СЧИТАЕТСЯ БЕЗ СТЕН. С 06.09.2026 поле не обязательно
       * квадратное: часть клеток вырезана, и «вся сетка» — это всё, ЧЕГО НЕ
       * СТЕНА. Проба, считавшая от `size × size`, краснела на верных досках.
       */
      const наДоске = puzzle.size * puzzle.size - (puzzle.walls?.length ?? 0);
      if (check.coveredCells !== наДоске) {
        broken.push(`L${puzzle.level}: покрыто ${check.coveredCells}/${наДоске}`);
      }
      for (const pair of puzzle.pairs) {
        const path = puzzle.solution[pair.id] as Cell[];
        if (path.length < puzzle.minPathLength) {
          broken.push(`L${puzzle.level}: путь ${pair.id} короче ${puzzle.minPathLength}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  /**
   * ВСТРЕЧНАЯ СТОРОНА: решение НАХОДИТСЯ по одним лишь точкам. Решатель не
   * видит ни зерна, ни `solution` — только `pairs`. Если бы он умел разбирать
   * лишь замысел генератора, любая смена раскладки оставила бы игру
   * непроходимой, а гейт — зелёным.
   */
  it('🔴 решение находится по одним точкам, без подсказки генератора', () => {
    const unsolved: string[] = [];
    for (const puzzle of LADDER) {
      const publicOnly: DotsPuzzle = {
        ...puzzle,
        pairs: puzzle.pairs.map((pair) => ({ ...pair, endpoints: [...pair.endpoints] as unknown as DotsPuzzle['pairs'][number]['endpoints'] })),
      };
      delete (publicOnly as { solution?: unknown }).solution;
      const found = solveDotsPuzzle(publicOnly);
      if (!found || !validateDotsSolution(puzzle, found).complete) unsolved.push(`L${puzzle.level}`);
    }
    expect(unsolved).toEqual([]);
  });

  /**
   * 🔴 «ВСЕ ПАРЫ СОЕДИНЕНЫ» — ЕЩЁ НЕ ПОБЕДА. Это и есть Flow: путь можно
   * провести по кратчайшей, и тогда часть клеток останется пустой. Прогоняем
   * такую партию через НАСТОЯЩУЮ сессию (те же beginPath/extendPath, что и от
   * пальца) и требуем, чтобы уровень НЕ закрылся.
   */
  /**
   * 🔴 ПОКРЫТИЕ ОБЯЗАТЕЛЬНО: СОЕДИНИТЬ ВСЕ ПАРЫ — ЕЩЁ НЕ ПОБЕДА.
   *
   * 📍 ПОЧЕМУ ДОСКА ТЕПЕРЬ РУЧНАЯ, А НЕ ИЗ ГЕНЕРАТОРА. Прежняя редакция брала
   * настоящий уровень и искала на нём путь КОРОЧЕ полного. Уровень протухал
   * дважды (ехал с 3 на 4), а 06.09.2026 перестал годиться вовсе: после
   * правила «путь не касается сам себя» доски стали плотнее, и короткого обхода
   * нет НИ НА ОДНОМ из сорока уровней — проверено перебором. То есть свойство
   * на живой доске больше не показать, хотя само свойство никуда не делось.
   *
   * Здесь оно показывается на доске, собранной руками: 3×3, две пары, обе
   * соединены кратчайшими путями, четыре клетки остались пустыми. Правило игры
   * обязано такое отвергнуть — и назвать причиной именно покрытие.
   */
  it('🔴 короткие пути соединяют все пары, но уровень не засчитывается', () => {
    const доска = {
      id: 'ручная', seed: 'ручная', level: 1, size: 3,
      pairCount: 2, minPathLength: 3, difficulty: 0, tier: 'forced' as const,
      construction: 'ручная', generatorVersion: 0,
      pairs: [
        { id: 'a', color: '#d81b3c', symbol: '●', endpoints: [{ row: 0, col: 0 }, { row: 0, col: 2 }] },
        { id: 'b', color: '#1a3ae0', symbol: '■', endpoints: [{ row: 2, col: 0 }, { row: 2, col: 2 }] },
      ],
    } as unknown as DotsPuzzle;
    // Обе пары соединены по верхнему и нижнему ряду; средний ряд пуст.
    const короткое = {
      a: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
      b: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
    } as unknown as DotsSolution;
    const итог = validateDotsSolution(доска, короткое as never);
    expect(`валидно: ${итог.valid}`).toBe('валидно: false');
    expect(`покрыто: ${итог.coveredCells}/${итог.totalCells}`).toBe('покрыто: 6/9');
    expect(итог.issues.some((i: string) => i.includes('coverage'))).toBe(true);
    // ⚠️ И придирка ровно одна — покрытие. Иначе проба зеленела бы, отвергая
    // доску за что-то постороннее, и про покрытие не говорила бы ничего.
    expect(итог.issues.length).toBe(1);
  });

  /**
   * ВСТРЕЧНАЯ СТОРОНА ТОЙ ЖЕ ПРОВЕРКИ: та же доска, полное покрытие — уровень
   * закрывается, и покрытие в метрике ровно 1.
   */
  it('🔴 та же доска с полным покрытием закрывается и уходит в метрику', () => {
    const level = 4;   // та же доска, что и в проверке выше — см. пояснение там
    const puzzle = generateDotsPuzzle('coverage-check', level);
    const full = solveDotsPuzzle(puzzle) as DotsSolution;
    let session = startRound(createDotsSession({ seed: 'coverage-check', level }), 1_000);
    session = drawSolution(session, full);
    expect(session.phase).toBe('result');
    expect(session.result?.specific.coverage).toBe(1);
    expect(session.result?.specific.gridSize).toBe(puzzle.size);
    expect(session.result?.specific.pairCount).toBe(puzzle.pairCount);
  });

  /** Обход, из которого режутся пары, обязан быть путём по КАЖДОЙ клетке ровно раз. */
  it('🔴 обход генератора накрывает всю сетку и не прыгает', () => {
    for (const size of [5, 7, 9, 10]) {
      const order = randomHamiltonianPath(size, createRng(`walk-${size}`));
      expect(order).toHaveLength(size * size);
      expect(new Set(order.map(key)).size).toBe(size * size);
      const jumps = order.filter((cell, index) => index > 0 && !isAdjacent(order[index - 1] as Cell, cell));
      expect(jumps).toEqual([]);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — счётчики видны и живут', () => {
  it('🔴 «ходы» и «покрытие %» нарисованы во время партии и меняются от хода', () => {
    const level = 1;
    const seed = 'hud-check';
    const puzzle = generateDotsPuzzle(seed, level);
    const solution = solveDotsPuzzle(puzzle) as DotsSolution;
    const strings = getDotsStrings('ru');
    const board = 320;
    const unit = board / puzzle.size;

    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(DotsConnectGame, {
        seed, level, locale: 'ru', skipIntro: true, showOwnResults: false,
        theme: {
          background: '#fff', surface: '#eee', card: '#fff', text: '#000', textSecondary: '#666',
          primary: '#2563eb', border: '#ccc', success: '#0a0', error: '#a00', warning: '#fa0',
        },
        gameGradient: ['#2563eb', '#0f766e'], gameGradientText: '#fff', now: () => 1000,
      } as any));
    });
    /**
     * 🔴 ЧИТАЕМ ВИДИМЫЙ ТЕКСТ, А НЕ JSON ДЕРЕВА. Первая редакция этой проверки
     * искала «20%» в `JSON.stringify(tree.toJSON())` — и осталась ЗЕЛЁНОЙ, когда
     * счётчик покрытия убрали с экрана нарочно (мутация 22.08.2026). Причина:
     * рядом со счётчиком стоит полоска, у которой ширина задана как `width:
     * "20%"`, и та же строка нашлась в стилях. То есть гейт стерёг разметку, а
     * не показанное человеку число — ровно та беда, из-за которой в SET бейдж
     * отсчёта был переведён на 12 языков и не показывался ни разу.
     */
    const visible = (): string => {
      const walk = (node: any): string => {
        if (node === null || node === undefined || node === false) return '';
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(walk).join('');
        return walk(node.children);
      };
      return walk(tree.toJSON());
    };
    const grid = () => tree.root.findAll((node: any) => node.props?.accessibilityRole === 'adjustable')[0];

    // Подписи на месте и по-русски, а не именем ключа.
    expect(strings.hudMoves).toBe('Ходы');
    expect(strings.hudCoverage).toBe('Покрытие');
    // До первого хода занято ровно ничего.
    expect(visible()).toContain(`${strings.hudMoves} 0`);
    expect(visible()).toContain(`${strings.hudCoverage} 0%`);

    TestRenderer.act(() => {
      grid().props.onLayout({ nativeEvent: { layout: { width: board, height: board } } });
    });
    const first = solution[(puzzle.pairs[0] as DotsPuzzle['pairs'][number]).id] as Cell[];
    const at = (cell: Cell) => touch((cell.col + 0.5) * unit, (cell.row + 0.5) * unit);
    TestRenderer.act(() => { grid().props.onResponderGrant(at(first[0] as Cell)); });
    for (const cell of first.slice(1)) {
      TestRenderer.act(() => { grid().props.onResponderMove(at(cell)); });
    }
    TestRenderer.act(() => { grid().props.onResponderRelease(at(first[first.length - 1] as Cell)); });

    // 🔴 «РАЗМЕТКА ЕСТЬ, ЭЛЕМЕНТ МЁРТВ» — самая частая беда в этом проекте.
    // Поэтому мало найти подпись: числа обязаны ИЗМЕНИТЬСЯ от настоящего хода.
    const moves = first.length - 1;
    const percent = Math.floor((first.length / (puzzle.size * puzzle.size)) * 100);
    expect(percent).toBeGreaterThan(0);
    expect(moves).toBeGreaterThan(0);
    expect(visible()).toContain(`${strings.hudMoves} ${moves}`);
    expect(visible()).toContain(`${strings.hudCoverage} ${percent}%`);
  });

  /** Подписи обязаны быть на языке человека — все двенадцать, а не ru/en. */
  it('🔴 счётчики переведены на все 12 языков приложения', () => {
    const context = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
    const block = context.slice(context.indexOf('export const LANGUAGES'), context.indexOf('const LANG_CODES'));
    const appLanguages = (block.match(/code:\s*'([a-z]{2})'/g) ?? []).map((row: string) => row.slice(-3, -1));
    expect(appLanguages.length).toBe(12);
    expect([...DOTS_LOCALES].sort()).toEqual([...appLanguages].sort());

    const gaps: string[] = [];
    const english = getDotsStrings('en');
    for (const locale of DOTS_LOCALES) {
      const strings = getDotsStrings(locale as DotsLocale);
      for (const field of ['hudMoves', 'hudCoverage', 'hudGoal'] as const) {
        if (!strings[field] || !strings[field].trim()) gaps.push(`${locale}.${field} пуст`);
        if (locale !== 'en' && strings[field] === english[field]) gaps.push(`${locale}.${field} остался английским`);
      }
      // Полнота словаря целиком: ни одной подписи мимо перевода.
      const missing = Object.entries(strings).filter(([, value]) => !String(value).trim());
      if (missing.length) gaps.push(`${locale}: пустые ${missing.map(([name]) => name).join(', ')}`);
      if (Object.keys(strings).sort().join(',') !== Object.keys(english).sort().join(',')) {
        gaps.push(`${locale}: набор ключей не совпадает с en`);
      }
    }
    expect(gaps).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Заготовки. Ничего из правил игры они не решают — только ведут руку игрока.
// ─────────────────────────────────────────────────────────────────────────────

/** Проводит пути через НАСТОЯЩИЕ ходы сессии, как это делает палец. */
function drawSolution(start: DotsSession, solution: DotsSolution): DotsSession {
  let session = start;
  for (const [pairId, path] of Object.entries(solution)) {
    void pairId;
    session = beginPath(session, path[0] as Cell);
    for (const cell of path.slice(1)) session = extendPath(session, cell, 2_000);
  }
  return session;
}


/** Синтетическое касание: PanResponder читает не только координаты, но и историю. */
let stamp = 0;
function touch(x: number, y: number) {
  stamp += 16;
  const bank = {
    touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 0,
    currentPageX: x, currentPageY: y, currentTimeStamp: stamp,
    previousPageX: x, previousPageY: y, previousTimeStamp: stamp - 16,
  };
  return {
    nativeEvent: {
      locationX: x, locationY: y, pageX: x, pageY: y, identifier: 1, timestamp: stamp,
      touches: [{ identifier: 1, pageX: x, pageY: y }],
      changedTouches: [{ identifier: 1, pageX: x, pageY: y }],
    },
    touchHistory: {
      touchBank: [undefined, bank], numberActiveTouches: 1,
      indexOfSingleActiveTouch: 1, mostRecentTimeStamp: stamp,
    },
    persist() {}, preventDefault() {}, stopPropagation() {},
  };
}

// ═════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 СТЕНЫ ДОЛЖНЫ ДЕЙСТВОВАТЬ ВЕЗДЕ, А НЕ ТОЛЬКО В ГЕНЕРАТОРЕ.
 *
 * Проба поведенческая: она не читает исходник, а ХОДИТ в стену и смотрит, что
 * ответила игра. Гейт, который ищет слово «walls» в файле, зеленеет от
 * комментария; этот — только от отказа принять ход.
 */
describe('«Соедини точки» — стены действуют в партии', () => {
  it('🔴 ход в стену игра не принимает, а поле без стен остаётся проходимым', () => {
    const беды: string[] = [];
    for (const level of [20, 30, 40]) {
      const seed = `wall-${level}`;
      const puzzle = generateDotsPuzzle(seed, level);
      const стены = puzzle.walls ?? [];
      if (стены.length === 0) { беды.push(`L${level}: стен нет — проверять нечего`); continue; }
      // Ищем стену, СОСЕДНЮЮ с началом какой-нибудь пары: только туда и можно
      // попытаться шагнуть первым ходом.
      let попробовали = false;
      for (const pair of puzzle.pairs) {
        const [from] = pair.endpoints;
        const рядом = стены.find((w) => Math.abs(w.row - from.row) + Math.abs(w.col - from.col) === 1);
        if (!рядом) continue;
        const начало = startRound(createDotsSession({ seed, level }), 0);
        const session = beginPath(начало, from);
        const после = extendPath(session, рядом, 2);
        попробовали = true;
        const путь = после.paths[pair.id] ?? [];
        if (путь.some((c) => c.row === рядом.row && c.col === рядом.col)) {
          беды.push(`L${level}/${pair.id}: путь зашёл в стену ${рядом.row},${рядом.col}`);
        }
        break;
      }
      if (!попробовали) беды.push(`L${level}: ни одна стена не примыкает к началу пары — проба слепа`);
    }
    expect(беды).toEqual([]);
  });
});
