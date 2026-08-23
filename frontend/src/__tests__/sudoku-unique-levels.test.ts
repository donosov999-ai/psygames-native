/**
 * Регресс-гейт на репорт Вали (ур. 30: «в текущем моменте несколько вариантов победы»).
 *
 * ЗАЧЕМ. Маркерные варианты (evenodd/kropki/sandwich) движок констрейнтом не enforces,
 * поэтому до v1.156 дырки копались без проверки уникальности: пазл имел 2+ базовых
 * решения, игрок ставил ВАЛИДНУЮ альтернативу, а сверка с зашитым solution засчитывала
 * ошибку. Проверено на 88 пазлах уровней 25-35 — чисто; здесь оставлен узкий срез,
 * чтобы гейт ловил регресс, но не растягивал прогон тестов (полный прогон ~285 с).
 */
import { levelConfig, dimsForSize, blanksFor, generatePuzzle, countSolutions, Overlays } from '@/src/services/sudoku-core';

/**
 * 🔴 ТРЕБОВАНИЕ УТОЧНЕНО 23.08.2026, И ЭТО НЕ ПОСЛАБЛЕНИЕ. Здесь стояло «решений по
 * БАЗОВОЙ судоку ровно одно» — потому что до этого дня движок оверлеев не знал вовсе,
 * и другого способа быть честным не было. Теперь `countSolutions` их знает, и точная
 * формулировка та же, что у игрока за экраном: единственно ли решение при базовых
 * правилах ПЛЮС тех подсказках, которые ему ПОКАЗАНЫ.
 *
 * Почему это не дыра. Второе базовое решение теперь существовать может, но оно обязано
 * нарушать видимую метку, точку или сумму — то есть человек, играющий по объявленным
 * правилам варианта, до него не дойдёт. Ставя цифру против показанной точки, он
 * нарушает правило так же, как нарушил бы ход коня в антиконе.
 *
 * ⚠️ И ровно тут прячется способ всё сломать: если копать одним набором подсказок, а
 * показать другой, доска снова станет неоднозначной ДЛЯ ЧЕЛОВЕКА — это и был исходный
 * репорт Вали. Поэтому проверка берёт `g.parity/g.kropki/g.sandwich`, то есть ровно то,
 * что генератор ОТДАЛ, а не строит свой набор.
 */
describe('sudoku: решение единственно на «тяжёлых» уровнях', () => {
  it('уровни 28-32, по 3 пазла — ни одного с 2+ решениями', () => {
    const bad: string[] = [];
    for (let level = 28; level <= 32; level++) {
      const cfg: any = levelConfig(level);
      const d = dimsForSize(cfg.size);
      const blanks = blanksFor(cfg.size, cfg.diff);
      for (let i = 0; i < 3; i++) {
        const g = generatePuzzle(blanks, d.N, d.BR, d.BC, cfg.variant);
        const ov: Overlays = { parity: g.parity, kropki: g.kropki, sandwich: g.sandwich };
        const n = countSolutions(g.puzzle.map((r: number[]) => [...r]), d.N, d.BR, d.BC,
          cfg.variant, g.regions, 2, { steps: 200000 }, g.thermo, g.arrow, undefined, ov);
        if (n !== 1) bad.push(`L${level} ${cfg.variant} → решений ${n}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300000);

  it('🔴 у вариантов БЕЗ оверлеев требование прежнее — единственность по самой доске', () => {
    // Диагональ, антиконь, гипер, несоседние: подсказок-оверлеев у них нет вовсе,
    // поэтому послабление выше их не касается и касаться не должно.
    const bad: string[] = [];
    for (const level of [11, 15, 19, 23]) {
      const cfg: any = levelConfig(level);
      const d = dimsForSize(cfg.size);
      for (let i = 0; i < 2; i++) {
        const g = generatePuzzle(blanksFor(cfg.size, cfg.diff), d.N, d.BR, d.BC, cfg.variant);
        expect(g.parity).toBeUndefined();
        expect(g.kropki).toBeUndefined();
        expect(g.sandwich).toBeUndefined();
        const n = countSolutions(g.puzzle.map((r: number[]) => [...r]), d.N, d.BR, d.BC,
          cfg.variant, g.regions, 2, { steps: 200000 }, g.thermo, g.arrow);
        if (n !== 1) bad.push(`L${level} ${cfg.variant} → решений ${n}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300000);
});
