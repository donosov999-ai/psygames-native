/* psygames-schulte-series-blocks · VER 1 · 23.08.2026 */
/**
 * ТРИ БЛОКА НА ОДНОМ ПОЛЕ — ПРАВИЛА И ХОД ПАРТИИ.
 *
 * Это игровая половина пилота из `PSYGAMES_MERGE_PLAN.md` §11: замер и уровень
 * живут в `src/services/series.ts`, а здесь — САМО ПОЛЕ и три правила поверх него.
 *
 *   'order'     — найти 1…N² по порядку              → T₁ скорость поиска
 *   'alternate' — ТО ЖЕ поле, чередуя два ряда       → T₂ − T₁ цена переключения
 *   'sum'       — ТО ЖЕ поле, пара с суммой S        → T₃ − T₁ цена удержания в уме
 *
 * 🔴 ПОЧЕМУ ПОЛЕ ЖИВЁТ ЗДЕСЬ, А НЕ В ЭКРАНЕ. Аддитивный метод (Стернберг) держится
 * ровно на одном: блоки СТРОГО сопоставимы, иначе в разность попадает разница
 * полей, а не цена правила. Поле собирается ОДИН раз (`buildSchulteField`), а
 * `nextBlock` переносит его в следующий блок ТЕМ ЖЕ объектом — перегенерировать
 * нечего, потому что генератора в переходе нет вовсе. Пока это решение стояло в
 * экране, «одно ли поле» нельзя было ни прогнать, ни доказать: экран собирал бы
 * сетку заново на каждом старте блока и выглядел бы при этом исправным.
 *
 * ⚠️ ЦЕЛИ БЛОКА ВЫЧИСЛЯЮТСЯ ИЗ ПОЛЯ, А НЕ ХРАНЯТСЯ РЯДОМ С НИМ. Два списка целей,
 * лежащие отдельно от раскладки, разъезжаются молча — ровно так же, как разъехались
 * бы два поля. Здесь список целей — функция от размера, а попадание проверяется по
 * значению клетки, то есть по тому, что человек видит.
 *
 * ⚠️ У БЛОКА 'sum' НА НЕЧЁТНОМ ПОЛЕ ОДНА КЛЕТКА ЛИШНЯЯ, И ЭТО НЕ ДЕФЕКТ. Пары
 * складываются в S = N²+1 (1+N², 2+N²−1 …). На поле 5×5 значений 25, пар 12, а
 * серединное 13 партнёра не имеет: 13+13 = 26 двумя РАЗНЫМИ клетками не собрать.
 * Правило делает это очевидным без подписи, а в разность попадает 24 нажатия
 * против 25 — смещение в сторону ЗАНИЖЕНИЯ цены удержания, то есть осторожное.
 */

export type SchulteBlockKey = 'order' | 'alternate' | 'sum';

/**
 * ПОРЯДОК БЛОКОВ НЕ РАНДОМИЗИРУЕТСЯ. Он часть замера: второй блок после третьего
 * идёт уже по разогретому полю, и разность считается от другого начала.
 */
export const SCHULTE_SERIES_PLAN: readonly SchulteBlockKey[] = ['order', 'alternate', 'sum'];

/** Сложность крутится РАЗМЕРОМ поля — не долями проб и не таймером. */
export const SERIES_MIN_SIZE = 5;
export const SERIES_MAX_SIZE = 8;

/**
 * Столько ошибок в блоке ещё считается взятым блоком. Число не выдумано: ровно с
 * таким допуском уровневый Шульте засчитывает таблицу (`errsArg <= 2` в экране).
 * Порог по ВРЕМЕНИ здесь запрещён — см. шапку `services/series.ts`.
 */
export const SERIES_BLOCK_MAX_ERRORS = 2;

export interface SchulteField {
  /** Сторона квадрата. Она же уровень серии: общий для всех блоков. */
  readonly size: number;
  /** Значения по клеткам слева направо и сверху вниз. ЭТО и есть раскладка. */
  readonly cells: readonly number[];
}

export function clampSeriesSize(size: number): number {
  const n = Math.round(Number.isFinite(size) ? size : SERIES_MIN_SIZE);
  return Math.min(SERIES_MAX_SIZE, Math.max(SERIES_MIN_SIZE, n));
}

/** Поле серии: 1…N² вперемешку. Собирается ОДИН раз на всю серию. */
export function buildSchulteField(size: number, random: () => number = Math.random): SchulteField {
  const n = clampSeriesSize(size);
  const cells = Array.from({ length: n * n }, (_, i) => i + 1);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return { size: n, cells };
}

/** Цели блока «по порядку»: 1, 2, 3 … N². */
export function orderTargets(total: number): number[] {
  return Array.from({ length: Math.max(0, total) }, (_, i) => i + 1);
}

/**
 * Цели блока «чередование»: 1, N², 2, N²−1 … Два ряда навстречу друг другу по
 * ОДНОМУ И ТОМУ ЖЕ полю — добавлено ровно одно требование, переключение между
 * рядами. На нечётном числе клеток серединное значение выпадает последним.
 */
export function alternateTargets(total: number): number[] {
  const out: number[] = [];
  let lo = 1;
  let hi = total;
  while (lo < hi) {
    out.push(lo);
    out.push(hi);
    lo += 1;
    hi -= 1;
  }
  if (lo === hi) out.push(lo);
  return out;
}

/** Сумма пары в блоке «счёт»: у каждого значения ровно один партнёр. */
export function pairSum(total: number): number {
  return total + 1;
}

/** Сколько пар предстоит собрать. На нечётном поле серединное значение без пары. */
export function sumPairsTotal(total: number): number {
  return Math.floor(total / 2);
}

export interface SchulteSeriesState {
  /** ОДНО поле на всю серию: `nextBlock` переносит его как есть. */
  readonly field: SchulteField;
  readonly blockIndex: number;
  /** Сколько целей блока уже взято: клеток в 'order'/'alternate', пар в 'sum'. */
  readonly step: number;
  /** Первая клетка собираемой пары (только 'sum'); иначе null. */
  readonly pending: number | null;
  /** Клетки, закрытые в ЭТОМ блоке. Длина всегда равна числу клеток поля. */
  readonly taken: readonly boolean[];
  readonly errors: number;
}

export function blockKeyAt(blockIndex: number): SchulteBlockKey {
  return SCHULTE_SERIES_PLAN[blockIndex] ?? SCHULTE_SERIES_PLAN[SCHULTE_SERIES_PLAN.length - 1];
}

/** Открыть блок на ГОТОВОМ поле. Поля здесь не создают — его приносят снаружи. */
export function openBlock(field: SchulteField, blockIndex: number): SchulteSeriesState {
  return {
    field,
    blockIndex,
    step: 0,
    pending: null,
    taken: field.cells.map(() => false),
    errors: 0,
  };
}

/** Следующий блок ТОГО ЖЕ поля. Единственный законный переход между блоками. */
export function nextBlock(state: SchulteSeriesState): SchulteSeriesState {
  return openBlock(state.field, state.blockIndex + 1);
}

export function blockStepsTotal(field: SchulteField, key: SchulteBlockKey): number {
  const total = field.cells.length;
  return key === 'sum' ? sumPairsTotal(total) : total;
}

/** Что показывать в шапке: искомое значение, а в блоке счёта — сумма пары. */
export function blockTarget(state: SchulteSeriesState): number {
  const total = state.field.cells.length;
  const key = blockKeyAt(state.blockIndex);
  if (key === 'sum') return pairSum(total);
  const targets = key === 'alternate' ? alternateTargets(total) : orderTargets(total);
  return targets[Math.min(state.step, targets.length - 1)];
}

export function blockDone(state: SchulteSeriesState): boolean {
  return state.step >= blockStepsTotal(state.field, blockKeyAt(state.blockIndex));
}

/**
 * `hit` — цель взята · `miss` — ошибка · `pair-open` — первая клетка пары выбрана
 * (ещё не ответ) · `pair-cancel` — выбор снят повторным нажатием · `ignored` —
 * клетка уже закрыта.
 */
export type SeriesPressResult = 'hit' | 'miss' | 'pair-open' | 'pair-cancel' | 'ignored';

/** Нажатие по клетке. Правило блока решает, что это было. */
export function pressSeriesCell(
  state: SchulteSeriesState,
  index: number,
): { state: SchulteSeriesState; result: SeriesPressResult } {
  const { field } = state;
  if (index < 0 || index >= field.cells.length || state.taken[index]) return { state, result: 'ignored' };
  const total = field.cells.length;
  const key = blockKeyAt(state.blockIndex);
  const value = field.cells[index];

  if (key === 'sum') {
    if (state.pending === null) return { state: { ...state, pending: index }, result: 'pair-open' };
    if (state.pending === index) return { state: { ...state, pending: null }, result: 'pair-cancel' };
    const partner = field.cells[state.pending];
    if (value + partner === pairSum(total)) {
      const taken = [...state.taken];
      taken[index] = true;
      taken[state.pending] = true;
      return { state: { ...state, taken, pending: null, step: state.step + 1 }, result: 'hit' };
    }
    // Пара не сложилась — это ошибка, и выбор снимается целиком: иначе следующее
    // нажатие достраивало бы пару к чужой клетке и ошибка считалась бы дважды.
    return { state: { ...state, pending: null, errors: state.errors + 1 }, result: 'miss' };
  }

  const targets = key === 'alternate' ? alternateTargets(total) : orderTargets(total);
  if (value !== targets[state.step]) return { state: { ...state, errors: state.errors + 1 }, result: 'miss' };
  const taken = [...state.taken];
  taken[index] = true;
  return { state: { ...state, taken, step: state.step + 1 }, result: 'hit' };
}
