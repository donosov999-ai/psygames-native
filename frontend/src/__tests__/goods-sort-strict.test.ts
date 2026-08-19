/**
 * СТРОГАЯ УКЛАДКА НЕ ВЫДАЁТ НЕРЕШАЕМЫХ РАСКЛАДОВ.
 *
 * 🔴 ЗАЧЕМ. Правило «класть только к такому же товару или в пустую нишу» —
 * единственная из наших механик, которая меняет САМО ДЕРЕВО РЕШЕНИЙ: появляются
 * тупики, и приходится считать на два-три хода вперёд. Ровно из-за него
 * сортировка по контейнерам вообще является трудной задачей.
 *
 * И ровно поэтому расклад под ним МОЖЕТ ОКАЗАТЬСЯ НЕПРОХОДИМЫМ. Обычная
 * гарантия «две свободные ниши» здесь не спасает: свободная ниша не помогает,
 * если в неё нельзя положить нужный товар, не заперев следующий ход.
 *
 * ⚠️ ПРОВЕРЯЕМ ТОЙ ЖЕ ФУНКЦИЕЙ, КОТОРОЙ ПОЛЬЗУЕТСЯ ИГРА. Своя копия перебора
 * здесь уже подвела: обход в ширину искал КРАТЧАЙШЕЕ решение и упирался в
 * бюджет на доске в 14 ниш — гейт объявил нерешаемыми расклады, которые
 * решаются за 367 тысяч состояний. Поиск в глубину находит решение за сотни
 * узлов, и именно он стоит в игре: расклад, который он не осилил, туда просто
 * не попадёт.
 */
declare const __dirname: string;
declare function require(m: string): any;

import { levelCfg, generate, strictPlacement, placementOk, solvableStrict } from '@/app/games/goods-sort';

const POOL = [0, 1, 2, 3, 4, 5, 6, 7];
describe('правило укладки', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(typeof strictPlacement).toBe('function');
    // Под строгим правилом чужой товар поверх другого положить нельзя.
    expect(placementOk([1], 2, true)).toBe(false);
    expect(placementOk([1], 1, true)).toBe(true);
    expect(placementOk([], 2, true)).toBe(true);
    // Без него — можно всё, пока есть место.
    expect(placementOk([1], 2, false)).toBe(true);
    expect(placementOk([1, 2, 3], 1, false)).toBe(false);   // ниша полна
  });

  /**
   * Правило приходит не сразу и не на каждом уровне: под ним доска может встать,
   * и партия закончится не победой и не честным проигрышем, а «ходов нет».
   */
  it('приходит не раньше четырнадцатого и не чаще чем через два уровня', () => {
    for (let L = 1; L < 14; L++) expect(strictPlacement(L)).toBe(false);
    const on = [];
    for (let L = 14; L <= 60; L++) if (strictPlacement(L)) on.push(L);
    expect(on[0]).toBe(14);
    for (let i = 1; i < on.length; i++) expect(on[i] - on[i - 1]).toBeGreaterThanOrEqual(3);
    // И не должно быть редкостью — иначе механику не успеешь освоить.
    expect(on.length).toBeGreaterThanOrEqual(10);
  });

  /**
   * Порядок перебора — не украшение. Он единственный, что делает проверку
   * посильной: игра зовёт её на КАЖДОЙ раздаче строгого уровня, и обход без
   * приоритетов упирается в бюджет вместо ответа. Поэтому требуем решение при
   * ЖЁСТКО УРЕЗАННОМ бюджете: с порядком его хватает с большим запасом, без —
   * нет. Иначе «оптимизацию» можно снять, и никто не заметит, пока экран не
   * начнёт задумываться на раздаче.
   */
  it('решение находится и при жёстко урезанном бюджете перебора', () => {
    const slow: string[] = [];
    for (let L = 14; L <= 30; L++) {
      if (!strictPlacement(L)) continue;
      for (const narrow of [false, true]) {
        const cfg = levelCfg(L, POOL.length, narrow);
        const board = generate(POOL, cfg.types, cfg.spares, cfg.slots);
        if (!solvableStrict(board, 1500)) slow.push(`L${L}${narrow ? ' узкий' : ''}: 1500 узлов не хватило`);
      }
    }
    expect(slow).toEqual([]);
  });

  /** 🔴 ГЛАВНОЕ: каждый выданный расклад имеет решение. */
  it('каждый строгий уровень выдаёт решаемый расклад', () => {
    const bad: string[] = [];
    const levels: number[] = [];
    for (let L = 14; L <= 60 && levels.length < 6; L++) if (strictPlacement(L)) levels.push(L);
    for (const L of levels) {
      for (const narrow of [false, true]) {
        const cfg = levelCfg(L, POOL.length, narrow);
        for (let t = 0; t < 5; t++) {
          const board = generate(POOL, cfg.types, cfg.spares, cfg.slots);
          if (!solvableStrict(board)) { bad.push(`L${L}${narrow ? ' узкий' : ''}: расклад ${t} нерешаем`); break; }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
