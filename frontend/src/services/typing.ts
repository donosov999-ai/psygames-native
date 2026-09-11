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

/**
 * 🔴 ПОСЛАБЛЕНИЕ ДЛЯ ДИКТОВКИ НА СЛУХ — ВКЛЮЧАЕТСЯ ЯВНО, ПО УМОЛЧАНИЮ ЕГО НЕТ.
 *
 * Решение Дениса 11.09.2026: «в диктанте надо сделать, чтобы заглавные не
 * считались ошибкой, и пунктуация тоже».
 *
 * ПОЧЕМУ ЭТО НЕ ПОБЛАЖКА, А ЧЕСТНОСТЬ СЧЁТА. Диктант меряет слух: человек
 * слышит фразу и записывает её. Заглавная буква и запятая на слух НЕ ЗВУЧАТ —
 * требовать их значит мерить орфографию под видом слуха, а при блокировке на
 * ошибке ещё и запирать человека на символе, которого он не мог услышать.
 *
 * ⚠️ ВЫКЛЮЧЕНО ПО УМОЛЧАНИЮ, И ЭТО ГЛАВНОЕ. Движок общий: кроме диктанта на
 * нём стоят печатный ответ словаря (`vocab-srs`) и беглость (`phonemic-fluency`)
 * — обе игры раздела «Языки», не мои. Там печать ПО ОБРАЗЦУ, у Шестова нулевая
 * терпимость к опечатке и есть смысл требовать точный символ. Поэтому послабление
 * — отдельный флаг, а не смена общего правила: чужие игры ведут себя как вели.
 */
export const PUNCT = /[.,!?;:…—–‑\-«»"'“”‘’()\[\]]/u;

/** Знак препинания набирать не нужно: он проставляется сам. */
export function isPunct(ch: string): boolean {
  return PUNCT.test(ch);
}

/**
 * Перешагнуть знаки препинания, пометив их набранными.
 * Зовётся и при создании состояния (фраза может начинаться с тире), и после
 * каждого принятого символа.
 */
function пропуститьЗнаки(st: TypingState): void {
  while (st.pos < st.pattern.length && isPunct(st.pattern[st.pos]!)) {
    st.marks[st.pos] = MARK.CORRECT;
    st.pos++;
  }
}

export function createState(lines: string[], lenient = false): TypingState {
  const pattern = lines.join('\n');
  const st: TypingState = {
    pattern,
    pos: 0,
    errors: 0,
    startedAt: null,
    finishedAt: null,
    marks: new Uint8Array(pattern.length),
  };
  /*
   * Фраза может начинаться со знака («— Привет»). Здесь пропускаем знаки И
   * ПРОБЕЛЫ: в середине фразы пробел человек набирает сам (он слышен паузой
   * между словами), а пробел ПЕРЕД первым словом он набрать не может — его
   * поставил тот же знак, которого человек не печатал. Проба
   * `dictation-lenient-typing` поймала это на «— Привет»: курсор вставал
   * на пробел и партия запиралась на первом же символе.
   */
  if (lenient) {
    while (st.pos < pattern.length && (isPunct(pattern[st.pos]!) || /\s/.test(pattern[st.pos]!))) {
      st.marks[st.pos] = MARK.CORRECT;
      st.pos++;
    }
  }
  return st;
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
export function pressChar(st: TypingState, ch: string, blockOnError: boolean, lenient = false): KeyResult {
  if (st.finishedAt !== null) return { accepted: false, wrong: false, finished: true };
  if (st.startedAt === null) st.startedAt = Date.now();

  const expected = st.pattern[st.pos];
  // Enter/возврат каретки в образце — ожидаем '\n'
  const norm = ch === '\r' ? '\n' : ch;
  /*
   * При послаблении регистр не важен: «а» засчитывается за «А». Сравниваем в
   * нижнем регистре ОБА символа, а не приводим образец — образец на экране
   * должен остаться как в языке, с заглавной в начале фразы.
   */
  const ok = lenient
    ? norm.toLowerCase() === (expected ?? '').toLowerCase()
    : norm === expected;

  if (ok) {
    st.marks[st.pos] = MARK.CORRECT;
    st.pos++;
    if (lenient) пропуститьЗнаки(st);
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
