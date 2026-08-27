/* psygames-sudoku-variant-band · VER 1 · 27.08.2026 */
/**
 * ВАРИАНТНЫЙ ПОТОЛОК СТУПЕНИ — починка «объявленный пол недостижим» (01a3b47a).
 *
 * Замер 27.08.2026, свободные прогоны без полосы (бюджет 1100 мс):
 * у thermo тир 6 не встретился НИ РАЗУ на 30 досках (2×17·3×7·4×4·5×2), у
 * thermocage — ни разу на 15. Полоса 5..6/6..6 для них — лотерея с пустым
 * барабаном: генератор жёг бюджет (961 мс/доска) и отдавал что попало (3/20).
 * С честной полосой 4..5 — 15/20 при 193 мс.
 *
 * Гейт держит два инварианта: клэмп существует для обоих термо-вариантов и
 * НЕ трогает варианты, где верхние ступени реально достижимы.
 */
import { effectiveBand } from '../services/sudoku-grade';

describe('вариантный потолок ступени', () => {
  it('🔴 thermo и thermocage клэмпятся: запрошенная 5..6 становится 4..5', () => {
    for (const variant of ['thermo', 'thermocage'] as const) {
      expect(effectiveBand(variant, { min: 5, max: 6 })).toEqual({ min: 4, max: 5 });
      expect(effectiveBand(variant, { min: 6, max: 6 })).toEqual({ min: 4, max: 5 });
    }
  });

  it('узкая полоса ниже капа проходит нетронутой', () => {
    expect(effectiveBand('thermo' as never, { min: 2, max: 3 })).toEqual({ min: 2, max: 3 });
  });

  it('🔴 jigsaw после lift достигает шестёрки массово (12/20) — его потолок поднят, полоса цела', () => {
    expect(effectiveBand('jigsaw' as never, { min: 5, max: 6 })).toEqual({ min: 5, max: 6 });
  });

  it('классика без потолка проходит нетронутой', () => {
    expect(effectiveBand('none' as never, { min: 5, max: 6 })).toEqual({ min: 5, max: 6 });
  });

  it('🔴 sandwich и hyper клэмпятся своими потолками из замеров 26.08 (оба — 4)', () => {
    // Раньше их лотерею не ловили: старый механизм опускал только пол, max
    // оставался недостижимым. Теперь 5..6 честно складывается в 3..4.
    for (const variant of ['sandwich', 'hyper'] as const) {
      expect(effectiveBand(variant as never, { min: 5, max: 6 })).toEqual({ min: 3, max: 4 });
    }
  });
});
