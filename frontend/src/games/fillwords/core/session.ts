/* psygames-fillwords-session · VER 1 · 22.08.2026 */
/**
 * ПАРТИЯ: РАЗБОР ЖЕСТА, СЧЁТ ОСТАВШИХСЯ БУКВ, ПОДСКАЗКА.
 *
 * 🔴 ПРАВИЛО ЗАЧЁТА, И ПОЧЕМУ ИМЕННО ТАКОЕ. Жест засчитывается, когда линия
 * прошла РОВНО ПО КЛЕТКАМ одного из ненайденных слов — в прямом или обратном
 * порядке. Соблазнительная альтернатива «засчитывать любую линию, которая
 * СКЛАДЫВАЕТСЯ в слово из списка» разрушила бы игру молча: буквы соседних слов
 * лежат вплотную, и «кот» почти всегда найдётся из чужих клеток. Человек
 * получил бы засчитанное слово, три чужие клетки оказались бы съедены, а поле —
 * неразбираемым. То есть ровно та беда, ради которой генератор и строит
 * разбиение.
 *
 * ⚠️ ОБРАТНЫЙ ПОРЯДОК ПРИНИМАЕТСЯ НАМЕРЕННО. Человек ведёт палец от той буквы,
 * которую увидел первой, а увидел он с равной вероятностью хвост слова. Клетки
 * при этом те же самые, разбиение не страдает — отказывать не за что.
 *
 * ⚠️ ПРИЧИНА ОТКАЗА — ЧАСТЬ ДОГОВОРА, А НЕ ОТЛАДОЧНЫЙ ВЫВОД. Проверки идут по
 * порядку (длина → повтор клетки → соседство → занятость → совпадение), и код
 * причины называет ПЕРВУЮ сработавшую. На этом стоит гейт «жест по несоседним
 * клеткам не принимается»: убери проверку соседства — прыжок начнёт получать
 * `no-match` вместо `not-adjacent`, и проба покраснеет. Верни булево «не
 * принято» — и такая подмена пройдёт незамеченной, потому что жест отклонён в
 * обоих случаях.
 */
import { areAdjacent } from './generator';
import { FILLWORDS_MIN_WORD } from './words';
import type {
  CellIndex,
  FillwordsHint,
  FillwordsPuzzle,
  FillwordsSession,
  FillwordsTrace,
  ПорядокСдачи,
} from './types';

/**
 * ЦВЕТА НАЙДЕННЫХ СЛОВ. Разобранное слово остаётся на поле своим цветом — так
 * видно, что именно уже съедено, и не приходится помнить.
 *
 * Пастель, а не насыщенный цвет: буква остаётся тёмной (`FILLWORDS_INK`), и её
 * контраст к любой плитке — не ниже 8:1 при норме AA 4.5. Заодно плитки
 * различимы между собой: минимальное расстояние по CIELAB в наборе 23.6, то
 * есть соседние слова не сливаются в «два одинаковых зелёных». Оба числа
 * пересчитывает гейт, а не память — подменишь цвет на глаз, он покраснеет.
 */
export const FILLWORDS_TINTS = [
  '#FCD34D', '#6EE7B7', '#93C5FD', '#D8B4FE',
  '#F9A8D4', '#FDBA74', '#D9F99D', '#CBD5E1',
] as const;

/** Цвет буквы на разобранной плитке. Тёмный — потому что плитки светлые. */
export const FILLWORDS_INK = '#1F2937';

/** Цвет плитки по порядку нахождения: девятое слово начинает круг заново. */
export function tintForFoundOrder(order: number): string {
  const size = FILLWORDS_TINTS.length;
  return FILLWORDS_TINTS[((order % size) + size) % size];
}

export function createFillwordsSession(
  puzzle: FillwordsPuzzle,
  порядок: ПорядокСдачи = 'свободно',
): FillwordsSession {
  return {
    puzzle,
    owner: new Array<number>(puzzle.rows * puzzle.cols).fill(-1),
    found: [],
    hints: 0,
    mistakes: 0,
    порядок,
  };
}

/**
 * 🔴 КАКОЙ ПОРЯДОК ОТДАТЬ ПАРТИИ — РЕШЕНИЕ, А НЕ ПЕРЕСКАЗ УРОВНЯ.
 *
 * Уровень ПРЕДЛАГАЕТ строгость (шестая ось лестницы), но применять её можно не
 * всегда: требовать «следующее по списку» у человека, который списка НЕ ВИДИТ, —
 * угадайка, а не трудность, он попросту не может знать, какое слово следующее.
 *
 * ⚠️ ЖИВЁТ ЗДЕСЬ, А НЕ В ЭКРАНЕ, ЧТОБЫ ЭТО МОЖНО БЫЛО ПРОВЕРИТЬ. Пока условие
 * стояло в разметке, проверить его исполнением было нечем: чтобы дойти до
 * уровня 203 в рендер-пробе, пришлось бы провести линию через распознаватель
 * жеста. Отдельная функция снимает вопрос — у неё исход виден сразу.
 */
export function порядокДляПартии(
  порядокУровня: ПорядокСдачи,
  списокВиден: boolean,
): ПорядокСдачи {
  return списокВиден ? порядокУровня : 'свободно';
}

/**
 * КАКИЕ СЛОВА СЕЙЧАС МОЖНО СДАВАТЬ.
 *
 * При свободном порядке — все ненайденные. При строгом — ровно одно: следующее
 * по списку либо последнее из ненайденных. Слово, сданное «не в свой черёд»,
 * получает тот же исход, что и линия в никуда: `no-match` и счёт промаха.
 */
export function допустимыеСлова(session: FillwordsSession): number[] {
  const ненайденные = unfoundWordIndexes(session);
  if (!ненайденные.length) return [];
  if (session.порядок === 'поСписку') return [ненайденные[0]];
  if (session.порядок === 'обратный') return [ненайденные[ненайденные.length - 1]];
  return ненайденные;
}

/** Сколько букв ещё на поле. Именно это число решает, закрыт ли уровень. */
export function lettersLeft(session: FillwordsSession): number {
  let left = 0;
  for (const owner of session.owner) if (owner === -1) left++;
  return left;
}

/**
 * 🔴 УРОВЕНЬ ЗАКРЫТ ⟺ НА ПОЛЕ НЕ ОСТАЛОСЬ БУКВ.
 *
 * Считаем по БУКВАМ, а не по числу найденных слов, хотя при исправной раскладке
 * это одно и то же. Разница проявляется ровно в тот момент, когда что-то пошло
 * не так: если раскладка перестанет быть разбиением, счёт по словам радостно
 * объявит победу над полем, в котором остались буквы. Счёт по буквам не
 * объявит — он смотрит на то, что видит человек.
 */
export function isCleared(session: FillwordsSession): boolean {
  return lettersLeft(session) === 0;
}

/** Индексы ещё не найденных слов. */
export function unfoundWordIndexes(session: FillwordsSession): number[] {
  const out: number[] = [];
  session.puzzle.words.forEach((_, index) => {
    if (!session.found.includes(index)) out.push(index);
  });
  return out;
}

function samePath(a: readonly CellIndex[], b: readonly CellIndex[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Разбор жеста БЕЗ побочных действий: та же линия на том же состоянии всегда
 * даёт тот же ответ. Отсюда её можно звать хоть на каждое движение пальца —
 * например, чтобы подсветить линию, пока её ведут.
 */
export function resolveTrace(session: FillwordsSession, path: readonly CellIndex[]): FillwordsTrace {
  const { puzzle } = session;
  const total = puzzle.rows * puzzle.cols;
  if (path.length < 2) return { ok: false, reason: 'too-short' };

  const seen = new Set<CellIndex>();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (!Number.isInteger(cell) || cell < 0 || cell >= total) return { ok: false, reason: 'no-match' };
    if (seen.has(cell)) return { ok: false, reason: 'repeat' };
    seen.add(cell);
    if (i > 0 && !areAdjacent(path[i - 1], cell, puzzle.cols, puzzle.диагонали)) return { ok: false, reason: 'not-adjacent' };
  }
  for (const cell of path) if (session.owner[cell] !== -1) return { ok: false, reason: 'taken' };

  const reversed = [...path].reverse();
  for (const index of допустимыеСлова(session)) {
    const planted = puzzle.words[index].path;
    if (samePath(path, planted) || samePath(reversed, planted)) return { ok: true, wordIndex: index };
  }
  return { ok: false, reason: 'no-match' };
}

/**
 * Применить жест. Состояние НЕ мутируется: попадание отдаёт новую партию,
 * промах — новую партию со счётчиком промахов, ошибка ведения (прыжок, возврат
 * на свою же клетку, слишком короткая линия) не считается промахом вовсе.
 *
 * ⚠️ Почему не всё подряд идёт в промахи: палец соскальзывает, и наказывать за
 * дрожь руки значит наказывать за телефон, а не за невнимательность. Промах —
 * это «провёл осмысленную линию, а слова там нет».
 */
export function applyTrace(
  session: FillwordsSession,
  path: readonly CellIndex[],
): { session: FillwordsSession; trace: FillwordsTrace } {
  const trace = resolveTrace(session, path);
  if (!trace.ok) {
    if (trace.reason !== 'no-match') return { session, trace };
    return { session: { ...session, mistakes: session.mistakes + 1 }, trace };
  }
  const owner = [...session.owner];
  for (const cell of session.puzzle.words[trace.wordIndex].path) owner[cell] = trace.wordIndex;
  return { session: { ...session, owner, found: [...session.found, trace.wordIndex] }, trace };
}

/**
 * ПОДСКАЗКА показывает НАЧАЛО слова, а не слово целиком.
 *
 * Открыть слово целиком — значит разобрать за человека кусок поля: подсказка
 * перестаёт быть помощью и становится кнопкой «пройти уровень». Две клетки
 * задают направление змейки — дальше человек ведёт сам.
 *
 * Берётся САМОЕ КОРОТКОЕ из ненайденных: короткое проще дочитать глазами, и
 * подсказка остаётся толчком, а не решением.
 */
export function takeHint(session: FillwordsSession): { session: FillwordsSession; hint: FillwordsHint | null } {
  const candidates = unfoundWordIndexes(session);
  if (candidates.length === 0) return { session, hint: null };
  let best = candidates[0];
  for (const index of candidates) {
    if (session.puzzle.words[index].path.length < session.puzzle.words[best].path.length) best = index;
  }
  /**
   * 🔴 ПОДСКАЗКА ПОКАЗЫВАЕТ СЛОВО ЦЕЛИКОМ, А НЕ ДВЕ ПЕРВЫЕ КЛЕТКИ.
   *
   * 📍 ОТЧЁТ ДЕНИСА 05.09.2026: «подсказка ни фига не работает» — на скриншоте
   * блок «Поиск слов», 50 секунд, найдено 0 из 6, ошибок 6, одна подсказка уже
   * потрачена. Замер по 30 раскладкам 5×5 объясняет почему: соседство тут
   * ВОСЬМИСТОРОННЕЕ, и две первые клетки оставляют медиану 7 продолжений
   * нужной длины (максимум 60) при средней длине слова 3,5. То есть подсказка
   * тратилась, а слово всё равно бралось перебором — и каждая неверная проба
   * шла в ошибки.
   *
   * Подсказок три на уровень, и каждая уже стоит звезды наравне с промахом.
   * За такую цену человек обязан ПОЛУЧИТЬ слово, а не направление к нему.
   */
  const path = session.puzzle.words[best].path;
  return {
    session: { ...session, hints: session.hints + 1 },
    hint: { wordIndex: best, cells: path.slice() },
  };
}

/**
 * ШАГ ВЕДЕНИЯ ЛИНИИ — ОДНО ПРАВИЛО НА ВСЕ СПОСОБЫ ВВОДА.
 *
 * Экран умеет вести линию двумя способами (протягивание пальцем и добор
 * тапами), и правило шага у них обязано быть ОДНО. Живи оно в обработчике
 * жеста, оно бы разошлось при первой же правке одного из двух — а проверить
 * его в экране нечем: там пиксели, таймеры и React.
 *
 * Три исхода, и каждый нужен:
 *   · та же клетка (или незаконный шаг) → линия не меняется, возвращается ОНА ЖЕ;
 *   · предпоследняя клетка → стираем хвост: так исправляют, не отпуская палец;
 *   · законный сосед → линия удлиняется.
 *
 * ⚠️ Незаконный шаг (прыжок через клетку, заход в разобранное слово) НЕ рвёт
 * линию и не считается промахом: палец соскальзывает, и терять из-за этого
 * набранное слово человек не должен.
 */
export function stepTrace(
  session: FillwordsSession,
  path: readonly CellIndex[],
  cell: CellIndex,
): CellIndex[] {
  const current = path as CellIndex[];
  if (path.length === 0) return session.owner[cell] === -1 ? [cell] : current;
  if (path[path.length - 1] === cell) return current;
  if (path.length >= 2 && path[path.length - 2] === cell) return path.slice(0, -1);
  const next = [...path, cell];
  return traceIsWalkable(session, next) ? next : current;
}

/**
 * Годится ли линия в продолжение (для подсветки во время ведения пальца).
 * Отдельная от `resolveTrace` мелочь: пока слово не дособрано, `resolveTrace`
 * честно отвечает «no-match», и красить линию красным на каждом шаге было бы
 * враньём — человек ещё ведёт.
 */
export function traceIsWalkable(session: FillwordsSession, path: readonly CellIndex[]): boolean {
  if (path.length === 0) return false;
  if (path.length > FILLWORDS_MIN_WORD * 8) return false;
  const seen = new Set<CellIndex>();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (session.owner[cell] !== -1 || seen.has(cell)) return false;
    seen.add(cell);
    if (i > 0 && !areAdjacent(path[i - 1], cell, session.puzzle.cols, session.puzzle.диагонали)) return false;
  }
  return true;
}
