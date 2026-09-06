/* psygames-cake-sort-plate · VER 1 · 06.09.2026 */
/**
 * ТОРТЫ — ядро доски. Отдельная игра, а не режим сортировки (решение Дениса).
 *
 * 🔴 ЧЕМ ОТЛИЧАЕТСЯ ОТ СОРТИРОВКИ ТОВАРОВ, И ПОЧЕМУ ЭТО НЕ КОСМЕТИКА.
 * Там тройка собирается в нише на 3 или 4 — то есть в нише на четыре тройка
 * лежит РЯДОМ с лишним предметом, и у игрока есть люфт. Здесь круг замыкается
 * шестью секторами при тарелке ровно на шесть: тарелка обязана стать
 * ОДНОРОДНОЙ И ПОЛНОЙ. Люфта внутри тарелки нет вообще, и весь запас манёвра
 * переезжает на число тарелок — отсюда требование ТЗ «тарелок на экране больше,
 * чем ниш».
 *
 * ⚠️ Ни одно число отсюда не унаследовано от сортировки. Калибровка
 * `REF_PER_TYPE = 2.2` снята под тройки и для шестёрок неверна — она меряется
 * заново в `cake-sort-reference`, а не переносится.
 */

/** Сколько секторов замыкают круг. Это правило игры, а не настройка. */
export const CIRCLE = 6;

/** Тарелка: сектора снизу вверх. Длина не больше `CIRCLE`. */
export type Plate = readonly number[];

export interface Board {
  /** Тарелки на столе. Пустая тарелка — пустой массив, а не дырка. */
  readonly plates: readonly Plate[];
  /**
   * Очередь входящих тарелок: приходит на освободившееся место сама.
   *
   * 🔴 ОЧЕРЕДЬ КОНЕЧНА И ЗАДАНА УРОВНЕМ. Это не украшение, а то, на чём держится
   * доказуемость: разбор §8 прямо говорит, что «замкнутость мультимножества
   * держит всю гарантию решаемости». Бесконечный поток отменил бы саму
   * возможность доказать уровень — а это единственное, чем мы отличаемся от
   * конкурента с 3,4★. Здесь очередь — просто ОТЛОЖЕННАЯ часть той же доски:
   * мультимножество замкнуто, кратно шести и известно целиком.
   */
  readonly queue: readonly Plate[];
}

export function makeBoard(plates: readonly Plate[], queue: readonly Plate[] = []): Board {
  for (const p of plates) {
    if (p.length > CIRCLE) throw new Error(`тарелка собрана неверно: секторов ${p.length} при круге ${CIRCLE}`);
  }
  for (const p of queue) {
    if (p.length > CIRCLE) throw new Error(`тарелка в очереди неверна: секторов ${p.length} при круге ${CIRCLE}`);
  }
  return { plates, queue };
}

/** Сколько ещё влезет в тарелку. */
export function roomIn(board: Board, i: number): number {
  return Math.max(0, CIRCLE - (board.plates[i]?.length ?? 0));
}

export function isEmpty(board: Board, i: number): boolean {
  return (board.plates[i]?.length ?? 0) === 0;
}

/**
 * Круг замкнулся? Тарелка полна И однородна.
 *
 * ⚠️ ПРОВЕРЯЕТСЯ СОСТАВ, А НЕ ТОЛЬКО ДЛИНА. Соблазн написать «длина = 6» стоит
 * ровно до первой смешанной тарелки: она полна и не является тортом.
 */
export function completeIn(plate: Plate): number | null {
  if (plate.length !== CIRCLE) return null;
  const t = plate[0] as number;
  return plate.every((s) => s === t) ? t : null;
}

/**
 * Можно ли положить сектор типа `type` на тарелку `i`.
 *
 * Правило одно и строгое: только к своему типу или на пустую. Смешанных тарелок
 * игра не запрещает физически — они получаются, когда игрок ошибся, — но класть
 * ПОВЕРХ чужого нельзя, иначе круг перестал бы быть задачей.
 */
export function canPlace(board: Board, i: number, type: number): boolean {
  if (roomIn(board, i) <= 0) return false;
  const plate = board.plates[i] ?? [];
  return plate.length === 0 || plate[plate.length - 1] === type;
}

/**
 * Снять со стола замкнувшиеся круги и подать следующие тарелки из очереди.
 *
 * 🔴 ОЧЕРЕДЬ ПОДАЁТСЯ ИМЕННО ЗДЕСЬ, а не в обработчике экрана. Освобождение
 * места и приход новой тарелки — одно событие; разведи их по двум местам, и
 * появится состояние «тарелка снята, а очередь ещё не подана», из которого
 * решатель посчитает не ту доску, что увидит игрок.
 */
export function collapse(board: Board): { board: Board; cleared: number[] } {
  const plates = board.plates.map((p) => [...p]);
  const queue = [...board.queue];
  const cleared: number[] = [];
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < plates.length; i += 1) {
      const t = completeIn(plates[i] as number[]);
      if (t === null) continue;
      cleared.push(t);
      const next = queue.shift();
      plates[i] = next ? [...next] : [];
      again = true;
    }
  }
  return { board: { plates, queue }, cleared };
}

/** Переложить верхний сектор. `null` — ход невозможен. */
export function moveTop(board: Board, from: number, to: number): Board | null {
  if (from === to) return null;
  const src = board.plates[from] ?? [];
  if (src.length === 0) return null;
  const type = src[src.length - 1] as number;
  if (!canPlace(board, to, type)) return null;
  const plates = board.plates.map((p) => [...p]);
  (plates[from] as number[]).pop();
  (plates[to] as number[]).push(type);
  return collapse({ plates, queue: board.queue }).board;
}

/** Стол разобран: тарелки пусты и очередь кончилась. */
export function isCleared(board: Board): boolean {
  return board.queue.length === 0 && board.plates.every((p) => p.length === 0);
}

/** Все сектора уровня — и на столе, и в очереди. Для проверки кратности кругу. */
export function allSectors(board: Board): number[] {
  return [...board.plates.flat(), ...board.queue.flat()];
}

/** Есть ли вообще законный ход. Нужен и игре («стол встал»), и решателю. */
export function hasAnyMove(board: Board): boolean {
  for (let from = 0; from < board.plates.length; from += 1) {
    const src = board.plates[from] ?? [];
    if (!src.length) continue;
    const type = src[src.length - 1] as number;
    for (let to = 0; to < board.plates.length; to += 1) {
      if (to !== from && canPlace(board, to, type)) return true;
    }
  }
  return false;
}
