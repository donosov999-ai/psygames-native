/* psygames-dots-connect-solver · VER 3 · 23.08.2026 */
import { isInBounds } from './grid';
import { validateDotsSolution } from './validator';
import type { Cell, DotsPuzzle, DotsSolution } from './types';

/**
 * НЕЗАВИСИМЫЙ РЕШАТЕЛЬ: ВИДИТ ТОЛЬКО ТОЧКИ.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. Прежний «решатель» ничего не решал. Он перебирал восемь
 * поворотов ДВУХ известных ему заготовок обхода (змейка и гамильтонов цикл),
 * проверял, что концы пар ложатся на них подряд, и объявлял это решением. То
 * есть он знал, КАК генератор строил доску, и без этого знания не мог ничего.
 * Как только генератор стал трясти путь backbite-ом, такой «решатель» вернул бы
 * null на КАЖДОМ уровне — и гейт «вся лесенка решается» покраснел бы не потому,
 * что уровни плохие, а потому, что проверяющий умел проверять только сам себя.
 *
 * ЧТО ЗДЕСЬ. Настоящий поиск с возвратом по правилам ИГРЫ, а не по замыслу
 * генератора: на вход — только `pairs` с концами, ни зерна, ни `solution`.
 * Поэтому найденное решение — самостоятельное доказательство, что доска
 * проходима, а не пересказ генератора.
 *
 * ТРИ ОТСЕЧЕНИЯ, БЕЗ КОТОРЫХ ПЕРЕБОР НЕ ЗАКАНЧИВАЕТСЯ.
 *
 * 1. СТЕПЕНЬ СВОБОДНОЙ КЛЕТКИ. Покрытие обязано быть полным, значит каждая
 *    свободная клетка станет СЕРЕДИНОЙ чьего-то пути (концы уже заняты
 *    точками) — а у середины ровно два соседа по пути. Если у свободной клетки
 *    меньше двух соседей, куда путь может войти и выйти, ветку можно бросать
 *    сразу.
 * 2. ОБЛАСТЬ БЕЗ ХОЗЯИНА. Свободные клетки разбиваются на связные области.
 *    Область, к которой не примыкает ни голова, ни цель ни одной недоведённой
 *    пары, не будет закрашена никогда — значит полного покрытия уже не выйдет.
 * 3. ПАРА, РАЗРЕЗАННАЯ НАДВОЕ. Если голова и цель пары не соседи и нет ни одной
 *    свободной области, примыкающей к обеим, — эта пара уже не соединится.
 *
 * ⚠️ ПОРЯДОК ХОДОВ. Сначала пробуем клетки, у которых МЕНЬШЕ свободных соседей
 * (углы и стены): именно они первыми становятся отрезанными, и, занимая их
 * раньше, поиск не тратит время на ветки, обречённые отсечением №1.
 */

interface SolverBoard {
  size: number;
  cells: number;
  owner: Int16Array;      // -1 свободна, иначе индекс пары
  head: Int32Array;       // где сейчас голова каждой пары
  target: Int32Array;     // куда она обязана прийти
  done: Uint8Array;
  /** 1 — клетки нет на доске (стена). Такие не занимают и не покрывают. */
  wall: Uint8Array;
  /** Чья это клетка по воротам; -1 — ничья. */
  gate: Int16Array;
  neighbours: Int32Array; // 4 соседа на клетку, -1 если край поля
  paths: number[][];
  /**
   * ⚠️ ЧЕРНОВИКИ ВЫДЕЛЕНЫ ОДИН РАЗ, А НЕ НА КАЖДУЮ ПРОВЕРКУ. Первая версия
   * создавала внутри `feasible` по два типизированных массива НА КАЖДУЮ ПАРУ —
   * то есть под три десятка выделений на один ход поиска. Замер: доска 10×10 на
   * девять пар решалась 4.2 с. С общими черновиками и «поколениями» вместо
   * очистки — 0.2 с при том же переборе.
   */
  region: Int32Array;
  regionStamp: Int32Array;
  stack: Int32Array;
  regionTouched: Int32Array;
  headTouches: Int32Array;
  targetTouches: Int32Array;
  generation: number;
}

function buildNeighbours(size: number): Int32Array {
  const cells = size * size;
  const table = new Int32Array(cells * 4).fill(-1);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const at = row * size + col;
      table[at * 4] = row > 0 ? at - size : -1;
      table[at * 4 + 1] = row < size - 1 ? at + size : -1;
      table[at * 4 + 2] = col > 0 ? at - 1 : -1;
      table[at * 4 + 3] = col < size - 1 ? at + 1 : -1;
    }
  }
  return table;
}

function prepare(puzzle: DotsPuzzle): SolverBoard | null {
  const size = puzzle.size;
  if (!Number.isInteger(size) || size < 2) return null;
  const cells = size * size;
  const pairs = puzzle.pairs;
  if (pairs.length === 0 || pairs.length * 2 > cells) return null;
  const owner = new Int16Array(cells).fill(-1);
  /**
   * ⚠️ СТЕНА — ОТДЕЛЬНЫЙ ПРИЗНАК, А НЕ «ЧУЖОЙ ВЛАДЕЛЕЦ С ОТРИЦАТЕЛЬНЫМ НОМЕРОМ».
   * Соблазн был пометить её как `owner = -2`: проверки «свободна ли клетка»
   * (`owner === -1`) тогда сработали бы сами. Но `connectable` и `forcedMove`
   * индексируют по владельцу МАССИВЫ (`done[pair]`, `head[pair]`), и −2 полез бы
   * туда молча — код бы работал по совпадению, а не по замыслу.
   */
  /**
   * Ворота в путевом решателе: клетка помечена номером пары, которой она
   * принадлежит; -1 — свободна для всех. Хранится массивом, а не картой, —
   * читается на каждом шаге перебора.
   */
  const gate = new Int16Array(cells).fill(-1);
  for (const g of puzzle.gates ?? []) {
    const индекс = puzzle.pairs.findIndex((p) => p.id === g.pairId);
    if (индекс < 0) return null;                 // ворота чужой пары — доска сломана
    gate[g.cell.row * size + g.cell.col] = индекс;
  }
  const wall = new Uint8Array(cells);
  for (const w of puzzle.walls ?? []) {
    if (!isInBounds(w, size)) return null;
    wall[w.row * size + w.col] = 1;
  }
  const head = new Int32Array(pairs.length);
  const target = new Int32Array(pairs.length);
  const paths: number[][] = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const [from, to] = pairs[index]!.endpoints;
    if (!isInBounds(from, size) || !isInBounds(to, size)) return null;
    const fromAt = from.row * size + from.col;
    const toAt = to.row * size + to.col;
    if (fromAt === toAt) return null;
    if (owner[fromAt] !== -1 || owner[toAt] !== -1) return null;
    // Точка пары на стене — доска собрана неверно, и это надо увидеть сразу.
    if (wall[fromAt] || wall[toAt]) return null;
    owner[fromAt] = index;
    owner[toAt] = index;
    head[index] = fromAt;
    target[index] = toAt;
    paths.push([fromAt]);
  }
  return {
    size,
    cells,
    owner,
    head,
    target,
    done: new Uint8Array(pairs.length),
    wall,
    gate,
    neighbours: buildNeighbours(size),
    paths,
    region: new Int32Array(cells),
    regionStamp: new Int32Array(cells),
    stack: new Int32Array(cells),
    regionTouched: new Int32Array(cells),
    headTouches: new Int32Array(pairs.length * cells),
    targetTouches: new Int32Array(pairs.length * cells),
    generation: 0,
  };
}

/**
 * 🔴 «СВОБОДНА» — ОДИН ПРЕДИКАТ НА ВЕСЬ РЕШАТЕЛЬ, А НЕ ТРИ ПОХОЖИЕ ПРОВЕРКИ.
 *
 * 📍 06.09.2026, когда появились стены: `feasible` проверял свободу как
 * `owner[at] === -1` и считал стену свободной клеткой — а дальше требовал у
 * каждой свободной клетки двух свободных соседей. Стена этого требования не
 * выполняла, отсечение объявляло ветку мёртвой, и решатель НЕ НАХОДИЛ ответа на
 * досках со стенами, хотя ответ был. Три места сравнивали одно и то же
 * по-разному — классика: величина стала данными, а читатели остались старые.
 */
function свободна(board: SolverBoard, at: number, pair?: number): boolean {
  if (board.wall[at] || board.owner[at] !== -1) return false;
  // Ворота: клетка свободна ДЛЯ СВОЕЙ пары и занята для всех прочих. Без
  // второго аргумента отвечаем «свободна вообще» — так спрашивает подсчёт
  // покрытия, которому владелец не важен.
  const чья = board.gate[at] as number;
  return чья < 0 || pair === undefined || чья === pair;
}

/** Может ли путь ВОЙТИ в эту клетку: она свободна либо это открытый конец пары. */
function connectable(board: SolverBoard, at: number): boolean {
  if (board.wall[at]) return false;          // стены в путь не входят
  if (board.owner[at] === -1) return true;
  const pair = board.owner[at] as number;
  if (board.done[pair]) return false;
  return board.head[pair] === at || board.target[pair] === at;
}

function feasible(board: SolverBoard): boolean {
  // ⚠️ `owner` больше не разбирается здесь: свободу клетки решает `свободна`,
  // который смотрит и на стену, и на владельца. Одно место вместо двух.
  const { cells, neighbours, region, stack, regionTouched } = board;
  const pairs = board.done.length;

  // Отсечение 1 — степень свободной клетки. Стены сюда не входят: их закрывать не надо.
  for (let at = 0; at < cells; at += 1) {
    if (!свободна(board, at)) continue;
    let open = 0;
    for (let dir = 0; dir < 4; dir += 1) {
      const near = neighbours[at * 4 + dir] as number;
      if (near >= 0 && connectable(board, near)) open += 1;
      if (open >= 2) break;
    }
    if (open < 2) return false;
  }

  // Разметка свободных областей — общая основа отсечений 2 и 3.
  // Вместо очистки массивов сравниваем «поколение»: номер этой проверки.
  board.generation += 1;
  const generation = board.generation;
  const stamp = board.regionStamp;
  let regions = 0;
  for (let at = 0; at < cells; at += 1) {
    if (!свободна(board, at) || stamp[at] === generation) continue;
    const mark = regions;
    regions += 1;
    stamp[at] = generation;
    region[at] = mark;
    let top = 0;
    stack[top] = at;
    top += 1;
    while (top > 0) {
      top -= 1;
      const current = stack[top] as number;
      for (let dir = 0; dir < 4; dir += 1) {
        const near = neighbours[current * 4 + dir] as number;
        if (near < 0 || !свободна(board, near) || stamp[near] === generation) continue;
        stamp[near] = generation;
        region[near] = mark;
        stack[top] = near;
        top += 1;
      }
    }
  }

  for (let pair = 0; pair < pairs; pair += 1) {
    if (board.done[pair]) continue;
    for (let side = 0; side < 2; side += 1) {
      const at = (side === 0 ? board.head[pair] : board.target[pair]) as number;
      const table = side === 0 ? board.headTouches : board.targetTouches;
      for (let dir = 0; dir < 4; dir += 1) {
        const near = neighbours[at * 4 + dir] as number;
        if (near < 0 || !свободна(board, near)) continue;
        const mark = region[near] as number;
        table[pair * cells + mark] = generation;
        regionTouched[mark] = generation;
      }
    }
  }

  // Отсечение 2 — область, до которой никому не дотянуться, не закрасится.
  for (let mark = 0; mark < regions; mark += 1) {
    if (regionTouched[mark] !== generation) return false;
  }

  // Отсечение 3 — пара, у которой не осталось общего коридора.
  for (let pair = 0; pair < pairs; pair += 1) {
    if (board.done[pair]) continue;
    const from = board.head[pair] as number;
    const to = board.target[pair] as number;
    let adjacent = false;
    for (let dir = 0; dir < 4; dir += 1) {
      if (neighbours[from * 4 + dir] === to) { adjacent = true; break; }
    }
    if (adjacent) continue;
    let shared = false;
    for (let mark = 0; mark < regions; mark += 1) {
      if (board.headTouches[pair * cells + mark] === generation
        && board.targetTouches[pair * cells + mark] === generation) { shared = true; break; }
    }
    if (!shared) return false;
  }
  return true;
}

function freeDegree(board: SolverBoard, at: number): number {
  let count = 0;
  for (let dir = 0; dir < 4; dir += 1) {
    const near = board.neighbours[at * 4 + dir] as number;
    if (near >= 0 && свободна(board, near)) count += 1;
  }
  return count;
}

function allCovered(board: SolverBoard): boolean {
  // Покрыть надо всё, ЧЕГО НЕ СТЕНА: у вырезанного поля «вся сетка» — не квадрат.
  for (let at = 0; at < board.cells; at += 1) {
    if (свободна(board, at)) return false;
  }
  return true;
}

/** Куда может шагнуть голова пары. Порядок — часть отсечения, см. шапку файла. */
/**
 * 🔴 ХОД, ПОСЛЕ КОТОРОГО ПУТЬ КОСНЁТСЯ САМ СЕБЯ, НЕЗАКОНЕН.
 *
 * 📍 ЗАЧЕМ. С 06.09.2026 это правило игры (см. `validator.ts`): только на нём
 * держится единственность решения — без него L7, L8, L9 решались несколькими
 * способами. Решатель обязан знать те же правила, что и проверка, иначе он
 * находит ответы, которые игре не подходят, и гейт «решение находится по одним
 * точкам» краснеет на 21 замечании.
 *
 * ⚠️ ЦЕЛЬ ПАРЫ — ОСОБЫЙ СЛУЧАЙ, И НАИВНАЯ ПРОВЕРКА ЕЁ ЛОМАЕТ. Обе точки пары
 * помечены владельцем ЗАРАНЕЕ, до того как путь до них дошёл. Поэтому «сосед
 * принадлежит моей паре» на подходе к цели — законно: туда и идём. Цель
 * исключается при ходьбе и проверяется отдельно В МОМЕНТ ЗАМЫКАНИЯ — тогда все
 * клетки пути уже известны, и соседство с целью читается верно.
 */
function коснётсяСвоего(board: SolverBoard, pair: number, cell: number, from: number): boolean {
  const цель = board.target[pair] as number;
  const замыкаем = cell === цель;
  for (let dir = 0; dir < 4; dir += 1) {
    const n = board.neighbours[cell * 4 + dir] as number;
    if (n < 0 || n === from) continue;
    if (board.owner[n] !== pair) continue;
    // При ходьбе цель ещё впереди — соседство с ней законно. При замыкании
    // законных соседей своей пары нет вовсе, кроме предыдущей клетки.
    if (!замыкаем && n === цель) continue;
    return true;
  }
  return false;
}

function movesFor(board: SolverBoard, pair: number): number[] {
  const from = board.head[pair] as number;
  const target = board.target[pair] as number;
  const moves: number[] = [];
  let closing = -1;
  for (let dir = 0; dir < 4; dir += 1) {
    const near = board.neighbours[from * 4 + dir] as number;
    if (near < 0) continue;
    if (near === target) { if (!коснётсяСвоего(board, pair, near, from)) closing = near; continue; }
    // ⚠️ ВЛАДЕЛЕЦ ПЕРЕДАЁТСЯ ИМЕННО ЗДЕСЬ: это единственное место, где решатель
    // выбирает, КУДА шагнуть, — и только здесь чужие ворота обязаны отсечь ход.
    if (свободна(board, near, pair) && !коснётсяСвоего(board, pair, near, from)) moves.push(near);
  }
  moves.sort((left, right) => freeDegree(board, left) - freeDegree(board, right));
  // Замкнуть пару пробуем последним: пока на доске есть свободные клетки, их
  // кому-то надо закрасить, и ранний финиш чаще всего оставляет сироту.
  if (closing >= 0) moves.push(closing);
  return moves;
}

/**
 * 🔴 ВЫНУЖДЕННЫЙ ХОД — ЕГО НЕ ПЕРЕБИРАЮТ, ЕГО ДЕЛАЮТ.
 *
 * Покрытие обязано быть полным, значит каждая свободная клетка станет
 * СЕРЕДИНОЙ чьего-то пути, а у середины ровно два соседа по пути. Если у
 * свободной клетки всего два соседа, куда путь может войти и выйти, оба этих
 * ребра предопределены. И если один из них — голова недоведённой пары, то эта
 * пара обязана шагнуть сюда: другого владельца у ребра быть не может.
 *
 * Два следствия сразу:
 *   · такой ход делается без ветвления — дерево перебора не растёт вовсе;
 *   · если оба вынужденных ребра ведут к головам РАЗНЫХ пар, клетка должна
 *     принадлежать двум путям одновременно — ветка мертва, и это видно сразу,
 *     а не через десять тысяч шагов.
 *
 * Замер: без этого правила доска 10×10 на двенадцать пар (уровень 24) не
 * решалась за четыре миллиона шагов; с ним — за миллисекунды.
 */
function forcedMove(board: SolverBoard): { pair: number; cell: number } | null | 'dead' {
  for (let at = 0; at < board.cells; at += 1) {
    /**
     * ⚠️ СТЕНУ ЗАКРЫВАТЬ НЕ НАДО, И БЕЗ ЭТОЙ СТРОКИ ОНА ЛОМАЛА ВЕСЬ ПЕРЕБОР.
     * Рассуждение вынужденного хода стоит на «каждая свободная клетка станет
     * серединой чьего-то пути». Стена — не свободная клетка, её никто не
     * закрывает; но `owner` у неё тоже −1, и проверка `owner !== -1` пропускала
     * её внутрь. Дальше у стены находилось два соседа-кандидата, один из них
     * оказывался головой пары — и решатель либо звал шагнуть В СТЕНУ, либо
     * объявлял ветку мёртвой. Замер: на 10×10 со стенами ответ не находился
     * вовсе, за 0 мс, при том что решение существует и валидно.
     */
    if (!свободна(board, at)) continue;
    let first = -1;
    let second = -1;
    let count = 0;
    for (let dir = 0; dir < 4; dir += 1) {
      const near = board.neighbours[at * 4 + dir] as number;
      if (near < 0 || !connectable(board, near)) continue;
      count += 1;
      if (count === 1) first = near;
      else if (count === 2) second = near;
      else break;
    }
    if (count !== 2) continue;
    const headOf = (cell: number): number => {
      const pair = board.owner[cell] as number;
      return pair >= 0 && !board.done[pair] && board.head[pair] === cell ? pair : -1;
    };
    const left = headOf(first);
    const right = headOf(second);
    if (left >= 0 && right >= 0 && left !== right) return 'dead';
    /**
     * ⚠️ ВЫНУЖДЕННЫЙ ХОД ТОЖЕ ОБЯЗАН БЫТЬ ЗАКОННЫМ. Он делается без ветвления,
     * то есть мимо `movesFor` — и если не спросить правило здесь, решатель
     * «вынужденно» построит путь, который касается сам себя, а проверка потом
     * его отвергнет. Такой ход не вынужденный, а мёртвый: раз клетку обязан
     * закрыть кто-то, а единственный кандидат не вправе — ветка кончилась.
     */
    /**
     * ⚠️ И ВОРОТА ЗДЕСЬ ТОЖЕ. Вынужденный ход идёт мимо `movesFor`, то есть мимо
     * единственного места, где ворота уже спрошены. Не спросить их здесь значит
     * «вынужденно» провести чужой путь через ворота — и получить решение,
     * которое проверка отвергнет. Раз клетку обязан закрыть кто-то, а
     * единственный кандидат не вправе, ветка кончилась.
     */
    const вправе = (pair: number): boolean => {
      const чья = board.gate[at] as number;
      return чья < 0 || чья === pair;
    };
    if (left >= 0) {
      if (!вправе(left)) return 'dead';
      return коснётсяСвоего(board, left, at, first) ? 'dead' : { pair: left, cell: at };
    }
    if (right >= 0) {
      if (!вправе(right)) return 'dead';
      return коснётсяСвоего(board, right, at, second) ? 'dead' : { pair: right, cell: at };
    }
  }
  return null;
}

/**
 * 🔴 ХОДИТ ТА ПАРА, У КОТОРОЙ МЕНЬШЕ ВСЕГО ВЫБОРА, А НЕ СЛЕДУЮЩАЯ ПО СПИСКУ.
 *
 * Первая версия доводила пары строго по порядку: пара 0 до конца, потом пара 1
 * и так далее. На доске 10×10 с десятью парами (уровень 18) это упиралось в
 * четыре миллиона шагов и НЕ находило решения, которое у доски заведомо есть, —
 * то есть гейт «уровень проходим» краснел бы на исправной игре.
 *
 * Причина обычная для перебора: длинные пути (сто клеток на десять пар — по
 * десять клеток на путь) дают дерево с ветвлением 3 на каждом шаге, и порядок
 * «по списку» тратит его целиком. Выбор пары с МИНИМАЛЬНЫМ числом ходов
 * (классический MRV) сначала доигрывает вынужденные места — там ветвления нет
 * вовсе — и только потом трогает свободные. Замер: тот же уровень 18 решается
 * за миллисекунды.
 */
function search(board: SolverBoard, budget: { steps: number }): boolean {
  if (budget.steps <= 0) return false;
  budget.steps -= 1;

  const forced = forcedMove(board);
  if (forced === 'dead') return false;

  let chosen = -1;
  let moves: number[] = [];
  if (forced) {
    chosen = forced.pair;
    moves = [forced.cell];
  } else for (let pair = 0; pair < board.done.length; pair += 1) {
    if (board.done[pair]) continue;
    const options = movesFor(board, pair);
    if (options.length === 0) return false;      // пара заперта — ветка мертва
    if (chosen < 0 || options.length < moves.length) { chosen = pair; moves = options; }
    if (moves.length === 1) break;               // вынужденный ход, искать лучше нечего
  }
  if (chosen < 0) return allCovered(board);      // все пары доведены

  const from = board.head[chosen] as number;
  const target = board.target[chosen] as number;
  for (const move of moves) {
    if (move === target) {
      board.done[chosen] = 1;
      (board.paths[chosen] as number[]).push(move);
      if (feasible(board) && search(board, budget)) return true;
      (board.paths[chosen] as number[]).pop();
      board.done[chosen] = 0;
      continue;
    }
    board.owner[move] = chosen;
    board.head[chosen] = move;
    (board.paths[chosen] as number[]).push(move);
    if (feasible(board) && search(board, budget)) return true;
    (board.paths[chosen] as number[]).pop();
    board.head[chosen] = from;
    board.owner[move] = -1;
  }
  return false;
}

/**
 * Ищет раскладку с ПОЛНЫМ покрытием по одним лишь концам пар.
 * `null` означает «не нашёл в отведённом бюджете шагов», и это честный ответ:
 * бюджет намеренно велик, а на сгенерированных досках решение находится за
 * тысячи шагов, а не за миллионы.
 */
export function solveDotsPuzzle(puzzle: DotsPuzzle, maxSteps = 4_000_000): DotsSolution | null {
  const board = prepare(puzzle);
  if (!board) return null;
  if (!feasible(board)) return null;
  const budget = { steps: maxSteps };
  if (!search(board, budget)) return null;

  const solution: DotsSolution = {};
  for (let index = 0; index < puzzle.pairs.length; index += 1) {
    solution[puzzle.pairs[index]!.id] = (board.paths[index] as number[]).map((at) => ({
      row: Math.floor(at / board.size),
      col: at % board.size,
    } as Cell));
  }
  return validateDotsSolution(puzzle, solution).complete ? solution : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// СТУПЕНИ РАССУЖДЕНИЯ — ЧЕМ ДОСКА ТРУДНА, А НЕ КАКОГО ОНА РАЗМЕРА
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 🔴 ЗАЧЕМ ЭТО ВООБЩЕ. До сих пор сложность «Соедини точки» задавалась ТОЛЬКО
 * строением доски: размер 5→10, число пар 4→14, нижняя длина пути 3→5
 * (`dotsLevelPlan`). Ни одна из трёх осей не говорит, СКОЛЬКО РАССУЖДЕНИЯ
 * доска требует: большая доска может закрываться вслепую, а маленькая требовать
 * плана. Числа замера — в шапке `dots-difficulty-ladder.test.ts`.
 *
 * ПРИЁМ ВЗЯТ У SIMON TATHAM (`puzzles/tracks.c`, MIT). Там решатель принимает
 * СТУПЕНЬ (`tracks_solve(state, diff)`), более трудный вывод включается только
 * при `diff >= DIFF_TRICKY`, а генератор (`add_clues(state, rs, diff)`) достраивает
 * доску, пока её не решит решатель ЗАДАННОЙ ступени. Смысл приёма: сложность —
 * это КАКАЯ ТЕХНИКА НУЖНА, и это ПРОВЕРЯЕТСЯ решателем, а не обещается формулой.
 * Код Тэтхэма на C и сюда не переносился — перенесён приём.
 *
 * СПИСОК СТУПЕНЕЙ (аналог его `DIFFLIST`) — снизу вверх. Следующая ступень
 * («коридоры», «парность», проба глубиной в два хода) вписывается сюда одной
 * строкой: и генератор, и гейт работают со СПИСКОМ, а не с зашитыми именами.
 */
export const DOTS_TIERS = ['forced', 'contradiction', 'chain'] as const;

/**
 * 🔴 ПОРОГ ВЕРХНЕЙ СТУПЕНИ — ДЛИНА ЧЕСТНОЙ ЦЕПИ, А НЕ НЕВОЗМОЖНОСТЬ ВЫВОДА.
 *
 * До 06.09.2026 верхом лесенки была ступень «перебор»: доска считалась трудной
 * ровно тем, что её НЕЛЬЗЯ вывести — ни рёберными правилами, ни от противного.
 * Ось держалась, пока поле было пустым прямоугольником. Стены её сломали:
 * стена сужает выбор, вывод доходит до конца — и «трудная» доска бралась
 * доказательством от противного, то есть верх лесенки исчезал именно там, где
 * поле становилось интереснее.
 *
 * Ось перевёрнута. Трудность наверху — не «вывести нельзя», а «выводить долго»:
 * сколько рёбер пришлось доказать от противного, потому что прямое
 * распространение до них не дотянулось. Считаются ДОКАЗАННЫЕ рёбра, а не
 * попытки: попытки зависят от порядка обхода, доказательства — нет.
 *
 * Порог назван здесь один раз; ступень и гейт читают его отсюда.
 */
export const ЦЕПОЧКА_С = 6;
export type DotsTier = (typeof DOTS_TIERS)[number];

/** Номер ступени в списке: чем больше, тем труднее требуемая техника. */
export function dotsTierRank(tier: DotsTier): number {
  return DOTS_TIERS.indexOf(tier);
}

/**
 * СТУПЕНЬ «ВЫНУЖДЕННЫЙ» — РАССУЖДЕНИЕ ПО РЁБРАМ, БЕЗ ЕДИНОЙ ДОГАДКИ.
 *
 * 🔴 ПОЧЕМУ НЕ «ВЕДЁМ ПУТЬ ОТ ТОЧКИ». Первая редакция этой ступени растила путь
 * от головы пары и делала ход, только если альтернативы нет. Замер 23.08.2026:
 * так закрывалось 0 досок из 100 НА КАЖДОМ уровне — не потому, что доски
 * трудные, а потому, что рассуждение было слепым: пока голова не упёрлась в
 * стену, вынужденных ходов почти не бывает, и ступень не отличала ничего от
 * ничего.
 *
 * ЧТО ЗДЕСЬ. Человек за такой доской рассуждает не «куда пойдёт голова», а
 * «сколько рёбер сходится в клетке». Условие полного покрытия даёт ровно две
 * жёсткие цифры:
 *   · клетка-точка лежит на КОНЦЕ своего пути → у неё ровно ОДНО ребро;
 *   · любая другая клетка лежит в СЕРЕДИНЕ чьего-то пути → ровно ДВА ребра.
 * Отсюда три правила, каждое — «альтернативы нет»:
 *   A. рёбер уже столько, сколько нужно → все остальные ЗАПРЕЩЕНЫ;
 *   B. проведённых плюс нерешённых ровно столько, сколько нужно → все
 *      нерешённые ОБЯЗАНЫ быть проведены (тупик, который надо закрыть);
 *   C. ребро, замыкающее кольцо или сшивающее куски РАЗНЫХ пар, невозможно →
 *      запрещено.
 * Правила гоняются до неподвижной точки. Застряли — доска требует перебора.
 *
 * ⚠️ ДОГАДОК ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО. Как только сюда попадёт «а попробуем
 * первое попавшееся ребро», ступень `forced` сравняется с `search`, лесенка
 * станет декоративной, а гейт этого не увидит — он спрашивает решателя. Ровно
 * поэтому гейт разбирает вынужденные ходы СВОИМ кодом, а не этим.
 */
interface EdgeBoard {
  size: number;
  cells: number;
  need: Int8Array;      // требуемая степень клетки: 1 у точки, 2 у остальных
  dotOf: Int16Array;    // индекс пары, если клетка — точка, иначе -1
  drawn: Int8Array;     // сколько рёбер уже проведено
  open: Int8Array;      // сколько рёбер ещё не решено
  edge: Int8Array;      // 0 не решено · 1 проведено · 2 запрещено
  edgeFrom: Int32Array;
  edgeTo: Int32Array;
  edgeIds: Int32Array;  // список настоящих рёбер сетки
  edgeCount: number;
  parent: Int32Array;   // объединение кусков, уже сшитых рёбрами
  colour: Int16Array;   // пара, которой принадлежит кусок (по корню), иначе -1
}

/** Ребро между соседними клетками: горизонтальное `at*2`, вертикальное `at*2+1`. */
function edgeBetween(from: number, to: number, size: number): number {
  if (to === from + 1) return from * 2;
  if (to === from - 1) return to * 2;
  if (to === from + size) return from * 2 + 1;
  return to * 2 + 1;
}

function buildEdgeBoard(puzzle: DotsPuzzle): EdgeBoard | null {
  const size = puzzle.size;
  if (!Number.isInteger(size) || size < 2) return null;
  const cells = size * size;
  const dotOf = new Int16Array(cells).fill(-1);
  for (let index = 0; index < puzzle.pairs.length; index += 1) {
    const [from, to] = puzzle.pairs[index]!.endpoints;
    for (const end of [from, to]) {
      if (!isInBounds(end, size)) return null;
      const at = end.row * size + end.col;
      if (dotOf[at] !== -1) return null;
      dotOf[at] = index;
    }
  }
  /**
   * 🔴 СТЕНЫ ПРОРЕЗАЮТСЯ ЗДЕСЬ, А НЕ ТОЛЬКО В ПУТЕВОМ РЕШАТЕЛЕ. Замер 06.09.2026:
   * решателя научили обходить стены в `forcedMove` (через `свободна`), а
   * рёберная доска — та, на которой работает вывод от противного, — осталась
   * слепой. Каждой клетке без точки она назначала степень 2, включая стену;
   * стена степени 2 быть не может, распространение сразу упиралось в
   * противоречие, и доска объявлялась НЕВЫВОДИМОЙ. Наружу это выглядело как
   * свойство игры: «со стенами верхние уровни не выводятся» — 0 годных досок из
   * 4000 попыток ровно с 11-го уровня, где стены и включаются. Заслон, стоящий
   * у одного потребителя, второго не прикрывает.
   */
  /**
   * 🔴 ВОРОТА В РЁБЕРНОМ ВЫВОДЕ — ЭТО ЗАРАНЕЕ ИЗВЕСТНЫЙ ЦВЕТ КЛЕТКИ.
   *
   * Здесь они работают иначе, чем в путевом решателе: тому важно «кому можно
   * ступить», а рёберному — «чья это клетка». Красим её сразу, и вывод от
   * противного получает опору: от ворот цепочка идёт в обе стороны.
   */
  const воротаПары = new Int16Array(cells).fill(-1);
  for (const g of puzzle.gates ?? []) {
    const индекс = puzzle.pairs.findIndex((p) => p.id === g.pairId);
    if (индекс < 0) return null;                 // ворота несуществующей пары
    if (!isInBounds(g.cell, size)) return null;
    воротаПары[g.cell.row * size + g.cell.col] = индекс;
  }
  const wall = new Uint8Array(cells);
  for (const w of puzzle.walls ?? []) {
    if (!isInBounds(w, size)) return null;
    const at = w.row * size + w.col;
    if (dotOf[at] !== -1) return null;         // точка на стене — доска сломана
    wall[at] = 1;
  }
  const need = new Int8Array(cells);
  const open = new Int8Array(cells);
  for (let at = 0; at < cells; at += 1) need[at] = wall[at] ? 0 : (dotOf[at] >= 0 ? 1 : 2);

  const edge = new Int8Array(cells * 2).fill(2);
  const edgeFrom = new Int32Array(cells * 2).fill(-1);
  const edgeTo = new Int32Array(cells * 2).fill(-1);
  const edgeIds = new Int32Array(cells * 2);
  let edgeCount = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const at = row * size + col;
      // Ребро, упирающееся в стену, не заводится вовсе: оно остаётся в
      // состоянии 2 («запрещено»), не попадает в `edgeIds` и потому не тратит
      // проб на доказательство того, что и так известно.
      if (col < size - 1 && !wall[at] && !wall[at + 1]) {
        const id = at * 2;
        edge[id] = 0; edgeFrom[id] = at; edgeTo[id] = at + 1;
        edgeIds[edgeCount] = id; edgeCount += 1;
        open[at] += 1; open[at + 1] += 1;
      }
      if (row < size - 1 && !wall[at] && !wall[at + size]) {
        const id = at * 2 + 1;
        edge[id] = 0; edgeFrom[id] = at; edgeTo[id] = at + size;
        edgeIds[edgeCount] = id; edgeCount += 1;
        open[at] += 1; open[at + size] += 1;
      }
    }
  }
  const parent = new Int32Array(cells);
  const colour = new Int16Array(cells).fill(-1);
  for (let at = 0; at < cells; at += 1) {
    parent[at] = at;
    /**
     * 🔴 ВОРОТА КРАСЯТ КЛЕТКУ НАРАВНЕ С ТОЧКОЙ. Для рёберного вывода это и есть
     * весь их смысл: цвет клетки известен ДО первого шага, значит слияние с
     * чужим цветом отсекается сразу (`drawEdge` сравнивает цвета корней), и
     * цепочка доказательств от ворот идёт в обе стороны. Без этой строки
     * ворота были бы известны игроку и невидимы выводу.
     */
    colour[at] = dotOf[at] >= 0 ? dotOf[at] : (воротаПары[at] as number);
  }
  return {
    size, cells, need, dotOf, drawn: new Int8Array(cells), open, edge,
    edgeFrom, edgeTo, edgeIds, edgeCount, parent, colour,
  };
}

function findRoot(board: EdgeBoard, at: number): number {
  let root = at;
  while (board.parent[root] !== root) root = board.parent[root] as number;
  let walk = at;
  while (board.parent[walk] !== root) {
    const next = board.parent[walk] as number;
    board.parent[walk] = root;
    walk = next;
  }
  return root;
}

/** Провести ребро. `false` — противоречие: доска в этой ветке невозможна. */
function drawEdge(board: EdgeBoard, id: number): boolean {
  if (board.edge[id] === 1) return true;
  if (board.edge[id] === 2) return false;
  const from = board.edgeFrom[id] as number;
  const to = board.edgeTo[id] as number;
  board.edge[id] = 1;
  board.drawn[from] += 1; board.open[from] -= 1;
  board.drawn[to] += 1; board.open[to] -= 1;
  if (board.drawn[from] > board.need[from] || board.drawn[to] > board.need[to]) return false;
  const left = findRoot(board, from);
  const right = findRoot(board, to);
  if (left === right) return false;                                  // кольцо
  const leftColour = board.colour[left] as number;
  const rightColour = board.colour[right] as number;
  if (leftColour >= 0 && rightColour >= 0 && leftColour !== rightColour) return false;
  board.parent[left] = right;
  board.colour[right] = rightColour >= 0 ? rightColour : leftColour;
  return true;
}

/** Запретить ребро. `false` — противоречие: клетке нечем набрать свою степень. */
function banEdge(board: EdgeBoard, id: number): boolean {
  if (board.edge[id] === 2) return true;
  if (board.edge[id] === 1) return false;
  const from = board.edgeFrom[id] as number;
  const to = board.edgeTo[id] as number;
  board.edge[id] = 2;
  board.open[from] -= 1; board.open[to] -= 1;
  if (board.drawn[from] + board.open[from] < board.need[from]) return false;
  if (board.drawn[to] + board.open[to] < board.need[to]) return false;
  return true;
}

function edgesOf(board: EdgeBoard, at: number, out: number[]): void {
  out.length = 0;
  const { size } = board;
  const row = Math.floor(at / size);
  const col = at % size;
  if (row > 0) out.push(edgeBetween(at, at - size, size));
  if (row < size - 1) out.push(edgeBetween(at, at + size, size));
  if (col > 0) out.push(edgeBetween(at, at - 1, size));
  if (col < size - 1) out.push(edgeBetween(at, at + 1, size));
}

/** Гоняет правила A, B, C до неподвижной точки. `false` — противоречие. */
function propagate(board: EdgeBoard): boolean {
  const around: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let at = 0; at < board.cells; at += 1) {
      const drawn = board.drawn[at] as number;
      const open = board.open[at] as number;
      const need = board.need[at] as number;
      if (drawn > need || drawn + open < need) return false;
      if (open === 0) continue;
      if (drawn === need) {                                          // правило A
        edgesOf(board, at, around);
        for (const id of around) {
          if (board.edge[id] !== 0) continue;
          if (!banEdge(board, id)) return false;
          changed = true;
        }
      } else if (drawn + open === need) {                            // правило B
        edgesOf(board, at, around);
        for (const id of around) {
          if (board.edge[id] !== 0) continue;
          if (!drawEdge(board, id)) return false;
          changed = true;
        }
      }
    }
    for (let index = 0; index < board.edgeCount; index += 1) {       // правило C
      const id = board.edgeIds[index] as number;
      if (board.edge[id] !== 0) continue;
      const left = findRoot(board, board.edgeFrom[id] as number);
      const right = findRoot(board, board.edgeTo[id] as number);
      const leftColour = board.colour[left] as number;
      const rightColour = board.colour[right] as number;
      if (left !== right && !(leftColour >= 0 && rightColour >= 0 && leftColour !== rightColour)) continue;
      if (!banEdge(board, id)) return false;
      changed = true;
    }
  }
  return true;
}

/** Собирает пути из проведённых рёбер. `null` — рёбра ещё не сложились в пути. */
function readEdgePaths(board: EdgeBoard, puzzle: DotsPuzzle): DotsSolution | null {
  const solution: DotsSolution = {};
  const around: number[] = [];
  for (let index = 0; index < puzzle.pairs.length; index += 1) {
    const start = puzzle.pairs[index]!.endpoints[0];
    const startAt = start.row * board.size + start.col;
    const path: number[] = [startAt];
    let previous = -1;
    let current = startAt;
    for (let guard = 0; guard <= board.cells; guard += 1) {
      if (current !== startAt && board.dotOf[current] === index) break;
      edgesOf(board, current, around);
      let next = -1;
      for (const id of around) {
        if (board.edge[id] !== 1) continue;
        const other = (board.edgeFrom[id] as number) === current
          ? (board.edgeTo[id] as number)
          : (board.edgeFrom[id] as number);
        if (other === previous) continue;
        next = other;
        break;
      }
      if (next < 0) return null;
      path.push(next);
      previous = current;
      current = next;
    }
    if (board.dotOf[current] !== index || current === startAt) return null;
    solution[puzzle.pairs[index]!.id] = path.map((at) => ({
      row: Math.floor(at / board.size),
      col: at % board.size,
    } as Cell));
  }
  return solution;
}

function isSettled(board: EdgeBoard): boolean {
  for (let at = 0; at < board.cells; at += 1) {
    if (board.drawn[at] !== board.need[at]) return false;
  }
  return true;
}

function cloneEdgeBoard(board: EdgeBoard): EdgeBoard {
  return {
    ...board,
    drawn: board.drawn.slice(),
    open: board.open.slice(),
    edge: board.edge.slice(),
    parent: board.parent.slice(),
    colour: board.colour.slice(),
  };
}

function solveForced(puzzle: DotsPuzzle): DotsSolution | null {
  const board = buildEdgeBoard(puzzle);
  if (!board) return null;
  if (!propagate(board)) return null;
  if (!isSettled(board)) return null;                                // застряли
  return readEdgePaths(board, puzzle);
}

/**
 * СТУПЕНЬ «ОТ ПРОТИВНОГО» — ТОЖЕ БЕЗ ДОГАДОК, НО НА ХОД ГЛУБЖЕ.
 *
 * Человек, у которого прямые правила кончились, рассуждает так: «допустим,
 * это ребро проведено — тогда вон та клетка остаётся без пары, значит ребра
 * здесь НЕТ». Вывод получается такой же жёсткий, как у правил A/B/C: это не
 * попытка угадать, это доказательство от противного глубиной в один ход.
 *
 * ⚠️ ОТЛИЧИЕ ОТ ПЕРЕБОРА. Перебор ставит предположение и ЖИВЁТ в нём, пока не
 * упрётся, а упёршись — откатывается и пробует другое; человек так за доской не
 * играет, он это место просто угадывает. Здесь предположение живёт ровно до
 * ответа «противоречие / не противоречие» и всегда откатывается: доска
 * меняется только тогда, когда противоречие ДОКАЗАНО. Ни одной догадки в
 * итоговом решении не остаётся.
 */
function solveByContradiction(
  puzzle: DotsPuzzle,
  учёт?: { доказано: number },
): DotsSolution | null {
  const board = buildEdgeBoard(puzzle);
  if (!board) return null;
  if (!propagate(board)) return null;
  /**
   * ⚠️ ПОТОЛОК ПРОБ — НЕ БЮДЖЕТ, А СТРАХОВКА ОТ ЗАВИСАНИЯ, И ОН ЗАВЕДОМО
   * НЕДОСТИЖИМ. Проход по всем рёбрам стоит не больше 2E проб и либо доказывает
   * хотя бы одно ребро, либо заканчивает ступень; доказанных рёбер не больше E.
   * Значит проб не больше 2E², и потолок ниже этого числа означал бы «ступень
   * зависит от константы» — а тогда чужой разбор в гейте имел бы полное право
   * разойтись с этим решателем. Пусть лучше страховка никогда не срабатывает.
   */
  const maxTrials = 2 * board.edgeCount * board.edgeCount + 1;
  let trials = 0;
  while (!isSettled(board)) {
    let progress = false;
    for (let index = 0; index < board.edgeCount; index += 1) {
      const id = board.edgeIds[index] as number;
      if (board.edge[id] !== 0) continue;
      if (trials >= maxTrials) return null;
      trials += 1;
      const asDrawn = cloneEdgeBoard(board);
      if (!drawEdge(asDrawn, id) || !propagate(asDrawn)) {
        if (!banEdge(board, id) || !propagate(board)) return null;
        if (учёт) учёт.доказано += 1;
        progress = true;
        continue;
      }
      const asBanned = cloneEdgeBoard(board);
      if (!banEdge(asBanned, id) || !propagate(asBanned)) {
        if (!drawEdge(board, id) || !propagate(board)) return null;
        if (учёт) учёт.доказано += 1;
        progress = true;
      }
    }
    if (!progress) return null;                                      // застряли
  }
  return readEdgePaths(board, puzzle);
}

/**
 * Решает доску РОВНО НА ЗАДАННОЙ СТУПЕНИ: техники выше указанной выключены.
 * `null` значит «этой ступени не хватило» — содержательный ответ, а не ошибка:
 * по нему генератор и отбирает доску для уровня.
 */
export function solveDotsPuzzleAt(
  puzzle: DotsPuzzle,
  tier: DotsTier,
  maxSteps = 4_000_000,
): DotsSolution | null {
  if (tier === 'forced') {
    const solution = solveForced(puzzle);
    return solution && validateDotsSolution(puzzle, solution).complete ? solution : null;
  }
  /**
   * Обе верхние ступени выводят доску одним и тем же рассуждением; отличает их
   * ДЛИНА цепи. Поэтому «от противного» отказывается от доски, которой не
   * хватило порога, — иначе `dotsPuzzleTier` объявил бы ступенью «от
   * противного» и ту доску, что требует девяти доказательств подряд.
   */
  const учёт = { доказано: 0 };
  const solution = solveByContradiction(puzzle, учёт);
  if (!solution || !validateDotsSolution(puzzle, solution).complete) return null;
  const длинная = учёт.доказано >= ЦЕПОЧКА_С;
  if (tier === 'chain') return длинная ? solution : null;
  return длинная ? null : solution;
}

/**
 * САМАЯ НИЗКАЯ СТУПЕНЬ, КОТОРОЙ ДОСКА ПОДДАЁТСЯ — это и есть её сложность по
 * требуемому рассуждению. `null` — не поддалась ни одной; для наших досок это
 * означало бы поломку: решение у них есть по построению.
 */
export function длинаЦепиВывода(puzzle: DotsPuzzle): number | null {
  const учёт = { доказано: 0 };
  const solution = solveByContradiction(puzzle, учёт);
  if (!solution || !validateDotsSolution(puzzle, solution).complete) return null;
  return учёт.доказано;
}

export function dotsPuzzleTier(puzzle: DotsPuzzle, maxSteps = 4_000_000): DotsTier | null {
  for (const tier of DOTS_TIERS) {
    if (solveDotsPuzzleAt(puzzle, tier, maxSteps)) return tier;
  }
  return null;
}
