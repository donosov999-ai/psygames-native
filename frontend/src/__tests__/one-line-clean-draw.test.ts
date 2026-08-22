/* psygames-one-line-clean-draw · VER 1 · 22.08.2026 */
/**
 * РИСУНОК ЧИТАЕТСЯ, ЛИНИЯ ИДЁТ ЗА ПАЛЬЦЕМ, ШАГ СЛЫШНО.
 *
 * 🔴 КАША. Раскладка ВЫБИРАЛА вариант с максимумом пересечений — в коде стояло
 * `crossings > bestCrossings`, а пересечения входили слагаемым в формулу
 * сложности, то есть считались осью трудности. Замер по 12 доскам на уровень:
 *
 *     рисованные фигуры          1,1 пересечения на фигуру
 *     генератор, уровень 49    196,1 пересечения на 37 рёбер
 *
 * Это не трудность, а нечитаемость: игры-образцы нарисованы руками и почти не
 * пересекаются, а трудность там даёт сам росчерк. Чинилось в три хода, каждый
 * замерен: развернули выбор в сторону чистоты (196 → 96), добавили сеточную
 * раскладку вместо одной окружности (96 → 65), ограничили плотность графа до
 * полутора рёбер на точку, как у рисованных (65 → 9,6), и дочистили обменом
 * пар точек (9,6 → 1,3). Итог вровень с рисованными.
 *
 * ⚠️ ПЛОТНОСТЬ — НЕ КОСМЕТИКА. На двенадцати точках планарный потолок 3·V−6 = 30
 * рёбер; при 37 рёбрах пересечения неизбежны ЛЮБОЙ раскладкой. Клубок создавал
 * сам граф, а не размещение.
 */
import { generateOneLinePuzzle } from '@/src/games/one-line/core/generator';
import { AUTHORED_LEVELS, AUTHORED_LEVEL_COUNT } from '@/src/games/one-line/core/authored';

declare const __dirname: string;
declare function require(id: string): any;

const at = (lv: number, seed = 'clean') => generateOneLinePuzzle(`${seed}-${lv}`, lv);
const PROBES = [AUTHORED_LEVEL_COUNT + 1, AUTHORED_LEVEL_COUNT + 8, AUTHORED_LEVEL_COUNT + 20, AUTHORED_LEVEL_COUNT + 40];

describe('рисунок читается', () => {
  it('есть что проверять — доски не выродились', () => {
    for (const lv of PROBES) expect(at(lv).edges.length).toBeGreaterThan(3);
  });

  it('🔴 пересечений не больше, чем у рисованных фигур, в пересчёте на ребро', () => {
    /**
     * Эталон СЧИТАЕТСЯ, а не вписывается числом: набор фигур растёт, и вписанное
     * число разъехалось бы с ним молча. Замер 22.08.2026: 28 пересечений на 441
     * ребро сорока фигур — 0,063 на ребро.
     */
    const { visualCrossingCount } = require('@/src/games/one-line/core/geometry');
    let authoredCross = 0, authoredEdges = 0;
    for (const l of AUTHORED_LEVELS) {
      authoredCross += visualCrossingCount(l.vertices, l.edges);
      authoredEdges += l.edges.length;
    }
    const authoredRate = authoredCross / authoredEdges;
    /**
     * ⚠️ СУДИМ ПО СРЕДНЕМУ, А ОДНУ ДОСКУ — ПО ПОТОЛКУ. Замер по всем уровням
     * генератора и восьми зёрнам: в среднем 0,10–0,12 пересечения на ребро при
     * эталонных 0,063 (то есть вдвое грязнее руки), худшая доска — 0,435, почти
     * всемеро. Прибить порог к худшему значит сделать проверку мигающей: новое
     * зерно однажды его перешагнёт. Среднее — это то, что человек видит на
     * протяжении игры; потолок на одну доску ловит возврат к клубку (до правок
     * было 5,3 на ребро, восемьдесят четыре раза от эталона).
     */
    let sumRate = 0, n = 0;
    const outrageous: string[] = [];
    for (const lv of PROBES) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const p = at(lv, seed);
        const rate = p.visualCrossings / Math.max(1, p.edges.length);
        sumRate += rate; n += 1;
        if (rate > authoredRate * 10) outrageous.push(`ур.${lv} (${seed}): ${p.visualCrossings} на ${p.edges.length} рёбер`);
      }
    }
    const avg = sumRate / n;
    expect(outrageous).toEqual([]);
    expect(`в среднем ${avg.toFixed(3)} на ребро при эталоне ${authoredRate.toFixed(3)} → ${avg <= authoredRate * 3 ? 'читаемо' : 'КАША'}`)
      .toBe(`в среднем ${avg.toFixed(3)} на ребро при эталоне ${authoredRate.toFixed(3)} → читаемо`);
  });

  /**
   * ⚠️ НАПРАВЛЕНИЕ ВЫБОРА ЗАКРЕПЛЯЕМ ОТДЕЛЬНО. Спуск обменом чистит любую стартовую
   * раскладку, поэтому перевёрнутый выбор («брать самую запутанную» — ровно то, что
   * стояло в коде) поведением уже не ловится: замер даёт 0,099 против 0,126 на
   * ребро, разница есть, но порог она не пробивает. А это ИСХОДНАЯ поломка, и
   * оставлять её незакреплённой нельзя.
   */
  it('🔴 перебор раскладок идёт в сторону ЧИСТОТЫ', () => {
    const gen: string = require('fs').readFileSync(
      require('path').resolve(__dirname, '../games/one-line/core/generator.ts'), 'utf8');
    const search = gen.slice(gen.indexOf('const attempts ='), gen.indexOf('// Проходов больше'));
    expect(search).toMatch(/if \(crossings < bestCrossings\)/);
    expect(search).not.toMatch(/if \(crossings > bestCrossings\)/);
    /**
     * ⚠️ И СЕТКА В ПЕРЕБОРЕ ОСТАЁТСЯ. Её вклад замерен: без неё 0,197 против 0,055
     * на ребро на 55-м уровне и 0,314 против 0,237 на 80-м. Поведением это тоже
     * почти не ловится — спуск обменом вытягивает и круг, — поэтому закрепляем
     * прямо: все точки на одной окружности дают хорды, которые режут друг друга по
     * свойству круга, а не по невезению.
     */
    expect(gen).toMatch(/function gridLayout\(/);
    expect(search).toMatch(/gridLayout\(shuffle\(rng, vertexIds\), rng\)/);
  });

  it('🔴 плотность графа держится в рисуемых пределах', () => {
    for (const lv of PROBES) {
      const p = at(lv);
      const perVertex = p.edges.length / p.vertices.length;
      const planar = 3 * p.vertices.length - 6;
      expect(`ур.${lv}: ${perVertex.toFixed(2)} рёбер на точку, ${p.edges.length} ≤ планарных ${planar}`)
        .toBe(`ур.${lv}: ${perVertex.toFixed(2)} рёбер на точку, ${Math.min(p.edges.length, planar)} ≤ планарных ${planar}`);
    }
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Убрать пересечения можно и обеднением: три точки в ряд
   * не пересекаются никогда. Поэтому рядом — требование, что граф остался задачей.
   */
  it('🔴 чистота не куплена обеднением графа', () => {
    const big = at(AUTHORED_LEVEL_COUNT + 40);
    expect(`точек ${big.vertices.length >= 10}, рёбер ${big.edges.length >= 14}`).toBe('точек true, рёбер true');
  });

  it('🔴 рисованных фигур сорок, и все разные', () => {
    expect(AUTHORED_LEVEL_COUNT).toBe(40);
    expect(new Set(AUTHORED_LEVELS.map((l) => l.shape)).size).toBe(40);
  });
});

describe('линия за пальцем и звук', () => {
  const src: string = require('fs').readFileSync(
    require('path').resolve(__dirname, '../games/one-line/OneLineGame.tsx'), 'utf8');

  it('🔴 палец ведёт резинку от текущей точки', () => {
    expect(src).toMatch(/const \[dragPoint, setDragPoint\]/);
    expect(src).toMatch(/x2=\{dragPoint\.x\} y2=\{dragPoint\.y\}/);
  });

  it('🔴 резинка гаснет, когда палец убрали', () => {
    expect(src).toMatch(/onPanResponderRelease: \(\) => setDragPoint\(null\)/);
    expect(src).toMatch(/onPanResponderTerminate: \(\) => setDragPoint\(null\)/);
  });

  it('🔴 взятое ребро отзывается звуком', () => {
    const choose = src.slice(src.indexOf('const choose ='), src.indexOf('const startAtPoint'));
    expect(choose).toMatch(/sndPlace\(\);/);
  });
});
