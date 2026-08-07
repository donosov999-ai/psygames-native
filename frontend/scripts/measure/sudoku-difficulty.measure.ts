import { levelConfig, generatePuzzle } from '@/src/services/sudoku-core';
import { gradePuzzle, generateLogical, targetTier } from '@/src/services/sudoku-grade';

// ЗАМЕР, А НЕ ТЕСТ. Печатает кривую сложности судоку по уровням.
//
// Лежит ВНЕ src/__tests__ намеренно: jest ловит тесты только из той папки, а этот
// прогон стоит ~5 минут на выборку — в CI-гейте ему делать нечего. Фоновый запуск
// с ним внутри набора стоил 2100 с против 14.7 с без него.
//
// Запуск вручную: npx jest --rootDir . scripts/measure/sudoku-difficulty.measure.ts
//   --testMatch "<rootDir>/scripts/measure/*.measure.ts" -t "НОВЫЙ"

const LEVELS = [8, 12, 19, 22, 26, 33, 37, 40, 45, 47];
const SAMPLES = 5;

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

describe('замер кривой сложности судоку', () => {
  jest.setTimeout(600_000);

  it('СТАРЫЙ путь: пустые клетки как мера сложности', () => {
    const rows: string[] = [];
    for (const lv of LEVELS) {
      const cfg = levelConfig(lv);
      const tiers: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const gen = generatePuzzle(cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant);
        const g = gradePuzzle(gen.puzzle, {
          N: cfg.N, BR: cfg.BR, BC: cfg.BC, variant: cfg.variant,
          regions: gen.regions, thermo: gen.thermo, arrow: gen.arrow,
          parity: gen.parity, kropki: gen.kropki,
        });
        tiers.push(g.tier);
      }
      rows.push(`L${String(lv).padStart(2)} ${cfg.variant.padEnd(11)} пустых=${cfg.blanks} → tier медиана ${median(tiers)}  [${tiers.join(',')}]`);
    }
    console.log('\n=== СТАРЫЙ путь ===\n' + rows.join('\n'));
    expect(rows.length).toBe(LEVELS.length);
  });

  it('НОВЫЙ путь: генерация от логики', () => {
    const rows: string[] = [];
    for (const lv of LEVELS) {
      const cfg = levelConfig(lv);
      const band = targetTier(lv);
      const tiers: number[] = []; const dugs: number[] = []; const ms: number[] = []; let fb = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = Date.now();
        const r = generateLogical(lv, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 2200 });
        ms.push(Date.now() - t0);
        tiers.push(r.grade.tier); dugs.push(r.dug); if (r.fellBack) fb++;
      }
      rows.push(`L${String(lv).padStart(2)} ${cfg.variant.padEnd(11)} цель ${band.min}..${band.max} → tier ${median(tiers)} [${tiers.join(',')}]  пустых ${median(dugs)}  ${median(ms)}мс${fb ? '  ОТКАТ×' + fb : ''}`);
    }
    console.log('\n=== НОВЫЙ путь ===\n' + rows.join('\n'));
    expect(rows.length).toBe(LEVELS.length);
  });
});
