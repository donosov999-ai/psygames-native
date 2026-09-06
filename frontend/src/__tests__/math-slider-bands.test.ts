/* __tests__/math-slider-bands · VER 1 · 07.09.2026 */
/**
 * СЛЕПОК ПОЛОС лестницы «Математической шкалы» — страж от МОЛЧАЛИВОГО сдвига.
 *
 * Замер 07.09.2026 (counting-chat/sim-slider.mjs, N=500/уровень): фактическая
 * лестница из 44 номеров — ШЕСТЬ ступеней работы, 38 из 43 переходов — клоны
 * (внутри полосы level генератором не используется вовсе), и она НЕ монотонна:
 * работа 2,1 (L1–10) → 4,0 (L11–20) → 3,1 (L21–28 — десятичные ЛЕГЧЕ умножения)
 * → 4,1 (L29–32) → 3,8 (L33–36) → 3,5 (L37+). Починка полос — отдельное
 * согласованное изменение; ЭТА проба лишь гарантирует, что границы семейств
 * не поедут тихо (при сознательной переделке слепок обновляется в том же
 * коммите, что и генератор).
 *
 * Проверяется ПОВЕДЕНИЕМ (генерация вопросов), не чтением исходника.
 */
import { generateMathSliderQuestions } from '@/src/games/math-slider/core/generator';

/** Какие семейства выражений отдаёт уровень (по 6 сидам × 12 вопросов). */
function kindsAt(level: number): Set<string> {
  const kinds = new Set<string>();
  for (let s = 0; s < 6; s++) {
    for (const q of generateMathSliderQuestions(`bands-${s}`, level, 12)) kinds.add(q.kind);
  }
  return kinds;
}

describe('полосы math-slider (слепок замера 07.09.2026)', () => {
  test('границы семейств выражений стоят там, где замерено', () => {
    const expectOnly = (level: number, kind: string) => {
      const k = kindsAt(level);
      expect({ level, kinds: [...k] }).toEqual({ level, kinds: [kind] });
    };
    expectOnly(1, 'integer-addition');
    expectOnly(5, 'integer-addition');
    expectOnly(6, 'signed-subtraction');
    expectOnly(10, 'signed-subtraction');
    expectOnly(11, 'mixed-small-multiplication');
    expectOnly(20, 'mixed-small-multiplication');
    expectOnly(21, 'decimal-arithmetic');
    expectOnly(24, 'decimal-arithmetic');
    expectOnly(25, 'percentage');
    expectOnly(28, 'percentage');
    expectOnly(29, 'discount');
    expectOnly(32, 'discount');
    expectOnly(33, 'proportion');
    expectOnly(36, 'proportion');
  });

  test('L37+ — микс четырёх поздних семейств, ранние (сложение/вычитание/умножение) не возвращаются', () => {
    const k = kindsAt(37);
    expect(k.size).toBeGreaterThanOrEqual(3);
    expect(k.has('integer-addition')).toBe(false);
    expect(k.has('signed-subtraction')).toBe(false);
    expect(k.has('mixed-small-multiplication')).toBe(false);
  });

  test('сид уровня детерминирован: тот же seed+level = те же вопросы (повтор уровня — не лотерея)', () => {
    const a = generateMathSliderQuestions('repeat-check', 7, 8).map((q) => q.answer);
    const b = generateMathSliderQuestions('repeat-check', 7, 8).map((q) => q.answer);
    expect(a).toEqual(b);
  });
});
