/**
 * ФРАКТАЛЬНАЯ СУДОКУ: ПАРТИЯ ОБЯЗАНА ДОИГРЫВАТЬСЯ, А РЕШЕНИЕ — БЫТЬ ОДНИМ.
 *
 * ЗАЧЕМ ГЕЙТ. Замер 19.08.2026 на живом коде до правки:
 *
 *   • ПОБЕД 0 ИЗ 30 на пятнадцатом уровне — и так на ЛЮБОМ уровне. Победа проверяла
 *     полное совпадение корня с решением, а заполнялись в корне ровно девять клеток,
 *     приходящих снизу. Остальные (в среднем 51 из 81) не заполнял никто: ввода в
 *     корень на экране не было вовсе. Игра была непроходима по построению.
 *   • ЕДИНСТВЕННЫХ РЕШЕНИЙ 0 ИЗ 270. Дырки копались случайно, без проверки. Значит
 *     подсветка ошибки врала: игрок ставил ВАЛИДНУЮ цифру, а сверка с зашитым
 *     solution засчитывала ошибку. И «вывести логикой» было невозможно в принципе —
 *     оставалась угадайка.
 *   • СЛОЖНОСТЬ РОСЛА ЧИСЛОМ ДЫРОК НАУГАД (38→56) — ровно та ось, на которой уже
 *     сломался обычный судоку («с 30 по 34 сложность не меняется», репорт Вали).
 *
 * Ни одну из трёх поломок нельзя увидеть глазами за разумное время: непроходимость
 * вскрывается через час игры, неединственность — когда «правильная» цифра вдруг
 * краснеет. Поэтому гейт.
 *
 * ⚠️ ЧЕМ ПРОВЕРЯЕМ. Широкий прогон идёт быстрым решателем самого движка — тем же,
 * которым генератор копает дырки. Чтобы это не было «код проверяет сам себя», узкий
 * срез перепроверен ЧУЖИМИ реализациями: countSolutions из ядра судоку и gradePuzzle
 * из градатора. Разъедутся — гейт покраснеет.
 */
import {
  N, FEED_CELL, generateFractal, flatten, countSolutionsFast, logicSolve,
  rootEditable, rootSolved, rootUnreachableCells, isUnlocked,
  logicSolveCalls, resetLogicSolveCalls,
  type FractalPuzzle,
} from '@/src/services/fractal-sudoku';
import { fractalLevel, FRACTAL_MAX_LEVEL } from '@/src/services/fractalLevels';
import { countSolutions } from '@/src/services/sudoku-core';
import { gradePuzzle } from '@/src/services/sudoku-grade';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

/** Уровни из задания: начало, середина каждой ступени техники и потолок. */
const LEVELS = [1, 5, 10, 15, 20, 30];
const PER_LEVEL = 50;

const houseSolutions = (b: number[][]) =>
  countSolutions(b.map((r) => [...r]), 9, 3, 3, 'none', undefined, 2, { steps: 500000 });

/**
 * Доиграть партию до конца ровно теми правилами, которыми играет экран:
 * дочернюю добиваем верными цифрами до её порога → она отдаёт свой центр наверх;
 * в корне человек заполняет всё, что движок считает его клетками.
 * Возвращает описание поломки либо null.
 */
function playToWin(f: FractalPuzzle): string | null {
  const rootGrid = f.root.puzzle.map((r) => [...r]);

  for (const [i, ch] of f.children.entries()) {
    const given = ch.puzzle.map((row) => row.map((v) => v !== 0));
    const grid = ch.puzzle.map((r) => [...r]);
    const done = () => isUnlocked(grid, ch.solution, given, ch.unlockCells);
    for (let r = 0; r < N && !done(); r++) {
      for (let c = 0; c < N && !done(); c++) {
        if (given[r][c]) continue;
        grid[r][c] = ch.solution[r][c];
      }
    }
    if (!done()) return `дочерняя ${i}: порог ${ch.unlockCells} не берётся, дырок всего ${ch.blanks}`;
    const [rr, rc] = ch.feedsCell;
    rootGrid[rr][rc] = ch.solution[FEED_CELL[0]][FEED_CELL[1]];
  }

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) if (rootEditable(f.root.puzzle, r, c)) rootGrid[r][c] = f.root.solution[r][c];
  }
  if (!rootSolved(rootGrid, f.root.solution)) {
    const left = rootGrid.flat().filter((v, k) => v !== f.root.solution[(k / N) | 0][k % N]).length;
    return `корень не сошёлся: ${left} клеток некому заполнить`;
  }
  return null;
}

describe('каждый уровень доигрывается до победы, и решение одно', () => {
  it(`уровни ${LEVELS.join(', ')} по ${PER_LEVEL} раскладов`, () => {
    const bad: string[] = [];
    const tierHits: Record<number, { top: number; all: number }> = {};

    for (const level of LEVELS) {
      const cfg = fractalLevel(level);
      tierHits[level] = { top: 0, all: 0 };
      for (let n = 0; n < PER_LEVEL; n++) {
        const f = generateFractal(level);
        const tag = `L${level}#${n}`;

        // 1. Партия доигрывается. Прямой регресс на «0 побед из 30».
        const fail = playToWin(f);
        if (fail) bad.push(`${tag}: ${fail}`);

        // 2. В корне нет клеток, которые не заполнит никто.
        const dead = rootUnreachableCells(f.root.puzzle);
        if (dead.length) bad.push(`${tag}: в корне ${dead.length} мёртвых клеток`);

        // 3. Дочерние: одно решение, берётся логикой, не сложнее обещанного уровнем.
        for (const [i, ch] of f.children.entries()) {
          const sols = countSolutionsFast(flatten(ch.puzzle), 2);
          if (sols !== 1) bad.push(`${tag} дочерняя ${i}: решений ${sols}`);
          const g = logicSolve(flatten(ch.puzzle), cfg.tier);
          if (!g.solved) bad.push(`${tag} дочерняя ${i}: логикой уровня не берётся, только перебором`);
          if (ch.tier > cfg.tier) bad.push(`${tag} дочерняя ${i}: техника ${ch.tier} выше обещанной ${cfg.tier}`);
          if (ch.unlockCells > ch.blanks || ch.unlockCells < 1) {
            bad.push(`${tag} дочерняя ${i}: порог ${ch.unlockCells} при ${ch.blanks} дырках`);
          }
          tierHits[level].all++;
          if (ch.tier === cfg.tier) tierHits[level].top++;
        }

        // 4. Корень с девятью цифрами снизу — ровно одно решение (иначе подсказка врёт).
        const withFeeds = f.root.puzzle.map((r) => [...r]);
        for (const ch of f.children) {
          const [rr, rc] = ch.feedsCell;
          withFeeds[rr][rc] = ch.solution[FEED_CELL[0]][FEED_CELL[1]];
        }
        const rootSols = countSolutionsFast(flatten(withFeeds), 2);
        if (rootSols !== 1) bad.push(`${tag} корень с цифрами снизу: решений ${rootSols}`);

        // 5. …а БЕЗ них — неоднозначен. Иначе девять дочерних декорация: корень
        //    закрывался бы напрямую, и вся вложенность оказалась бы ни при чём.
        if (countSolutionsFast(flatten(f.root.puzzle), 2) < 2) {
          bad.push(`${tag}: корень решается без дочерних`);
        }
        if (!f.root.needsChildren) bad.push(`${tag}: движок сам признал корень независимым от дочерних`);
      }
    }

    expect(bad.slice(0, 12)).toEqual([]);
    expect(bad).toEqual([]);

    // Лестница техник не должна быть декоративной: на ступенях выше первой верхняя
    // техника обязана реально требоваться заметной доле сеток, иначе «уровень 20»
    // отличается от «уровня 7» только надписью.
    const lazy = LEVELS
      .filter((l) => fractalLevel(l).tier > 1)
      .filter((l) => tierHits[l].top / tierHits[l].all < 0.25)
      .map((l) => `уровень ${l}: верхняя техника нужна лишь в ${(100 * tierHits[l].top / tierHits[l].all).toFixed(0)}% сеток`);
    expect(lazy).toEqual([]);
  }, 600000);
});

describe('сверка чужими реализациями — чтобы движок не судил сам себя', () => {
  it('countSolutions ядра и gradePuzzle градатора согласны с быстрым решателем', () => {
    const bad: string[] = [];
    for (const level of [1, 10, 20, 30]) {
      for (let n = 0; n < 3; n++) {
        const f = generateFractal(level);
        for (const [i, ch] of f.children.entries()) {
          const mine = countSolutionsFast(flatten(ch.puzzle), 2);
          const house = houseSolutions(ch.puzzle);
          if (mine !== house) bad.push(`L${level}#${n} дочерняя ${i}: свой решатель ${mine}, ядро ${house}`);
          if (house !== 1) bad.push(`L${level}#${n} дочерняя ${i}: ядро насчитало ${house} решений`);
          const g = gradePuzzle(ch.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' });
          if (!g.solved) bad.push(`L${level}#${n} дочерняя ${i}: градатор не решил логикой`);
          // Градатор доводит доску до конца — она обязана совпасть с эталоном.
          if (g.grid && g.grid.some((row, r) => row.some((v, c) => v !== ch.solution[r][c]))) {
            bad.push(`L${level}#${n} дочерняя ${i}: градатор решил ЧУЖУЮ доску`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  }, 600000);

  it('быстрый решатель совпадает с ядром и на заведомо неоднозначных досках', () => {
    // ⚠️ САМАЯ ОПАСНАЯ ВЕТКА — «решений несколько». Совпадение только на единственных
    // решениях не доказывает ничего: решатель, который ВСЕГДА отвечает «одно», прошёл бы
    // такую сверку целиком. Поэтому здесь задание ломают снятием настоящих подсказок
    // (не пустых клеток — их в задании и так большинство) и требуют одинакового ответа
    // от обеих реализаций именно там, где решений стало много.
    //
    // Снимаем по нарастающей 1..4: после одной подсказки решений обычно два-три и
    // штатный перебор отвечает быстро, после четырёх — заметно больше.
    const bad: string[] = [];
    let ambiguous = 0;
    const f = generateFractal(10);
    for (const [i, ch] of f.children.entries()) {
      const clues: [number, number][] = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (ch.puzzle[r][c] !== 0) clues.push([r, c]);
      for (let k = 1; k <= 4; k++) {
        const holed = ch.puzzle.map((r) => [...r]);
        for (let j = 0; j < k; j++) holed[clues[j][0]][clues[j][1]] = 0;
        const mine = countSolutionsFast(flatten(holed), 2);
        const house = houseSolutions(holed);
        if (mine !== house) bad.push(`дочерняя ${i} −${k}: свой решатель ${mine}, ядро ${house}`);
        if (mine >= 2) ambiguous++;
      }
    }
    expect(bad).toEqual([]);
    // Без этого гейт был бы зелен вслепую: если снятие подсказок ничего не размножило,
    // сверять на «много решений» было не на чем.
    expect(ambiguous).toBeGreaterThanOrEqual(9);
  }, 300000);
});

describe('экран действительно даёт закрыть корень', () => {
  const src: string = readFileSync(join(__dirname, '../../app/games/sudoku-fractal.tsx'), 'utf8');

  it('в корне есть ввод: выбор клетки, клавиатура и победа по движку', () => {
    // Именно отсутствие этих трёх вещей и делало игру непроходимой: корень был
    // картинкой. Гейт держит их вместе — клавиатура без правила редактируемости
    // позволила бы вписать цифру в клетку, которую обязаны принести дочерние.
    expect(src).toContain('placeRootDigit');
    expect(src).toContain('renderPad(placeRootDigit)');
    expect(src).toContain('rootEditable');
    expect(src).toContain('rootSolved');
  });

  it('порог открытия берётся у самой сетки, а не из таблицы уровней', () => {
    // Число дырок теперь задаёт логика, и общий на всех порог мог бы оказаться выше
    // числа дырок конкретной сетки — она не открылась бы никогда.
    expect(src).toContain('unlockCells');
    expect(src).not.toMatch(/cfg\.unlockCells/);
  });
});

describe('генерация не вешает экран', () => {
  /**
   * ⚠️ МЕРИМ РАБОТУ, А НЕ ЧАСЫ. Здесь стояло «партия собирается быстрее полусекунды», и
   * 19.08 на общем прогоне это покраснело: на машине шли три тяжёлых набора разом (load
   * average 73), и та же партия тридцатого уровня заняла 1016 мс вместо 143 на свободной.
   * Часы в параллельном прогоне меряют ЗАГРУЗКУ МАШИНЫ, а не код — и гейт начинает врать
   * про регресс, которого нет. Та же ошибка, от которой лечили самурая: там генератор
   * обрывал выкалывание по gameNow(), и сложность зависела от быстродействия телефона.
   *
   * Прогон логического решателя — единица работы генератора: копание зовёт его на каждое
   * пробное снятие клетки. Потолок не с потолка: девять дочерних × 4 захода × 82 прогона
   * плюс корень (2 захода × 82) плюс страховочный проход — около 3200 по построению.
   * Замер 19.08: максимум 2874 на тридцатом уровне, 371 на первом.
   */
  it('партия стоит ограниченного числа прогонов решателя', () => {
    const over: string[] = [];
    const seen: string[] = [];
    for (const [level, cap] of [[1, 700], [15, 4000], [FRACTAL_MAX_LEVEL, 4000]] as [number, number][]) {
      let worst = 0;
      for (let i = 0; i < 5; i++) {
        resetLogicSolveCalls();
        const t = Date.now();
        generateFractal(level);
        const ms = Date.now() - t;
        const calls = logicSolveCalls();
        if (calls > worst) worst = calls;
        if (i === 0) seen.push(`L${level}: ${calls} прогонов, ${ms} мс`);
      }
      if (worst > cap) over.push(`уровень ${level}: ${worst} прогонов при потолке ${cap}`);
    }
    // Миллисекунды печатаем для человека, но НЕ утверждаем: см. шапку блока.
    console.log('стоимость партии —', seen.join('; '));
    expect(over).toEqual([]);
  }, 600000);

  it('счётчик работы живой — иначе потолок сторожит ноль', () => {
    // Гейт выше зелен вслепую, если счётчик всегда отдаёт ноль.
    resetLogicSolveCalls();
    expect(logicSolveCalls()).toBe(0);
    generateFractal(1);
    expect(logicSolveCalls()).toBeGreaterThan(100);
  }, 300000);
});
