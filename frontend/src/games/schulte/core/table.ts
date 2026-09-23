/* psygames-schulte-table · VER 1 · 23.09.2026 */
/**
 * ТАБЛИЦА ШУЛЬТЕ: РАСКЛАДКА КЛЕТОК И ПОРЯДОК ЦЕЛЕЙ.
 *
 * 🔴 ВЫНЕСЕНО ИЗ ЭКРАНА БЕЗ ЕДИНОЙ ПРАВКИ ПРАВИЛ (переезд на Flutter, задача
 * 87bc3f37). Причина ровно та же, по которой раньше вынесли блоки серии: пока
 * сборка поля жила в `useCallback` внутри компонента, её нельзя было ни
 * прогнать, ни выгрузить эталоном — а переносить правила на Dart разрешено
 * только ПРОГОНОМ живого кода, не пересказом. Экран зовёт эти же функции;
 * второй копии правил нет ни здесь, ни там.
 *
 * ⚠️ ПОРЯДОК БРОСКОВ СОХРАНЁН ПОБАЙТНО: перемешивание идёт Фишером—Йетсом с
 * конца, и `random` тянется ровно столько же раз, сколько тянулось в экране.
 * Иначе раскладки при одном зерне разъехались бы — а именно на них держится
 * сверка переноса.
 *
 * ⚠️ ЦЕЛИ СЧИТАЮТСЯ ОТ ЧИСЛА КЛЕТОК, А НЕ ХРАНЯТСЯ РЯДОМ С РАСКЛАДКОЙ — тот же
 * довод, что в `blocks.ts`: два списка, лежащие порознь, разъезжаются молча.
 */

export type SchulteContentMode = 'numbers' | 'letters' | 'mixed';
export type SchulteDirection = 'forward' | 'backward' | 'center-out';
/** Клетка — число (цифровая таблица) или знак письменности (буквенная и Горбов). */
export type SchulteCell = number | string;

/**
 * От центра наружу: h, h+1, h−1, h+2, h−2… (образец drafterleo/schulte «divergent»).
 * Зовётся ЧИСЛОМ КЛЕТОК, а не стороной поля.
 */
export function centerOutOrder(n: number): number[] {
  const mid = Math.floor((n + 1) / 2);
  const order: number[] = [mid];
  let lo = mid - 1, hi = mid + 1;
  while (order.length < n) {
    if (hi <= n) order.push(hi++);
    if (order.length < n && lo >= 1) order.push(lo--);
  }
  return order;
}

export interface SchulteTableOptions {
  /** Сторона поля. Клеток будет `size * size`. */
  readonly size: number;
  readonly contentMode: SchulteContentMode;
  readonly direction: SchulteDirection;
  /** Знаки письменности по порядку (`SCRIPTS[script].chars`). */
  readonly alphabet: string;
  /** Горбов: чередование начинается с буквы (А-1-Б-2), а не с цифры. Ось 9. */
  readonly lettersFirst?: boolean;
}

export interface SchulteTable {
  /** Что лежит по клеткам слева направо и сверху вниз — уже перемешано. */
  readonly items: SchulteCell[];
  /** Что искать по порядку: первая цель — `sequence[0]`. */
  readonly sequence: SchulteCell[];
}

/** Цели по порядку и набор клеток ДО перемешивания. */
export function schulteSequence(options: SchulteTableOptions): SchulteTable {
  const { size, contentMode, direction, alphabet, lettersFirst = false } = options;
  const totalCells = size * size;
  let items: SchulteCell[];
  let orderedSequence: SchulteCell[];

  if (contentMode === 'numbers') {
    items = Array.from({ length: totalCells }, (_, i) => i + 1);
    orderedSequence = direction === 'center-out' ? centerOutOrder(totalCells) : [...items];
  } else if (contentMode === 'letters') {
    items = alphabet.slice(0, totalCells).split('');
    orderedSequence = [...items];
  } else {
    // Горбов: 1, А, 2, Б, 3, В… — обратный ход и «от центра» к нему не применяются.
    const half = Math.ceil(totalCells / 2);
    const numbers = Array.from({ length: half }, (_, i) => i + 1);
    const letters = alphabet.slice(0, totalCells - half).split('');
    orderedSequence = [];
    for (let i = 0; i < half; i++) {
      if (lettersFirst) {
        if (i < letters.length) orderedSequence.push(letters[i]);
        orderedSequence.push(numbers[i]);
      } else {
        orderedSequence.push(numbers[i]);
        if (i < letters.length) orderedSequence.push(letters[i]);
      }
    }
    orderedSequence = orderedSequence.slice(0, totalCells);
    items = [...orderedSequence];
  }

  if (direction === 'backward' && contentMode !== 'mixed') {
    orderedSequence = [...orderedSequence].reverse();
  }

  return { items, sequence: orderedSequence };
}

/** Готовая таблица: цели по порядку и ПЕРЕМЕШАННАЯ раскладка. */
export function schulteTable(
  options: SchulteTableOptions,
  random: () => number = Math.random,
): SchulteTable {
  const { items, sequence } = schulteSequence(options);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return { items, sequence };
}
