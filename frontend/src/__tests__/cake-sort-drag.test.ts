/**
 * 🔴 ПОПАДАНИЕ ПАЛЬЦА СЧИТАЕТСЯ ПО КРУГУ, А НЕ ПО КЛЕТКЕ.
 *
 * Перетаскивание спрашивает «какая тарелка под точкой» десятки раз в секунду.
 * Ошибка здесь не падает, а ПРОМАХИВАЕТСЯ: сектор едет не в ту тарелку, и на
 * глаз промах в одну ячейку от промаха в ноль не отличить — ловится замером.
 *
 * ⚠️ Угол клетки — пустое место. У круга, вписанного в квадрат, вне круга
 * остаётся 21,5 % площади: палец там означает «мимо», а не «в тарелку».
 */
import { plateAtPoint, tableLayout, PLATE_GAP } from '@/src/games/cake-sort/core/layout';

const W = 344;
const COLS = 4;
const L = tableLayout(W, COLS);
const центр = (i: number) => {
  const шаг = L.plate + PLATE_GAP;
  const c = i % COLS; const r = Math.floor(i / COLS);
  return { x: PLATE_GAP / 2 + c * шаг + L.plate / 2, y: PLATE_GAP / 2 + r * шаг + L.plate / 2 };
};

describe('попадание по тарелке', () => {
  it('есть что проверять — раскладка настоящая', () => {
    expect(L.plate).toBeGreaterThan(20);
    expect(L.cols).toBe(COLS);
  });

  it('🔴 центр каждой тарелки попадает в неё саму, а не в соседнюю', () => {
    const плохо: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const c = центр(i);
      const попал = plateAtPoint(c.x, c.y, COLS, L.plate, 12);
      if (попал !== i) плохо.push(`тарелка ${i}: центр отдал ${попал}`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 угол клетки — мимо, а не «в тарелку»', () => {
    // Левый верхний угол клетки нулевой тарелки: внутри квадрата, вне круга.
    expect(plateAtPoint(PLATE_GAP / 2 + 1, PLATE_GAP / 2 + 1, COLS, L.plate, 12)).toBeNull();
    // А центр той же клетки — попадание.
    expect(plateAtPoint(центр(0).x, центр(0).y, COLS, L.plate, 12)).toBe(0);
  });

  it('🔴 край круга ловится, а точка сразу за ним — уже нет', () => {
    const c = центр(5);
    const r = L.plate / 2;
    expect(plateAtPoint(c.x + r - 1, c.y, COLS, L.plate, 12)).toBe(5);
    expect(plateAtPoint(c.x + r + 3, c.y, COLS, L.plate, 12)).toBeNull();
  });

  it('за пределами стола и за числом тарелок — null, а не последняя тарелка', () => {
    expect(plateAtPoint(-20, 10, COLS, L.plate, 12)).toBeNull();
    expect(plateAtPoint(10, -20, COLS, L.plate, 12)).toBeNull();
    expect(plateAtPoint(W + 50, 10, COLS, L.plate, 12)).toBeNull();
    // Одиннадцатая тарелка при десяти на столе — не существует.
    expect(plateAtPoint(центр(11).x, центр(11).y, COLS, L.plate, 10)).toBeNull();
  });

  /** Ни одна точка стола не отдаёт индекс, которого на доске нет. */
  it('🔴 сплошной проход по столу не выдаёт несуществующих тарелок', () => {
    const плохо: string[] = [];
    for (let y = 0; y < L.plate * 3 + PLATE_GAP * 4; y += 3) {
      for (let x = 0; x < W; x += 3) {
        const i = plateAtPoint(x, y, COLS, L.plate, 10);
        if (i !== null && (i < 0 || i >= 10)) плохо.push(`(${x},${y}) → ${i}`);
      }
    }
    expect(плохо).toEqual([]);
  });
});
