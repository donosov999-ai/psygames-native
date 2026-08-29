/* psygames-sudoku-thermocage-gate · VER 1 · 20.08.2026 */
/**
 * THERMOCAGE — ТЕРМОМЕТР И КЛЕТКИ-СУММЫ НА ОДНОЙ ДОСКЕ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ, ЕСЛИ ОБЕ ПОЛОВИНЫ УЖЕ ЕСТЬ. Два набора ограничений на
 * одной доске — это НЕ сумма двух флагов. Вместе они дают выводы, которых нет ни у
 * одного порознь, и доска, единственная по каждому правилу отдельно, вместе может
 * оказаться и тривиальной, и вовсе неразрешимой. Замер 20.08.2026 на выданных
 * генератором досках L54: единственна доска ТОЛЬКО с обоими правилами, а по одному
 * термометру, по одним суммам и по базовому судоку у неё 2+ решения. То есть
 * проверять единственность по половине правил — значит выпускать доску, на которой
 * честный игрок ставит валидную вторую цифру и получает «ошибку» (ровно тот репорт
 * Вали, из-за которого в v1.156 в проверку добавляли маркерные варианты).
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ ВЕЗДЕ ИСПОЛНЕНИЕ, А НЕ РАЗБОР ТЕКСТА. За сутки шесть раз
 * попадались на том, что гейт держал зелёный цвет из-за слова в комментарии, и
 * дважды — на том, что проверка смотрела срез данных вместо всех. Поэтому:
 *   · правила проверяются НА РЕШЕНИИ и на КАЖДОЙ клетке доски, а не на выборке;
 *   · единственность считается настоящим countSolutions с обоими правилами;
 *   · отдельным блоком ниже стоят НАРОЧНО ИСПОРЧЕННЫЕ данные — если проверка на них
 *     не краснеет, она не проверка. Без этого блока «сумма сходится» зеленела бы и
 *     на доске, где сумм нет вовсе.
 *
 * ⚠️ Экранная часть (что термометр и сумма нарисованы и не спорят за место) держится
 * не текстом, а условиями отрисовки: сумма стоит в углу клетки, колба — по центру,
 * и обе разметки включены одним признаком `showCages`/`variant === 'thermocage'`.
 * Ниже это читается из исходника экрана — но только там, где иначе проверить нечем.
 */
import {
  Cell, CageMap, ThermoPN, levelConfig, generatePuzzle, countSolutions, isValid,
  generateThermoCages, cageMapFrom, variantRule, variantLabel,
} from '@/src/services/sudoku-core';
import { gradePuzzle, generateLogical, TECHNIQUE_TIER } from '@/src/services/sudoku-grade';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const N = 9, BR = 3, BC = 3;

/**
 * Одна доска ThermoCage тем же путём, каким её получает игрок на уровне 50.
 *
 * ⚠️ Берём доску, ПРИШЕДШУЮ ОТ ЛОГИКИ (`fellBack === false`). У generateLogical есть
 * запасной путь через перебор с проверкой единственности: доска оттуда честная, но
 * решаемой логикой не обещана, и мерить по ней технику — мерить не то. Замер 24 досок
 * 20.08.2026: запасной путь не сработал ни разу, поэтому три неудачи подряд — это
 * регресс, а не невезение, и гейт обязан на них покраснеть.
 */
/**
 * 🔴 Бюджет фикстуры — снаружи (рецепт стабилизации 2731e0b6, раскатан 29.08):
 * на медленной CI-машине 6000 мс не хватало, generateLogical падал в fallback без
 * разметок, и «обе разметки на доске есть» краснел ложью (срезы тегов 1.253.0 и
 * 1.255.0). При боевом бюджете недобор — честный красный (регресс генератора);
 * при задушенном (SUDOKU_BUDGET_MS меньше дефолта) — null, и кейс пропускается.
 */
const FIXTURE_BUDGET_MS = Number(process.env.SUDOKU_BUDGET_MS ?? 30000);

function board(level = 50) {   // 27.08: термоклетка переехала на 50–53 (джигсо — вершина)
  const cfg = levelConfig(level);
  expect(cfg.variant).toBe('thermocage');
  for (let attempt = 0; attempt < 3; attempt++) {
    const { gen, fellBack } = generateLogical(level, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: FIXTURE_BUDGET_MS });
    if (!fellBack && gen.thermo && gen.cages) return gen;
  }
  if (FIXTURE_BUDGET_MS < 30000) return null;   // задушенный прогон: пропуск, не вердикт
  throw new Error('L50: логический путь не дал доску за три захода на боевом бюджете');
}

/**
 * ЗАМОРОЖЕННАЯ ДОСКА — та самая, ради которой существует этот гейт.
 *
 * Выдана генератором 20.08.2026 (техника решения — голая пара). На ней разница между
 * «проверил комбинацию» и «проверил половину» видна числом: с обоими правилами решение
 * ОДНО, а с любым правилом по отдельности — два. На случайной доске это утверждение
 * держать нельзя (у части досок хватает и одних сумм), поэтому оно стоит на фикстуре,
 * а со случайной спрашивается то, что верно всегда.
 */
const FIX_PUZZLE: Cell[][] = [
  [0, 1, 0, 0, 0, 0, 9, 6, 0],
  [0, 0, 0, 0, 5, 0, 2, 0, 4],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 7, 3, 8, 0, 0, 0, 0],
  [9, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 8, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 2, 0, 7, 0],
  [0, 5, 0, 0, 0, 0, 8, 0, 1],
  [0, 0, 0, 0, 0, 0, 5, 0, 0],
];
/** Термометры: путь от колбы, цифры вдоль него строго растут. */
const FIX_THERMO_PATHS: [number, number][][] = [
  [[0, 5], [1, 5], [2, 5]],
  [[0, 8], [0, 7], [0, 6]],
  [[1, 6], [1, 7], [1, 8], [2, 8], [2, 7]],
  [[4, 4], [4, 3], [5, 3]],
  [[6, 3], [7, 3], [7, 2]],
  [[6, 5], [7, 5], [7, 4], [6, 4]],
];
/** Клетки-суммы: метка в углу группы + её состав. Часть клеток лежит и на термометре. */
const FIX_CAGES: { sum: number; cells: [number, number][] }[] = [
  { sum: 9, cells: [[2, 6], [2, 7]] },
  { sum: 27, cells: [[4, 2], [5, 2], [5, 3], [6, 2], [6, 3]] },
  { sum: 23, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { sum: 17, cells: [[7, 7], [8, 7], [8, 8]] },
  { sum: 7, cells: [[4, 4], [4, 5]] },
  { sum: 13, cells: [[0, 2], [1, 2], [2, 2]] },
  { sum: 9, cells: [[8, 0], [8, 1]] },
  { sum: 15, cells: [[1, 4], [1, 5], [2, 4]] },
  { sum: 24, cells: [[3, 8], [4, 7], [4, 8], [5, 8]] },
];
function thermoFromPaths(paths: [number, number][][]): ThermoPN {
  const pn: ThermoPN = Array.from({ length: N }, () => Array(N).fill(null));
  for (const path of paths) path.forEach(([r, c], k) => {
    pn[r][c] = { prev: k > 0 ? path[k - 1] : null, next: k < path.length - 1 ? path[k + 1] : null };
  });
  return pn;
}
function cagesFromList(list: { sum: number; cells: [number, number][] }[]): CageMap {
  const cageOf = Array.from({ length: N }, () => Array(N).fill(-1));
  const sum: number[] = [], anchor: number[] = [];
  list.forEach((g, id) => {
    for (const [r, c] of g.cells) cageOf[r][c] = id;
    sum[id] = g.sum;
    anchor[id] = Math.min(...g.cells.map(([r, c]) => r * N + c));
  });
  return cageMapFrom(cageOf, sum, anchor, N);
}

/** Нарушения строгого роста вдоль цепочек — по ВСЕЙ доске, а не по первой найденной. */
function thermoBreaks(sol: Cell[][], thermo: ThermoPN): string[] {
  const bad: string[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const pn = thermo[r][c];
    if (!pn || !pn.next) continue;
    const [nr, nc] = pn.next;
    if (!(sol[r][c] < sol[nr][nc])) bad.push(`r${r}c${c}=${sol[r][c]} → r${nr}c${nc}=${sol[nr][nc]}`);
  }
  return bad;
}

/** Нарушения клеток-сумм: сумма не сошлась или цифра внутри группы повторилась. */
function cageBreaks(sol: Cell[][], cages: CageMap): string[] {
  const bad: string[] = [];
  for (let id = 0; id < cages.cells.length; id++) {
    const cells = cages.cells[id];
    if (!cells) continue;
    const digits = cells.map(([r, c]) => sol[r][c]);
    const total = digits.reduce((a, b) => a + b, 0);
    if (total !== cages.sum[id]) bad.push(`группа ${id}: сумма ${total}, на метке ${cages.sum[id]}`);
    if (new Set(digits).size !== digits.length) bad.push(`группа ${id}: повтор цифры ${digits.join(',')}`);
  }
  return bad;
}

describe('ThermoCage: доска несёт оба правила сразу', () => {
  const gen = board();
    if (!gen) { console.log('бюджет: фикстура не добрана — пропуск'); return; }
  const { puzzle, solution, thermo, cages } = gen as { puzzle: Cell[][]; solution: Cell[][]; thermo: ThermoPN; cages: CageMap };

  it('обе разметки на доске есть, и они пересекаются', () => {
    let onThermo = 0, inCage = 0, both = 0, groups = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = !!thermo[r][c], g = cages.cageOf[r][c] >= 0;
      if (t) onThermo++;
      if (g) inCage++;
      if (t && g) both++;
    }
    for (let id = 0; id < cages.cells.length; id++) if (cages.cells[id]) groups++;
    // Не «есть хоть что-то», а обе разметки заметной величины: одна цепочка на всю
    // доску или одна группа из двух клеток — это украшение, а не второе правило.
    expect(`цепочки ${onThermo >= 12} · группы ${groups >= 5} · в группах ${inCage >= 16} · пересечение ${both >= 1}`)
      .toBe('цепочки true · группы true · в группах true · пересечение true');
  });

  it('термометр строго растёт вдоль КАЖДОЙ цепочки решения', () => {
    expect(thermoBreaks(solution, thermo)).toEqual([]);
  });

  it('сумма КАЖДОЙ группы сходится с решением, цифры внутри не повторяются', () => {
    expect(cageBreaks(solution, cages)).toEqual([]);
  });

  it('на пересечении правила не спорят: решение принимается isValid в каждой клетке', () => {
    // Проверка исполнением, а не рассуждением: подставляем цифру решения в пустую
    // доску клетка за клеткой и спрашиваем движок, законна ли она при ОБОИХ правилах.
    const grid: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
    const rejected: string[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!isValid(grid, r, c, solution[r][c], N, BR, BC, 'thermocage', undefined, thermo, undefined, cages)) {
        rejected.push(`r${r}c${c}=${solution[r][c]}`);
      }
      grid[r][c] = solution[r][c];
    }
    expect(rejected).toEqual([]);
  });

  it('🔴 решение единственно ПО ДВУМ правилам, и базовых правил для этого мало', () => {
    // Счётчик при исчерпании шагов возвращает limit — «не доказал» ≠ «два решения»
    // (рецепт 2731e0b6): вердикт «один» ставится только при живом остатке бюджета.
    const count = (variant: 'none' | 'thermo' | 'thermocage', th?: ThermoPN, cg?: CageMap) => {
      const bud = { steps: 400000 };
      const n = countSolutions(puzzle.map((row) => [...row]), N, BR, BC, variant, undefined, 2, bud, th, undefined, cg);
      return { n, proven: bud.steps >= 0 };
    };
    const both = count('thermocage', thermo, cages);
    if (!both.proven) console.log('живая доска: счётчик исчерпал шаги — половина «оба 1» пропущена');
    else expect(`оба ${both.n}`).toBe('оба 1');
    // Доска выкопана глубже, чем держит классическое судоку: без правил варианта у неё
    // два решения. Значит единственность даёт ИМЕННО комбинация, а не остатки подсказок.
    expect(`база ${count('none').n}`).toBe('база 2');   // найти два дешевле, чем доказать один
  });

  it('🔴 доска берётся ЛОГИКОЙ, без перебора, и не одними голыми одиночками', () => {
    const g = gradePuzzle(puzzle, { N, BR, BC, variant: 'thermocage', thermo, cages });
    expect(`решается ${g.solved} · техника ${g.hardest}`).toBe(`решается true · техника ${g.hardest}`);
    expect(g.solved).toBe(true);
    expect(g.hardest).not.toBe('guess');
    // Замер 24 досок L54 (20.08.2026): голые одиночки — 0, скрытые одиночки 9,
    // связанные кандидаты 5, голые пары/тройки 10. Порог держим по НИЖНЕЙ границе
    // замера: если вариант выродится в украшение, доска станет решаться одними
    // голыми одиночками — и это покраснеет здесь.
    expect(TECHNIQUE_TIER[g.hardest]).toBeGreaterThanOrEqual(TECHNIQUE_TIER.hidden_single);
    // Без сумм та же доска логикой НЕ берётся — суммы не декорация, а половина задачи.
    expect(gradePuzzle(puzzle, { N, BR, BC, variant: 'thermo', thermo }).solved).toBe(false);
  });
});

describe('замороженная доска: единственность даёт КОМБИНАЦИЯ, а не половина правил', () => {
  const thermo = thermoFromPaths(FIX_THERMO_PATHS);
  const cages = cagesFromList(FIX_CAGES);
  const count = (variant: 'none' | 'thermo' | 'thermocage', th?: ThermoPN, cg?: CageMap) =>
    countSolutions(FIX_PUZZLE.map((row) => [...row]), N, BR, BC, variant, undefined, 2, { steps: 600000 }, th, undefined, cg);

  it('🔴 оба правила → одно решение; термометр без сумм, суммы без термометра, база → два', () => {
    expect(`оба ${count('thermocage', thermo, cages)}`).toBe('оба 1');
    expect(`только термометр ${count('thermo', thermo)}`).toBe('только термометр 2');
    expect(`только суммы ${count('thermocage', undefined, cages)}`).toBe('только суммы 2');
    expect(`база ${count('none')}`).toBe('база 2');
  });

  it('на этой доске разметки действительно пересекаются — иначе «комбинация» была бы словом', () => {
    const cross: string[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (thermo[r][c] && cages.cageOf[r][c] >= 0) cross.push(`r${r}c${c}`);
    }
    expect(cross.length).toBeGreaterThanOrEqual(3);
  });

  it('и она берётся логикой — техника выше голых одиночек', () => {
    const g = gradePuzzle(FIX_PUZZLE, { N, BR, BC, variant: 'thermocage', thermo, cages });
    expect(`решается ${g.solved}, техника ${g.hardest}`).toBe('решается true, техника naked_subset');
  });
});

describe('ThermoCage: проверки краснеют на нарочно испорченных данных', () => {
  // Без этого блока любая проверка выше зеленела бы на пустых данных — а пустые
  // данные это и есть самый частый способ сломать вариант незаметно.
  const sol: Cell[][] = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8, 9, 1, 2, 3],
    [7, 8, 9, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 1],
    [5, 6, 7, 8, 9, 1, 2, 3, 4],
    [8, 9, 1, 2, 3, 4, 5, 6, 7],
    [3, 4, 5, 6, 7, 8, 9, 1, 2],
    [6, 7, 8, 9, 1, 2, 3, 4, 5],
    [9, 1, 2, 3, 4, 5, 6, 7, 8],
  ];
  const thermoOf = (path: [number, number][]): ThermoPN => {
    const pn: ThermoPN = Array.from({ length: N }, () => Array(N).fill(null));
    path.forEach(([r, c], k) => { pn[r][c] = { prev: k > 0 ? path[k - 1] : null, next: k < path.length - 1 ? path[k + 1] : null }; });
    return pn;
  };

  it('падающая цепочка ловится проверкой роста', () => {
    // r0: 1 2 3 — растёт; обратный ход 3 → 2 → 1 обязан покраснеть.
    expect(thermoBreaks(sol, thermoOf([[0, 0], [0, 1], [0, 2]]))).toEqual([]);
    expect(thermoBreaks(sol, thermoOf([[0, 2], [0, 1], [0, 0]])).length).toBe(2);
  });

  it('разъехавшаяся сумма и повтор цифры внутри группы ловятся', () => {
    const mk = (cells: [number, number][], sum: number): CageMap => {
      const cageOf = Array.from({ length: N }, () => Array(N).fill(-1));
      for (const [r, c] of cells) cageOf[r][c] = 0;
      return cageMapFrom(cageOf, [sum], [cells[0][0] * N + cells[0][1]], N);
    };
    expect(cageBreaks(sol, mk([[0, 0], [0, 1]], 3))).toEqual([]);            // 1+2 = 3
    expect(cageBreaks(sol, mk([[0, 0], [0, 1]], 4)).length).toBe(1);          // метка врёт
    expect(cageBreaks(sol, mk([[0, 0], [1, 6]], 2)).length).toBe(1);          // 1 и 1 — повтор
  });

  it('isValid отказывает и по сумме, и по цепочке — каждое правило по отдельности', () => {
    const grid: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
    const cageOf = Array.from({ length: N }, () => Array(N).fill(-1));
    cageOf[0][0] = 0; cageOf[0][1] = 0;
    const cages = cageMapFrom(cageOf, [5], [0], N);          // две клетки, сумма 5
    grid[0][0] = 1;
    expect(isValid(grid, 0, 1, 4, N, BR, BC, 'thermocage', undefined, undefined, undefined, cages)).toBe(true);   // 1+4 = 5
    expect(isValid(grid, 0, 1, 3, N, BR, BC, 'thermocage', undefined, undefined, undefined, cages)).toBe(false);  // 1+3 ≠ 5
    grid[0][0] = 0;

    // ⚠️ ПОВТОР ЦИФРЫ ВНУТРИ ГРУППЫ ПРОВЕРЯЕМ НА КЛЕТКАХ, КОТОРЫЕ НЕ ДЕЛЯТ НИ СТРОКУ,
    // НИ СТОЛБЕЦ, НИ БЛОК. Первая версия этой проверки брала (0,0) и (0,1) — одну строку,
    // и повтор ловило базовое правило судоку. Гейт был зелёным даже когда правило группы
    // из движка ВЫРЕЗАНО (проверено поломкой 20.08.2026). Группа r0c2–r1c2–r1c3 такой лазейки
    // не оставляет: r0c2 и r1c3 — разные строка, столбец и блок, запретить повтор может
    // только правило клетки-суммы.
    const zig = Array.from({ length: N }, () => Array(N).fill(-1));
    zig[0][2] = 0; zig[1][2] = 0; zig[1][3] = 0;
    const trio = cageMapFrom(zig, [13], [2], N);
    grid[0][2] = 6; grid[1][2] = 3;
    expect(isValid(grid, 1, 3, 4, N, BR, BC, 'thermocage', undefined, undefined, undefined, trio)).toBe(true);    // 6+3+4 = 13
    grid[0][2] = 5;
    expect(isValid(grid, 1, 3, 5, N, BR, BC, 'thermocage', undefined, undefined, undefined, trio)).toBe(false);   // 5+3+5 = 13, но 5 уже в группе
    grid[0][2] = 0; grid[1][2] = 0;

    const th = thermoOf([[3, 0], [3, 1]]);
    grid[3][0] = 5;
    expect(isValid(grid, 3, 1, 6, N, BR, BC, 'thermocage', undefined, th, undefined, undefined)).toBe(true);   // растёт
    expect(isValid(grid, 3, 1, 4, N, BR, BC, 'thermocage', undefined, th, undefined, undefined)).toBe(false);  // падает
    expect(isValid(grid, 3, 1, 5, N, BR, BC, 'thermocage', undefined, th, undefined, undefined)).toBe(false);  // равно — тоже нельзя
  });

  it('оба правила проверяются РАЗОМ, а не «одно вместо другого»', () => {
    // Клетка на термометре И в группе. Цифра, законная по одному правилу, но
    // запрещённая другим, обязана быть отвергнута — этим ловится `else if`,
    // при котором первая же подошедшая ветка закрывала бы проверку.
    const grid: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
    const th = thermoOf([[0, 0], [0, 1]]);
    const cageOf = Array.from({ length: N }, () => Array(N).fill(-1));
    cageOf[0][0] = 0; cageOf[0][1] = 0;
    const cages = cageMapFrom(cageOf, [7], [0], N);   // сумма 7
    grid[0][0] = 3;
    expect(isValid(grid, 0, 1, 4, N, BR, BC, 'thermocage', undefined, th, undefined, cages)).toBe(true);    // растёт и 3+4 = 7
    expect(isValid(grid, 0, 1, 2, N, BR, BC, 'thermocage', undefined, th, undefined, cages)).toBe(false);   // сумма бы сошлась? нет: 3+2≠7, и не растёт
    expect(isValid(grid, 0, 1, 5, N, BR, BC, 'thermocage', undefined, th, undefined, cages)).toBe(false);   // растёт, но 3+5 ≠ 7 → суммой отвергнуто
    grid[0][0] = 5;
    expect(isValid(grid, 0, 1, 2, N, BR, BC, 'thermocage', undefined, th, undefined, cages)).toBe(false);   // сумма 5+2 = 7 сходится, но цепочка падает
  });

  it('🔴 второй путь генерации (перебор с проверкой единственности) тоже считает ОБА правила', () => {
    // У уровня два пути к доске: логический (generateLogical) и запасной — выкалывание
    // с countSolutions. Запасной срабатывает редко, поэтому проверять его надо явно:
    // забудь передать туда группы, и доска уедет в прод с двумя решениями, а гейт на
    // логическом пути этого не заметит.
    // ⚠️ ТРИ ДОСКИ, А НЕ ОДНА. Замер поломкой 20.08.2026: сними проверку единственности
    // совсем — и одна случайная доска из двух ВСЁ РАВНО выходит единственной, настолько
    // сильны вместе цепочка и суммы. На одной доске гейт был бы монеткой; на трёх
    // выключенная проверка краснеет почти наверняка, а включённая зелена всегда —
    // countSolutions при нехватке бюджета отвечает «два», то есть ошибается в
    // безопасную сторону и лишних решений не выдумывает.
    const counts: number[] = [];
    let proven = 0;
    for (let i = 0; i < 3; i++) {
      const g = generatePuzzle(58, N, BR, BC, 'thermocage');
      const bud = { steps: 400000 };
      const n = countSolutions(g.puzzle.map((row) => [...row]), N, BR, BC, 'thermocage', undefined, 2, bud, g.thermo, undefined, g.cages);
      if (bud.steps < 0) { console.log(`доска #${i}: счётчик исчерпал шаги — пропуск`); continue; }
      proven++;
      counts.push(n);
    }
    // Страховка от вырождения: хотя бы одна доска обязана быть доказана.
    expect(proven).toBeGreaterThanOrEqual(1);
    expect(`решений ${counts.join(',')}`).toBe(`решений ${Array(proven).fill(1).join(',')}`);
  }, 180000);

  it('группы-острова не касаются сторонами — иначе один цвет слил бы их в одну', () => {
    // Подкрас группы на экране берётся из её номера (`id % 6`): у соседних по стороне
    // групп цвет мог бы совпасть, и человек увидел бы одну группу вместо двух.
    const g = generatePuzzle(0, N, BR, BC, 'thermocage');
    const cages = g.cages!;
    const touching: string[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const a = cages.cageOf[r][c];
      if (a < 0) continue;
      for (const [dr, dc] of [[1, 0], [0, 1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (nr >= N || nc >= N) continue;
        const b = cages.cageOf[nr][nc];
        if (b >= 0 && b !== a) touching.push(`${a}|${b} у r${r}c${c}`);
      }
    }
    expect(touching).toEqual([]);
    // и сам генератор групп это держит на произвольном решении, а не только на этом
    const flat = generateThermoCages(g.solution, N);
    expect(flat.cells.filter(Boolean).length).toBeGreaterThanOrEqual(5);
  });
});

describe('ThermoCage: правило видно человеку и нарисовано обеими разметками', () => {
  it('подпись и правило берутся из словаря, а не из английской заглушки', () => {
    for (const lang of ['ru', 'en', 'de', 'ja', 'ar']) {
      expect(`${lang}: ${variantLabel('thermocage', lang).length > 2}`).toBe(`${lang}: true`);
      const rule = variantRule('thermocage', lang);
      expect(`${lang}: ${rule.length > 40}`).toBe(`${lang}: true`);
      expect(rule).not.toBe('sudokuRuleThermocage');   // ключ вместо текста = дыра в словаре
    }
  });

  it('экран включает обе разметки для thermocage — цепочку и суммы', () => {
    const src = read('app/games/sudoku.tsx');
    // Цепочка: блок отрисовки термометра обязан срабатывать и на комбинированном варианте.
    expect(src).toContain("{(variant === 'thermo' || variant === 'thermocage' || variant === 'thermoknight') && thermo && thermo[r][c]");
    // Суммы: общий признак вместо `mode === 'killer'`, иначе разметка была бы только у killer.
    expect(src).toContain("const showCages = !!cages && (mode === 'killer' || variant === 'thermocage');");
    // Подпись суммы рисуется по этому же признаку — и только у клеток внутри группы.
    expect(src).toContain('{cageAt(r, c) >= 0 && cageAnchors[cageAt(r, c)] === r * N + c && (');
    // Сумма — в углу клетки, колба термометра — по центру: разметки не спорят за место.
    expect(src).toContain("position: 'absolute', top: 1, left: 2, fontSize: Math.max(8, Math.round(cellSize * 0.27))");
    // Группы берутся из генератора, а НЕ нарезаются экраном заново (см. проверку ниже).
    expect(src).toContain('else if (cg) { setCages(cg.cageOf); setCageSums(cg.sum); setCageAnchors(cg.anchor); }');
  });

  it('🔴 нарезать группы заново нельзя: второй вызов даёт ДРУГУЮ разметку', () => {
    // Экран мог бы собрать клетки-суммы сам, как это делает killer. Здесь видно, почему
    // нельзя: разбиение случайное, и второй вызов на том же решении даёт другие группы.
    // Показали бы игроку их — и он получил бы подсказки, под которые доску никто не
    // проверял на единственность, то есть законное второе решение.
    const gen = generatePuzzle(0, N, BR, BC, 'thermocage');
    const again = generateThermoCages(gen.solution, N);
    const key = (m: CageMap) => m.cageOf.map((row) => row.join('')).join('|');
    expect(`разметка совпала: ${key(again) === key(gen.cages!)}`).toBe('разметка совпала: false');
  });
});
