/* __tests__/ospan-ladder · VER 1 · 07.09.2026 */
/**
 * ГЕЙТ лестницы OSPAN v2 (07.09.2026). Замер ДО (counting-chat, прямой расчёт
 * формул v1): обрыв ×1,59 на L5→L6 (рубильник hardMath: треть пула — умножение
 * и числа 9→12 разом) и КЛОНЫ с L13 (обе формулы замирали: letterMs floor 600
 * на L13, setSize cap ещё раньше). v2: нагрузка mathLoad растёт плавно до L16+,
 * letterMs до L16; умножение ПОЯВЛЯЕТСЯ ровно с L6 (порог карточки правила).
 *
 * Индекс трудности (модель, та же что в замере ДО, дополнена нагрузкой):
 *   work(L) = setSize × (1100 / letterMs) × (1 + 0,45·mathLoad + (hardMath ? 0,1 : 0))
 * Гейты: [G1] скачок соседних ≤ ×1,5 · [G2] рост монотонный до L16 (клонов
 * |Δ|<2% нет — формулы детерминированы, шума нет) · [G3] умножение с L6.
 */
import { levelParams } from '@/app/games/ospan';

const work = (L: number) => {
  const p = levelParams(L);
  return p.setSize * (1100 / p.letterMs) * (1 + 0.45 * p.mathLoad + (p.hardMath ? 0.1 : 0));
};

describe('лестница ospan v2 (счётная ось, 07.09.2026)', () => {
  test('[G1] скачок работы между соседними уровнями ≤ ×1,5 (обрыв ×1,59 не вернулся)', () => {
    const bad: string[] = [];
    for (let L = 2; L <= 20; L++) {
      const jump = work(L) / work(L - 1);
      if (jump > 1.5) bad.push(`L${L - 1}→L${L}: ×${jump.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  test('[G2] рост живой до L16: соседние уровни различимы (клоны с L13 не вернулись)', () => {
    for (let L = 2; L <= 16; L++) {
      expect(work(L)).toBeGreaterThan(work(L - 1) * 1.02);
    }
  });

  test('[G3] умножение появляется ровно с L6 (порог карточки правила hardmath)', () => {
    expect(levelParams(5).hardMath).toBe(false);
    expect(levelParams(6).hardMath).toBe(true);
  });

  test('поля лестницы на опорных уровнях (слепок)', () => {
    expect(levelParams(1)).toEqual({ setSize: 3, letterMs: 1100, hardMath: false, mathLoad: 0 });
    expect(levelParams(7)).toEqual({ setSize: 9, letterMs: 990, hardMath: true, mathLoad: 0.375 });
    expect(levelParams(13)).toEqual({ setSize: 9, letterMs: 660, hardMath: true, mathLoad: 1.125 });
    expect(levelParams(16)).toEqual({ setSize: 9, letterMs: 500, hardMath: true, mathLoad: 1.5 });
  });
});
