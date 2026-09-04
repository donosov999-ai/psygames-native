/* psygames-typing · VER 2 · 04.09.2026 */
/**
 * ДВИЖОК ПЕЧАТИ С БЛОКИРОВКОЙ НА ОШИБКЕ.
 *
 * ⚠️ VER 2 — ПЕРЕЕХАЛ ИЗ `games/vocab-srs/core` В СЕРВИСЫ. Механику печати просят
 * уже ДВА упражнения: печатный ответ в словаре (676a62cb) и диктант (f618c79b).
 * Оставить движок внутри одной игры значило бы, что вторая заведёт свою копию —
 * и они разойдутся на первой правке правила блокировки.
 *
 * Снимок ~/dev/typerighting/src/typing.ts.
 *
 * ЗАЧЕМ. Квиз словаря спрашивал выбором из вариантов, а это меряет УЗНАВАНИЕ.
 * Извлечение из памяти меряет только печать целиком — тот самый testing effect
 * (Roediger & Karpicke 2006: через неделю вспоминают на ~50% больше). У Шестова
 * это ядро метода: печать как носитель грамотности и НУЛЕВАЯ терпимость к
 * опечатке — курсор не идёт дальше, пока не нажат верный символ.
 *
 * ОТКУДА. Это СНИМОК нашего же движка `~/dev/typerighting/src/typing.ts` (96 строк,
 * чистая логика без DOM). Взят целиком, а не переписан: механика уже обкатана в
 * TypeRIGHTing, а вторая реализация того же разошлась бы с первой молча.
 *
 * ⚠️ СНИМОК, А НЕ ЖИВАЯ СВЯЗЬ. Репозитории разные, зависимости между ними нет.
 * Если движок в TypeRIGHTing поменяется, сюда это НЕ приедет само — сверять
 * руками при правках механики. Здесь добавлено то, чего в оригинале нет:
 * определение живой клавиатуры (`hasPhysicalKeyboard`).
 */

export interface TypingStats {
  typed: number;       // верно введённых символов
  errors: number;      // суммарно ошибочных нажатий
  elapsedMs: number;
  wpm: number;         // (слова=символы/5) в минуту, по верным символам
  accuracy: number;    // 0..100
}

export interface TypingState {
  /** плоский образец (все строки соединены '\n') */
  pattern: string;
  pos: number;         // текущая позиция курсора (индекс ожидаемого символа)
  errors: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** per-char статус: 'pending' | 'correct' | 'wrong' (зафиксированная ошибка в free-режиме) */
  marks: Uint8Array;   // 0 pending, 1 correct, 2 wrong-now
}

export const MARK = { PENDING: 0, CORRECT: 1, WRONG: 2 } as const;

export function createState(lines: string[]): TypingState {
  const pattern = lines.join('\n');
  return {
    pattern,
    pos: 0,
    errors: 0,
    startedAt: null,
    finishedAt: null,
    marks: new Uint8Array(pattern.length),
  };
}

export interface KeyResult {
  accepted: boolean;   // символ принят (курсор продвинулся)
  wrong: boolean;      // нажатие было ошибочным
  finished: boolean;
}

/**
 * Обработать введённый символ.
 * @param blockOnError true = не пускать дальше, пока не нажат верный символ (как оригинал)
 */
export function pressChar(st: TypingState, ch: string, blockOnError: boolean): KeyResult {
  if (st.finishedAt !== null) return { accepted: false, wrong: false, finished: true };
  if (st.startedAt === null) st.startedAt = Date.now();

  const expected = st.pattern[st.pos];
  // Enter/возврат каретки в образце — ожидаем '\n'
  const norm = ch === '\r' ? '\n' : ch;
  const ok = norm === expected;

  if (ok) {
    st.marks[st.pos] = MARK.CORRECT;
    st.pos++;
    const finished = st.pos >= st.pattern.length;
    if (finished) st.finishedAt = Date.now();
    return { accepted: true, wrong: false, finished };
  }

  // ошибка
  st.errors++;
  if (blockOnError) {
    // не продвигаемся — курсор стоит, символ помечается «ждёт верного»
    return { accepted: false, wrong: true, finished: false };
  }
  // free-режим: фиксируем ошибку и идём дальше
  st.marks[st.pos] = MARK.WRONG;
  st.pos++;
  const finished = st.pos >= st.pattern.length;
  if (finished) st.finishedAt = Date.now();
  return { accepted: true, wrong: true, finished };
}

export function backspace(st: TypingState): void {
  if (st.finishedAt !== null) return;
  if (st.pos > 0) {
    st.pos--;
    st.marks[st.pos] = MARK.PENDING;
  }
}

export function stats(st: TypingState): TypingStats {
  const now = st.finishedAt ?? Date.now();
  const elapsedMs = st.startedAt ? now - st.startedAt : 0;
  let correct = 0;
  for (let i = 0; i < st.pos; i++) if (st.marks[i] === MARK.CORRECT) correct++;
  const minutes = elapsedMs / 60000;
  const wpm = minutes > 0 ? Math.round(correct / 5 / minutes) : 0;
  const totalKeys = correct + st.errors;
  const accuracy = totalKeys > 0 ? Math.round((correct / totalKeys) * 100) : 100;
  return { typed: correct, errors: st.errors, elapsedMs, wpm, accuracy };
}

/**
 * 🔴 ЕСТЬ ЛИ У ЧЕЛОВЕКА НАСТОЯЩАЯ КЛАВИАТУРА.
 *
 * Метод стоит на физической клавиатуре: на экранной это другое упражнение под тем
 * же названием (там нет ни слепого набора, ни мышечной памяти пальцев), и подделка
 * была бы враньём про то, что тренируется.
 *
 * ⚠️ `Platform.OS` ЗДЕСЬ НЕ РАБОТАЕТ, И ЭТО НЕ ОЧЕВИДНО. Приложение живёт в
 * WebView и на телефоне тоже: у Tauri-сборки под Android `Platform.OS === 'web'`,
 * ровно как на макбуке. Различает их не платформа, а УКАЗАТЕЛЬ: у мыши и трекпада
 * `pointer: fine`, у пальца — `coarse`. Проверяем это, а не имя платформы.
 *
 * Неизвестность считаем «клавиатуры нет»: лучше честно предложить выбор из
 * вариантов, чем показать поле ввода, в которое нечем печатать.
 */
export function hasPhysicalKeyboard(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}
