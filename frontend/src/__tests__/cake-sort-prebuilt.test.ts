/**
 * 🔴 ВШИТЫЙ УРОВЕНЬ ОБЯЗАН СОВПАДАТЬ С ТЕМ, ЧТО РАЗДАСТ ИГРА.
 *
 * Файл `levels.json` несёт доску и её точный минимум ходов, посчитанные офлайн
 * с бюджетом в тринадцать раз больше, чем позволяет устройство. Из этого следует
 * ровно одна опасность: ДВЕ ПРАВДЫ ОБ ОДНОМ УРОВНЕ. Игрок видит доску, которую
 * раздал `deal(L)`, а звёзды считаются по минимуму, посчитанному для ДРУГОЙ
 * доски, — и никакой формулой это не видно, только сверкой.
 *
 * ⚠️ Сверяется СОСТАВ доски, а не факт наличия записи: запись есть всегда, и
 * проверка «файл не пуст» зеленела бы на любом мусоре.
 */
import { prebuilt, prebuiltMin, PREBUILT_COUNT } from '@/src/games/cake-sort/core/prebuilt';
import { deal, levelCfg } from '@/src/games/cake-sort/core/level';
import { makeBoard, allSectors, CIRCLE } from '@/src/games/cake-sort/core/plate';
import { solve, minMoves } from '@/src/games/cake-sort/core/solver';
import { referenceFor, starsFor } from '@/src/games/cake-sort/core/stars';

jest.setTimeout(600000);

describe('вшитые уровни', () => {
  it('есть что проверять — файл не пуст', () => {
    expect(PREBUILT_COUNT).toBeGreaterThanOrEqual(12);
  });

  it('🔴 вшитая доска совпадает с тем, что раздаёт игра на том же уровне', () => {
    const расхождения: string[] = [];
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      const у = prebuilt(L);
      if (!у) { расхождения.push(`L${L}: записи нет`); continue; }
      const { board, cfg } = deal(L);
      if (JSON.stringify(у.plates) !== JSON.stringify(board.plates)) расхождения.push(`L${L}: тарелки не те`);
      if (JSON.stringify(у.queue) !== JSON.stringify(board.queue)) расхождения.push(`L${L}: очередь не та`);
      if (у.types !== cfg.types) расхождения.push(`L${L}: видов ${у.types} против ${cfg.types}`);
    }
    expect(расхождения).toEqual([]);
  });

  it('🔴 каждая вшитая доска решаема и кратна кругу', () => {
    const плохо: string[] = [];
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      const у = prebuilt(L) as { plates: number[][]; queue: number[][] };
      const b = makeBoard(у.plates, у.queue);
      if (allSectors(b).length % CIRCLE !== 0) плохо.push(`L${L}: секторов не кратно кругу`);
      if (!solve(b, 20000).solvable) плохо.push(`L${L}: решаемость не подтверждена`);
    }
    expect(плохо).toEqual([]);
  });

  /**
   * 🔴 ВШИТЫЙ МИНИМУМ — НАСТОЯЩИЙ, А НЕ ОКРУГЛЁННАЯ ОЦЕНКА. Сверяем с живым A*
   * там, где он успевает: если файл несёт другое число, звёзды врут молча.
   */
  it('🔴 вшитый минимум совпадает с живым расчётом там, где расчёт успевает', () => {
    const врут: string[] = [];
    let сверено = 0;
    for (let L = 1; L <= Math.min(6, PREBUILT_COUNT); L += 1) {
      const вшит = prebuiltMin(L);
      if (вшит === null) continue;
      const живой = minMoves(deal(L).board, 400000);
      if (живой.moves === null) continue;
      сверено += 1;
      if (живой.moves !== вшит) врут.push(`L${L}: в файле ${вшит}, живой расчёт ${живой.moves}`);
    }
    expect(врут).toEqual([]);
    // Обе стороны непусты: если сверять было нечего, проверка зелена вслепую.
    expect(сверено).toBeGreaterThanOrEqual(3);
  });

  /**
   * 🔴 И ГЛАВНОЕ, РАДИ ЧЕГО ВСЁ: ТАМ, ГДЕ МИНИМУМ ЕСТЬ, ЗВЁЗДЫ ИДУТ ПО НЕМУ.
   * Идеальная игра обязана давать три звезды — иначе высшая оценка недостижима,
   * ровно тот дефект, который сортировка товаров пережила на 95 % досок.
   */
  it('🔴 идеальная игра даёт три звезды на каждом уровне со вшитым минимумом', () => {
    const мимо: string[] = [];
    let проверено = 0;
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      const m = prebuiltMin(L);
      if (m === null) continue;
      проверено += 1;
      const у = prebuilt(L) as { types: number };
      if (starsFor(m, у.types, m) !== 3) мимо.push(`L${L}: минимум ${m} не даёт трёх звёзд`);
      // И эталон обязан браться от минимума, а не от калибровки.
      if (referenceFor(у.types, m) !== m) мимо.push(`L${L}: эталон не равен минимуму`);
    }
    expect(мимо).toEqual([]);
    expect(проверено).toBeGreaterThanOrEqual(8);
  });

  /**
   * 🔴 «НЕ ЗНАЮ» ОБЯЗАНО БЫТЬ `null`, А НЕ ЧИСЛОМ. Ветка отсутствия минимума
   * опаснее всех: подставь она единицу — эталон станет равен одному ходу, и три
   * звезды окажутся недостижимы на всех таких уровнях разом. Мутация «вернуть 1
   * вместо null» пережила первую редакцию этой пробы, потому что в файле почти у
   * всех уровней минимум есть. Подаём вход руками.
   */
  it('🔴 у уровня без записи минимум — null, а не выдуманное число', () => {
    expect(prebuiltMin(99999)).toBeNull();
    expect(prebuilt(99999)).toBeNull();
    // И эталон в этом случае берёт калибровку, а не единицу.
    const э = referenceFor(5, prebuiltMin(99999));
    expect(э).toBeGreaterThan(20);
    // Три звезды при таком эталоне достижимы — а при подставленной единице нет.
    expect(starsFor(э, 5, prebuiltMin(99999))).toBe(3);
  });

  /**
   * ⚠️ ЧЕСТНАЯ ГРАНИЦА. Не у каждого уровня минимум посчитан: поиск взрывается,
   * и офлайн-бюджет 400 000 тоже конечен. Там, где его нет, звёзды идут от
   * калибровки — хуже, но честнее выдумки. Проверяем, что таких не большинство.
   */
  it('минимум посчитан у большинства вшитых уровней', () => {
    let есть = 0;
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) if (prebuiltMin(L) !== null) есть += 1;
    expect(есть * 2).toBeGreaterThan(PREBUILT_COUNT);
  });
});
