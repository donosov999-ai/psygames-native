/**
 * ПРЕПЯТСТВИЯ НЕ ДЕЛАЮТ УРОВЕНЬ НЕРЕШАЕМЫМ.
 *
 * ЗАЧЕМ. Формы подняли разнообразие с 13 разных уровней до 30, цель Дениса —
 * 55. Оси «больше типов» и «теснее» насыщаются к L21 и дальше не дают ничего;
 * препятствия не насыщаются, потому что меняют не количество, а то, КУДА можно
 * ходить. Но ровно поэтому они и опаснее всего для решаемости.
 *
 * 🔴 ГЛАВНОЕ ПРАВИЛО: ЗАПЕРТАЯ НИША НЕ СЧИТАЕТСЯ СВОБОДНОЙ. Решаемость держится
 * на том, что свободных ниш минимум две — но ниша под замком манёвра не даёт.
 * Если её не вычесть из ёмкости, уровень с препятствиями окажется теснее, чем
 * задумано, и может стать непроходимым. Это единственный способ сломать игру
 * препятствиями, и он проверяется здесь.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const src = readFileSync(join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;

import { liveRowsForFreeze } from '@/app/games/goods-sort';

/** Таблицу препятствий и формы читаем ИЗ ЭКРАНА, чтобы тест не проверял свою копию. */
function plans(): { blocked: number; locked: number; covered: number; frozenRow: boolean }[] {
  const body = src.slice(src.indexOf('const OBSTACLE_PLANS'), src.indexOf('const NO_OBSTACLES'));
  return [...body.matchAll(/\{ blocked: (\d+), locked: (\d+), covered: (\d+), frozenRow: (true|false) \}/g)]
    .map((m) => ({ blocked: +m[1], locked: +m[2], covered: +m[3], frozenRow: m[4] === 'true' }));
}
function shapes(): Record<string, string[][]> {
  const body = src.slice(src.indexOf('const SHAPES'), src.indexOf('function shapeFor'));
  const out: Record<string, string[][]> = {};
  for (const m of body.matchAll(/'(\d+x\d+)': \[([\s\S]*?)\n  \],/g)) {
    out[m[1]] = [...m[2].matchAll(/\[([^\]]+)\]/g)]
      .map((g) => [...g[1].matchAll(/'([#.]+)'/g)].map((q) => q[1]));
  }
  return out;
}

const PLANS = plans();
const SH = shapes();
const STEP = Number((src.match(/\(\(L - 3\) \* (\d+)\)/) || [])[1]);
const gridFor = (L: number): [number, number] => (L <= 7 ? [3, 4] : L <= 11 ? [3, 5] : [3, 6]);
const planFor = (L: number) => (L < 6 ? { blocked: 0, locked: 0, covered: 0, frozenRow: false } : PLANS[(L - 6) % PLANS.length]);

function level(L: number) {
  const [cols, rows] = gridFor(L);
  const list = SH[`${cols}x${rows}`];
  const sh = list[L <= 2 ? 0 : ((L - 3) * STEP) % list.length];
  const slots = sh.join('').split('').filter((c) => c === '#').length;
  const o = planFor(L);
  const shut = o.blocked + o.locked;
  const usable = slots - shut;
  const types = Math.min(24, slots - 2 - shut, 4 + Math.floor(L / 2));
  let spares = Math.max(2, Math.ceil(usable * 0.34) - Math.floor((L - 1) / 4));
  spares = Math.max(2, Math.min(spares, usable - types));
  const over = Math.max(0, L - 8);
  const moveLimit = over > 0 ? Math.max(types * 2, types * 3 - over) : 0;
  return { cols, rows, sh, slots, usable, types, spares, moveLimit, o };
}

describe('препятствия', () => {
  it('таблица прочитана из экрана', () => {
    expect(PLANS.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(SH).length).toBeGreaterThanOrEqual(4);
  });

  /** До шестого уровня человек учит само правило игры — второе поверх него это каша. */
  it('препятствий нет раньше шестого уровня', () => {
    for (let L = 1; L <= 5; L++) {
      const o = planFor(L);
      expect(o.blocked + o.locked + o.covered).toBe(0);
      expect(o.frozenRow).toBe(false);
    }
  });

  /** Первое появление каждого вида должно быть ОДИНОЧНЫМ — иначе правило не прочитать. */
  it('каждый вид препятствия появляется впервые в одиночку', () => {
    const firsts: Record<string, number> = {};
    PLANS.forEach((o, i) => {
      (['blocked', 'locked', 'covered'] as const).forEach((k) => {
        if (o[k] > 0 && firsts[k] === undefined) firsts[k] = i;
      });
      if (o.frozenRow && firsts.frozen === undefined) firsts.frozen = i;
    });
    const bad: string[] = [];
    Object.entries(firsts).forEach(([k, i]) => {
      const o = PLANS[i];
      const kinds = [o.blocked > 0, o.locked > 0, o.covered > 0, o.frozenRow].filter(Boolean).length;
      if (kinds !== 1) bad.push(`${k}: впервые вместе с другими (набор #${i})`);
    });
    expect(bad).toEqual([]);
  });

  it('🔴 каждый уровень с 1 по 60 решаем при своих препятствиях', () => {
    const bad: string[] = [];
    for (let L = 1; L <= 60; L++) {
      const v = level(L);
      if (v.spares < 2) bad.push(`L${L}: свободных ${v.spares} при ${v.o.blocked + v.o.locked} запертых`);
      if (v.usable - v.spares < v.types) bad.push(`L${L}: ёмкости на ${v.types} типов нет (доступно ${v.usable})`);
      if (v.types < 3) bad.push(`L${L}: типов ${v.types} — играть нечем`);
      // накрытых не может быть больше, чем товаров не-последних в нишах
      if (v.o.covered > v.types * 2) bad.push(`L${L}: накрыто ${v.o.covered} при ${v.types} типах`);
    }
    expect(bad).toEqual([]);
  });

  it('запертые ниши вычтены из ёмкости в самом экране, а не только в тесте', () => {
    expect(src).toMatch(/const shut = obst\.blocked \+ obst\.locked;/);
    expect(src).toMatch(/const usable = slots - shut;/);
    expect(src).toMatch(/slots - 2 - obstaclePlan\(L\)\.blocked - obstaclePlan\(L\)\.locked/);
  });

  /**
   * Запрет обязан стоять и на «взять», и на «положить» — ОДНОЙ проверкой.
   *
   * ⚠️ 19.08.2026 проверка переехала. Раньше здесь закреплялась буквальная
   * строчка `if (!cellUsable(fromCell) || !cellUsable(toCell))` внутри
   * `moveItem`. С появлением перетаскивания тот же вопрос понадобился ещё и
   * подсветке ниши под пальцем, и обе стороны свернулись в один предикат
   * `canPlaceInto`. Смысл гейта не изменился, поэтому и правило то же — только
   * закрепляем теперь сам предикат и то, что ход идёт через него. Способов
   * хода стало два, а проверка обязана остаться одна.
   */
  /**
   * ⚠️ ПРОВЕРЯЕМ СМЫСЛ, А НЕ ЗАПИСЬ. Первая редакция требовала дословное
   * `cellUsable(fromCell) && cellUsable(toCell)` и покраснела 19.08.2026 на
   * правильной правке: предикат вырос до нескольких строк ради строгой укладки,
   * и то же самое условие записалось как ранний выход. Смысл — обе стороны хода
   * спрашивают о препятствии — не изменился ни на букву.
   */
  it('препятствие запрещает обе стороны хода', () => {
    const pred = src.slice(src.indexOf('const canPlaceInto'), src.indexOf('const moveItem'));
    expect(pred).toMatch(/cellUsable\(fromCell\)/);
    expect(pred).toMatch(/cellUsable\(toCell\)/);
    expect(src).toMatch(/if \(!canPlaceInto\(fromCell, toCell\)\)/);
  });

  /** Замер: ради этого препятствия и заводились. */
  it('связка формы × препятствия даёт не меньше 45 разных уровней за 60', () => {
    const seen = new Set<string>();
    for (let L = 1; L <= 60; L++) {
      const v = level(L);
      seen.add(`${v.cols}x${v.rows}|${v.sh.join('/')}|${v.types}|${v.spares}|${v.moveLimit}|${v.o.blocked}${v.o.locked}${v.o.covered}${v.o.frozenRow ? 1 : 0}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(45);
  });
});

/**
 * ЗАМОРОЗКА НЕ ЛОЖИТСЯ ПОВЕРХ ЗАМКА И НЕ ПАДАЕТ НА ДЫРЫ.
 *
 * Найдено глазами 19.08.2026 на форсированной раскладке blocked 2 + locked 1 +
 * frozenRow: замок и снежинка встали в одну нишу — два значка друг на друге и
 * двойной запрет там, где хватает одного. В боевой таблице планов заморозка с
 * замками не встречается, поэтому на экране это не всплывало; но таблицу ещё
 * будут править, и тогда всплывёт.
 *
 * Функция настоящая, из экрана — не копия правила в тесте.
 */
describe('примёрзший ряд выбирается живым', () => {
  const full = (n: number) => Array(n).fill(true);
  const none = (n: number) => Array(n).fill(null);

  it('верхний ряд не морозим — с него читают доску', () => {
    expect(liveRowsForFreeze(full(9), none(9), 3, 3)).not.toContain(0);
  });

  it('ряд под замками не предлагается', () => {
    const obs = none(9);
    obs[3] = { kind: 'blocked' };
    obs[4] = { kind: 'locked', movesLeft: 5 };   // в ряду 1 остаётся одна ниша
    expect(liveRowsForFreeze(full(9), obs, 3, 3)).toEqual([2]);
  });

  it('ряд из дыр не предлагается', () => {
    const mask = full(9);
    mask[3] = false; mask[4] = false;            // ряд 1 — почти весь вырезан
    expect(liveRowsForFreeze(mask, none(9), 3, 3)).toEqual([2]);
  });

  it('когда живых рядов нет — пусто, и заморозки не будет', () => {
    const obs = none(9);
    obs[3] = { kind: 'blocked' }; obs[4] = { kind: 'blocked' }; obs[5] = { kind: 'blocked' };
    obs[6] = { kind: 'blocked' }; obs[7] = { kind: 'blocked' }; obs[8] = { kind: 'blocked' };
    expect(liveRowsForFreeze(full(9), obs, 3, 3)).toEqual([]);
  });

  it('на чистой доске морозить можно все ряды кроме верхнего', () => {
    expect(liveRowsForFreeze(full(12), none(12), 3, 4)).toEqual([1, 2, 3]);
  });
});
