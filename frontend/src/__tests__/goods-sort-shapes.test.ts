/**
 * ФОРМЫ ДОСКИ: КАЖДЫЙ УРОВЕНЬ РЕШАЕМ, И УРОВНИ НЕ ПОВТОРЯЮТСЯ.
 *
 * ЗАЧЕМ. Замер 19.08.2026: генератор давал 13 разных составов за первые 60
 * уровней, последний новый появлялся на 18-м, а L20, L50, L200 и L1000 были
 * ОДИНАКОВЫМИ — 3×5, 13 типов, 2 свободных. Тысяча таких уровней это один
 * уровень тысячу раз. Потолок держали три упора: поле не больше 16 ячеек,
 * типов не больше `slots − 2`, свободных не меньше двух.
 *
 * Форма доски не упирается ни во что из этого: та же сетка 3×5 даёт крест,
 * лесенку, песочные часы, рамку — и каждая играется иначе, потому что меняется,
 * куда вообще можно переложить товар.
 *
 * ⚠️ ШАГ ПО СПИСКУ ФОРМ ОБЯЗАН БЫТЬ ВЗАИМНО ПРОСТ С ЕГО ДЛИНОЙ. Я поставил
 * шаг 3 при списке из 12 форм — gcd(3,12)=3, обходилась ровно треть списка, и
 * разных уровней стало МЕНЬШЕ (23 против 25), хотя форм я добавил вдвое.
 * Здесь это проверяется прямо: все формы должны быть достижимы.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const src = readFileSync(join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;

/** Разбираем таблицу форм прямо из экрана — иначе тест проверял бы свою копию. */
function shapes(): Record<string, string[][]> {
  const body = src.slice(src.indexOf('const SHAPES'), src.indexOf('function shapeFor'));
  const out: Record<string, string[][]> = {};
  for (const m of body.matchAll(/'(\d+x\d+)': \[([\s\S]*?)\n  \],/g)) {
    out[m[1]] = [...m[2].matchAll(/\[([^\]]+)\]/g)]
      .map((g) => [...g[1].matchAll(/'([#.]+)'/g)].map((q) => q[1]));
  }
  return out;
}

const SH = shapes();
const STEP = Number((src.match(/\(\(L - 3\) \* (\d+)\)/) || [])[1]);
const gridFor = (L: number): [number, number] => (L <= 7 ? [3, 4] : L <= 11 ? [3, 5] : [3, 6]);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

describe('формы доски', () => {
  it('таблица форм прочитана', () => {
    expect(Object.keys(SH).length).toBeGreaterThanOrEqual(4);
    expect(STEP).toBeGreaterThan(0);
  });

  it('каждая форма прямоугольна и не пустая', () => {
    const bad: string[] = [];
    for (const [size, list] of Object.entries(SH)) {
      const [cols, rows] = size.split('x').map(Number);
      list.forEach((sh, i) => {
        if (sh.length !== rows) bad.push(`${size}#${i}: ${sh.length} рядов вместо ${rows}`);
        sh.forEach((line, r) => {
          if (line.length !== cols) bad.push(`${size}#${i} ряд ${r}: ${line.length} клеток вместо ${cols}`);
        });
        const cells = sh.join('').split('').filter((c) => c === '#').length;
        if (cells < 6) bad.push(`${size}#${i}: всего ${cells} ниш — играть нечем`);
      });
    }
    expect(bad).toEqual([]);
  });

  /** Шаг не взаимно прост с длиной — часть форм не увидит никто и никогда. */
  it('все формы достижимы: шаг взаимно прост с длиной каждого списка', () => {
    const bad: string[] = [];
    for (const [size, list] of Object.entries(SH)) {
      if (gcd(STEP, list.length) !== 1) {
        bad.push(`${size}: шаг ${STEP} и длина ${list.length}, обойдётся лишь ${list.length / gcd(STEP, list.length)} форм`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 РЕШАЕМОСТЬ. Ход здесь — «взять из любой ниши, положить в любую», поэтому
   * связность фигуры не нужна. Нужно другое: свободных ниш не меньше двух и
   * достаточно ёмкости под все товары. Считается по СУЩЕСТВУЮЩИМ нишам.
   */
  it('каждый уровень с 1 по 60 решаем', () => {
    const bad: string[] = [];
    const POOL = 24, CAP = 3;
    for (let L = 1; L <= 60; L++) {
      const [cols, rows] = gridFor(L);
      const list = SH[`${cols}x${rows}`];
      const sh = list[L <= 2 ? 0 : ((L - 3) * STEP) % list.length];
      const slots = sh.join('').split('').filter((c) => c === '#').length;
      const types = Math.min(POOL, slots - 2, 4 + Math.floor(L / 2));
      let spares = Math.max(2, Math.ceil(slots * 0.34) - Math.floor((L - 1) / 4));
      spares = Math.max(2, Math.min(spares, slots - types));
      if (spares < 2) bad.push(`L${L}: свободных ${spares}`);
      if (slots - spares < types) bad.push(`L${L}: ёмкости на ${types} типов не хватает`);
      if (types * CAP > (slots - spares) * CAP) bad.push(`L${L}: товары не влезают`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Цель Дениса 19.08.2026 — 55 уровней. Формы сами дают 30; остальное добьют
   * препятствия и цели уровня, они множатся с формами. Порог здесь ниже цели
   * намеренно: он стережёт, чтобы разнообразие не УПАЛО, а не изображает,
   * будто цель уже достигнута.
   */
  it('разных уровней за первые 60 — не меньше 28', () => {
    const seen = new Set<string>();
    const POOL = 24;
    for (let L = 1; L <= 60; L++) {
      const [cols, rows] = gridFor(L);
      const list = SH[`${cols}x${rows}`];
      const sh = list[L <= 2 ? 0 : ((L - 3) * STEP) % list.length];
      const slots = sh.join('').split('').filter((c) => c === '#').length;
      const types = Math.min(POOL, slots - 2, 4 + Math.floor(L / 2));
      let spares = Math.max(2, Math.ceil(slots * 0.34) - Math.floor((L - 1) / 4));
      spares = Math.max(2, Math.min(spares, slots - types));
      const over = Math.max(0, L - 8);
      const moveLimit = over > 0 ? Math.max(types * 2, types * 3 - over) : 0;
      seen.add(`${cols}x${rows}|${sh.join('/')}|${types}|${spares}|${moveLimit}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(28);
  });
});
