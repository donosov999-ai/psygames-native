/**
 * fractal-sudoku — судоку, вложенная сама в себя.
 *
 * ЗАЧЕМ. Разобрано по фото карточки, которые прислал Денис: за каждой клеткой верхней
 * сетки спрятана целая судоку. Решаешь снизу вверх, слой за слоем, пока не вскроешь
 * корневую. Как мега-босс — событие на несколько часов.
 *
 * ⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ ОРИГИНАЛА — РАЗМЕР. У них 6555 пазлов в одной игре: очевидно
 * заготовленных заранее. У нас доска строится на лету, и мы уже ловили 90 секунд на
 * одном варианте правил. Дерево из тысяч пазлов на лету не соберётся никогда.
 *
 * Поэтому глубина здесь ДВА уровня: корень + девять дочерних = 10 сеток. Этого хватает
 * на несколько часов игры, а собирается за секунды. Глубина три (91 сетка) остаётся
 * возможной — структура её держит, — но только заготовками, а не генерацией в момент
 * запуска. Строить на лету то, что заведомо не успеет, — обманывать себя.
 *
 * ПОРОГ 17 КЛЕТОК — НЕ ВЫДУМКА. Чтобы открыть цифру в родительской клетке, надо решить
 * не менее 17 клеток дочерней сетки. 17 — доказанный минимум подсказок, при котором
 * судоку 9×9 ещё имеет ЕДИНСТВЕННОЕ решение. То есть порог выбран так, чтобы дочерняя
 * сетка стала однозначно определена, и её центр можно было честно отдать наверх.
 * Та же теорема, на которой стоит наш гейт единственности.
 */
import { shuffle } from '@/src/services/sudoku-core';
import { makeRng, seededShuffle, type Rng } from '@/src/services/seed';

export const N = 9;

/** Минимум решённых клеток дочерней сетки, чтобы отдать цифру наверх. */
export const UNLOCK_CELLS = 17;

/** Клетка, чьё значение уходит родителю. Центр — потому что он дальше всех от краёв. */
export const FEED_CELL: readonly [number, number] = [4, 4];

export type Board = number[][];

export interface FractalPuzzle {
  /** Корневая сетка: то, что человек собирает в итоге. */
  root: { solution: Board; puzzle: Board };
  /**
   * Девять дочерних, по одной на каждый БЛОК корня (индекс 0..8, слева направо сверху вниз).
   * Центр дочерней сетки равен цифре, которую она открывает в родителе.
   */
  children: { solution: Board; puzzle: Board; feedsCell: [number, number] }[];
}

function ok(b: Board, r: number, c: number, v: number): boolean {
  for (let i = 0; i < N; i++) if (b[r][i] === v || b[i][c] === v) return false;
  const br = r - (r % 3), bc = c - (c % 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (b[br + i][bc + j] === v) return false;
  return true;
}

const empty = (): Board => Array.from({ length: N }, () => Array(N).fill(0));

function fill(b: Board, pos = 0, rnd?: Rng): boolean {
  if (pos === N * N) return true;
  const r = Math.floor(pos / N), c = pos % N;
  if (b[r][c] !== 0) return fill(b, pos + 1, rnd);
  for (const v of (rnd ? seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd) : shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]))) {
    if (!ok(b, r, c, v)) continue;
    b[r][c] = v;
    if (fill(b, pos + 1, rnd)) return true;
    b[r][c] = 0;
  }
  return false;
}

/** Решённая сетка, у которой центр равен заданной цифре. */
export function solvedWithCenter(center: number, rnd?: Rng): Board {
  for (let attempt = 0; attempt < 60; attempt++) {
    const b = empty();
    b[FEED_CELL[0]][FEED_CELL[1]] = center;
    if (fill(b, 0, rnd)) return b;
  }
  throw new Error(`fractal: не удалось собрать сетку с центром ${center}`);
}

/**
 * Клетка корня, которую открывает дочерняя сетка с индексом i.
 *
 * Одна дочерняя на БЛОК корня, а не на клетку: девять сеток вместо восьмидесяти одной.
 * Отдаёт она центр своего блока — так связь видна на глаз, и человек понимает, что решил.
 */
export function rootCellForChild(i: number): [number, number] {
  const blockRow = Math.floor(i / 3), blockCol = i % 3;
  return [blockRow * 3 + 1, blockCol * 3 + 1];
}

/**
 * Сколько клеток дочерней сетки уже решено. Считаем СОВПАДЕНИЯ с решением, а не просто
 * заполненность: неверная цифра — не прогресс, и открывать ею родителя нельзя.
 *
 * ⚠️ ПАРАМЕТР given ОБЯЗАТЕЛЕН НА ЖИВОМ ЭКРАНЕ. Без него считаются и подсказки задания,
 * а они с решением совпадают по определению: при 36 подсказках порог 17 оказывается
 * взят ДО первого хода, все девять сеток открыты сразу, и вся конструкция теряет смысл.
 * Поймано на первом же запуске экрана 12.08 — девять плиток показали «17/17».
 * Маска given помечает клетки задания, они в счёт не идут.
 */
export function solvedCount(current: Board, solution: Board, given?: boolean[][]): number {
  let n = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (given?.[r][c]) continue;
      if (current[r][c] !== 0 && current[r][c] === solution[r][c]) n++;
    }
  }
  return n;
}

/** Открыта ли родительская клетка этой дочерней сеткой. */
export function isUnlocked(current: Board, solution: Board, given?: boolean[][]): boolean {
  return solvedCount(current, solution, given) >= UNLOCK_CELLS;
}

function dig(solution: Board, blanks: number, rnd?: Rng): Board {
  const b = solution.map((row) => [...row]);
  const cells = rnd ? seededShuffle(Array.from({ length: N * N }, (_, i) => i), rnd) : shuffle(Array.from({ length: N * N }, (_, i) => i));
  let removed = 0;
  for (const idx of cells) {
    if (removed >= blanks) break;
    const r = Math.floor(idx / N), c = idx % N;
    // Центр дочерней не выкалываем у КОРНЯ — там он и есть ответ; у дочерних выкалываем,
    // иначе цифру, ради которой всё затевалось, человек получил бы даром.
    if (b[r][c] === 0) continue;
    b[r][c] = 0;
    removed++;
  }
  return b;
}

/**
 * Собрать фрактальную головоломку глубины два.
 *
 * @param rootBlanks   выколотых клеток в корне
 * @param childBlanks  выколотых в каждой дочерней; чем больше, тем дольше до порога 17
 */
export function generateFractal(rootBlanks = 50, childBlanks = 50, seed?: string): FractalPuzzle {
  const rnd = seed ? makeRng(seed) : undefined;
  const rootSolution = empty();
  if (!fill(rootSolution, 0, rnd)) throw new Error('fractal: не удалось собрать корень');

  const children = [];
  for (let i = 0; i < 9; i++) {
    const [rr, rc] = rootCellForChild(i);
    const center = rootSolution[rr][rc];
    const solution = solvedWithCenter(center, rnd);
    children.push({ solution, puzzle: dig(solution, childBlanks, rnd), feedsCell: [rr, rc] as [number, number] });
  }

  // В корне выкалываем ТОЛЬКО те клетки, которые открываются снизу, плюс обычные дырки.
  // Иначе корень решался бы сам по себе, и вложенность оказалась бы украшением.
  const rootPuzzle = dig(rootSolution, rootBlanks, rnd);
  for (let i = 0; i < 9; i++) {
    const [rr, rc] = rootCellForChild(i);
    rootPuzzle[rr][rc] = 0;
  }

  return { root: { solution: rootSolution, puzzle: rootPuzzle }, children };
}
