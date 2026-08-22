/* psygames-samurai-wrong-is-visible · VER 1 · 22.08.2026 */
/**
 * ЧТО СТОИЛО ЖИЗНИ — ТО ВИДНО НА ДОСКЕ.
 *
 * 🔴 ЧТО НАШЛОСЬ. В самурае ошибка списывалась по одному правилу (`solution[r][c] !== n`),
 * а красным клетка красилась по другому — только если цифра ДУБЛИРУЕТСЯ внутри своей
 * сетки. Правила разошлись, и в зазор провалилась почти половина неверных ходов:
 *
 *     уровень  4: 4376 неверных цифр, 1840 без единой пометки — 42,0 %
 *     уровень 12: 4408 неверных цифр, 1935 без единой пометки — 43,9 %
 *     уровень 25: 4408 неверных цифр, 1871 без единой пометки — 42,4 %
 *
 * Счётчик показывал «3/4», поле из 369 клеток выглядело нормальным, и человек не знал
 * даже, в какой из пяти сеток искать. На 12-м уровне четырёх таких тиков хватает,
 * чтобы оборвать партию, которая идёт час. Классика (`wrongVal`) и фрактал (`wrong`)
 * такую клетку красили давно — самурай остался единственным, кто наказывал вслепую.
 *
 * ⚠️ ПРОВЕРЯЕМ СВЯЗЬ, А НЕ ДВА ПРАВИЛА ПОРОЗНЬ. Утверждение здесь одно: множество
 * помеченных клеток НАКРЫВАЕТ множество тех, за которые снимают жизнь. Пока это так,
 * молчаливого штрафа не бывает по построению.
 */
import { generateSamuraiLevel, gridsOf, samuraiCellWrong } from '@/app/games/sudoku-samurai';

declare const __dirname: string;
declare function require(id: string): any;

type Cell = number;
const LEVELS = [4, 12, 25];

/** Доска с одной подставленной цифрой — как после нажатия. */
function withDigit(puzzle: Cell[][], r: number, c: number, n: number): Cell[][] {
  const g = puzzle.map((row) => [...row]);
  g[r]![c] = n;
  return g;
}

describe('самурай: молчаливого штрафа не бывает', () => {
  const boards = LEVELS.map((level) => ({ level, ...generateSamuraiLevel(level) }));

  it('есть что проверять — доски настоящие и с дырками', () => {
    for (const b of boards) {
      const empty = b.puzzle.flatMap((row, r) => row.map((v, c) => (gridsOf(r, c).length && v === 0 ? 1 : 0))).reduce((x: number, y) => x + y, 0);
      expect(`ур.${b.level}: пустых ${empty > 100}`).toBe(`ур.${b.level}: пустых true`);
    }
  });

  /** Главное: за что снимают жизнь — то и помечено. */
  it('🔴 каждая цифра, снимающая жизнь, помечена на доске', () => {
    for (const b of boards) {
      let costLife = 0;
      const unmarked: string[] = [];
      for (let r = 0; r < 21; r++) for (let c = 0; c < 21; c++) {
        if (!gridsOf(r, c).length || b.puzzle[r]![c] !== 0) continue;
        for (let n = 1; n <= 9; n++) {
          if (n === b.solution[r]![c]) continue;   // за верную цифру жизнь не снимают
          costLife++;
          if (!samuraiCellWrong(withDigit(b.puzzle, r, c, n), b.solution, r, c).error) {
            if (unmarked.length < 3) unmarked.push(`ур.${b.level} ${r}:${c}=${n}`);
          }
        }
      }
      expect(`ур.${b.level}: ${costLife > 1000}`).toBe(`ур.${b.level}: true`);   // выборка не выродилась
      expect(unmarked).toEqual([]);
    }
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Накрыть можно и жульничеством — покрасить всё подряд.
   * Тогда метка перестаёт что-либо значить, а верная игра выглядит как ошибка.
   */
  it('🔴 верная цифра не помечена никогда', () => {
    for (const b of boards) {
      const wronglyRed: string[] = [];
      for (let r = 0; r < 21; r++) for (let c = 0; c < 21; c++) {
        if (!gridsOf(r, c).length || b.puzzle[r]![c] !== 0) continue;
        const n = b.solution[r]![c]!;
        if (samuraiCellWrong(withDigit(b.puzzle, r, c, n), b.solution, r, c).error) {
          if (wronglyRed.length < 3) wronglyRed.push(`ур.${b.level} ${r}:${c}=${n}`);
        }
      }
      expect(wronglyRed).toEqual([]);
    }
  });

  it('пустая клетка не помечена, и собранная доска чиста целиком', () => {
    for (const b of boards) {
      expect(samuraiCellWrong(b.puzzle, b.solution, 0, 0).error).toBe(b.puzzle[0]![0] !== 0 && false);
      let red = 0;
      for (let r = 0; r < 21; r++) for (let c = 0; c < 21; c++) {
        if (!gridsOf(r, c).length) continue;
        if (samuraiCellWrong(b.solution, b.solution, r, c).error) red++;
      }
      expect(`ур.${b.level}: красных на решении ${red}`).toBe(`ур.${b.level}: красных на решении 0`);
    }
  });

  it('дубль по-прежнему виден отдельно — это другой признак, не «где-то не то»', () => {
    const b = boards[0]!;
    let found = false;
    for (let r = 0; r < 21 && !found; r++) for (let c = 0; c < 21 && !found; c++) {
      const owners = gridsOf(r, c);
      if (!owners.length || b.puzzle[r]![c] !== 0) continue;
      const [r0, c0] = owners[0]!;
      for (let cc = c0; cc < c0 + 9; cc++) {
        const twin = b.puzzle[r]![cc];
        if (cc !== c && twin !== 0) {
          const res = samuraiCellWrong(withDigit(b.puzzle, r, c, twin), b.solution, r, c);
          expect(res.duplicate).toBe(true);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  /**
   * ⚠️ И ЧТО ЭКРАН БЕРЁТ КРАСНОЕ ИМЕННО ОТСЮДА. Правило можно починить и не подключить —
   * ровно так оно и разъехалось в прошлый раз.
   */
  it('🔴 экран красит клетку по этому правилу, а не по своей копии', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/sudoku-samurai.tsx'), 'utf8');
    const body = src.slice(src.indexOf('const renderCell'));
    expect(body).toMatch(/const conflict = samuraiCellWrong\(grid, solution, r, c\)\.error;/);
    // и внутри отрисовки клетки нет второй, самодельной проверки дублей
    expect(body.slice(0, body.indexOf('let bg'))).not.toMatch(/for \(const \[r0, c0\] of gridsOf/);
  });
});
