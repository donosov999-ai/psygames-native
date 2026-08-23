/**
 * ОВЕРЛЕИ УЧАСТВУЮТ В ПРОВЕРКЕ ЕДИНСТВЕННОСТИ — И ТЕ ЖЕ, ЧТО ВИДИТ ИГРОК.
 *
 * Что было (`TODO(unique)`, снят 23.08.2026). Метки чётности, точки кропки и суммы
 * сэндвича показываются игроку, но движок про них не знал: единственность считалась по
 * БАЗОВОЙ судоку, подсказка отдавалась даром и не могла оправдать снятие лишней цифры.
 * А/Б на одних решениях и одном порядке копания, по 6 досок:
 *   чётность 56,0 → 66,7 пустых · кропки 56,0 → 70,0 · сэндвич 56,2 → 67,0
 *
 * 🔴 ПЕРВАЯ ПОПЫТКА ЭТОЙ ПРАВКИ ВЕРНУЛА БАГ ВАЛИ, и это главное, что тут сторожится.
 * Копали ПОЛНЫМ набором меток, а `thinMarkers` прятал часть ПОСЛЕ — доска выходила
 * единственной для движка и неоднозначной для человека. Гейт `sudoku-unique-levels`
 * выдал «L30 evenodd → решений 2». Правка откачена и переделана: прореживание уходит
 * ВНУТРЬ генератора (`overlayThinner`), копание и показ идут одним набором.
 */
import {
  Cell, Overlays, levelConfig, generatePuzzle, solve, countSolutions,
  overlayOk, overlaysFromSolution, shuffle,
} from '@/src/services/sudoku-core';
import { logicalBuilder, overlayThinner } from '@/src/services/sudoku-grade';

const LEVELS: [number, string][] = [[31, 'evenodd'], [35, 'kropki'], [39, 'sandwich']];

describe('оверлеи и единственность', () => {
  it('🔴 ДОСКА БОЕВОГО ПУТИ однозначна с ПРОРЕЖЁННЫМИ подсказками', () => {
    // Самая важная проверка файла: именно тут ломалась первая редакция.
    for (const [L] of LEVELS) {
      const cfg = levelConfig(L);
      for (let i = 0; i < 3; i++) {
        const b = logicalBuilder(L, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 30000 });
        let made: ReturnType<typeof b.step> | null = null;
        for (let s = 0; s < b.steps; s++) { made = b.step(); if (b.enough(made)) break; }
        if (!made) continue;
        const g = made.gen;
        const ov: Overlays = { parity: g.parity, kropki: g.kropki, sandwich: g.sandwich };
        const n = countSolutions(g.puzzle.map((r) => [...r]), cfg.N, cfg.BR, cfg.BC,
          cfg.variant, g.regions, 2, { steps: 400000 }, g.thermo, g.arrow, undefined, ov);
        expect(`L${L} решений ${n}`).toBe(`L${L} решений 1`);
      }
    }
  }, 600000);

  it('🔴 generatePuzzle: доска однозначна ТЕМ ЖЕ набором, что она отдала', () => {
    /**
     * ⚠️ ЭТА ПРОВЕРКА ПОЯВИЛАСЬ ПОТОМУ, ЧТО МУТАЦИЯ «копаем полными, показываем
     * прорежённые» ОСТАЛАСЬ ЗЕЛЁНОЙ на 9 проверках из 9. Остальные её не видят:
     * боевой путь на этих уровнях идёт через `digByLogic` (у него свои оверлеи), а
     * «решение проходит свои подсказки» не ловит вовсе — прореживание только СНИМАЕТ
     * ограничения, поэтому решение их проходит при любом наборе.
     * Ловится единственным способом: взять то, что отдала `generatePuzzle`, и
     * пересчитать решения ИМЕННО ТЕМ набором подсказок, который она вернула.
     */
    for (const [L] of LEVELS) {
      const cfg = levelConfig(L);
      for (let i = 0; i < 3; i++) {
        const g = generatePuzzle(cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, overlayThinner(L, cfg.variant, cfg.N));
        const ov: Overlays = { parity: g.parity, kropki: g.kropki, sandwich: g.sandwich };
        const n = countSolutions(g.puzzle.map((r) => [...r]), cfg.N, cfg.BR, cfg.BC,
          cfg.variant, g.regions, 2, { steps: 400000 }, g.thermo, g.arrow, undefined, ov);
        expect(`L${L} решений ${n}`).toBe(`L${L} решений 1`);
      }
    }
  }, 600000);

  it('🔴 прорежённый набор — ПОДМНОЖЕСТВО полного, а не другой набор', () => {
    for (const [L] of LEVELS) {
      const cfg = levelConfig(L);
      const sol: Cell[][] = Array.from({ length: cfg.N }, () => Array(cfg.N).fill(0));
      solve(sol, cfg.N, cfg.BR, cfg.BC, cfg.variant);
      const full = overlaysFromSolution(sol, cfg.N, cfg.variant);
      const thin = overlayThinner(L, cfg.variant, cfg.N)(full);
      if (full.parity && thin.parity) for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) {
        if (thin.parity[r][c] !== 0) expect(thin.parity[r][c]).toBe(full.parity[r][c]);   // не выдумано
      }
      if (full.kropki && thin.kropki) for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) {
        if (thin.kropki.h[r][c] !== 0) expect(thin.kropki.h[r][c]).toBe(full.kropki.h[r][c]);
        if (thin.kropki.v[r][c] !== 0) expect(thin.kropki.v[r][c]).toBe(full.kropki.v[r][c]);
      }
    }
  });

  it('🔴 решение проходит СВОИ ЖЕ подсказки в каждой клетке', () => {
    for (const [L] of LEVELS) {
      const cfg = levelConfig(L);
      const g = generatePuzzle(cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, overlayThinner(L, cfg.variant, cfg.N));
      const ov: Overlays = { parity: g.parity, kropki: g.kropki, sandwich: g.sandwich };
      for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) {
        const v = g.solution[r][c];
        g.solution[r][c] = 0;
        const ok = overlayOk(g.solution, r, c, v, cfg.N, ov);
        g.solution[r][c] = v;
        expect(ok).toBe(true);
      }
    }
  }, 120000);

  it('🔴 НЕПОКАЗАННАЯ точка ничего не запрещает — иначе проверка ложно-строгая', () => {
    const grid: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][1] = 6;
    const zeros = () => Array.from({ length: 9 }, () => Array(9).fill(0));
    const hidden: Overlays = { kropki: { h: zeros(), v: zeros() } };
    expect(overlayOk(grid, 0, 0, 3, 9, hidden)).toBe(true);   // связь 3–6 есть, точки нет → молчим
    const shownBlack = { kropki: { h: zeros(), v: zeros() } };
    shownBlack.kropki.h[0][0] = 2;
    expect(overlayOk(grid, 0, 0, 3, 9, shownBlack)).toBe(true);
    expect(overlayOk(grid, 0, 0, 4, 9, shownBlack)).toBe(false);
  });

  it('🔴 СПРЯТАННАЯ сумма сэндвича (-1) ничего не запрещает', () => {
    const grid: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][0] = 1; grid[0][1] = 3; grid[0][3] = 9;
    const shown: Overlays = { sandwich: { rows: Array(9).fill(-1), cols: Array(9).fill(-1) } };
    expect(overlayOk(grid, 0, 2, 5, 9, shown)).toBe(true);    // сумма спрятана → не подсказка
    shown.sandwich!.rows[0] = 7;
    expect(overlayOk(grid, 0, 2, 4, 9, shown)).toBe(true);    // 3+4=7 ✓
    expect(overlayOk(grid, 0, 2, 5, 9, shown)).toBe(false);   // 3+5=8 ✗
  });

  it('🔴 чётность запрещает ровно помеченное и молчит там, где метки нет', () => {
    const grid: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const parity = Array.from({ length: 9 }, () => Array(9).fill(0));
    parity[2][2] = 1; parity[3][3] = 2;
    const ov: Overlays = { parity };
    expect(overlayOk(grid, 2, 2, 4, 9, ov)).toBe(true);
    expect(overlayOk(grid, 2, 2, 5, 9, ov)).toBe(false);
    expect(overlayOk(grid, 3, 3, 5, 9, ov)).toBe(true);
    expect(overlayOk(grid, 8, 8, 5, 9, ov)).toBe(true);
  });

  it('🔴 со сведениями об оверлеях копается ГЛУБЖЕ — на одних досках и одном порядке', () => {
    for (const [L] of LEVELS) {
      const cfg = levelConfig(L);
      const dig = (sol: Cell[][], ov: Overlays | undefined, order: number[]) => {
        const puz = sol.map((r) => [...r]);
        let dug = 0;
        for (const p of order) {
          if (dug >= 70) break;
          const r = Math.floor(p / cfg.N), c = p % cfg.N, keep = puz[r][c];
          puz[r][c] = 0;
          if (countSolutions(puz, cfg.N, cfg.BR, cfg.BC, cfg.variant, undefined, 2, { steps: 8000 }, undefined, undefined, undefined, ov) !== 1) puz[r][c] = keep;
          else dug++;
        }
        return dug;
      };
      let deeper = 0;
      for (let i = 0; i < 3; i++) {
        const sol: Cell[][] = Array.from({ length: cfg.N }, () => Array(cfg.N).fill(0));
        solve(sol, cfg.N, cfg.BR, cfg.BC, cfg.variant);
        const ov = overlaysFromSolution(sol, cfg.N, cfg.variant);
        const order = shuffle(Array.from({ length: cfg.N * cfg.N }, (_, k) => k));
        if (dig(sol, ov, order) > dig(sol, undefined, order)) deeper++;
      }
      expect(deeper).toBe(3);   // прирост замерен в +10,7…+14,0 клеток
    }
  }, 600000);
});
