/* psygames-cake-sort-plate · VER 2 · 09.09.2026 */
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

/**
 * Сколько секторов замыкают круг ПО УМОЛЧАНИЮ.
 *
 * ⚠️ Уже НЕ «правило игры, а не настройка», как было написано здесь до
 * 09.09.2026: у доски появились СВОИ вместимости тарелок (`Board.caps`), а это
 * число осталось значением по умолчанию — для доски, которая их не задаёт.
 * Разбор, зачем понадобилось, — в шапке `capOf`.
 */
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
  /**
   * 🔴 ВМЕСТИМОСТЬ КАЖДОЙ ТАРЕЛКИ. Нет поля — все по `CIRCLE`, как жила игра до
   * 09.09.2026, и ни один прежний вызов не меняется.
   *
   * 📍 ЗАЧЕМ. Замер лестницы 09.09.2026: `types` замирает на L17 (потолок 11 =
   * длина палитры), `plates` — на L42 (`PLATES_MAX = 20`), и с L42 стартовый
   * стол СОВПАДАЕТ на каждом уровне до L200 — 11 занятых, 9 пустых, 66 секторов,
   * 99 законных ходов. Растёт одна очередь: 5 полок на L42 → 25 на L200. То есть
   * уровень становится длиннее, а не труднее. Разная вместимость тарелки —
   * первая ось, которая меняет саму форму стола; приём проверен у соседа
   * (`capsFor` в сортировке товаров).
   */
  readonly caps?: readonly number[];
  /** Вместимости тарелок В ОЧЕРЕДИ. Едут вместе со своей тарелкой (см. `collapse`). */
  readonly queueCaps?: readonly number[];
}

/**
 * 🔴 ВМЕСТИМОСТЬ ТАРЕЛКИ СПРАШИВАЕТСЯ У ДОСКИ, А НЕ БЕРЁТСЯ КОНСТАНТОЙ.
 *
 * ⚠️ Одна функция на всё ядро — намеренно. В сортировке товаров ровно эта
 * величина однажды считалась в двух местах (`capsFor(level, slots)` в экране и
 * длина доски в ядре), и на переходе L6→L7 доска приезжала на девять ниш с
 * ёмкостями на семь: игра падала. Здесь единственный источник — сама доска.
 */
export function capOf(board: Board, i: number): number {
  const c = board.caps?.[i];
  return typeof c === 'number' && c > 0 ? c : CIRCLE;
}

/** Вместимость тарелки, стоящей в очереди под номером `i`. */
export function queueCapOf(board: Board, i: number): number {
  const c = board.queueCaps?.[i];
  return typeof c === 'number' && c > 0 ? c : CIRCLE;
}

export function makeBoard(
  plates: readonly Plate[], queue: readonly Plate[] = [],
  caps?: readonly number[], queueCaps?: readonly number[],
): Board {
  const б: Board = { plates, queue, ...(caps ? { caps } : {}), ...(queueCaps ? { queueCaps } : {}) };
  plates.forEach((p, i) => {
    const c = capOf(б, i);
    if (p.length > c) throw new Error(`тарелка собрана неверно: секторов ${p.length} при круге ${c}`);
  });
  queue.forEach((p, i) => {
    const c = queueCapOf(б, i);
    if (p.length > c) throw new Error(`тарелка в очереди неверна: секторов ${p.length} при круге ${c}`);
  });
  return б;
}

/** Сколько ещё влезет в тарелку. */
export function roomIn(board: Board, i: number): number {
  return Math.max(0, capOf(board, i) - (board.plates[i]?.length ?? 0));
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
export function completeIn(plate: Plate, cap: number = CIRCLE): number | null {
  if (plate.length !== cap) return null;
  const t = plate[0] as number;
  return plate.every((s) => s === t) ? t : null;
}

/** То же для тарелки, стоящей НА СТОЛЕ: вместимость берётся у доски. */
export function completeAt(board: Board, i: number): number | null {
  return completeIn(board.plates[i] ?? [], capOf(board, i));
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
  /*
   * 🔴 ВМЕСТИМОСТЬ ЕДЕТ ВМЕСТЕ СО СВОЕЙ ТАРЕЛКОЙ. Пришедшая из очереди тарелка
   * приносит СВОЙ круг, а освободившееся место его не навязывает: иначе тарелка
   * на восемь, встав на место шестёрки, замкнулась бы шестью секторами — то
   * есть правило игры менялось бы от того, куда она попала.
   * ⚠️ Опустевшее место без очереди тоже обязано получить вместимость: она
   * задана уровнем, а не содержимым, и обнулять её нельзя.
   */
  const caps = board.plates.map((_, i) => capOf(board, i));
  const capsQ = board.queue.map((_, i) => queueCapOf(board, i));
  const cleared: number[] = [];
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < plates.length; i += 1) {
      const t = completeIn(plates[i] as number[], caps[i] as number);
      if (t === null) continue;
      cleared.push(t);
      const next = queue.shift();
      const capNext = capsQ.shift();
      plates[i] = next ? [...next] : [];
      if (next) caps[i] = capNext ?? CIRCLE;
      again = true;
    }
  }
  return { board: собрано(plates, queue, caps, capsQ, board), cleared };
}

/**
 * Собрать доску, сохранив вместимости ТОЛЬКО если они и правда свои. Доска без
 * своих кругов остаётся без поля `caps` — так прежние сравнения досок (ключ
 * решателя, `toEqual` в пробах) не начинают видеть новое поле там, где ничего
 * не менялось.
 */
function собрано(
  plates: number[][], queue: readonly Plate[], caps: number[], capsQ: number[], было: Board,
): Board {
  const своиCaps = было.caps !== undefined || caps.some((c) => c !== CIRCLE);
  const своиQ = было.queueCaps !== undefined || capsQ.some((c) => c !== CIRCLE);
  return {
    plates, queue,
    ...(своиCaps ? { caps } : {}),
    ...(своиQ ? { queueCaps: capsQ } : {}),
  };
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
  // ⚠️ Вместимости переносим ЯВНО: без них ход по доске со своими кругами
  // молча вернул бы доску с кругами по умолчанию.
  return collapse({ ...board, plates }).board;
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
