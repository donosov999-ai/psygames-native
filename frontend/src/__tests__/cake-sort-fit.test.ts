/**
 * ГЕОМЕТРИЯ СТОЛА — считается ДО отрисовки.
 *
 * Требование ТЗ дословно: «тарелок на экране больше, чем ниш: посчитай размер
 * сектора при 360 точках ширины ДО того, как рисовать». В сортировке товаров
 * ровно этот замер поймал, что товар ужимается до 18 точек, — и поймал числом,
 * а не глазами.
 *
 * ⚠️ У СЕКТОРА ДВА РАЗМЕРА, И РЕШАЕТ МЕНЬШИЙ. Дуга по внешнему краю вдвое
 * больше ширины на среднем радиусе. Мерить по внешней — значит завысить оценку
 * вдвое и нарисовать нечитаемое.
 */
import { tableLayout, maxCols, sectorWidth, SECTOR_MIN, PLATE_GAP } from '@/src/games/cake-sort/core/layout';
import { levelCfg, PLATES_MAX } from '@/src/games/cake-sort/core/level';
import { CIRCLE } from '@/src/games/cake-sort/core/plate';

const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('стол влезает читаемо', () => {
  it('есть что проверять — пол задан и не нулевой', () => {
    expect(SECTOR_MIN).toBeGreaterThan(10);
    expect(PLATE_GAP).toBeGreaterThan(0);
  });

  /** Замер из шапки `layout.ts`, проверенный исполнением, а не переписанный. */
  it('🔴 на 360 точках читаемы ровно пять столбцов, шестой под полом', () => {
    expect(maxCols(360)).toBe(5);
    expect(tableLayout(360, 5).sector).toBeGreaterThanOrEqual(SECTOR_MIN);
    expect(tableLayout(360, 6).sector).toBeLessThan(SECTOR_MIN);
  });

  it('узкий экран не молчит, а даёт меньше столбцов', () => {
    expect(maxCols(320)).toBeLessThanOrEqual(maxCols(360));
    expect(maxCols(414)).toBeGreaterThanOrEqual(maxCols(360));
  });

  /**
   * 🔴 ШИРИНА СЕКТОРА СЧИТАЕТСЯ ПО СРЕДНЕМУ РАДИУСУ. Если кто-то поменяет
   * формулу на внешнюю дугу, число вырастет вдвое и пол перестанет что-либо
   * значить — проверяем отношение, а не только «больше нуля».
   */
  it('🔴 сектор меряется по среднему радиусу, а не по внешнему краю', () => {
    const l = tableLayout(360, 4);
    expect(l.sectorOuter / l.sector).toBeCloseTo(2, 1);
    expect(sectorWidth(l.plate)).toBeCloseTo(l.sector, 5);
    // Клин — шестая часть круга: внешняя дуга равна длине окружности, делённой на круг.
    expect(l.sectorOuter).toBeCloseTo((2 * Math.PI * l.radius) / CIRCLE, 5);
  });

  it('🔴 ни на одном уровне тарелок не больше, чем помещается читаемо', () => {
    const строк = 4;
    const влезает = maxCols(360) * строк;
    expect(PLATES_MAX).toBeLessThanOrEqual(влезает);
    const перебор = LEVELS
      .filter((L) => levelCfg(L).plates > влезает)
      .map((L) => `L${L}: тарелок ${levelCfg(L).plates} при ${влезает} местах`);
    expect(перебор).toEqual([]);
  });

  it('🔴 тарелок ПРАВДА больше, чем ниш в сортировке товаров', () => {
    // Там потолок 14 ниш; здесь это требование ТЗ, а не пожелание.
    expect(PLATES_MAX).toBeGreaterThan(14);
    expect(Math.max(...LEVELS.map((L) => levelCfg(L).plates))).toBeGreaterThan(14);
  });

  it('раскладка не выходит за ширину стола', () => {
    for (const w of [320, 360, 390, 414]) {
      for (let c = 2; c <= maxCols(w); c += 1) {
        const l = tableLayout(w, c);
        expect(l.plate * c + PLATE_GAP * (c + 1)).toBeCloseTo(w, 5);
        expect(l.plate).toBeGreaterThan(0);
      }
    }
  });
});
