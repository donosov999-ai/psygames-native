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
import { tableLayout, tableFit, maxCols, sectorWidth, cakeRadius, CAKE_FILL, SECTOR_MIN, PLATE_GAP } from '@/src/games/cake-sort/core/layout';
import { levelCfg, PLATES_MAX } from '@/src/games/cake-sort/core/level';
import { CIRCLE } from '@/src/games/cake-sort/core/plate';

const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('стол влезает читаемо', () => {
  it('есть что проверять — пол задан и не нулевой', () => {
    expect(SECTOR_MIN).toBeGreaterThan(10);
    expect(PLATE_GAP).toBeGreaterThan(0);
  });

  /** Замер из шапки `layout.ts`, проверенный исполнением, а не переписанный. */
  it('🔴 на 360 точках читаемы ровно четыре столбца, пятый под полом', () => {
    expect(maxCols(360)).toBe(4);
    expect(tableLayout(360, 4).sector).toBeGreaterThanOrEqual(SECTOR_MIN);
    expect(tableLayout(360, 5).sector).toBeLessThan(SECTOR_MIN);
  });

  /**
   * 🔴 МЕРИМ ТОРТ, А НЕ ТАРЕЛКУ — И ЭТО БЫЛ ЖИВОЙ ДЕФЕКТ, А НЕ ПРИДИРКА.
   *
   * До 09.09.2026 `sectorWidth` считала по кругу ТАРЕЛКИ, а клин рисовался долей
   * 0,72 от него: замер завышал нарисованное в 1/0,72 = 1,39 раза, и «пять
   * читаемых столбцов» на 360 точках означали настоящий клин 10,6 при поле 15.
   * Проба ловит возврат к тому же: сектор обязан быть посчитан по РАДИУСУ ТОРТА.
   */
  it('🔴 ширина сектора считается по кругу торта, а не тарелки', () => {
    for (const p of [60, 80, 104, 160]) {
      const r = cakeRadius(p);
      expect(r).toBeLessThan(p / 2);
      expect(sectorWidth(p)).toBeCloseTo((Math.PI * (r / 2)) / 3, 5);
    }
    // Доля торта не «почти вся тарелка» и не «серединка»: обе крайности — дефекты.
    expect(CAKE_FILL).toBeGreaterThanOrEqual(0.85);
    expect(CAKE_FILL).toBeLessThanOrEqual(0.95);
  });

  /**
   * 🔴 СТОЛ ОБЯЗАН ВЛЕЗАТЬ В ПОЛЕ, А НЕ ТОЛЬКО В ШИРИНУ.
   *
   * Переполнение по высоте не «некрасиво»: нижний ряд тарелок просто не виден, а
   * поле не прокручивается (см. `touchAction: 'none'` в экране). Гоняем те же
   * поля, что даёт GameShell на телефоне и на планшете.
   */
  it('🔴 подбор стола влезает в поле по высоте на всех уровнях', () => {
    const поля: [number, number][] = [[344, 380], [344, 440], [374, 520], [398, 560], [504, 700]];
    const беда: string[] = [];
    for (const [w, h] of поля) {
      for (const L of LEVELS) {
        const п = levelCfg(L).plates;
        const f = tableFit(w, h, п);
        const нужно = f.rows * (f.plate + PLATE_GAP) + PLATE_GAP;
        if (f.cols * f.rows < п) беда.push(`${w}×${h} L${L}: мест ${f.cols * f.rows} на ${п} тарелок`);
        if (нужно > h + 0.5) беда.push(`${w}×${h} L${L}: стол ${нужно.toFixed(0)} при поле ${h}`);
      }
    }
    expect(беда).toEqual([]);
  });

  /**
   * 🔴 ТОРТ ПОСЛЕ ПРАВКИ НЕ МЕЛЬЧЕ, ЧЕМ ДО НЕЁ. Денис 09.09.2026: «тортики должны
   * быть больше». Проба держит именно это: при той же ширине поля торт обязан
   * быть КРУПНЕЕ прежнего (доля 0,72 при пяти столбцах на 360) — иначе правка
   * съедена следующей.
   */
  it('🔴 торт крупнее прежнего на всех проверяемых полях', () => {
    const прежний = 2 * 0.72 * (tableLayout(360, 5).plate / 2 - 3);   // 40,6 точки
    for (const [w, h, п] of [[344, 440, 20], [360, 480, 12], [398, 560, 5]] as [number, number, number][]) {
      const f = tableFit(w, h, п);
      expect(2 * cakeRadius(f.plate)).toBeGreaterThan(прежний);
    }
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
    // Круг здесь — ТОРТ, а не тарелка: обе меры клина обязаны быть про один круг.
    expect(l.sectorOuter).toBeCloseTo((2 * Math.PI * cakeRadius(l.plate)) / CIRCLE, 5);
  });

  it('🔴 ни на одном уровне тарелок не больше, чем помещается читаемо', () => {
    /*
     * Рядов пять, а не четыре: столбцов после честного замера клина стало
     * четыре, и двадцать тарелок ложатся 4×5. Что такой стол ВЛЕЗАЕТ по высоте,
     * проверяет отдельная проба выше — здесь речь только о числе мест.
     */
    const строк = 5;
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
