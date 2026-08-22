/* psygames-goods-sort-free-niches · VER 1 · 22.08.2026 */
/**
 * СВОБОДНЫХ НИШ ВСЕГДА МИНИМУМ ДВЕ — ПОСЛЕ ТОГО, КАК СЕЛИ ПРЕПЯТСТВИЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ РАЗБОРОМ 22.08.2026. Замысел был верный и записан в коде:
 * решаемость держится на двух свободных нишах, и потолок числа видов
 * (`typeCeiling`) считается ровно от этого. Но раздаче передавался голый
 * `spares` — то есть доска оставляла столько пустых ниш, сколько должно
 * ОСТАТЬСЯ, — а следом препятствия садились на те же самые пустые.
 *
 * Замер: 117 уровней из 200 получали меньше двух свободных, 57 — ни одной. Для
 * человека это доска, на которой не с чего начать: товар взять некуда, а почему
 * не сказано. Ни компилятор, ни прежние гейты этого не видели, потому что
 * каждое из двух мест по отдельности написано правильно.
 *
 * ⚠️ ПРОВЕРЯЕМ РАЗДАЧЕЙ, А НЕ АРИФМЕТИКОЙ. Считать по формуле здесь бесполезно:
 * ошибка была именно в том, что две правильные формулы стояли рядом и вычитали
 * из одного и того же. Поэтому ниже настоящие раздачи и настоящий подсчёт.
 */
import { levelCfg, generate, capsFor, dealBoard } from '@/app/games/goods-sort';

/** Товары в наборах и их число — как в игре. */
const POOL = Array.from({ length: 32 }, (_, i) => i);

/**
 * ⚠️ ЗОВЁМ ТУ ЖЕ РАЗДАЧУ, ЧТО И ЭКРАН. Первая редакция этой проверки собирала
 * доску сама, повторяя починку у себя, — и обе мутации проходили ЗЕЛЁНЫМИ: тест
 * сверял свою копию формулы, а не игру. Ровно та ошибка, из-за которой дефект и
 * прожил незамеченным: запас считался в двух местах.
 */
function freeAfterObstacles(L: number): number {
  const { cells, obstacles, freeNiches } = dealBoard(L, POOL);
  /**
   * ⚠️ СЧИТАЕМ ПО ДОСКЕ, А НЕ ВЕРИМ ОТВЕТУ. Доверять возвращённому числу значит
   * проверять его согласие с самим собой: мутация «не вычитать препятствия»
   * проходила зелёной, потому что запаса и так хватало. Свободная ниша — это
   * ПУСТАЯ и НЕ занятая препятствием, и здесь она пересчитывается заново.
   */
  const actual = cells.reduce(
    (n, cell, i) => n + (cell.length === 0 && !obstacles[i] ? 1 : 0), 0,
  );
  expect(`${L}: ответ ${freeNiches}, на доске ${actual}`).toBe(`${L}: ответ ${actual}, на доске ${actual}`);
  return actual;
}

describe('свободных ниш хватает на каждом уровне', () => {
  it('🔴 двести уровней подряд: свободных не меньше двух', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 200; L += 1) {
      const free = freeAfterObstacles(L);
      if (free < 2) bad.push(`L${L}: свободных ${free}`);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('ни на одном уровне не остаётся НОЛЬ свободных', () => {
    const zero: string[] = [];
    for (let L = 1; L <= 200; L += 1) if (freeAfterObstacles(L) <= 0) zero.push(`L${L}`);
    expect(zero.slice(0, 8)).toEqual([]);
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ. Если передать раздаче голый `spares`, как было до
   * починки, — свободных обязано не хватить. Без этого случая проверка выше
   * зеленела бы и на сломанном коде: мало ли, вдруг запаса и так с избытком.
   */
  it('прежнее поведение эта проверка ловит', () => {
    const broken: string[] = [];
    for (let L = 1; L <= 200; L += 1) {
      const cfg = levelCfg(L, POOL.length);
      const shut = cfg.obst.blocked + cfg.obst.locked;
      if (shut === 0) continue;                       // без препятствий ломать нечего
      const built = generate(POOL, cfg.types, cfg.spares, cfg.slots, capsFor(L, cfg.slots));
      const free = built.filter((c) => c.length === 0).length - shut;
      if (free < 2) broken.push(`L${L}`);
    }
    expect(broken.length).toBeGreaterThan(20);        // прежде таких было больше сотни
  });

  it('уровни с препятствиями вообще существуют — иначе всё выше беспредметно', () => {
    let withObstacles = 0;
    for (let L = 1; L <= 200; L += 1) {
      const cfg = levelCfg(L, POOL.length);
      if (cfg.obst.blocked + cfg.obst.locked > 0) withObstacles += 1;
    }
    expect(withObstacles).toBeGreaterThan(50);
  });
});

describe('🔴 свободное место разбросано, а не свалено в угол', () => {
  /**
   * Перемешивание ниш стояло под `if (!caps)`, а `caps` приходит всегда — не
   * срабатывало НИ РАЗУ: 2000 раздач из 2000 клали пустые ниши в хвост, то есть
   * в один и тот же угол склада. Свободное место здесь главный рабочий ресурс, и
   * когда оно всегда на месте, доска перестаёт быть задачей на планирование.
   */
  it('пустые ниши не всегда в конце', () => {
    const tailOnly: number[] = [];
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const { cells } = dealBoard(20, POOL);
      const empties = cells.map((c, i) => (c.length === 0 ? i : -1)).filter((i) => i >= 0);
      if (empties.length === 0) continue;
      const allAtTail = empties.every((i) => i >= cells.length - empties.length);
      tailOnly.push(allAtTail ? 1 : 0);
    }
    const share = tailOnly.reduce((a, b) => a + b, 0) / Math.max(1, tailOnly.length);
    // При сломанном перемешивании доля была бы ровно 1. Допускаем случайные совпадения.
    expect(`доля раздач с пустыми только в хвосте: ${share > 0.5 ? 'больше половины' : 'меньше половины'}`)
      .toBe('доля раздач с пустыми только в хвосте: меньше половины');
  });

  it('раздача вообще меняется от раза к разу', () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      seen.add(JSON.stringify(dealBoard(20, POOL).cells.map((c) => c.length)));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});
