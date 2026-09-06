/* psygames-goods-sort-board · VER 1 · 22.08.2026 */
/**
 * ДОСКА СОРТИРОВКИ: СОДЕРЖИМОЕ И ВМЕСТИМОСТЬ — ОДИН ОБЪЕКТ.
 *
 * 🔴 ЗАЧЕМ ЭТО ЗАВЕДЕНО. За один день 22.08.2026 в игре нашлось ЧЕТЫРЕ дефекта, и
 * все четыре — одна и та же ошибка в разных местах:
 *   · раздача считала пустые ниши, не зная про препятствия → 57 уровней из 200
 *     выдавались без единой свободной ниши;
 *   · перемешивание считало корзины делением на три → 14–48 % нажатий ТЕРЯЛИ
 *     товар, и уровень становился непроходимым;
 *   · решатель считал все ниши по три → «решение», которым доска признавалась
 *     проходимой, содержало невозможный ход на 69–100 % досок с 20-го уровня;
 *   · он же не замечал тройку в нише на четыре.
 *
 * Корень один: ниши разной вместимости появились позже (с 18-го уровня), а
 * половина кода писалась под «в каждой нише три места». Константа `CAP` стояла
 * там, где должно стоять `caps[i]`, — и каждое такое место было отдельным тихим
 * багом, который не видит ни компилятор, ни тесты.
 *
 * ⚠️ ПОЭТОМУ ЗДЕСЬ СОДЕРЖИМОЕ И ВМЕСТИМОСТЬ ЛЕЖАТ ВМЕСТЕ. Взять клетки без
 * ёмкостей теперь нельзя: `Board` — это пара, и любая работа с доской идёт через
 * неё. Ошибка «забыл про ёмкость» перестаёт компилироваться, а не всплывает
 * через месяц отчётом «две одинаковые банки, которые ничем не убрать».
 */

/** Сколько одинаковых товаров складываются в тройку и исчезают. Это правило игры. */
export const TRIPLE = 3;

/** Ниша: что в ней лежит, сколько влезает и снято ли с неё правило укладки. */
export interface Board {
  /** Содержимое каждой ниши, снизу вверх. */
  readonly cells: readonly (readonly number[])[];
  /** Вместимость каждой ниши. Длина совпадает с `cells`. */
  readonly caps: readonly number[];
  /**
   * Ниши-джокеры: принимают ЛЮБОЙ тип, пока есть место, даже при строгой
   * укладке. Пусто или короче доски — джокеров нет; читается через `isJoker`,
   * поэтому старые вызовы `makeBoard` из двух аргументов остаются верными.
   */
  readonly jokers?: readonly boolean[];
}

export function makeBoard(
  cells: readonly (readonly number[])[],
  caps: readonly number[],
  jokers?: readonly boolean[],
): Board {
  if (cells.length !== caps.length) {
    throw new Error(`доска собрана неверно: ниш ${cells.length}, ёмкостей ${caps.length}`);
  }
  if (jokers && jokers.length !== cells.length) {
    throw new Error(`доска собрана неверно: ниш ${cells.length}, джокеров ${jokers.length}`);
  }
  return jokers ? { cells, caps, jokers } : { cells, caps };
}

/** Снято ли с ниши правило укладки. Единственное место, где это читается. */
export function isJoker(board: Board, index: number): boolean {
  return board.jokers?.[index] === true;
}

/** Вместимость ниши. Единственное место, где это число берётся. */
export function capOf(board: Board, index: number): number {
  const cap = board.caps[index];
  if (cap === undefined) throw new Error(`ниши ${index} на доске нет`);
  return cap;
}

/** Сколько ещё влезет в нишу. */
export function roomIn(board: Board, index: number): number {
  return Math.max(0, capOf(board, index) - (board.cells[index]?.length ?? 0));
}

/** Ниша пуста. */
export function isEmpty(board: Board, index: number): boolean {
  return (board.cells[index]?.length ?? 0) === 0;
}

/** Ниша заполнена под завязку. */
export function isFull(board: Board, index: number): boolean {
  return roomIn(board, index) === 0;
}

/**
 * Тройка в нише, если она есть. Ищется ПО СОДЕРЖИМОМУ, а не по заполненности:
 * в нише на четыре тройка лежит рядом с четвёртым предметом, и проверка вида
 * «ниша полна и всё одинаковое» её не видит.
 */
export function tripleIn(cell: readonly number[]): number | null {
  const count = new Map<number, number>();
  for (const t of cell) {
    const n = (count.get(t) ?? 0) + 1;
    if (n === TRIPLE) return t;
    count.set(t, n);
  }
  return null;
}

/** Убрать из ниши тройку одного типа, оставив остальное. */
export function removeTriple(cell: readonly number[], type: number): number[] {
  const out: number[] = [];
  let left = TRIPLE;
  for (const t of cell) {
    if (t === type && left > 0) { left -= 1; continue; }
    out.push(t);
  }
  return out;
}

/**
 * Можно ли положить товар в нишу.
 *
 * `strict` — строгая укладка: класть можно только к своему типу или в пустую.
 * Без неё ниша принимает что угодно, пока есть место.
 */
export function canPlace(board: Board, index: number, type: number, strict: boolean): boolean {
  // 🔴 МЕСТО ПРОВЕРЯЕТСЯ ПЕРВЫМ И ДЛЯ ДЖОКЕРА ТОЖЕ. Джокер снимает ПРАВИЛО
  // УКЛАДКИ, а не ёмкость: он даёт место, куда положить, но не лишний товар.
  // Инвариант «сумма ёмкостей = ниш × 3» держится только пока это так.
  if (roomIn(board, index) <= 0) return false;
  if (!strict || isJoker(board, index)) return true;
  const cell = board.cells[index] ?? [];
  return cell.length === 0 || cell[cell.length - 1] === type;
}

/** Доска разобрана: во всех нишах пусто. */
export function isCleared(board: Board): boolean {
  return board.cells.every((c) => c.length === 0);
}

/** Убрать все тройки, какие сложились, — повторяя, пока складываются. */
export function collapseTriples(board: Board): Board {
  const cells = board.cells.map((c) => [...c]);
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < cells.length; i += 1) {
      const t = tripleIn(cells[i] as number[]);
      if (t !== null) { cells[i] = removeTriple(cells[i] as number[], t); again = true; }
    }
  }
  return { cells, caps: board.caps, jokers: board.jokers };
}

/** Переложить верхний товар из одной ниши в другую. `null` — ход невозможен. */
export function moveTop(board: Board, from: number, to: number, strict: boolean): Board | null {
  if (from === to) return null;
  const src = board.cells[from] ?? [];
  if (src.length === 0) return null;
  const type = src[src.length - 1] as number;
  if (!canPlace(board, to, type, strict)) return null;
  const cells = board.cells.map((c) => [...c]);
  (cells[from] as number[]).pop();
  (cells[to] as number[]).push(type);
  return collapseTriples({ cells, caps: board.caps, jokers: board.jokers });
}

/** Свободные ниши: пустые и не занятые препятствием. */
export function freeNiches(board: Board, blocked: readonly boolean[] = []): number {
  return board.cells.reduce(
    (n, cell, i) => n + (cell.length === 0 && !blocked[i] ? 1 : 0), 0,
  );
}
