/**
 * Регресс-гейт на репорт Вали (ур. 30: «в текущем моменте несколько вариантов победы»).
 *
 * ЗАЧЕМ. Маркерные варианты (evenodd/kropki/sandwich) движок констрейнтом не enforces,
 * поэтому до v1.156 дырки копались без проверки уникальности: пазл имел 2+ базовых
 * решения, игрок ставил ВАЛИДНУЮ альтернативу, а сверка с зашитым solution засчитывала
 * ошибку. Проверено на 88 пазлах уровней 25-35 — чисто; здесь оставлен узкий срез,
 * чтобы гейт ловил регресс, но не растягивал прогон тестов (полный прогон ~285 с).
 */
import { levelConfig, dimsForSize, blanksFor, generatePuzzle, countSolutions } from '@/src/services/sudoku-core';

describe('sudoku: решение единственно на «тяжёлых» уровнях', () => {
  it('уровни 28-32, по 3 пазла — ни одного с 2+ решениями', () => {
    const bad: string[] = [];
    for (let level = 28; level <= 32; level++) {
      const cfg: any = levelConfig(level);
      const d = dimsForSize(cfg.size);
      const blanks = blanksFor(cfg.size, cfg.diff);
      for (let i = 0; i < 3; i++) {
        const g = generatePuzzle(blanks, d.N, d.BR, d.BC, cfg.variant);
        const n = countSolutions(g.puzzle.map((r: number[]) => [...r]), d.N, d.BR, d.BC,
          cfg.variant, g.regions, 2, { steps: 200000 }, g.thermo, g.arrow);
        if (n !== 1) bad.push(`L${level} ${cfg.variant} → решений ${n}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300000);
});
