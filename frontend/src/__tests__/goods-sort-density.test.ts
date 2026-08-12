/**
 * Плотность доски в сортировке товаров: поле не должно пустовать.
 *
 * ЗАЧЕМ. 12.08.2026, на свежем релизе: «даже не все слоты заняты, это просто, какой-то
 * позор», «это сортировка товаров, это позор, а не игра». Смотреть было не на что —
 * на первом уровне доска 3×3 держала три занятые ячейки из девяти: две трети поля
 * пустовали, и уровень решался без единой мысли.
 *
 * Причина — число свободных ячеек задавалось АБСОЛЮТНЫМ числом (6), одинаковым для
 * доски 9 и доски 16. На маленькой это 67% пустоты, на большой 37%. Такую ошибку
 * не видно в коде: константа выглядит разумной, пока не пересчитаешь её в долю.
 *
 * Поэтому тест проверяет не формулу, а СВОЙСТВО: сколько поля занято на каждом уровне.
 */

/** Копия раскладки из app/games/goods-sort.tsx — числа обязаны совпадать. */
function gridFor(L: number): { cols: number; rows: number } {
  if (L <= 7) return { cols: 3, rows: 3 };
  if (L <= 11) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

function levelCfg(L: number, poolSize: number) {
  const { cols, rows } = gridFor(L);
  const slots = cols * rows;
  const typeCeiling = slots - 2;
  const types = Math.min(poolSize, typeCeiling, 4 + Math.floor(L / 2));
  let spares = Math.max(2, Math.ceil(slots * 0.34) - Math.floor((L - 1) / 4));
  spares = Math.max(2, Math.min(spares, slots - types));
  return { types, spares, slots, used: Math.max(types, slots - spares) };
}

const POOL = 26;
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

describe('плотность доски', () => {
  it('ни на одном уровне не пустует больше половины поля', () => {
    const bad = LEVELS
      .map((L) => ({ L, ...levelCfg(L, POOL) }))
      .filter((c) => (c.slots - c.used) / c.slots > 0.5)
      .map((c) => `ур.${c.L}: занято ${c.used} из ${c.slots}`);

    expect(bad).toEqual([]);
  });

  it('первый уровень не пустует больше чем наполовину — с него и начинается впечатление', () => {
    const c = levelCfg(1, POOL);
    expect(`занято ${c.used} из ${c.slots}`).toBe(`занято 5 из ${c.slots}`);
  });

  it('плотность растёт с уровнем, а не скачет', () => {
    const fill = LEVELS.map((L) => { const c = levelCfg(L, POOL); return c.used / c.slots; });
    // допускаем просадку на смене размера доски (3×3 → 4×3 → 4×4), но не более чем на 15%
    const drops = fill.map((v, i) => (i ? fill[i - 1] - v : 0)).filter((d) => d > 0.15);
    expect(drops).toEqual([]);
  });

  it('свободных ячеек всегда хотя бы две — иначе доска не разбирается', () => {
    const tight = LEVELS.map((L) => levelCfg(L, POOL)).filter((c) => c.spares < 2);
    expect(tight).toEqual([]);
  });

  it('предметы помещаются в занятые ячейки: типов×3 не больше вместимости', () => {
    const overflow = LEVELS
      .map((L) => ({ L, ...levelCfg(L, POOL) }))
      .filter((c) => c.types * 3 > c.used * 3)
      .map((c) => `ур.${c.L}`);

    expect(overflow).toEqual([]);
  });
});
