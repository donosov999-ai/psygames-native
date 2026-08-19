/**
 * СМЕШАННАЯ ЁМКОСТЬ НИШ НЕ ЛОМАЕТ АРИФМЕТИКУ РЕШАЕМОСТИ.
 *
 * 🔴 ЗАЧЕМ. Когда все ниши одинаковы, через десяток уровней рука ходит сама:
 * видишь пару — несёшь третий, не глядя. Ниша на ДВА тройку не вместит вовсе,
 * ниша на ЧЕТЫРЕ вмещает тройку и ещё лишний товар — автоматизм ломается.
 *
 * Но вся арифметика решаемости (запас пустых, потолок типов, ёмкость за вычетом
 * запертых) посчитана из «ниш × 3». Урежь общую ёмкость — и уровень станет
 * теснее задуманного, причём МОЛЧА, без единой ошибки. Поэтому здесь главная
 * проверка — сумма ёмкостей не меняется.
 */
import { capsFor, CAP_MIN, CAP_MAX, MIXED_CAP_FROM, placementOk, tripleIn, removeTriple } from '@/app/games/goods-sort';

const SLOTS = [9, 12, 15, 16, 18];

describe('ёмкости ниш', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(CAP_MIN).toBeLessThan(3);
    expect(CAP_MAX).toBeGreaterThan(3);
    expect(MIXED_CAP_FROM).toBeGreaterThan(10);
  });

  it('до своего уровня все ниши одинаковы', () => {
    for (let L = 1; L < MIXED_CAP_FROM; L++) {
      for (const slots of SLOTS) {
        expect(new Set(capsFor(L, slots)).size).toBe(1);
      }
    }
  });

  it('после — уже не одинаковы', () => {
    const mixed = SLOTS.filter((slots) => new Set(capsFor(MIXED_CAP_FROM, slots)).size > 1);
    expect(mixed.length).toBeGreaterThan(0);
  });

  /** 🔴 ГЛАВНОЕ: доска не стала теснее. */
  it('сумма ёмкостей всегда равна «ниш × 3»', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 60; L++) {
      for (const slots of SLOTS) {
        const total = capsFor(L, slots).reduce((a, b) => a + b, 0);
        if (total !== slots * 3) bad.push(`L${L}, ниш ${slots}: ёмкость ${total} вместо ${slots * 3}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ёмкость каждой ниши в разумных пределах', () => {
    for (let L = 1; L <= 60; L++) {
      for (const slots of SLOTS) {
        for (const c of capsFor(L, slots)) {
          expect(c).toBeGreaterThanOrEqual(CAP_MIN);
          expect(c).toBeLessThanOrEqual(CAP_MAX);
        }
      }
    }
  });

  /** Повтор уровня обязан давать ту же форму доски: расклад случаен, форма нет. */
  it('один и тот же уровень даёт одни и те же ёмкости', () => {
    for (const L of [20, 33, 47]) {
      expect(capsFor(L, 12)).toEqual(capsFor(L, 12));
      expect(capsFor(L, 12)).not.toEqual(capsFor(L + 1, 12));
    }
  });

  /** Узкие ниши не должны съесть больше трети доски — иначе играть негде. */
  it('узких ниш не больше трети', () => {
    for (let L = MIXED_CAP_FROM; L <= 60; L++) {
      for (const slots of SLOTS) {
        const small = capsFor(L, slots).filter((c) => c === CAP_MIN).length;
        expect(small).toBeLessThanOrEqual(Math.ceil(slots / 3));
      }
    }
  });
});

describe('сбор тройки при разной ёмкости', () => {
  /**
   * 🔴 Ниша на четыре держит тройку И лишний товар. Проверяй «ровно три в
   * нише» — и на четырёхместной тройка не соберётся НИКОГДА. Самый обидный вид
   * тихой поломки: механика есть, ниша есть, а работать не будет.
   */
  it('тройка находится и когда в нише есть лишний', () => {
    expect(tripleIn([1, 1, 1])).toBe(1);
    expect(tripleIn([2, 1, 1, 1])).toBe(1);     // четырёхместная: тройка + чужой
    expect(tripleIn([1, 1, 2, 1])).toBe(1);     // и вразбивку тоже
    expect(tripleIn([1, 1, 2])).toBeNull();
    expect(tripleIn([])).toBeNull();
  });

  it('исчезает ровно тройка, лишнее остаётся', () => {
    expect(removeTriple([2, 1, 1, 1], 1)).toEqual([2]);
    expect(removeTriple([1, 1, 1], 1)).toEqual([]);
    expect(removeTriple([1, 1, 2, 1], 1)).toEqual([2]);
  });

  it('в двухместную нишу третий товар не влезает', () => {
    expect(placementOk([9, 9], 9, false, CAP_MIN)).toBe(false);
    expect(placementOk([9], 9, false, CAP_MIN)).toBe(true);
  });

  it('в четырёхместную влезает четвёртый', () => {
    expect(placementOk([9, 8, 7], 6, false, CAP_MAX)).toBe(true);
    expect(placementOk([9, 8, 7, 6], 5, false, CAP_MAX)).toBe(false);
  });
});
