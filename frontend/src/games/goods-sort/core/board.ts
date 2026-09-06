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
  /**
   * 🔴 СТОЛБЕЦ КАЖДОЙ НИШИ. Нужен ровно для одного: знать, кто «сверху».
   *
   * Без него доска — плоский список, и «полка закрылась, верхние осели» задать
   * нельзя. Номер столбца, а не ширина сетки, потому что доска бывает с дырами
   * (`SHAPES`): в столбце может стоять три ниши, а в соседнем одна.
   *
   * ⚠️ Пусто — прежнее поведение: тройка убирается, ниша ОСТАЁТСЯ пустой. Так
   * играют сорок пять уровней и все прежние пробы, и трогать их незачем.
   */
  readonly col?: readonly number[];
  /**
   * 🔴 УСТОЙЧИВЫЙ НОМЕР НИШИ. Переезжает вместе с содержимым.
   *
   * Место в массиве после схлопывания меняется, а всё, что помнит про нишу —
   * цель «освободи нишу», ключи скрытости, примёрзший ряд — помнило её ИМЕННО
   * по месту. Решение Дениса 06.09.2026: перевести на устойчивый id, иначе
   * переномерация ломает четыре механики молча.
   */
  readonly ids?: readonly number[];
  /**
   * 🔴 ОЧЕРЕДЬ ВХОДЯЩИХ ПОЛОК — КОНЕЧНАЯ И ИЗВЕСТНАЯ ЗАРАНЕЕ.
   *
   * Приходит сверху на место закрывшейся, как в «Тортах». Замкнутость
   * мультимножества держит всю гарантию решаемости: бесконечный поток доказать
   * нельзя вообще никак, а «каждая раздача доказано решаема» — единственное,
   * чем мы отличаемся от конкурента с 454 жалобами на непроходимые уровни.
   */
  readonly queue?: readonly Shelf[];
}

/** Полка из очереди: что на ней лежит и сколько влезает. */
export interface Shelf {
  readonly cell: readonly number[];
  readonly cap: number;
  readonly joker?: boolean;
}

export interface BoardExtras {
  jokers?: readonly boolean[];
  col?: readonly number[];
  ids?: readonly number[];
  queue?: readonly Shelf[];
}

export function makeBoard(
  cells: readonly (readonly number[])[],
  caps: readonly number[],
  jokersOrExtras?: readonly boolean[] | BoardExtras,
): Board {
  /*
   * ⚠️ Третий аргумент принимает и старую форму (массив джокеров), и новую
   * (объект с полями). Иначе пришлось бы одним коммитом переписать все вызовы
   * из сорока с лишним проб — а они проверяют игру, а не форму вызова.
   */
  const extras: BoardExtras = Array.isArray(jokersOrExtras)
    ? { jokers: jokersOrExtras as readonly boolean[] }
    : ((jokersOrExtras as BoardExtras) ?? {});
  if (cells.length !== caps.length) {
    throw new Error(`доска собрана неверно: ниш ${cells.length}, ёмкостей ${caps.length}`);
  }
  for (const [имя, ряд] of [['джокеров', extras.jokers], ['столбцов', extras.col], ['номеров', extras.ids]] as const) {
    if (ряд && ряд.length !== cells.length) {
      throw new Error(`доска собрана неверно: ниш ${cells.length}, ${имя} ${ряд.length}`);
    }
  }
  const out: Board = { cells, caps };
  return Object.assign({}, out,
    extras.jokers ? { jokers: extras.jokers } : {},
    extras.col ? { col: extras.col } : {},
    extras.ids ? { ids: extras.ids } : {},
    extras.queue ? { queue: extras.queue } : {});
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
  /*
   * ⚠️ ОЧЕРЕДЬ ТОЖЕ СЧИТАЕТСЯ. Пустая доска при непустой очереди — не победа, а
   * промежуточное состояние: полки ещё придут. Забудь это условие — и решатель
   * объявит решённой партию, которая на деле только началась.
   */
  return board.cells.every((c) => c.length === 0) && (board.queue?.length ?? 0) === 0;
}

/**
 * Убрать все тройки, какие сложились, — повторяя, пока складываются.
 *
 * 🔴 ДВА ПОВЕДЕНИЯ В ОДНОЙ ФУНКЦИИ, И ЭТО НАМЕРЕННО.
 *
 * Без `col` ниша остаётся пустой — так живут сорок пять уровней и все прежние
 * пробы. С `col` полка ЗАКРЫВАЕТСЯ: уходит с доски, столбец оседает, сверху
 * приходит следующая из очереди (решение Дениса 06.09.2026).
 *
 * ⚠️ ПОЧЕМУ ИМЕННО ЗДЕСЬ, А НЕ ОТДЕЛЬНОЙ ФУНКЦИЕЙ В ЭКРАНЕ. Эту функцию зовёт
 * `moveTop`, а через него — РЕШАТЕЛЬ. Положи закрытие полки в экран, и решатель
 * стал бы доказывать решаемость доски, которой в игре нет: обещание «уровень
 * проверен» превратилось бы в ложь, а именно им мы и отличаемся. В «Тортах»
 * ровно та же причина записана у `collapse`: освобождение места и приход новой
 * тарелки — ОДНО событие.
 */
export function collapseTriples(board: Board): Board {
  const cells = board.cells.map((c) => [...c]);
  if (!board.col) {
    let again = true;
    while (again) {
      again = false;
      for (let i = 0; i < cells.length; i += 1) {
        const t = tripleIn(cells[i] as number[]);
        if (t !== null) { cells[i] = removeTriple(cells[i] as number[], t); again = true; }
      }
    }
    return { ...board, cells };
  }

  /*
   * Столбцовая модель: собираем ниши по столбцам В ПОРЯДКЕ МАССИВА (он идёт по
   * рядам сверху вниз, значит внутри столбца это порядок сверху вниз), закрываем
   * что сложилось, подаём из очереди СВЕРХУ — и раскладываем обратно.
   */
  const caps = [...board.caps];
  const jokers = board.jokers ? [...board.jokers] : null;
  const ids = board.ids ? [...board.ids] : null;
  const col = [...board.col];
  const queue = board.queue ? [...board.queue] : [];

  interface Ниша { cell: number[]; cap: number; joker: boolean; id: number }
  const столбцы = new Map<number, Ниша[]>();
  const порядокСтолбцов: number[] = [];
  cells.forEach((cell, i) => {
    const c = col[i] as number;
    if (!столбцы.has(c)) { столбцы.set(c, []); порядокСтолбцов.push(c); }
    (столбцы.get(c) as Ниша[]).push({
      cell, cap: caps[i] as number, joker: jokers?.[i] === true, id: ids ? (ids[i] as number) : i,
    });
  });

  let again = true;
  while (again) {
    again = false;
    for (const c of порядокСтолбцов) {
      const ниши = столбцы.get(c) as Ниша[];
      for (let k = 0; k < ниши.length; k += 1) {
        const t = tripleIn((ниши[k] as Ниша).cell);
        if (t === null) continue;
        /*
         * ⚠️ ЗАКРЫВАЕТСЯ ТОЛЬКО ПОЛНАЯ ТРОЙКА В НИШЕ НА ТРИ. В нише на четыре
         * тройка складывается РЯДОМ с четвёртым товаром, и закрыть её значило бы
         * выбросить его с доски — мультимножество перестало бы быть замкнутым, а
         * на замкнутости стоит вся доказуемость.
         */
        const полная = (ниши[k] as Ниша).cell.length === TRIPLE;
        if (!полная) { (ниши[k] as Ниша).cell = removeTriple((ниши[k] as Ниша).cell, t); again = true; continue; }
        ниши.splice(k, 1);
        const пришла = queue.shift();
        if (пришла) {
          ниши.unshift({ cell: [...пришла.cell], cap: пришла.cap, joker: пришла.joker === true, id: -1 });
        }
        again = true;
        break;
      }
    }
  }

  /* Новым полкам номера выдаём ПОСЛЕ всех переездов — от наибольшего занятого. */
  let следующий = Math.max(0, ...[...столбцы.values()].flat().map((н) => н.id)) + 1;
  const плоско: Ниша[] = [];
  for (const c of порядокСтолбцов) {
    for (const н of столбцы.get(c) as Ниша[]) {
      if (н.id === -1) н.id = следующий++;
      плоско.push(н);
    }
  }
  /*
   * ⚠️ Обратно раскладываем В ТОМ ЖЕ ПОРЯДКЕ, что и разбирали: сначала все ниши
   * первого столбца, потом второго. Это НЕ порядок по рядам, но он согласован
   * сам с собой, а экран читает место ниши из `col`, а не из номера в массиве.
   */
  const новСтолбцы: number[] = [];
  for (const c of порядокСтолбцов) (столбцы.get(c) as Ниша[]).forEach(() => новСтолбцы.push(c));

  return makeBoard(
    плоско.map((н) => н.cell),
    плоско.map((н) => н.cap),
    {
      jokers: jokers ? плоско.map((н) => н.joker) : undefined,
      col: новСтолбцы,
      ids: плоско.map((н) => н.id),
      queue,
    },
  );
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
  /*
   * ⚠️ ПОЛЯ ДОСКИ ПЕРЕНОСЯТСЯ ЦЕЛИКОМ. Здесь стояло `{ cells, caps, jokers }` —
   * то есть ход молча ронял `col`, `ids` и очередь. Последствие было тихим и
   * полным: после ПЕРВОГО же хода доска теряла столбцы, схлопывание сваливалось
   * на старое поведение, а товары из очереди исчезали из партии вместе с полем.
   * Замер до починки: 0 доказуемо решаемых уровней из 56, часть — за один узел.
   */
  return collapseTriples({ ...board, cells });
}

/** Свободные ниши: пустые и не занятые препятствием. */
export function freeNiches(board: Board, blocked: readonly boolean[] = []): number {
  return board.cells.reduce(
    (n, cell, i) => n + (cell.length === 0 && !blocked[i] ? 1 : 0), 0,
  );
}
