/* psygames-sudoku-schrodinger-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * КЛЕТКИ ШРЁДИНГЕРА ЗАСЛУЖИВАЮТ СВОЁ ИМЯ (пункт 13 цепочки «14 усложнений», задача f46c796c).
 *
 * Цифры 0–9: в каждой строке, столбце и блоке каждая по разу; ровно одна клетка ряда — с двумя
 * цифрами, где она — выводит игрок. Гейт держит:
 *   · код клетки: пусто и «ноль» различаются, пара — по возрастанию;
 *   · сетка генератора честная: в каждом ряду десять цифр по разу и ровно одна пара;
 *   · задача единственна перебором; пустая доска — нет;
 *   · мера (только вынужденные шаги) доходит до той же сетки; без выводов про пару (потолок 3) —
 *     не доходит ни одна: правило работает на каждой доске, а не только видом.
 * 📍 Замер 07.10 (12 досок): единственны 12/12; ≈25 клеток-подсказок, из них ≈4 пары (5 из 9
 *    клеток Шрёдингера прячутся); шагов ≈56, из них про пары ≈5; 16 мс на доску. Скрипт —
 *    ~/dev/psygames/sudoku-chat/measure/schrodinger-measure-20261007.test.ts.
 */
import { countS, decodeGridS, decodeS, emptyS, encodeS, logicS, sameS } from '@/src/services/sudoku-schrodinger';
import { generateLogical, gradeSchrodinger } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('Шрёдингер: код клетки', () => {
  it('пусто и «ноль» различаются; пара — по возрастанию; код обратим', () => {
    expect(encodeS([])).toBe(0);
    expect(encodeS([0])).toBe(1);
    expect(encodeS([9])).toBe(10);
    expect(encodeS([7, 2])).toBe(127);
    expect(encodeS([0, 9])).toBe(109);
    for (const ds of [[], [0], [5], [9], [0, 1], [3, 8], [8, 9]]) expect(decodeS(encodeS(ds))).toEqual(ds);
  });
});

describe('🔴 Шрёдингер на досках генератора', () => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(145));
  const built = Array.from({ length: 4 }, () => generateLogical(145, 81, 9, 3, 3, 'schrodinger', {}));
  spy.mockRestore();

  it('сетка честная: в каждой строке, столбце и блоке десять цифр по разу и ровно одна пара', () => {
    for (const b of built) {
      const sol = decodeGridS(b.gen.solution);
      const units: [number, number][][] = [];
      for (let i = 0; i < 9; i++) {
        units.push(Array.from({ length: 9 }, (_, j) => [i, j] as [number, number]));
        units.push(Array.from({ length: 9 }, (_, j) => [j, i] as [number, number]));
        units.push(Array.from({ length: 9 }, (_, j) => [Math.floor(i / 3) * 3 + Math.floor(j / 3), (i % 3) * 3 + (j % 3)] as [number, number]));
      }
      for (const u of units) {
        const ds = u.flatMap(([r, c]) => sol[r][c]).sort((x, y) => x - y);
        expect(ds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(u.filter(([r, c]) => sol[r][c].length === 2)).toHaveLength(1);
      }
    }
  });

  it('задача единственна перебором; пустая доска — нет', () => {
    for (const b of built) expect(countS(decodeGridS(b.gen.puzzle), 2, { steps: 500000 })).toBe(1);
    expect(countS(emptyS(), 2)).toBe(2);
  });

  it('мера доходит до той же сетки; не все клетки Шрёдингера показаны', () => {
    for (const b of built) {
      const g = gradeSchrodinger(b.gen.puzzle);
      expect(g.solved).toBe(true);
      expect(g.grid).toEqual(b.gen.solution);
      expect(sameS(logicS(decodeGridS(b.gen.puzzle)).grid!, decodeGridS(b.gen.solution))).toBe(true);
      const shownPairs = b.gen.puzzle.flat().filter((v) => v >= 100).length;
      expect(shownPairs).toBeLessThan(9);
    }
  });

  it('🔴 без выводов про пару (потолок 3) не решается ни одна доска', () => {
    for (const b of built) {
      expect(gradeSchrodinger(b.gen.puzzle).tier).toBe(4);
      expect(gradeSchrodinger(b.gen.puzzle, 3).solved).toBe(false);
    }
  });
});
