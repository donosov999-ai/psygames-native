/* psygames-proofreading-series-blocks · VER 1 · 23.08.2026 */
/**
 * ТРИ БЛОКА НА ОДНОМ ПОЛЕ БУКВ — ПРАВИЛА И ХОД ПАРТИИ.
 *
 * Замер и уровень живут в `src/services/series.ts`, поле — в `./field.ts`, а
 * здесь только правила поверх готового поля:
 *
 *   'sign'  — отметить все клетки с заданными знаками  → T₁ зрительный поиск
 *   'word'  — ТО ЖЕ поле, собрать все слова           → T₂ − T₁ цена сегментации
 *   'sense' — ТО ЖЕ поле, только слова одной категории → T₃ − T₂ цена смысла
 *
 * 🔴 ПОЧЕМУ ПОЛЕ ПЕРЕНОСИТСЯ ТЕМ ЖЕ ОБЪЕКТОМ. Пока решение «то же поле» стоит в
 * экране, оно недоказуемо: экран собирал бы сетку заново на каждом старте блока
 * и выглядел бы при этом исправным. Здесь `nextBlock` не имеет доступа ни к
 * генератору, ни к зерну — переносить ему нечего, кроме уже собранного поля.
 *
 * ⚠️ ПОПАДАНИЕ СЧИТАЕТСЯ ПО ТОМУ, ЧТО ЧЕЛОВЕК ВИДИТ. В блоке «Знак» проверяется
 * БУКВА В КЛЕТКЕ, а не членство в заранее посчитанном списке целей: два списка,
 * лежащие отдельно от раскладки, разъезжаются молча — ровно так же, как разъехались
 * бы два поля. Список `signCells` в поле есть, но он служит только счётчиком
 * «сколько всего», а не судьёй.
 *
 * 🔴 ЧУЖОЕ СЛОВО В БЛОКЕ «СМЫСЛ» — ОШИБКА, А НЕ ХОД, И КЛЕТКИ ОНО НЕ СЪЕДАЕТ.
 * Засчитать его значило бы вернуть блок «Слово» под другим названием: тогда
 * достаточно найти хоть что-нибудь, и цена семантики выходит нулевой. Убрать его
 * клетки с поля — тоже нельзя: поле пустело бы от НЕВЕРНЫХ ответов.
 *
 * ⚠️ СОСКОЛЬЗНУВШИЙ ПАЛЕЦ НЕ ОШИБКА. Прыжок через клетку, возврат на пройденную,
 * слишком короткая линия — это неудавшийся жест, а не неверный ответ. Ошибкой
 * считается только осмысленная линия: доведённая до конца и мимо цели.
 */
import {
  applyTrace,
  createFillwordsSession,
  resolveTrace,
  type CellIndex,
  type FillwordsSession,
} from '@/src/games/fillwords/core';
import type { ProofField } from './field';

export type ProofBlockKey = 'sign' | 'word' | 'sense';

/**
 * ПОРЯДОК БЛОКОВ НЕ РАНДОМИЗИРУЕТСЯ. Он часть замера: сегментация имеет смысл
 * только после чистого поиска знака, а смысл — только после сегментации.
 */
export const PROOF_SERIES_PLAN: readonly ProofBlockKey[] = ['sign', 'word', 'sense'];

/**
 * Столько ошибок в блоке ещё считается взятым блоком — ровно тот же допуск, с
 * каким серия Шульте засчитывает таблицу. Порога по ВРЕМЕНИ здесь нет и быть не
 * может: см. шапку `services/series.ts`.
 */
export const PROOF_BLOCK_MAX_ERRORS = 2;

export interface ProofSeriesState {
  /** ОДНО поле на всю серию: `nextBlock` переносит его как есть. */
  readonly field: ProofField;
  readonly blockIndex: number;
  /** Клетки, закрытые в блоке «Знак». Длина всегда равна числу клеток поля. */
  readonly taken: readonly boolean[];
  /** Партия филвордов блоков «Слово» и «Смысл» — по тому же полю. */
  readonly session: FillwordsSession;
  readonly errors: number;
}

export function blockKeyAt(blockIndex: number): ProofBlockKey {
  return PROOF_SERIES_PLAN[blockIndex] ?? PROOF_SERIES_PLAN[PROOF_SERIES_PLAN.length - 1];
}

/** Открыть блок на ГОТОВОМ поле. Поля здесь не создают — его приносят снаружи. */
export function openBlock(field: ProofField, blockIndex: number): ProofSeriesState {
  return {
    field,
    blockIndex,
    taken: field.puzzle.letters.map(() => false),
    session: createFillwordsSession(field.puzzle),
    errors: 0,
  };
}

/** Следующий блок ТОГО ЖЕ поля. Единственный законный переход между блоками. */
export function nextBlock(state: ProofSeriesState): ProofSeriesState {
  return openBlock(state.field, state.blockIndex + 1);
}

/** Сколько целей в блоке: клеток знака, слов поля или слов нужной категории. */
export function blockStepsTotal(field: ProofField, key: ProofBlockKey): number {
  if (key === 'sign') return field.signCells.length;
  if (key === 'word') return field.puzzle.words.length;
  return field.senseWords.length;
}

/** Сколько целей блока уже взято. Считается по состоянию, а не счётчиком рядом. */
export function blockStep(state: ProofSeriesState): number {
  const key = blockKeyAt(state.blockIndex);
  if (key === 'sign') return state.taken.filter(Boolean).length;
  if (key === 'word') return state.session.found.length;
  return state.session.found.filter((index) => state.field.senseWords.includes(index)).length;
}

export function blockDone(state: ProofSeriesState): boolean {
  return blockStep(state) >= blockStepsTotal(state.field, blockKeyAt(state.blockIndex));
}

/**
 * `hit` — цель взята · `miss` — ответ мимо цели (ошибка) · `ignored` — не ответ
 * вовсе: закрытая клетка, сорвавшийся жест, чужой блок.
 */
export type ProofPressResult = 'hit' | 'miss' | 'ignored';

/** Нажатие по клетке в блоке «Знак». В остальных блоках клетки не нажимают. */
export function pressSignCell(
  state: ProofSeriesState,
  index: number,
): { state: ProofSeriesState; result: ProofPressResult } {
  if (blockKeyAt(state.blockIndex) !== 'sign') return { state, result: 'ignored' };
  const letters = state.field.puzzle.letters;
  if (index < 0 || index >= letters.length || state.taken[index]) return { state, result: 'ignored' };
  if (!state.field.signs.includes(letters[index])) {
    return { state: { ...state, errors: state.errors + 1 }, result: 'miss' };
  }
  const taken = [...state.taken];
  taken[index] = true;
  return { state: { ...state, taken }, result: 'hit' };
}

/**
 * Линия по клеткам в блоках «Слово» и «Смысл». Разбор жеста делает ядро
 * филвордов (`resolveTrace`), решение «годится ли это слово» — правило блока,
 * и только принятое слово доходит до `applyTrace`.
 */
export function pressWordTrace(
  state: ProofSeriesState,
  path: readonly CellIndex[],
): { state: ProofSeriesState; result: ProofPressResult } {
  const key = blockKeyAt(state.blockIndex);
  if (key === 'sign') return { state, result: 'ignored' };

  const trace = resolveTrace(state.session, path);
  if (!trace.ok) {
    if (trace.reason !== 'no-match') return { state, result: 'ignored' };
    return { state: { ...state, errors: state.errors + 1 }, result: 'miss' };
  }
  if (key === 'sense' && !state.field.senseWords.includes(trace.wordIndex)) {
    return { state: { ...state, errors: state.errors + 1 }, result: 'miss' };
  }
  const step = applyTrace(state.session, path);
  return { state: { ...state, session: step.session }, result: 'hit' };
}
