/**
 * 🔴 КАЖДЫЙ РЯД ТАРЕЛОК ЦЕНТРИРУЕТСЯ ОТДЕЛЬНО, И ПОПАДАНИЕ ОБЯЗАНО ЭТО ЗНАТЬ.
 *
 * 📍 ПОВОД — ЖИВОЙ ЗАМЕР 09.09.2026. Денис: «не работает ни драг-энд-дроп, ни по
 * клику, ни прицеливание». Снято прямо в браузере, `getBoundingClientRect` по
 * кнопкам тарелок: поле 359, тарелка 109, шаг 117, пять тарелок в три столбца.
 *
 *   ряд 1 (3 тарелки) — начинается на x = 8,  сетка искала на x = 4
 *   ряд 2 (2 тарелки) — начинается на x = 67, сетка искала на x = 4
 *
 * Стол — `flexWrap` с `justifyContent: 'center'`, поэтому НЕПОЛНЫЙ ряд встаёт по
 * центру. Промах во втором ряду 63 точки, больше половины тарелки: палец по
 * нижней тарелке попадал в соседнюю или мимо стола.
 *
 * ⚠️ ЧИСЛА В ЭТОЙ ПРОБЕ — ИЗ БРАУЗЕРА, А НЕ ИЗ ФОРМУЛЫ. В этом весь смысл:
 * формула выглядела правильной и была неправильной. Проба сверяет обе стороны —
 * то, что рисует вёрстка, и то, что считает попадание.
 */
import { plateAtPoint, plateForGrab, rowLeft, inRow, PLATE_GAP } from '@/src/games/cake-sort/core/layout';

/** Замер из живой игры: левый-верхний угол каждой тарелки в координатах стола. */
const ЗАМЕР = { boardW: 359, plate: 109, cols: 3, count: 5,
  углы: [[8, 12], [125, 12], [242, 12], [67, 129], [184, 129]] as [number, number][] };

describe('ряды тарелок центрируются', () => {
  it('есть что проверять — замер настоящий и ряды РАЗНОЙ длины', () => {
    expect(ЗАМЕР.углы).toHaveLength(ЗАМЕР.count);
    expect(inRow(0, ЗАМЕР.cols, ЗАМЕР.count)).toBe(3);
    expect(inRow(1, ЗАМЕР.cols, ЗАМЕР.count)).toBe(2);
  });

  it('🔴 расчёт левого края ряда совпадает с тем, что намерено в браузере', () => {
    const { boardW, plate, cols, count, углы } = ЗАМЕР;
    for (let r = 0; r < 2; r += 1) {
      const ожидание = (углы[r * cols] as [number, number])[0];
      const наш = rowLeft(boardW, plate, inRow(r, cols, count)) + PLATE_GAP / 2;
      expect(Math.abs(наш - ожидание)).toBeLessThanOrEqual(1);
    }
  });

  it('🔴 центр каждой тарелки опознаётся как ОНА САМА — и при хвате, и при сбросе', () => {
    const { boardW, plate, cols, count, углы } = ЗАМЕР;
    const плохо: string[] = [];
    углы.forEach(([x, y], i) => {
      const cx = x + plate / 2; const cy = y + plate / 2;
      const хват = plateForGrab(cx, cy, cols, plate, count, boardW);
      const сброс = plateAtPoint(cx, cy, cols, plate, count, boardW);
      if (хват !== i) плохо.push(`тарелка ${i}: хват отдал ${хват}`);
      if (сброс !== i) плохо.push(`тарелка ${i}: сброс отдал ${сброс}`);
    });
    expect(плохо).toEqual([]);
  });

  /**
   * 🔴 ПРОТИВОПОЛОЖНАЯ СТОРОНА: без ширины стола нижний ряд ПРОМАХИВАЕТСЯ. Без
   * этой проверки проба выше зеленела бы и на старом коде — надо показать, что
   * поправка и правда что-то меняет.
   */
  it('🔴 без ширины стола нижний ряд опознаётся неверно — поправка не косметика', () => {
    const { plate, cols, count, углы } = ЗАМЕР;
    const [x, y] = углы[3] as [number, number];
    const cx = x + plate / 2; const cy = y + plate / 2;
    expect(plateForGrab(cx, cy, cols, plate, count)).not.toBe(3);
    expect(plateAtPoint(cx, cy, cols, plate, count)).not.toBe(3);
  });

  it('🔴 полный ряд тоже сдвинут — на половину зазора, и это не ноль', () => {
    const { boardW, plate, cols, count } = ЗАМЕР;
    expect(rowLeft(boardW, plate, cols)).toBeGreaterThan(0);
    // Верхний ряд полон, но стол шире содержимого: центрирование сдвигает и его.
    expect(rowLeft(boardW, plate, inRow(0, cols, count))).toBeCloseTo(4, 0);
  });
});
