/* psygames-sudoku-side-modes-gate · VER 1 · 27.08.2026 */
/**
 * МИНИ-ЛЕСТНИЦЫ РЕЖИМОВ (небоскрёбы, неравенства) ОБЕЩАЮТ ТОЛЬКО ДОСТИЖИМОЕ
 * И РАСТУТ МОНОТОННО.
 *
 * Философия та же, что у sudoku-tier-reachable и sudoku-ladder-monotonic:
 * достижимость ступени — величина вероятностная, поэтому генератор здесь
 * гоняется ТОЛЬКО как дым-проверка на рабочих точках, а сторожится УСТРОЙСТВО:
 *   · полоса каждой ступени не выше замеренного потолка варианта (4 — см.
 *     VARIANT_TIER_CEILING с распечатками замера 27.08.2026);
 *   · обещания не убывают от ступени к ступени (жалоба «на 40-м проще, чем на
 *     30-м» не должна повториться в миниатюре);
 *   · вторая ось (глубина у башен, доля знаков у неравенств) растёт НЕ строго,
 *     но и не падает — рост внутри плато 4..4 держится на ней.
 */
import { TOWERS_LADDER, UNEQUAL_LADDER, sideBoardForStep, sideStepCount } from '@/src/services/sudoku-modes';
import { markerDensity } from '@/src/services/sudoku-grade';

/** Потолок из распечатки замера 27.08.2026 — КОПИЯ, а не импорт (см. sudoku-tier-reachable). */
const MEASURED_SIDE_CEILING = 4;

describe('мини-лестницы режимов судоку', () => {
  it('есть что проверять — по 8 ступеней в обеих', () => {
    expect(sideStepCount('towers')).toBe(8);
    expect(sideStepCount('unequal')).toBe(8);
  });

  it('🔴 полосы не требуют больше замеренного потолка', () => {
    for (const [name, ladder] of [['towers', TOWERS_LADDER], ['unequal', UNEQUAL_LADDER]] as const) {
      ladder.forEach((s, i) => {
        expect(`${name}[${i + 1}] min=${s.band.min} ≤ ${MEASURED_SIDE_CEILING}`)
          .toBe(`${name}[${i + 1}] min=${Math.min(s.band.min, MEASURED_SIDE_CEILING)} ≤ ${MEASURED_SIDE_CEILING}`);
        expect(s.band.min).toBeLessThanOrEqual(s.band.max);
      });
    }
  });

  it('🔴 обещания монотонны, вторая ось не падает', () => {
    for (const ladder of [TOWERS_LADDER, UNEQUAL_LADDER]) {
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i].band.min).toBeGreaterThanOrEqual(ladder[i - 1].band.min);
        expect(ladder[i].band.max).toBeGreaterThanOrEqual(ladder[i - 1].band.max);
        expect(ladder[i].blanks).toBeGreaterThanOrEqual(ladder[i - 1].blanks);
      }
    }
    // Глубина башен растёт СТРОГО — на плато 4..4 это единственная ось.
    for (let i = 1; i < TOWERS_LADDER.length; i++) {
      expect(TOWERS_LADDER[i].blanks).toBeGreaterThan(TOWERS_LADDER[i - 1].blanks);
    }
    /**
     * Ось неравенств — ДВУХФАЗНАЯ (замер 27.08.2026, разбор в markerDensity):
     * вход в фазу цепочек — на самой щедрой доле (достижимость ступени растёт
     * со знаками), внутри плато 4..4 доля ПАДАЕТ (дефицит знаков усложняет при
     * той же ступени — как прореживание сэндвича). Сторожим обе фазы.
     */
    const dens = Array.from({ length: UNEQUAL_LADDER.length }, (_, i) => markerDensity(i + 1, 'unequal'));
    const chainFrom = UNEQUAL_LADDER.findIndex((s) => s.band.min >= 4);
    expect(chainFrom).toBeGreaterThan(0);                       // входные ступени есть
    expect(Math.max(...dens)).toBe(dens[chainFrom]);            // вход в цепочки — максимум знаков
    for (let i = chainFrom + 1; i < dens.length; i++) {
      expect(dens[i]).toBeLessThanOrEqual(dens[i - 1]);         // внутри плато — дефицит растёт
    }
    expect(dens[dens.length - 1]).toBeLessThan(dens[chainFrom]); // ось внутри плато живая
  });

  it('дым: башни выдают доску в полосе на первой и последней ступени', () => {
    for (const step of [1, 8]) {
      const b = sideBoardForStep('towers', step);
      expect(b.puzzle.length).toBe(6);
      expect(b.towers).toBeTruthy();
      // Полоса — обещание генератора; фолбэк допустим, но на 6×6 при 3–5 мс/доске
      // за полторы секунды попадание практически гарантировано. Если тут стало
      // красно — сломан сам генератор, а не не повезло.
      const band = TOWERS_LADDER[step - 1].band;
      expect(b.tier).not.toBeNull();
      expect(b.tier!).toBeGreaterThanOrEqual(band.min);
      expect(b.tier!).toBeLessThanOrEqual(band.max);
    }
  }, 120000);

  it('дым: неравенства выдают решаемую доску со знаками (ступень 1)', () => {
    const b = sideBoardForStep('unequal', 1);
    expect(b.puzzle.length).toBe(9);
    expect(b.unequal).toBeTruthy();
    // Знаки прорежены: показана малая доля из 144 граней, а не все.
    let signs = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (c < 8 && b.unequal!.h[r][c] !== 0) signs++;
      if (r < 8 && b.unequal!.v[r][c] !== 0) signs++;
    }
    expect(signs).toBeGreaterThan(0);
    expect(signs).toBeLessThan(72);   // ≤ половины граней — прореживание живое
  }, 120000);
});
