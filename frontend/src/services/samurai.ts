/**
 * samurai — судоку-самурай: пять сеток 9×9, сцепленных углами.
 *
 * ЗАЧЕМ. Идея Дениса: длинные головоломки как МЕГА-БОСС. Обычным уровнем такое было бы
 * издевательством — партия идёт час, — а боссом становится событием, ради которого
 * возвращаются. Слот боссов в игре уже есть.
 *
 * ПОЧЕМУ САМУРАЙ, А НЕ ФРАКТАЛ, ПЕРВЫМ. У фрактала дерево из тысяч пазлов и своя
 * навигация по глубине; самурай — одна плоская доска, и вся сложность в генерации.
 * Тот же эффект «надолго» за вдвое меньшую работу.
 *
 * ФУНДАМЕНТ УЖЕ В РЕЛИЗЕ (v1.191.0): сохранение незаконченной партии (`services/resume`),
 * отмена хода (`services/moveStack`) и модель провала параметром (`services/failure`).
 * Без них длинный режим нежизнеспособен: звонок стирает час, промах пальцем стоит жизни,
 * третья ошибка обнуляет всё. Здесь — только доска.
 *
 * УСТРОЙСТВО. Пять сеток на поле 21×21: четыре по углам и одна в центре. Каждая угловая
 * делит с центральной ОДИН блок 3×3. Клетки в пересечении принадлежат сразу двум сеткам,
 * и правило должно выполняться в обеих — отсюда вся трудность и весь интерес.
 *
 *   ┌───┐   ┌───┐        (0,0)         (0,12)
 *   │ 0 │   │ 1 │
 *   └─┬─┘   └─┬─┘
 *     └─┌───┐─┘          пересечения — угловые блоки 3×3
 *       │ 4 │            центральной сетки (6,6)
 *     ┌─└───┘─┐
 *   ┌─┴─┐   ┌─┴─┐
 *   │ 2 │   │ 3 │        (12,0)        (12,12)
 *   └───┘   └───┘
 */
import { shuffle } from '@/src/services/sudoku-core';

export const N = 9;
export const CANVAS = 21;

/** Левый верхний угол каждой сетки на поле 21×21. Порядок: 4 угла, затем центр. */
export const GRID_ORIGINS: readonly (readonly [number, number])[] = [
  [0, 0], [0, 12], [12, 0], [12, 12], [6, 6],
];

export type Board = number[][];   // 9×9, 0 = пусто

export interface Samurai {
  /** Пять решённых сеток. */
  solution: Board[];
  /** Пять сеток с выколотыми клетками — то, что видит человек. */
  puzzle: Board[];
}

/** Клетка поля, принадлежащая сетке g. */
export function toCanvas(g: number, r: number, c: number): [number, number] {
  const [or_, oc] = GRID_ORIGINS[g];
  return [or_ + r, oc + c];
}

/**
 * Пары клеток, которые физически одна и та же точка поля.
 * Возвращает для каждой сетки-угла список [rУгла, cУгла, rЦентра, cЦентра].
 *
 * Считаем ГЕОМЕТРИЕЙ, а не таблицей констант: таблица разъедется при первой же правке
 * раскладки, и разъедется молча — доска останется «почти правильной».
 */
export function overlapsOf(g: number): [number, number, number, number][] {
  if (g === 4) return [];
  const [gr, gc] = GRID_ORIGINS[g];
  const [cr, cc] = GRID_ORIGINS[4];
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const ar = gr + r, ac = gc + c;
      const br = ar - cr, bc = ac - cc;
      if (br >= 0 && br < N && bc >= 0 && bc < N) out.push([r, c, br, bc]);
    }
  }
  return out;
}

function ok(b: Board, r: number, c: number, v: number): boolean {
  for (let i = 0; i < N; i++) if (b[r][i] === v || b[i][c] === v) return false;
  const br = r - (r % 3), bc = c - (c % 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (b[br + i][bc + j] === v) return false;
  return true;
}

const empty = (): Board => Array.from({ length: N }, () => Array(N).fill(0));

/** Заполнить сетку с учётом уже расставленных клеток. Возвращает false, если не вышло. */
function fill(b: Board, pos = 0): boolean {
  if (pos === N * N) return true;
  const r = Math.floor(pos / N), c = pos % N;
  if (b[r][c] !== 0) return fill(b, pos + 1);
  for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!ok(b, r, c, v)) continue;
    b[r][c] = v;
    if (fill(b, pos + 1)) return true;
    b[r][c] = 0;
  }
  return false;
}

/**
 * Решённый самурай.
 *
 * ⚠️ ПОРЯДОК ВАЖЕН: сначала ЦЕНТР, потом углы. Центр делит блок с каждым из четырёх
 * углов, поэтому он самый связанный. Начни с угла — и центр придётся подгонять под
 * четыре готовых блока сразу, что почти всегда упирается в тупик и заставляет
 * перебирать всё заново.
 */
export function buildSolution(): Board[] {
  // 🔴 Геометрию проверяем ДО перебора. Замер 12.08.2026: при сдвинутой раскладке
  // (центр в [5,5] вместо [6,6]) пересечение разрастается с 9 клеток до 16, решения
  // не существует, и перебор МОЛОТИТ ВХОЛОСТУЮ — 400 секунд без результата и без ошибки.
  // Для мега-боссa это худший отказ: экран просто висит, и непонятно, думает он или умер.
  // Дешёвая проверка впереди превращает зависание в внятную ошибку.
  for (let g = 0; g < 4; g++) {
    const n = overlapsOf(g).length;
    if (n !== 9) throw new Error(`samurai: угол ${g} делит с центром ${n} клеток вместо 9 — раскладка сломана`);
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const grids: Board[] = [empty(), empty(), empty(), empty(), empty()];
    if (!fill(grids[4])) continue;

    let good = true;
    for (let g = 0; g < 4 && good; g++) {
      for (const [r, c, cr, cc] of overlapsOf(g)) grids[g][r][c] = grids[4][cr][cc];
      if (!fill(grids[g])) good = false;
    }
    if (good) return grids;
  }
  throw new Error('samurai: не удалось собрать решение');
}

/** Проверка: каждая сетка валидна и пересечения согласованы. */
export function isSolved(grids: Board[]): boolean {
  for (const b of grids) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = b[r][c];
        if (v < 1 || v > 9) return false;
        b[r][c] = 0;
        const fine = ok(b, r, c, v);
        b[r][c] = v;
        if (!fine) return false;
      }
    }
  }
  for (let g = 0; g < 4; g++) {
    for (const [r, c, cr, cc] of overlapsOf(g)) {
      if (grids[g][r][c] !== grids[4][cr][cc]) return false;
    }
  }
  return true;
}

/**
 * Выколоть клетки. Симметрично по пересечениям: если убрали клетку в пересечении, она
 * исчезает В ОБЕИХ сетках — иначе человек видел бы подсказку с одной стороны и пустоту
 * с другой на одной и той же точке поля, и доска выглядела бы сломанной.
 */
export function dig(solution: Board[], blanksPerGrid: number): Board[] {
  const puzzle = solution.map((b) => b.map((row) => [...row]));

  const twin = new Map<string, [number, number, number]>();
  for (let g = 0; g < 4; g++) {
    for (const [r, c, cr, cc] of overlapsOf(g)) {
      twin.set(`${g}:${r}:${c}`, [4, cr, cc]);
      twin.set(`4:${cr}:${cc}`, [g, r, c]);
    }
  }

  for (let g = 0; g < 5; g++) {
    const cells = shuffle(Array.from({ length: N * N }, (_, i) => i));
    let removed = 0;
    for (const idx of cells) {
      if (removed >= blanksPerGrid) break;
      const r = Math.floor(idx / N), c = idx % N;
      if (puzzle[g][r][c] === 0) continue;
      puzzle[g][r][c] = 0;
      const t = twin.get(`${g}:${r}:${c}`);
      if (t) puzzle[t[0]][t[1]][t[2]] = 0;
      removed++;
    }
  }
  return puzzle;
}

export function generateSamurai(blanksPerGrid = 45): Samurai {
  const solution = buildSolution();
  return { solution, puzzle: dig(solution, blanksPerGrid) };
}
