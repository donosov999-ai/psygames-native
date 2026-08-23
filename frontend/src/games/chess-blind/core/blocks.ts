/* psygames-chess-blind-blocks · VER 1 · 23.08.2026 */
/**
 * ТРИ БЛОКА НА ОДНОЙ ПОЗИЦИИ — ПРАВИЛА И ХОД ПАРТИИ.
 *
 * Замер и уровень живут в `src/services/series.ts`, позиция — в `./positions.ts`,
 * маршрут коня — в `./knight.ts`, а здесь только правила поверх готовой доски:
 *
 *   'square' — одного ли цвета два поля            → T₁ координатная работа
 *   'knight' — дойдёт ли конь с A на B за N ходов  → T₂ − T₁ цена правила хода
 *   'recall' — позицию убрали: что стоит на поле X → T₃ − T₁ цена удержания
 *
 * 🔴 ПОЗИЦИЯ СОБИРАЕТСЯ ОДИН РАЗ И ПЕРЕНОСИТСЯ ТЕМ ЖЕ ОБЪЕКТОМ. `nextBlock` не
 * имеет доступа ни к партиям, ни к генератору — переносить ему нечего, кроме уже
 * выбранной позиции. Пока это решение стоит в экране, «одна ли позиция» нельзя ни
 * прогнать, ни доказать: экран выбирал бы позицию заново на каждом старте блока и
 * выглядел бы при этом совершенно исправным, а в разность T₂ − T₁ тихо попадала
 * бы разница ПОЗИЦИЙ.
 *
 * 🔴 ВСЕ ТРИ БЛОКА ОТВЕЧАЮТСЯ ОДИНАКОВО — ДА ИЛИ НЕТ, ОДНО КАСАНИЕ. Ответ цифрой
 * («за сколько ходов дойдёт», «какая фигура стоит») тащит в время реакции разнобой
 * ввода: сколько цифр набрать, где кнопка, промахнулся ли по ней. Разность тогда
 * мерила бы способ ответа, а не добавленное правило. Двоичный ответ снимает это
 * целиком, и блоки становятся сопоставимы не только по доске, но и по вводу.
 *
 * 🔴 БЛОК 'square' СПРАШИВАЕТ ПРО ОТНОШЕНИЕ ДВУХ ПОЛЕЙ, А НЕ ПРО ОДНО. Цвет ОДНОГО
 * поля — это чётность суммы координат: приём выучивается за минуту, и дальше
 * человек отвечает не глядя, ничего не представляя. Такая проба мерила бы знание
 * приёма. Вопрос про отношение двух полей приёмом не берётся: чётность надо
 * посчитать дважды и сравнить, а на слух это уже работа с доской.
 *
 * ⚠️ ПОРЯДОК БЛОКОВ НЕ РАНДОМИЗИРУЕТСЯ. Он часть замера: «конь» имеет смысл
 * только после чистой координатной работы, а «память» — только после того, как
 * координаты уже замерены без нагрузки на удержание.
 *
 * ⚠️ ДОЛЯ ВЕРНЫХ ОТВЕТОВ «ДА» — РОВНО ПОЛОВИНА В КАЖДОМ БЛОКЕ. Перекос делает
 * выгодной стратегию «всегда отвечать да», и блок начинает мерить угадывание.
 */
import {
  seriesDiffs,
  type SeriesRun,
} from '@/src/services/series';
import {
  BOARD_SQUARES,
  pieceGlyph,
  sameSquareColor,
  samePiece,
  squareName,
  type ChessPiece,
  type ChessPosition,
} from './board';
import { knightDistance, pairAtDistance } from './knight';
import { knightMovesForLevel } from './positions';
import { interpolate, type ChessBlindStrings } from './i18n';

export type ChessBlockKey = 'square' | 'knight' | 'recall';

/** Порядок задан до старта и не меняется. */
export const CHESS_SERIES_PLAN: readonly ChessBlockKey[] = ['square', 'knight', 'recall'];

/** Вопросов в блоке. Одинаково во всех трёх — иначе разность времён несравнима. */
export const QUESTIONS_PER_BLOCK = 8;

/**
 * Столько ошибок в блоке ещё считается взятым блоком — тот же допуск, с каким
 * серия Шульте засчитывает таблицу. Порога по ВРЕМЕНИ здесь нет и быть не может:
 * см. шапку `services/series.ts`.
 */
export const CHESS_BLOCK_MAX_ERRORS = 2;

/**
 * Насколько длиннее верного маршрута маршрут в неверном вопросе. ДВА, а не один:
 * конь меняет цвет поля каждым ходом, поэтому расстояние N+1 отличается от N
 * цветом полей — и вопрос решался бы приёмом из блока 1, ничего не считая.
 * Подробный разбор — в шапке `knight.ts`.
 */
export const KNIGHT_WRONG_GAP = 2;

export interface SquareQuestion {
  readonly kind: 'square';
  readonly a: number;
  readonly b: number;
  /** Верный ответ: одного ли цвета. */
  readonly answer: boolean;
}

export interface KnightQuestion {
  readonly kind: 'knight';
  readonly from: number;
  readonly to: number;
  /** Спрошенное число ходов. */
  readonly moves: number;
  /** Истинное расстояние по ПУСТОЙ доске. */
  readonly distance: number;
  readonly answer: boolean;
}

export interface RecallQuestion {
  readonly kind: 'recall';
  readonly square: number;
  /**
   * Что утверждает вопрос. ВСЕГДА ФИГУРА, никогда не «пусто» — см. шапку
   * `buildRecallQuestions`: утверждение «здесь было пусто» почти всегда верно и
   * потому отвечается без всякой памяти о позиции.
   */
  readonly claim: ChessPiece;
  /** Что там на самом деле: фигура или пусто. Нужно для разбора после ответа. */
  readonly truth: ChessPiece | null;
  readonly answer: boolean;
}

export type ChessQuestion = SquareQuestion | KnightQuestion | RecallQuestion;

export interface ChessSeriesState {
  /** ОДНА позиция на всю серию: `nextBlock` переносит её как есть. */
  readonly position: ChessPosition;
  readonly level: number;
  readonly blockIndex: number;
  readonly questions: readonly ChessQuestion[];
  readonly step: number;
  readonly errors: number;
}

export function blockKeyAt(blockIndex: number): ChessBlockKey {
  return CHESS_SERIES_PLAN[blockIndex] ?? CHESS_SERIES_PLAN[CHESS_SERIES_PLAN.length - 1];
}

/** Ровно половина ответов «да», порядок перемешан. */
function balancedAnswers(count: number, random: () => number): boolean[] {
  const yes = Math.round(count / 2);
  const out = Array.from({ length: count }, (_, i) => i < yes);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length) % list.length];
}

/**
 * Блок 1. Начало берётся равномерно по доске, конец — равномерно среди полей
 * нужного цвета. Отсюда важное свойство: зная ОДНО поле пары, про ответ не
 * скажешь ничего — оба ответа при нём одинаково вероятны.
 */
export function buildSquareQuestions(count: number, random: () => number): SquareQuestion[] {
  const answers = balancedAnswers(count, random);
  const used = new Set<string>();
  const out: SquareQuestion[] = [];
  for (const answer of answers) {
    let made: SquareQuestion | null = null;
    for (let tries = 0; tries < 200 && !made; tries += 1) {
      const a = Math.floor(random() * BOARD_SQUARES) % BOARD_SQUARES;
      const targets: number[] = [];
      for (let b = 0; b < BOARD_SQUARES; b += 1) {
        if (b !== a && sameSquareColor(a, b) === answer) targets.push(b);
      }
      const b = pick(targets, random);
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (used.has(key)) continue;
      used.add(key);
      made = { kind: 'square', a, b, answer };
    }
    if (made) out.push(made);
  }
  return out;
}

/**
 * Блок 2. Верный ответ «да» — пара ровно с расстоянием N; «нет» — ровно
 * N + KNIGHT_WRONG_GAP. Расстояние считается по ПУСТОЙ доске: фигуры маршруту не
 * мешают, и это нарочно (см. `knight.ts`).
 */
export function buildKnightQuestions(
  count: number,
  moves: number,
  random: () => number,
): KnightQuestion[] {
  const answers = balancedAnswers(count, random);
  const used = new Set<string>();
  const out: KnightQuestion[] = [];
  for (const answer of answers) {
    const distance = answer ? moves : moves + KNIGHT_WRONG_GAP;
    let made: KnightQuestion | null = null;
    for (let tries = 0; tries < 200 && !made; tries += 1) {
      const pair = pairAtDistance(distance, random);
      if (!pair) break;
      const key = `${pair.from}-${pair.to}`;
      if (used.has(key)) continue;
      used.add(key);
      made = { kind: 'knight', from: pair.from, to: pair.to, moves, distance, answer };
    }
    if (made) out.push(made);
  }
  return out;
}

/** Свободное поле из набора: уже спрошенные не берутся дважды. `-1` — не нашлось. */
function takeSquare(pool: readonly number[], used: Set<number>, random: () => number): number {
  const free = pool.filter((square) => !used.has(square));
  if (free.length === 0) return -1;
  const square = pick(free, random);
  used.add(square);
  return square;
}

/**
 * Блок 3. Вопрос всегда одной формы: «на этом поле стояла ВОТ ЭТА фигура?»
 *
 * 🔴 «ПУСТО» НЕ БЫВАЕТ УТВЕРЖДЕНИЕМ, И ЭТО НЕ ПРИДИРКА. На доске из 20 фигур
 * пусто 44 клетки из 64: утверждение «здесь было пусто» верно почти всегда, и
 * отвечать на него выгоднее «да», ничего не вспоминая. Одна такая подсказка
 * обнуляет весь блок. Поэтому утверждение — всегда фигура, а слово «пусто»
 * живёт только в РАЗБОРЕ после ответа (`truthLabel`).
 *
 * 🔴 ЗАНЯТОСТЬ ПОЛЯ НЕ ЧИТАЕТСЯ ИЗ ПОРЯДКА ВОПРОСОВ. Про пустые поля спрашивают
 * вперемешку с занятыми, и выбор делает зерно, а не чётность номера вопроса:
 * «каждый второй вопрос про пустое поле» — это правило, которое замечают за один
 * прогон, и дальше блок мерит наблюдательность, а не память.
 *
 * 🔴 НАЗВАННАЯ ФИГУРА БЕРЁТСЯ С ДОСКИ И ПО ЧАСТОТЕ, А НЕ ИЗ СПИСКА ВИДОВ. Выбор
 * равномерно среди ВИДОВ фигур перекашивает подсказку: верное утверждение чаще
 * всего называет пешку (пешек на доске больше всех), а неверное — ферзя или
 * ладью не реже пешки. Тогда «названа пешка → скорее да» работает без всякой
 * памяти. Поэтому подмена берётся с СЛУЧАЙНОГО ЗАНЯТОГО ПОЛЯ: частоты у верного
 * и неверного утверждения совпадают, и вид фигуры об ответе не говорит ничего.
 * Выдуманную фигуру (второго белого ферзя) отвергали бы не по памяти о позиции,
 * а по тому, что её в партии не было вовсе, — поэтому её здесь и нет.
 *
 * ⚠️ ПОЛЯ ПОД ВЕРНЫЕ УТВЕРЖДЕНИЯ ЗАНИМАЮТСЯ ПЕРВЫМИ. Верное утверждение может
 * дать только ЗАНЯТОЕ поле, и на бедной доске (полоса 4–8 фигур) неверные
 * вопросы успевали разобрать занятые поля раньше — блок выходил короче и с
 * перекосом в «нет». Отсюда условие на материал: фигур не меньше
 * `QUESTIONS_PER_BLOCK / 2`; самая бедная полоса корпуса — 4, это ровно половина
 * от восьми.
 */
export function buildRecallQuestions(
  position: ChessPosition,
  count: number,
  random: () => number,
): RecallQuestion[] {
  const answers = balancedAnswers(count, random);
  const occupied: number[] = [];
  const empty: number[] = [];
  for (let i = 0; i < BOARD_SQUARES; i += 1) (position.squares[i] ? occupied : empty).push(i);
  const used = new Set<number>();

  // Занятые поля под верные утверждения резервируются ДО всего остального.
  const reserved: number[] = [];
  for (let i = answers.filter(Boolean).length; i > 0; i -= 1) {
    const square = takeSquare(occupied, used, random);
    if (square < 0) break;
    reserved.push(square);
  }

  const out: RecallQuestion[] = [];
  for (const answer of answers) {
    if (answer) {
      const square = reserved.pop();
      if (square === undefined) continue;
      const truth = position.squares[square] as ChessPiece;
      out.push({ kind: 'recall', square, claim: truth, truth, answer: true });
      continue;
    }
    // «Нет» — и про занятые поля, и про пустые, вперемешку: занятость поля не
    // должна вычитываться из самого факта, что ответ неверный.
    const first = random() < 0.5 ? empty : occupied;
    let square = takeSquare(first, used, random);
    if (square < 0) square = takeSquare(first === empty ? occupied : empty, used, random);
    if (square < 0) continue;
    const truth = position.squares[square] ?? null;
    const others = occupied.filter((sq) => !samePiece(position.squares[sq] ?? null, truth));
    if (others.length === 0) continue;
    out.push({
      kind: 'recall',
      square,
      claim: position.squares[pick(others, random)] as ChessPiece,
      truth,
      answer: false,
    });
  }
  return out;
}

/** Вопросы блока строятся из ГОТОВОЙ позиции — сама позиция здесь не выбирается. */
export function buildBlockQuestions(
  position: ChessPosition,
  level: number,
  blockIndex: number,
  random: () => number,
): ChessQuestion[] {
  const key = blockKeyAt(blockIndex);
  if (key === 'square') return buildSquareQuestions(QUESTIONS_PER_BLOCK, random);
  if (key === 'knight') return buildKnightQuestions(QUESTIONS_PER_BLOCK, knightMovesForLevel(level), random);
  return buildRecallQuestions(position, QUESTIONS_PER_BLOCK, random);
}

/** Открыть блок на ГОТОВОЙ позиции. Позиции здесь не выбирают — её приносят снаружи. */
export function openBlock(
  position: ChessPosition,
  blockIndex: number,
  level: number,
  random: () => number = Math.random,
): ChessSeriesState {
  return {
    position,
    level,
    blockIndex,
    questions: buildBlockQuestions(position, level, blockIndex, random),
    step: 0,
    errors: 0,
  };
}

/** Следующий блок ТОЙ ЖЕ позиции. Единственный законный переход между блоками. */
export function nextBlock(state: ChessSeriesState, random: () => number = Math.random): ChessSeriesState {
  return openBlock(state.position, state.blockIndex + 1, state.level, random);
}

export function blockStepsTotal(state: ChessSeriesState): number {
  return state.questions.length;
}

export function currentQuestion(state: ChessSeriesState): ChessQuestion | null {
  return state.questions[state.step] ?? null;
}

export function blockDone(state: ChessSeriesState): boolean {
  return state.step >= state.questions.length;
}

/** `hit` — ответ верный · `miss` — неверный (ошибка) · `ignored` — блок уже кончился. */
export type ChessPressResult = 'hit' | 'miss' | 'ignored';

/** Ответ «да»/«нет». Одно касание — во всех трёх блоках одинаково. */
export function answerQuestion(
  state: ChessSeriesState,
  said: boolean,
): { state: ChessSeriesState; result: ChessPressResult } {
  const question = currentQuestion(state);
  if (!question) return { state, result: 'ignored' };
  const hit = question.answer === said;
  return {
    state: { ...state, step: state.step + 1, errors: hit ? state.errors : state.errors + 1 },
    result: hit ? 'hit' : 'miss',
  };
}

/** Маршрут коня для разбора после ответа. Пустая доска — как и при постановке вопроса. */
export function knightTruth(question: KnightQuestion): { distance: number; reachable: boolean } {
  const distance = knightDistance(question.from, question.to);
  return { distance, reachable: distance <= question.moves };
}

/* ──────────────────────────────────────────────────────────────────────────────
 * ТЕКСТ ПАРТИИ СОБИРАЕТСЯ ЗДЕСЬ, А НЕ В ЭКРАНЕ.
 *
 * Экран получает готовые строки и рисует их. Так подпись вопроса не разъезжается
 * с тем, что вопрос на самом деле спрашивает: «одного ли цвета {a} и {b}» берёт
 * ОБА поля прямо из объекта вопроса, и подменить его на однопольный, не сломав
 * подпись, уже нельзя.
 * ────────────────────────────────────────────────────────────────────────────── */

export function blockTitle(strings: ChessBlindStrings, key: ChessBlockKey): string {
  if (key === 'square') return strings.blockSquare;
  if (key === 'knight') return strings.blockKnight;
  return strings.blockRecall;
}

export function blockRule(strings: ChessBlindStrings, key: ChessBlockKey, moves: number): string {
  if (key === 'square') return strings.ruleSquare;
  if (key === 'knight') return interpolate(strings.ruleKnight, { moves });
  return strings.ruleRecall;
}

/** Шапка блока: «Блок 2 из 3» плюс название и правило. */
export function blockHeader(strings: ChessBlindStrings, state: ChessSeriesState): {
  counter: string; title: string; rule: string;
} {
  const key = blockKeyAt(state.blockIndex);
  return {
    counter: interpolate(strings.blockOf, { n: state.blockIndex + 1, total: CHESS_SERIES_PLAN.length }),
    title: blockTitle(strings, key),
    rule: blockRule(strings, key, knightMovesForLevel(state.level)),
  };
}

/** Врезка между блоками. Главное, что она говорит: позиция не менялась. */
export function blockInterlude(strings: ChessBlindStrings, state: ChessSeriesState): {
  heading: string; same: string; title: string; rule: string;
} {
  const header = blockHeader(strings, state);
  return { heading: strings.ruleChanges, same: strings.samePosition, title: header.title, rule: header.rule };
}

/** Подпись фазы запоминания в блоке 3. */
export function memorizeLine(strings: ChessBlindStrings): string {
  return strings.memorize;
}

/** Что стоит на поле: фигурный знак или слово «пусто». */
export function claimLabel(strings: ChessBlindStrings, piece: ChessPiece | null): string {
  return piece ? pieceGlyph(piece) : strings.emptySquare;
}

/** Что там было НА САМОМ ДЕЛЕ — для разбора после ответа. Здесь «пусто» уместно. */
export function truthLabel(strings: ChessBlindStrings, question: RecallQuestion): string {
  return claimLabel(strings, question.truth);
}

/** Сам вопрос — одной строкой, из значений самого вопроса. */
export function questionText(strings: ChessBlindStrings, question: ChessQuestion): string {
  if (question.kind === 'square') {
    return interpolate(strings.askSquare, { a: squareName(question.a), b: squareName(question.b) });
  }
  if (question.kind === 'knight') {
    return interpolate(strings.askKnight, {
      from: squareName(question.from),
      to: squareName(question.to),
      moves: question.moves,
    });
  }
  return interpolate(strings.askRecall, {
    square: squareName(question.square),
    piece: claimLabel(strings, question.claim),
  });
}

/** Две кнопки ответа. Одинаковые во всех трёх блоках — в этом весь смысл. */
export function answerLabels(strings: ChessBlindStrings): { yes: string; no: string } {
  return { yes: strings.answerYes, no: strings.answerNo };
}

/** Откуда позиция: партия, игроки, год, номер хода. */
export function positionCaption(
  strings: ChessBlindStrings,
  source: { white: string; black: string; year: number; ply: number },
): string {
  return interpolate(strings.fromGame, {
    white: source.white,
    black: source.black,
    year: source.year,
    move: Math.ceil(source.ply / 2),
  });
}

/** Экран входа: что за серия, с какой позиции и какие уровни были у блоков. */
export function seriesIntro(
  strings: ChessBlindStrings,
  band: { min: number; max: number },
  perBlock: Record<ChessBlockKey, number>,
): { entry: string; startsAt: string; yourLevels: string } {
  return {
    entry: strings.entry,
    startsAt: interpolate(strings.startsAt, { min: band.min, max: band.max }),
    yourLevels: interpolate(strings.yourLevels, {
      square: perBlock.square,
      knight: perBlock.knight,
      recall: perBlock.recall,
    }),
  };
}

export interface RecapRow {
  readonly key: string;
  readonly label: string;
  readonly ms: number;
}

/**
 * Разбор серии. Неполная серия разностей не даёт ВООБЩЕ — не нули и не часть:
 * решает это `seriesDiffs`, здесь только подпись к его ответу.
 */
export function seriesRecap(strings: ChessBlindStrings, run: SeriesRun): {
  title: string; rows: RecapRow[]; note: string | null;
} {
  const diffs = seriesDiffs(run);
  if (!diffs) return { title: strings.seriesDone, rows: [], note: strings.notFinished };
  const base = run.blocks[0];
  return {
    title: strings.seriesDone,
    rows: [
      { key: 'square', label: strings.coordSpeed, ms: base.timeMs },
      { key: 'knight', label: strings.knightCost, ms: diffs.knight_minus_square ?? 0 },
      { key: 'recall', label: strings.holdCost, ms: diffs.recall_minus_square ?? 0 },
    ],
    note: null,
  };
}

/** Что стало с уровнем: вырос или кого ждёт. */
export function levelMoveLine(
  strings: ChessBlindStrings,
  move: { raised: boolean; band: { min: number; max: number }; weakest: ChessBlockKey; runsLeft: number },
): string {
  if (move.raised) return interpolate(strings.levelUp, { min: move.band.min, max: move.band.max });
  return interpolate(strings.heldBy, {
    block: blockTitle(strings, move.weakest),
    runs: move.runsLeft,
  });
}

/**
 * Следующий НЕОТВЕЧЕННЫЙ вопрос по кругу от текущего; -1 = закрыты все.
 *
 * Отвечать можно вразнобой (репорт Дениса 23.08.2026: «нельзя вручную выбрать те, что
 * помнишь — он навязывает свою последовательность»), поэтому переход не может быть
 * `index + 1`: человек мог закрыть третий вопрос раньше первого.
 * ⚠️ Набор вопросов и их число при этом НЕ меняются — иначе поедет сама мера:
 * разности между блоками считаются на одинаковых заданиях.
 */
export function nextUnanswered(cur: number, total: number, answered: ReadonlySet<number>): number {
  for (let k = 1; k <= total; k++) {
    const cand = (cur + k) % total;
    if (!answered.has(cand)) return cand;
  }
  return -1;
}
