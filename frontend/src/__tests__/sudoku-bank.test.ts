/* psygames-test-sudoku-bank · VER 1 · 23.08.2026 */
/**
 * ГЕЙТ БАНКА КЛАССИЧЕСКОЙ СУДОКУ.
 *
 * Проверяет ровно те три вещи, ради которых банк и заведён, — и каждую так, чтобы
 * ложь по ней краснела, а не проскакивала:
 *
 * 1. ЛЕСТНИЦА МОНОТОННА. Рейтинг доски, выдаваемой уровню N+1, не ниже, чем уровню N.
 *    Не «в целом растёт», а не падает НИГДЕ — ни на одной паре соседних уровней, ни на
 *    одной из трёх дорог. У прежней лестницы `targetTier` это не так: полоса варианта
 *    перезапускается каждые четыре уровня, и L46 просит 3..4 после L45, просившего 6..6.
 *
 * 2. РЕШЕНИЕ ЕДИНСТВЕННО — СВОИМ ПЕРЕБОРОМ. Банк заявляет, что все 1835 досок прогнаны
 *    независимой проверкой при закладке. Гейт этому НЕ ВЕРИТ и считает заново: ниже
 *    свой перебор на битовых масках, ничего общего с `countSolutions` ядра. Доска с
 *    двумя решениями — это партия, где верный ход засчитывается ошибкой (репорты Вали
 *    «могло быть оба варианта»), и ловить её надо у себя, а не в чужой строке README.
 *
 * 3. ВЫБОР ИДЁТ ПО ЗЕРНУ, А НЕ ПО КРУГУ. Два условия сразу, и они ловят разное:
 *    одно зерно дважды → та же доска (это краснеет на обходе по кругу, где доска
 *    зависит от счётчика вызовов), разные зёрна → разные доски (это краснеет там,
 *    где зерно вообще не читают).
 *
 * ⚠️ НИЧЕГО СЛУЧАЙНОГО. Все зёрна в файле записаны буквами. Проверка, раздающая через
 * `Math.random`, бывает зелёной локально и красной в сборке — этой ценой уже платили.
 */
import {
  BANK_BC, BANK_BR, BANK_N, RATING_LADDER, SUDOKU_BANK,
  bankBoardForLevel, bankPool, bankRatingForLevel,
} from '@/src/services/sudoku-bank';
import { levelConfig } from '@/src/services/sudoku-core';
import { gradePuzzle, targetTier } from '@/src/services/sudoku-grade';

// Тот же приём, что в sudoku-high-levels.test.ts: tsconfig не подключает типы node
// (`types: ["jest"]`), поэтому fs/path объявляются вручную, а не тянут @types/node.
declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

/** Последний уровень игры — тот же, что сторожит гейт уровней. */
const LAST_LEVEL = 80;
const LEVELS = Array.from({ length: LAST_LEVEL }, (_, i) => i + 1);

/** Дороги отдают банку сдвиг по ступени лестницы: −1 полегче, 0 обычная, +1 пожёстче. */
const ROAD_SHIFTS = [-1, 0, 1];

/** Зёрна записаны буквами намеренно — см. «⚠️ НИЧЕГО СЛУЧАЙНОГО» в шапке. */
const SEEDS = ['кедр-муссон-47', 'сокол-риф-12', 'дюна-иней-88', 'оникс-пламя-31', 'лагуна-агат-55'];

/**
 * Зёрна для проходов по ВСЕЙ лестнице. Их два, а не пять, по цене: каждая доска
 * несёт решение, а решение считается перебором, и полный проход пятью зёрнами трижды
 * (по числу дорог) добавлял к общему `npm test` пятнадцать секунд ради того же вывода.
 */
const SWEEP_SEEDS = [SEEDS[0] as string, SEEDS[3] as string];

// ─────────────────────────────────────────────────────────────────────────────
// СВОЙ ПЕРЕБОР. Ядро игры здесь не участвует вовсе: если бы участвовало, гейт
// проверял бы согласие кода с самим собой, а не с правилами судоку.
// ─────────────────────────────────────────────────────────────────────────────

/** Сколько решений у доски, но не больше `limit`. Битовые маски + MRV, свой код. */
function countSolutionsOwn(puzzle: readonly number[][], limit = 2): number {
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  const cell = new Array<number>(81).fill(0);
  const boxOf = (r: number, c: number) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = (puzzle[r] as readonly number[])[c] as number;
      cell[r * 9 + c] = v;
      if (v === 0) continue;
      const b = 1 << (v - 1);
      // Подсказка, конфликтующая с уже поставленной, — доска противоречива, решений ноль.
      if ((rows[r] as number) & b || (cols[c] as number) & b || (boxes[boxOf(r, c)] as number) & b) return 0;
      rows[r] = (rows[r] as number) | b;
      cols[c] = (cols[c] as number) | b;
      boxes[boxOf(r, c)] = (boxes[boxOf(r, c)] as number) | b;
    }
  }

  const ALL = (1 << 9) - 1;
  let found = 0;

  const walk = (): boolean => {   // true = стоп, набрали limit
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (cell[i] !== 0) continue;
      const r = Math.floor(i / 9);
      const c = i % 9;
      const mask = ALL & ~((rows[r] as number) | (cols[c] as number) | (boxes[boxOf(r, c)] as number));
      let n = 0;
      for (let m = mask; m; m &= m - 1) n++;
      if (n < bestCount) { bestCount = n; best = i; bestMask = mask; if (n <= 1) break; }
    }
    if (best < 0) { found++; return found >= limit; }
    if (bestCount === 0) return false;
    const r = Math.floor(best / 9);
    const c = best % 9;
    const b = boxOf(r, c);
    for (let m = bestMask; m; m &= m - 1) {
      const bit = m & -m;
      const v = 32 - Math.clz32(bit);
      cell[best] = v;
      rows[r] = (rows[r] as number) | bit;
      cols[c] = (cols[c] as number) | bit;
      boxes[b] = (boxes[b] as number) | bit;
      const stop = walk();
      cell[best] = 0;
      rows[r] = (rows[r] as number) & ~bit;
      cols[c] = (cols[c] as number) & ~bit;
      boxes[b] = (boxes[b] as number) & ~bit;
      if (stop) return true;
    }
    return false;
  };

  walk();
  return found;
}

/** Заполненная сетка законна: в каждой строке, столбце и блоке все девять цифр. */
function isCompleteAndLegal(grid: readonly number[][]): boolean {
  const full = (1 << 9) - 1;
  for (let i = 0; i < 9; i++) {
    let row = 0;
    let col = 0;
    let box = 0;
    for (let j = 0; j < 9; j++) {
      const a = (grid[i] as readonly number[])[j] as number;
      const b = (grid[j] as readonly number[])[i] as number;
      const br = Math.floor(i / 3) * 3 + Math.floor(j / 3);
      const bc = (i % 3) * 3 + (j % 3);
      const d = (grid[br] as readonly number[])[bc] as number;
      if (a < 1 || a > 9 || b < 1 || b > 9 || d < 1 || d > 9) return false;
      row |= 1 << (a - 1);
      col |= 1 << (b - 1);
      box |= 1 << (d - 1);
    }
    if (row !== full || col !== full || box !== full) return false;
  }
  return true;
}

const key = (grid: readonly number[][]): string => grid.map((r) => r.join('')).join('');

// ─────────────────────────────────────────────────────────────────────────────

describe('банк классической судоку: происхождение и полосы', () => {
  it('банк на месте и той величины, под которую строилась таблица', () => {
    expect(SUDOKU_BANK.size).toBe(1835);
    expect(SUDOKU_BANK.bands.length).toBe(58);
    // Лицензия — общественное достояние: если источник когда-нибудь подменят на другой,
    // это обязано быть видно здесь, а не выясняться в магазине приложений.
    expect(SUDOKU_BANK.license).toMatch(/[Оо]бщественное достояние/);
  });

  it('каждая полоса лестницы полная — не меньше сорока досок', () => {
    // Тощая полоса превращает «по зерну» в «по кругу» сама собой: выбирать не из чего.
    for (const row of RATING_LADDER) {
      expect({ rating: row.rating, size: bankPool(row.rating).length })
        .toEqual({ rating: row.rating, size: expect.any(Number) });
      expect(bankPool(row.rating).length).toBeGreaterThanOrEqual(40);
    }
  });

  it('строки таблицы идут по неубывающему рейтингу и покрывают лестницу до конца', () => {
    for (let i = 1; i < RATING_LADDER.length; i++) {
      const prev = RATING_LADDER[i - 1]!;
      const cur = RATING_LADDER[i]!;
      expect(cur.rating).toBeGreaterThan(prev.rating);
      expect(cur.upTo).toBeGreaterThan(prev.upTo);
      // Обоснование у каждой строки обязано быть непустым: таблица — решение, а
      // решение без причины через полгода не отличить от опечатки.
      expect(cur.why.length).toBeGreaterThan(10);
    }
    expect(RATING_LADDER[RATING_LADDER.length - 1]!.upTo).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('банк: лестница монотонна', () => {
  it.each(ROAD_SHIFTS)('полоса не падает ни на одной паре соседних уровней (сдвиг %i)', (shift) => {
    const drops: string[] = [];
    for (let lv = 1; lv < LAST_LEVEL + 10; lv++) {
      const a = bankRatingForLevel(lv, shift);
      const b = bankRatingForLevel(lv + 1, shift);
      if (b < a) drops.push(`L${lv}→L${lv + 1}: ${a}→${b}`);
    }
    expect(drops).toEqual([]);
  });

  it('выданная доска уровня N+1 рейтингом не ниже доски уровня N', () => {
    // Полосы таблицы не пересекаются, поэтому монотонность полос переносится на
    // КОНКРЕТНЫЕ доски — проверяем это на настоящей выдаче, а не на словах.
    for (const seed of SWEEP_SEEDS) {
      const drops: string[] = [];
      for (let lv = 1; lv < LAST_LEVEL; lv++) {
        const a = bankBoardForLevel(lv, seed).rating;
        const b = bankBoardForLevel(lv + 1, seed).rating;
        if (b < a) drops.push(`${seed} L${lv}→L${lv + 1}: ${a}→${b}`);
      }
      expect(drops).toEqual([]);
    }
  });

  it('лестница действительно РАСТЁТ: от первого уровня к последнему рейтинг выше', () => {
    // Монотонность одна ничего не стоит: плоская лестница тоже монотонна.
    expect(bankRatingForLevel(LAST_LEVEL)).toBeGreaterThan(bankRatingForLevel(1) + 3);
    const distinct = new Set(LEVELS.map((lv) => bankRatingForLevel(lv)));
    expect(distinct.size).toBeGreaterThanOrEqual(20);
  });

  it('прежняя лестница targetTier немонотонна — это и есть причина таблицы', () => {
    // Не проверка банка, а зафиксированный ФАКТ про старую ось. Если targetTier
    // когда-нибудь починят, тест покраснеет и заставит перечитать обоснование таблицы.
    const drops: string[] = [];
    for (let lv = 1; lv < LAST_LEVEL; lv++) {
      if (targetTier(lv + 1).max < targetTier(lv).max) drops.push(`L${lv}→L${lv + 1}`);
    }
    expect(drops.length).toBeGreaterThan(0);
  });
});

describe('банк: уровню достаётся доска ИЗ ЕГО полосы', () => {
  it.each(ROAD_SHIFTS)('рейтинг выданной доски равен полосе уровня (сдвиг %i)', (shift) => {
    const wrong: string[] = [];
    for (const lv of LEVELS) {
      const want = bankRatingForLevel(lv, shift);
      for (const seed of SWEEP_SEEDS) {
        const got = bankBoardForLevel(lv, seed, shift).rating;
        if (Math.abs(got - want) > 1e-9) wrong.push(`L${lv} ${seed}: ждали ${want}, дали ${got}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('дорога сдвигает полосу в нужную сторону, а на краях упирается, а не срывается', () => {
    expect(bankRatingForLevel(30, -1)).toBeLessThan(bankRatingForLevel(30, 0));
    expect(bankRatingForLevel(30, 1)).toBeGreaterThan(bankRatingForLevel(30, 0));
    // Низ лестницы: «полегче» ниже первой полосы не уводит.
    expect(bankRatingForLevel(1, -1)).toBe(bankRatingForLevel(1, 0));
    // Верх: «пожёстче» на последнем уровне обязано что-то дать, а не упереться в ту же полосу.
    expect(bankRatingForLevel(LAST_LEVEL, 1)).toBeGreaterThan(bankRatingForLevel(LAST_LEVEL, 0));
  });
});

describe('банк: выбор внутри полосы — по зерну', () => {
  it('одно зерно, один уровень — та же доска, сколько ни спрашивай', () => {
    for (const lv of [5, 8, 21, 34, 57]) {
      for (const seed of SEEDS) {
        const a = bankBoardForLevel(lv, seed);
        const b = bankBoardForLevel(lv, seed);
        expect(key(b.puzzle)).toBe(key(a.puzzle));
        // Решение считается перебором ядра, а он ходит по кандидатам в случайном
        // порядке. Ответ обязан быть тем же — иначе единственность решения не та,
        // за которую мы её выдаём.
        expect(key(b.solution)).toBe(key(a.solution));
        expect(b.index).toBe(a.index);
      }
    }
  });

  it('разные зёрна на одном уровне — разные доски', () => {
    for (const lv of [5, 8, 21, 34, 57]) {
      const seen = new Set(SEEDS.map((s) => key(bankBoardForLevel(lv, s).puzzle)));
      // Полоса из сорока досок: пять зёрен, совпавших все до единого, означают, что
      // зерно не читают вовсе.
      expect(seen.size).toBeGreaterThan(1);
    }
    // Именованная пара — чтобы отказ был читаемым, а не «размер множества 1».
    expect(key(bankBoardForLevel(8, 'кедр-муссон-47').puzzle))
      .not.toBe(key(bankBoardForLevel(8, 'сокол-риф-12').puzzle));
  });

  it('зерно нормализуется: «Кедр Муссон 47» и «кедр-муссон-47» — одна доска', () => {
    expect(key(bankBoardForLevel(8, 'Кедр Муссон 47').puzzle))
      .toBe(key(bankBoardForLevel(8, 'кедр-муссон-47').puzzle));
  });

  it('одно зерно на разных уровнях одной полосы — разные доски', () => {
    // L5 и L6 сидят на одной полосе 1.2. Если уровень не входит в зерно, весь путь
    // игрока раздавался бы одним и тем же местом полосы.
    expect(key(bankBoardForLevel(5, 'дюна-иней-88').puzzle))
      .not.toBe(key(bankBoardForLevel(6, 'дюна-иней-88').puzzle));
  });

  it('зерно разводит игроков по полосе, а не жмёт всех в один угол', () => {
    const idx = new Set(
      Array.from({ length: 60 }, (_, i) => bankBoardForLevel(8, `игрок-${i}`).index),
    );
    expect(idx.size).toBeGreaterThanOrEqual(20);
  });
});

describe('банк: у каждой выдаваемой доски РОВНО ОДНО решение', () => {
  jest.setTimeout(300_000);

  it('свой перебор подтверждает единственность на всех полосах лестницы', () => {
    // Считаем не выборку, а ВСЕ доски всех полос, до которых лестница может дотянуться
    // (включая полосу, которую достаёт только дорога «пожёстче»).
    const bad: string[] = [];
    let checked = 0;
    for (const row of RATING_LADDER) {
      for (const board of bankPool(row.rating)) {
        const puzzle: number[][] = [];
        for (let r = 0; r < 9; r++) {
          puzzle.push([...board.p.slice(r * 9, r * 9 + 9)].map(Number));
        }
        const n = countSolutionsOwn(puzzle, 2);
        checked++;
        if (n !== 1) bad.push(`SE ${row.rating}: решений ${n >= 2 ? '≥2' : n}`);
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(RATING_LADDER.length * 40);
  });

  it('решение, которое отдаётся игре, законно и совпадает с подсказками доски', () => {
    for (const lv of LEVELS) {
      for (const seed of SWEEP_SEEDS) {
        const b = bankBoardForLevel(lv, seed);
        expect(isCompleteAndLegal(b.solution)).toBe(true);
        // Открытая клетка обязана совпасть с решением — иначе честный ход игрока
        // сверка с зашитым решением засчитает ошибкой.
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const v = (b.puzzle[r] as number[])[c] as number;
            if (v !== 0) expect(v).toBe((b.solution[r] as number[])[c]);
          }
        }
        expect(b.blanks).toBe(81 - [...key(b.puzzle)].filter((ch) => ch !== '0').length);
        expect(b.blanks).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('размер доски банка — ровно классические 9×9', () => {
    expect([BANK_N, BANK_BR, BANK_BC]).toEqual([9, 3, 3]);
    const b = bankBoardForLevel(8, SEEDS[1] as string);
    expect(b.puzzle.length).toBe(9);
    expect(b.puzzle.every((r) => r.length === 9)).toBe(true);
  });
});

describe('банк: оценщик техник остался и описывает доску банка', () => {
  it('на полосах до SE 3.6 оценщик называет технику, и она растёт вместе с лестницей', () => {
    // Оценщик не назначает сложность — он говорит игроку, КАКАЯ техника здесь работает.
    // Проверяем, что он вообще применим к доскам банка и что низ лестницы берётся
    // простыми техниками, а верх его области — непростыми.
    const tierOf = (lv: number, seed: string): number => {
      const g = gradePuzzle(bankBoardForLevel(lv, seed).puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' });
      return g.solved ? g.tier : -1;
    };
    const low = SEEDS.map((s) => tierOf(5, s));
    const high = SEEDS.map((s) => tierOf(29, s));
    expect(low.every((t) => t >= 1 && t <= 2)).toBe(true);
    expect(high.every((t) => t >= 4)).toBe(true);
  });
});

describe('банк: варианты не тронуты', () => {
  it('в банке только классика — все уровни с правилом варианта идут мимо него', () => {
    const classic = LEVELS.filter((lv) => levelConfig(lv).variant === 'none' && levelConfig(lv).N === 9);
    const variants = LEVELS.filter((lv) => levelConfig(lv).variant !== 'none');
    // Лестница 28.08: классика 9×9 — уровни 5–8 (вход) и 58–80 (пояса ALS/цепей из
    // банка, где сложность растёт рейтингом доски); 9–57 — под правилами вариантов.
    expect(classic).toEqual([5, 6, 7, 8, ...Array.from({ length: 23 }, (_, i) => 58 + i)]);
    expect(variants.length).toBe(49);
  });

  it('экран берёт банк ТОЛЬКО под классику 9×9, а генератор вариантов на месте', () => {
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/sudoku.tsx'), 'utf8');
    // Вызов банка обязан стоять за проверкой «правило пустое И доска девятка».
    expect(src).toMatch(/if \(vr === 'none' && d\.N === BANK_N\) \{[\s\S]{0,600}?bankBoardForLevel\(/);
    // Путь вариантов не выпилен: без него диагональ, джигсо и термометры остались бы без досок.
    expect(src).toMatch(/logicalBuilder\(lv, blanks, d\.N, d\.BR, d\.BC, vr/);
    expect(src).toMatch(/roadTier\(lv, road\)/);
  });
});
