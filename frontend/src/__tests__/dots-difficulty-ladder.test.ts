/* psygames-dots-difficulty-ladder-gate · VER 1 · 23.08.2026 */
/**
 * У «СОЕДИНИ ТОЧКИ» ЕСТЬ ОСЬ СЛОЖНОСТИ ПО ТРЕБУЕМОМУ РАССУЖДЕНИЮ, А НЕ ТОЛЬКО
 * ПО РАЗМЕРУ ПОЛЯ.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО И ЧЕМ ЭТО МЕРЯНО. Лесенка держалась на трёх осях —
 * размер 5→10, число пар 4→14, нижняя длина пути 3→5 — и все три описывают
 * РАЗМЕР задачи, а не то, сколько на доске надо сообразить. Прогон 23.08.2026
 * (генератор v2, по 60 досок на уровень) — доля досок, закрываемых ОДНИМИ
 * вынужденными ходами, без единой догадки:
 *
 *   L1  2/60 · L2  4/60 · L3  7/60 · L4  0/60 · L5  1/60 · L6  3/60
 *   L8  0/60 · L10 0/60 · L15 0/60 · L20 0/60 · L30 0/60 · L40 0/60
 *
 * То есть от первого уровня до сорокового доска стояла на ОДНОЙ И ТОЙ ЖЕ
 * верхней ступени «без догадки не закрыть», и «сложность» росла только числом
 * клеток. Ступень «от противного» (доказательство глубиной в один ход) ничего
 * не меняла: 3/60 на первом уровне, 0/60 с восьмого.
 *
 * ЧТО СТАЛО. Генератор собирает доску и ПРОВЕРЯЕТ решателем заданной ступени;
 * не та ступень — пересобирает (приём Simon Tatham, `puzzles/tracks.c`:
 * `add_clues(state, rs, diff)` достраивает доску, пока её не решит
 * `tracks_solve(state, diff)`). Лесенка ступеней: 1–3 «вынужденный», 4–6 «от
 * противного», 7–40 «перебор». Замер после правки, по 20 досок на уровень:
 *
 *   L1  вынужденными 20/20 · L5  от противного 20/20
 *   L10 · L20 · L30 · L40 — ни та ни другая ступень не берёт, 20/20 «перебор»
 *
 * то есть каждый уровень попадает ровно в назначенную ему ступень. Цена отбора
 * на сборку доски: 4–20 мс на уровнях 1–3, 39–50 мс на 4–6 (до 180 мс в худшем
 * случае), 2–8 мс на 7–40 — верх лесенки дешевле середины, потому что доказать
 * «эта доска вынужденными не берётся» быстро, а найти выводимую — долго.
 *
 * ⚠️ ГЕЙТ РАЗБИРАЕТ ДОСКУ САМ, А НЕ СПРАШИВАЕТ РЕШАТЕЛЬ. Проверка вида
 * «решатель говорит, что доска не решается вынужденными» зелена и при СЛОМАННОМ
 * решателе — сломанный тем более ничего не решит. Поэтому ниже лежит свой,
 * независимо написанный разбор по тем же правилам игры, и именно он выносит
 * вердикт; решателю модуля гейт верит ровно в одном месте — когда сверяет, что
 * раздача не врёт о себе в поле `tier`.
 *
 * ⚠️ ОБЕ СТОРОНЫ КАЖДОГО УТВЕРЖДЕНИЯ. «Верхние доски вынужденными не берутся»
 * проверяется вместе с «нижние берутся ЦЕЛИКОМ и дают настоящую раскладку», и
 * вместе с «решение у каждой доски по-прежнему есть и накрывает поле целиком».
 * Гейт, умеющий только запрещать, зелен и на игре, в которую нельзя играть.
 */
import {
  DOTS_TIER_ATTEMPTS,
  dotsLevelTier,
  generateDotsPuzzle,
  generateDotsTrainingPuzzle,
  требуемаяЦепь,
} from '@/src/games/dots-connect/core/generator';
import { DOTS_TIERS, ЦЕПОЧКА_С, type DotsTier } from '@/src/games/dots-connect/core/solver';
import { validateDotsSolution } from '@/src/games/dots-connect/core/validator';
import { LEVELS, type Cell, type DotsPuzzle } from '@/src/games/dots-connect/core/types';

// ═════════════════════════════════════════════════════════════════════════════
// СВОЙ РАЗБОР ДОСКИ. Никаких вызовов решателя модуля: правила игры записаны
// здесь заново.
//
// Полное покрытие даёт две жёсткие цифры на клетку:
//   · клетка-точка — конец пути → ровно ОДНО ребро к соседу;
//   · любая другая клетка — середина пути → ровно ДВА ребра.
// Отсюда три правила, у каждого нет альтернативы:
//   A. рёбер набралось сколько нужно → остальные вокруг ЗАПРЕЩЕНЫ;
//   B. проведённых плюс нерешённых ровно сколько нужно → все нерешённые ОБЯЗАНЫ
//      быть проведены;
//   C. ребро, замыкающее кольцо или сшивающее куски разных пар, невозможно.
// Ступень «от противного» добавляет к ним ровно один приём: подставить ребро,
// прогнать правила и, если вышло противоречие, вывести обратное. Догадок нет
// ни там, ни там — предположение всегда откатывается, доска меняется только
// после ДОКАЗАННОГО противоречия.
// ═════════════════════════════════════════════════════════════════════════════

const UNDECIDED = 0;
const DRAWN = 1;
const BANNED = 2;

interface Reading {
  size: number;
  need: number[];
  dot: number[];
  edgeA: number[];
  edgeB: number[];
  state: number[];
  around: number[][];
  drawn: number[];
  open: number[];
  boss: number[];
  colour: number[];
}

function readBoard(puzzle: DotsPuzzle): Reading {
  const size = puzzle.size;
  const count = size * size;
  const dot = new Array<number>(count).fill(-1);
  puzzle.pairs.forEach((pair, index) => {
    for (const end of pair.endpoints) dot[end.row * size + end.col] = index;
  });
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const around: number[][] = Array.from({ length: count }, () => []);
  const link = (a: number, b: number) => {
    const at = edgeA.length;
    edgeA.push(a);
    edgeB.push(b);
    (around[a] as number[]).push(at);
    (around[b] as number[]).push(at);
  };
  /**
   * 🔴 СТЕНЫ — КЛЕТКИ, КОТОРЫХ НА ДОСКЕ НЕТ (правка 06.09.2026). Рёбра к ним не
   * заводятся вовсе, и требование «через клетку проходит линия» к ним не
   * применяется.
   *
   * ⚠️ БЕЗ ЭТОГО РАЗБОР ГЕЙТА ВРАЛ В ЛЁГКУЮ СТОРОНУ. Он требовал у стены
   * ДВУХ линий, как у обычной пустой клетки; у стены их взять неоткуда, и
   * вывод «вынужденно» шёл каскадом по всей доске. Гейт объявлял «forced»
   * доски, которые игра честно считает переборными, — и краснел на верном коде.
   */
  const стена = new Array<boolean>(count).fill(false);
  for (const w of puzzle.walls ?? []) стена[w.row * size + w.col] = true;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const at = row * size + col;
      if (стена[at]) continue;
      if (col + 1 < size && !стена[at + 1]) link(at, at + 1);
      if (row + 1 < size && !стена[at + size]) link(at, at + size);
    }
  }
  return {
    size,
    // Стене линий не нужно вовсе: её нет на доске.
    need: dot.map((owner, at) => (стена[at] ? 0 : owner >= 0 ? 1 : 2)),
    dot,
    edgeA,
    edgeB,
    state: new Array<number>(edgeA.length).fill(UNDECIDED),
    around,
    drawn: new Array<number>(count).fill(0),
    open: around.map((list) => list.length),
    boss: Array.from({ length: count }, (_, at) => at),
    colour: dot.slice(),
  };
}

function copyReading(reading: Reading): Reading {
  return {
    ...reading,
    state: reading.state.slice(),
    drawn: reading.drawn.slice(),
    open: reading.open.slice(),
    boss: reading.boss.slice(),
    colour: reading.colour.slice(),
  };
}

function bossOf(reading: Reading, at: number): number {
  let top = at;
  while (reading.boss[top] !== top) top = reading.boss[top] as number;
  return top;
}

/** Провести ребро. `false` — доска в этом состоянии невозможна. */
function drawIt(reading: Reading, at: number): boolean {
  if (reading.state[at] === DRAWN) return true;
  if (reading.state[at] === BANNED) return false;
  reading.state[at] = DRAWN;
  const a = reading.edgeA[at] as number;
  const b = reading.edgeB[at] as number;
  for (const side of [a, b]) {
    reading.drawn[side] = (reading.drawn[side] as number) + 1;
    reading.open[side] = (reading.open[side] as number) - 1;
    if ((reading.drawn[side] as number) > (reading.need[side] as number)) return false;
  }
  const left = bossOf(reading, a);
  const right = bossOf(reading, b);
  if (left === right) return false;                                    // кольцо
  const leftColour = reading.colour[left] as number;
  const rightColour = reading.colour[right] as number;
  if (leftColour >= 0 && rightColour >= 0 && leftColour !== rightColour) return false;
  reading.boss[left] = right;
  reading.colour[right] = rightColour >= 0 ? rightColour : leftColour;
  return true;
}

/** Запретить ребро. `false` — клетке больше нечем набрать свою степень. */
function banIt(reading: Reading, at: number): boolean {
  if (reading.state[at] === BANNED) return true;
  if (reading.state[at] === DRAWN) return false;
  reading.state[at] = BANNED;
  for (const side of [reading.edgeA[at] as number, reading.edgeB[at] as number]) {
    reading.open[side] = (reading.open[side] as number) - 1;
    if ((reading.drawn[side] as number) + (reading.open[side] as number) < (reading.need[side] as number)) {
      return false;
    }
  }
  return true;
}

/** Правила A, B, C до упора. `false` — противоречие. */
function settle(reading: Reading): boolean {
  for (;;) {
    let moved = false;
    for (let at = 0; at < reading.need.length; at += 1) {
      const drawn = reading.drawn[at] as number;
      const open = reading.open[at] as number;
      const need = reading.need[at] as number;
      if (drawn > need || drawn + open < need) return false;
      if (open === 0) continue;
      const shut = drawn === need;
      const forced = drawn + open === need;
      if (!shut && !forced) continue;
      for (const edge of reading.around[at] as number[]) {
        if (reading.state[edge] !== UNDECIDED) continue;
        if (!(shut ? banIt(reading, edge) : drawIt(reading, edge))) return false;
        moved = true;
      }
    }
    for (let edge = 0; edge < reading.state.length; edge += 1) {
      if (reading.state[edge] !== UNDECIDED) continue;
      const left = bossOf(reading, reading.edgeA[edge] as number);
      const right = bossOf(reading, reading.edgeB[edge] as number);
      const clash = (reading.colour[left] as number) >= 0
        && (reading.colour[right] as number) >= 0
        && reading.colour[left] !== reading.colour[right];
      if (left !== right && !clash) continue;
      if (!banIt(reading, edge)) return false;
      moved = true;
    }
    if (!moved) return true;
  }
}

function isReadable(reading: Reading): boolean {
  for (let at = 0; at < reading.need.length; at += 1) {
    if (reading.drawn[at] !== reading.need[at]) return false;
  }
  return true;
}

/**
 * Один проход проб «а если». Возвращает, удалось ли что-то ДОКАЗАТЬ, и
 * приписывает в `учёт` число доказанных рёбер — это длина цепи вывода, по
 * которой теперь и различается верх лесенки.
 */
function proveByContradiction(reading: Reading, учёт: { доказано: number }): boolean | 'broken' {
  let proved = false;
  for (let edge = 0; edge < reading.state.length; edge += 1) {
    if (reading.state[edge] !== UNDECIDED) continue;
    const asDrawn = copyReading(reading);
    if (!drawIt(asDrawn, edge) || !settle(asDrawn)) {
      if (!banIt(reading, edge) || !settle(reading)) return 'broken';
      учёт.доказано += 1;
      proved = true;
      continue;
    }
    const asBanned = copyReading(reading);
    if (!banIt(asBanned, edge) || !settle(asBanned)) {
      if (!drawIt(reading, edge) || !settle(reading)) return 'broken';
      учёт.доказано += 1;
      proved = true;
    }
  }
  return proved;
}

/** Пути из проведённых рёбер — чтобы вердикт «вывелось» можно было предъявить. */
function pathsOf(reading: Reading, puzzle: DotsPuzzle): Record<string, Cell[]> | null {
  const out: Record<string, Cell[]> = {};
  for (let index = 0; index < puzzle.pairs.length; index += 1) {
    const pair = puzzle.pairs[index] as DotsPuzzle['pairs'][number];
    const start = (pair.endpoints[0] as Cell).row * reading.size + (pair.endpoints[0] as Cell).col;
    const walk = [start];
    let back = -1;
    let here = start;
    for (let guard = 0; guard <= reading.need.length; guard += 1) {
      if (here !== start && reading.dot[here] === index) break;
      let step = -1;
      for (const edge of reading.around[here] as number[]) {
        if (reading.state[edge] !== DRAWN) continue;
        const other = (reading.edgeA[edge] as number) === here
          ? (reading.edgeB[edge] as number)
          : (reading.edgeA[edge] as number);
        if (other === back) continue;
        step = other;
        break;
      }
      if (step < 0) return null;
      walk.push(step);
      back = here;
      here = step;
    }
    if (here === start || reading.dot[here] !== index) return null;
    out[pair.id] = walk.map((at) => ({ row: Math.floor(at / reading.size), col: at % reading.size }));
  }
  return out;
}

type Verdict = 'вывелась' | 'застряла' | 'сломана';

/**
 * РАЗБИРАЕТ ДОСКУ СВОИМИ СИЛАМИ. `deep = false` — только прямые правила
 * («вынужденный»), `deep = true` — плюс доказательство от противного.
 */
function readOut(
  puzzle: DotsPuzzle, deep: boolean,
): { verdict: Verdict; paths: Record<string, Cell[]> | null; доказано: number } {
  const reading = readBoard(puzzle);
  const учёт = { доказано: 0 };
  if (!settle(reading)) return { verdict: 'сломана', paths: null, ...учёт };
  if (deep) {
    while (!isReadable(reading)) {
      const step = proveByContradiction(reading, учёт);
      if (step === 'broken') return { verdict: 'сломана', paths: null, ...учёт };
      if (!step) break;
    }
  }
  if (!isReadable(reading)) return { verdict: 'застряла', paths: null, ...учёт };
  return { verdict: 'вывелась', paths: pathsOf(reading, puzzle), ...учёт };
}

/**
 * Ступень доски ПО СВОЕМУ разбору. Верхняя — не «не вывелась», а «выводится
 * длинной цепью»: доказанных от противного рёбер не меньше `ЦЕПОЧКА_С`.
 * `null` означает, что доску не берёт ни одно рассуждение, — с перевёрнутой
 * осью это брак раздачи, а не вершина лесенки.
 */
function tierByOwnReading(puzzle: DotsPuzzle): DotsTier | null {
  if (readOut(puzzle, false).verdict === 'вывелась') return 'forced';
  const deep = readOut(puzzle, true);
  if (deep.verdict !== 'вывелась') return null;
  return deep.доказано >= ЦЕПОЧКА_С ? 'chain' : 'contradiction';
}

const SEEDS = ['ladder-a', 'ladder-b', 'ladder-c'] as const;
const LADDER = Array.from({ length: LEVELS }, (_, index) => generateDotsPuzzle(SEEDS[0], index + 1));
const OWN_TIERS = LADDER.map(tierByOwnReading);
/** Длина цепи вывода ПО СВОЕМУ разбору — независимо от того, что записал генератор. */
const OWN_CHAINS = LADDER.map((puzzle) => readOut(puzzle, true).доказано);

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — ось сложности по требуемому рассуждению', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(LADDER).toHaveLength(40);
    expect(DOTS_TIERS.length).toBeGreaterThanOrEqual(2);
    expect(DOTS_TIER_ATTEMPTS).toBeGreaterThan(100);
    // Свой разбор обязан УМЕТЬ ОБА ответа: разбор, который всегда говорит одно и
    // то же, доказывает ровно ничего.
    expect(new Set(OWN_TIERS).size).toBeGreaterThanOrEqual(2);
    expect(OWN_TIERS).toContain('forced');
    expect(OWN_TIERS).toContain('chain');
  });

  /**
   * 🔴 НИЖНИЕ УРОВНИ УЧАТ ПРАВИЛУ: там нечего угадывать. Свой разбор обязан
   * пройти доску прямыми правилами ДО КОНЦА — и предъявить настоящую раскладку,
   * а не просто «рёбра сошлись».
   */
  it('🔴 уровни 1–3 выводятся целиком, без единой догадки', () => {
    const stuck: string[] = [];
    for (const level of [1, 2, 3]) {
      for (const seed of SEEDS) {
        const puzzle = generateDotsPuzzle(seed, level);
        const { verdict, paths } = readOut(puzzle, false);
        if (verdict !== 'вывелась' || !paths) { stuck.push(`L${level}/${seed}: ${verdict}`); continue; }
        const check = validateDotsSolution(puzzle, paths);
        if (!check.complete) stuck.push(`L${level}/${seed}: вывелось не решение — ${check.issues.join('; ')}`);
      }
    }
    expect(stuck).toEqual([]);
  });

  /**
   * 🔴 СЕРЕДИНА ТРЕБУЕТ ХОДА ГЛУБЖЕ. Обе стороны сразу: прямых правил НЕ
   * ХВАТАЕТ (иначе уровень 4 ничем не отличался бы от первого), а рассуждения
   * от противного — хватает.
   */
  it('🔴 уровни 4–6 прямыми правилами не берутся, а от противного берутся', () => {
    const wrong: string[] = [];
    for (const level of [4, 5, 6]) {
      for (const seed of SEEDS) {
        const puzzle = generateDotsPuzzle(seed, level);
        if (readOut(puzzle, false).verdict === 'вывелась') {
          wrong.push(`L${level}/${seed}: взялась прямыми правилами — ступень ниже назначенной`);
          continue;
        }
        const deep = readOut(puzzle, true);
        if (deep.verdict !== 'вывелась' || !deep.paths) {
          wrong.push(`L${level}/${seed}: от противного не вывелась (${deep.verdict})`);
          continue;
        }
        const check = validateDotsSolution(puzzle, deep.paths);
        if (!check.complete) wrong.push(`L${level}/${seed}: вывелось не решение — ${check.issues.join('; ')}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * 🔴 ВЕРХ ЛЕСЕНКИ — САМАЯ ДЛИННАЯ ЧЕСТНАЯ ЦЕПЬ, А НЕ НЕВОЗМОЖНОСТЬ ВЫВОДА.
   *
   * До 06.09.2026 здесь стояло обратное требование: доска верхней полосы НЕ
   * должна была выводиться ни прямыми правилами, ни от противного. Ось держалась
   * ровно до появления стен — вырезанное поле сужает выбор, вывод доходит до
   * конца, и «трудная» доска бралась доказательством. Хуже того, ярлык верхней
   * ступени не требовал замера: доска получала его за то, что её НЕ вывели, и
   * тридцать четыре уровня выглядели растущими, ничем не отличаясь. Замер это и
   * показал: на 25-м уровне медиана длины цепи равнялась нулю.
   *
   * Теперь требование прямое и проверяемое: доска верхней полосы обязана
   * выводиться ЦЕЛИКОМ и требовать цепи не короче назначенной уровню. Длину
   * гейт считает СВОИМ разбором — генератор в свидетели своей же работы не
   * годится.
   */
  it('🔴 верхняя полоса выводится целиком и требует назначенной длины цепи', () => {
    const soft: string[] = [];
    for (const level of [7, 10, 20, 30, 40]) {
      for (const seed of SEEDS) {
        const puzzle = generateDotsPuzzle(seed, level);
        if (readOut(puzzle, false).verdict === 'вывелась') {
          soft.push(`L${level}/${seed}: взялась прямыми правилами — ступень ниже назначенной`);
          continue;
        }
        const deep = readOut(puzzle, true);
        if (deep.verdict !== 'вывелась' || !deep.paths) {
          soft.push(`L${level}/${seed}: не выводится вовсе (${deep.verdict}) — это угадайка, а не верх лесенки`);
          continue;
        }
        const надо = требуемаяЦепь(level);
        if (deep.доказано < надо) soft.push(`L${level}/${seed}: цепь ${deep.доказано} короче назначенной ${надо}`);
        const check = validateDotsSolution(puzzle, deep.paths);
        if (!check.complete) soft.push(`L${level}/${seed}: вывелось не решение — ${check.issues.join('; ')}`);
      }
    }
    expect(soft).toEqual([]);
  });

  /**
   * 🔴 РАСТУЩАЯ ОСЬ ДЕЙСТВИТЕЛЬНО РАСТЁТ. Ступень упирается в потолок на седьмом
   * уровне, и дальше лесенку держит только длина цепи. Если требование по
   * уровням где-то откатится назад, тридцать четыре верхних уровня снова станут
   * одинаковыми — на этот раз молча.
   */
  it('🔴 требуемая длина цепи по уровням назад не откатывается', () => {
    const откаты: string[] = [];
    for (let level = 2; level <= LEVELS; level += 1) {
      const было = требуемаяЦепь(level - 1);
      const стало = требуемаяЦепь(level);
      if (стало < было) откаты.push(`L${level - 1}→L${level}: ${было}→${стало}`);
    }
    expect(откаты).toEqual([]);
    expect(требуемаяЦепь(LEVELS)).toBeGreaterThan(требуемаяЦепь(7));
  });

  /** 🔴 И померенная цепь на каждом уровне не короче требуемой — по СВОЕМУ разбору. */
  it('🔴 померенная длина цепи по всей лесенке добирает назначенную', () => {
    const коротко: string[] = [];
    for (let index = 0; index < LADDER.length; index += 1) {
      const level = index + 1;
      const надо = требуемаяЦепь(level);
      const есть = OWN_CHAINS[index] as number;
      if (есть < надо) коротко.push(`L${level}: цепь ${есть} < ${надо}`);
    }
    expect(коротко).toEqual([]);
  });

  /** 🔴 Лесенка по СВОЕМУ разбору идёт вверх и назад не откатывается. */
  it('🔴 требуемое рассуждение по всей лесенке не откатывается назад', () => {
    const rank = (tier: DotsTier) => DOTS_TIERS.indexOf(tier);
    const backslides: string[] = [];
    for (let index = 1; index < OWN_TIERS.length; index += 1) {
      const before = OWN_TIERS[index - 1];
      const after = OWN_TIERS[index];
      // `null` — доска не выводится ни одним рассуждением. С перевёрнутой осью
      // это не вершина, а брак: играть в неё можно только угадыванием.
      if (before === null) { backslides.push(`L${index}: доска не выводится вовсе`); continue; }
      if (after === null) { backslides.push(`L${index + 1}: доска не выводится вовсе`); continue; }
      if (rank(after) < rank(before)) backslides.push(`L${index}→L${index + 1}: ${before}→${after}`);
    }
    expect(backslides).toEqual([]);
    expect(`низ ${OWN_TIERS[0]} · верх ${OWN_TIERS[LEVELS - 1]}`).toBe('низ forced · верх chain');
  });

  /**
   * 🔴 РАЗДАЧА НЕ ВРЁТ О СЕБЕ. Поле `tier` уезжает в сложность и в разбор
   * партий; если оно разойдётся со своим разбором хоть на одном уровне, врать
   * будет вся бухгалтерия сложности.
   */
  it('🔴 объявленная ступень доски совпадает со своим разбором и с планом уровня', () => {
    const lies: string[] = [];
    for (let index = 0; index < LADDER.length; index += 1) {
      const puzzle = LADDER[index] as DotsPuzzle;
      const own = OWN_TIERS[index] as DotsTier;
      if (puzzle.tier !== own) lies.push(`L${puzzle.level}: раздача «${puzzle.tier}», свой разбор «${own}»`);
      if (puzzle.tier !== dotsLevelTier(puzzle.level)) {
        lies.push(`L${puzzle.level}: раздача «${puzzle.tier}», уровню назначено «${dotsLevelTier(puzzle.level)}»`);
      }
    }
    expect(lies).toEqual([]);
  });

  /**
   * 🔴 ВСТРЕЧНАЯ СТОРОНА ВСЕГО ВЫШЕ: доски остались проходимыми. Отбор по
   * ступени не имеет права давать поле, которое нельзя занять целиком, — а
   * гейт, который стережёт только «трудно», зелен и на игре, в которую нельзя
   * играть.
   */
  it('🔴 у каждого уровня решение на месте и накрывает поле целиком', () => {
    const broken: string[] = [];
    for (const puzzle of LADDER) {
      const check = validateDotsSolution(puzzle, puzzle.solution);
      if (!check.complete) broken.push(`L${puzzle.level}: ${check.issues.join('; ')}`);
      // ⚠️ СТЕНЫ ИЗ СЧЁТА ВЫЧИТАЮТСЯ. Путь обязан занять всё СВОБОДНОЕ поле, а
      // не всю сетку: клетка под стеной не занимается по определению.
      const свободных = puzzle.size * puzzle.size - (puzzle.walls?.length ?? 0);
      if (check.coveredCells !== свободных) {
        broken.push(`L${puzzle.level}: покрыто ${check.coveredCells}/${свободных}`);
      }
    }
    expect(broken).toEqual([]);
  });

  /** Тренировка учит правилу — на ней не должно быть места догадке. */
  it('🔴 тренировочная доска выводится целиком прямыми правилами', () => {
    const stuck: string[] = [];
    for (const seed of SEEDS) {
      const training = generateDotsTrainingPuzzle(seed);
      const { verdict, paths } = readOut(training, false);
      if (verdict !== 'вывелась' || !paths) { stuck.push(`${seed}: ${verdict}`); continue; }
      if (!validateDotsSolution(training, paths).complete) stuck.push(`${seed}: вывелось не решение`);
    }
    expect(stuck).toEqual([]);
  });

  /**
   * Отбор по ступени крутит цикл пересборок — и обязан оставаться
   * ВОСПРОИЗВОДИМЫМ: то же зерно даёт ту же доску, иначе «подсмотрел →
   * перезапустил» стало бы бесплатным прохождением.
   */
  it('одно зерно — одна и та же доска, разные зёрна — разные', () => {
    for (const level of [1, 5, 20]) {
      const first = generateDotsPuzzle('repeat-me', level);
      const again = generateDotsPuzzle('repeat-me', level);
      expect(JSON.stringify(again.pairs)).toBe(JSON.stringify(first.pairs));
      const other = generateDotsPuzzle('someone-else', level);
      expect(JSON.stringify(other.pairs)).not.toBe(JSON.stringify(first.pairs));
    }
  });
});
