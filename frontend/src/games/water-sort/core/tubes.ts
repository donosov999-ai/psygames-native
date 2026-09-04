/* psygames-water-sort-tubes · VER 1 · 05.09.2026 */
/**
 * ПОЛЕ СОРТИРОВКИ ЖИДКОСТЕЙ: ПРОБИРКИ И ИХ ВМЕСТИМОСТЬ — ОДИН ОБЪЕКТ.
 *
 * Игра по просьбе Дениса 05.09.2026 (кадры App Store: «Бутылочки Пробирки. Water
 * Sort», SortPuz) — в хаб «Башни». Родство с ханойской башней и лондонской не
 * внешнее: везде стопка, ход разрешён не всякий, и выигрывает тот, кто считает
 * наперёд. Разница в том, ЧТО ограничивает ход: у Ханоя размер диска, здесь —
 * цвет верхнего слоя и свободное место.
 *
 * 🔴 ВМЕСТИМОСТЬ ЛЕЖИТ РЯДОМ С СОДЕРЖИМЫМ, А НЕ КОНСТАНТОЙ В СОСЕДНЕМ ФАЙЛЕ.
 * Это не эстетика, а оплаченный урок `goods-sort` (22.08.2026): там ёмкости
 * появились позже кода, `CAP` осталась зашитой в четырёх местах — и каждое стало
 * тихим дефектом, которого не видят ни компилятор, ни пробы. Здесь ёмкость одна
 * на поле, но живёт она В ПОЛЕ: появятся пробирки разной высоты — правка пойдёт
 * в одно место, а не в четыре.
 *
 * 🔴 ХОД ПЕРЕЛИВАЕТ ВЕСЬ ВЕРХНИЙ ОДНОЦВЕТНЫЙ СТОЛБИК, А НЕ ОДНУ ПОРЦИЮ. Это
 * правило самой игры, а не оптимизация: человек нажимает две пробирки и ждёт, что
 * перельётся всё, что помещается. Переливать по одной — другая игра, в которой
 * ходов втрое больше, а решений столько же.
 */

/** Пробирка снизу вверх: последний элемент — верхний слой. */
export type Tube = readonly number[];

export interface Field {
  readonly tubes: readonly Tube[];
  /** Сколько порций помещается в пробирку. */
  readonly cap: number;
}

export interface Move { readonly from: number; readonly to: number }

export function makeField(tubes: readonly (readonly number[])[], cap: number): Field {
  if (cap <= 0) throw new Error('вместимость пробирки должна быть больше нуля');
  for (const t of tubes) {
    if (t.length > cap) throw new Error(`в пробирке ${t.length} порций при вместимости ${cap}`);
  }
  return { tubes: tubes.map((t) => [...t]), cap };
}

export const isEmptyTube = (t: Tube): boolean => t.length === 0;
export const topColor = (t: Tube): number | null => (t.length ? t[t.length - 1]! : null);
export const roomIn = (f: Field, i: number): number => f.cap - f.tubes[i]!.length;

/** Высота верхнего одноцветного столбика. */
export function topRun(t: Tube): number {
  if (!t.length) return 0;
  const c = t[t.length - 1]!;
  let n = 1;
  for (let i = t.length - 2; i >= 0 && t[i] === c; i--) n++;
  return n;
}

/** Пробирка «закрыта»: пустая либо полная одним цветом. */
export function isDone(f: Field, i: number): boolean {
  const t = f.tubes[i]!;
  return t.length === 0 || (t.length === f.cap && topRun(t) === t.length);
}

export function isSolved(f: Field): boolean {
  return f.tubes.every((_, i) => isDone(f, i));
}

/**
 * Разрешён ли перелив.
 *
 * ⚠️ ПЕРЕЛИВ ИЗ ОДНОЦВЕТНОЙ ПРОБИРКИ В ПУСТУЮ ЗАПРЕЩЁН. Формально он законен и
 * ничего не ломает, но не меняет положения: то же содержимое в другой посуде.
 * Без запрета решатель ходит по кругу «туда-обратно» и упирается в бюджет на
 * досках, которые решаются за десять ходов, а человек получает подсказку,
 * ведущую в никуда.
 */
export function canPour(f: Field, from: number, to: number): boolean {
  if (from === to) return false;
  const a = f.tubes[from]!;
  const b = f.tubes[to]!;
  if (!a.length) return false;
  if (roomIn(f, to) === 0) return false;
  const цвет = topColor(a)!;
  if (b.length === 0) return topRun(a) !== a.length;   // однородную — не переливаем в пустую
  return topColor(b) === цвет;
}

/** Сколько порций реально перельётся. */
export function pourAmount(f: Field, from: number, to: number): number {
  if (!canPour(f, from, to)) return 0;
  return Math.min(topRun(f.tubes[from]!), roomIn(f, to));
}

/** Новое поле после перелива; null — ход незаконен. */
export function pour(f: Field, from: number, to: number): Field | null {
  const n = pourAmount(f, from, to);
  if (!n) return null;
  const цвет = topColor(f.tubes[from]!)!;
  const tubes = f.tubes.map((t, i) => {
    if (i === from) return t.slice(0, t.length - n);
    if (i === to) return [...t, ...Array(n).fill(цвет)];
    return t;
  });
  return { tubes, cap: f.cap };
}

export function legalMoves(f: Field): Move[] {
  const ходы: Move[] = [];
  for (let a = 0; a < f.tubes.length; a++) {
    for (let b = 0; b < f.tubes.length; b++) if (canPour(f, a, b)) ходы.push({ from: a, to: b });
  }
  return ходы;
}

/**
 * Ключ положения для памяти обхода.
 *
 * ⚠️ ПРОБИРКИ СОРТИРУЮТСЯ. Поле «красная слева, синяя справа» и «синяя слева,
 * красная справа» — одно и то же положение: пробирки не приколочены, важно лишь
 * их содержимое. Без сортировки обход разбирает одну доску по многу раз, бюджет
 * выгорает, и генератор объявляет непроходимыми решаемые расклады.
 */
export function fieldKey(f: Field): string {
  return f.tubes.map((t) => t.join(',')).sort().join('|');
}
