/* psygames-chess-blind-series-gate · VER 1 · 23.08.2026 */
/**
 * СЕРИЯ «ШАХМАТЫ ВСЛЕПУЮ»: ТРИ БЛОКА ПО ОДНОЙ ПОЗИЦИИ — И ЭТО ДОКАЗЫВАЕТСЯ,
 * А НЕ ОБЕЩАЕТСЯ В КОММЕНТАРИИ.
 *
 * Замер держится на аддитивном методе (Стернберг): каждый следующий блок
 * добавляет РОВНО ОДНО требование, и тогда разность времён — цена добавленного
 * звена. Всё это разваливается от пяти поломок, каждая из которых на экране
 * выглядит совершенно нормально:
 *
 *   1. позиция пересобралась между блоками — в T₂−T₁ поехала разница ПОЗИЦИЙ;
 *   2. маршрут коня посчитан С УЧЁТОМ фигур — блок 2 добавил ДВА требования
 *      вместо одного, и назвать разность ценой правила хода уже нельзя;
 *   3. блок 1 спросил про ОДНО поле — и мерит знание приёма «чётность суммы
 *      координат», а не работу с доской;
 *   4. серия записалась тремя сессиями — разность не посчитать уже никогда;
 *   5. перевод координат перевернул доску — фигур столько же, расстановка чужая.
 *
 * ⚠️ ПОЭТОМУ ПРОВЕРЯЕМ ПОВЕДЕНИЕ И ЗНАЧЕНИЯ, А НЕ ТЕКСТ ИСХОДНИКА. Расстановка
 * сверяется ПОЭЛЕМЕНТНО и ПОСИМВОЛЬНО с чужой записью (FEN), маршрут коня —
 * СВОИМ независимым обходом, написанным здесь и по-другому, а «ответ не выводится
 * из одного поля» — решателем, который видит только одно поле и обязан остаться
 * на уровне угадывания.
 *
 * ⚠️ ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО. «Расстановки совпали» — правда и для
 * двух пустых досок; «маршрут кратчайший» — правда и когда вопросов не построено
 * ни одного. Поэтому каждая проба сначала доказывает, что есть на что смотреть:
 * вопросов ровно столько, сколько заявлено; фигуры на доске есть; сравнение умеет
 * КРАСНЕТЬ (перевёрнутая доска и сдвинутая фигура не равны оригиналу).
 */
import {
  BOARD_SQUARES,
  CHESS_BLIND_LOCALES,
  CHESS_BLOCK_MAX_ERRORS,
  CHESS_GAMES,
  CHESS_SERIES_PLAN,
  EMPTY_CHESS_PROGRESS,
  KNIGHT_WRONG_GAP,
  PIECE_BANDS,
  POSITION_CORPUS,
  QUESTIONS_PER_BLOCK,
  afterSeriesRun,
  answerLabels,
  answerQuestion,
  bandForLevel,
  blockDone,
  blockHeader,
  blockInterlude,
  blockKeyAt,
  blockTaken,
  boardFen,
  chessMaxLevel,
  claimLabel,
  corpusBandSize,
  corpusEntries,
  gameMoves,
  gameOutcome,
  getChessBlindStrings,
  knightDistance,
  knightMovesForLevel,
  knightPath,
  knightTruth,
  levelMoveLine,
  memorizeLine,
  nextBlock,
  openBlock,
  pairsAtDistanceCount,
  pieceCount,
  pieceGlyph,
  positionCaption,
  positionForLevel,
  positionFromFen,
  positionWithPieces,
  truthLabel,
  questionText,
  replayGame,
  samePiece,
  sameSquareColor,
  seriesEntry,
  seriesIntro,
  seriesRecap,
  squareIndex,
  squareName,
  type ChessPiece,
  type ChessPosition,
  type ChessSeriesState,
  type KnightQuestion,
  type RecallQuestion,
  type SquareQuestion,
} from '@/src/games/chess-blind/core';
import {
  recordBlock,
  seriesDiffs,
  seriesSession,
  startSeries,
  STABLE_RUNS,
  type SeriesBlock,
} from '@/src/services/series';

/* ── Инструменты пробы. Всё независимое — написано здесь и по-другому. ──────── */

/** Зерновой генератор: одна и та же партия воспроизводится точь-в-точь. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Цвет поля — считается ИЗ ИМЕНИ поля, а не вызовом того же кода. */
function lightByName(name: string): boolean {
  const file = 'abcdefgh'.indexOf(name[0]);
  const rank = Number(name[1]) - 1;
  return (file + rank) % 2 === 1;
}

/**
 * НЕЗАВИСИМЫЙ обход коня. Написан иначе, чем в игре: расширяем фронт по ИМЕНАМ
 * полей и считаем координаты из букв, а не из индексов. Совпасть с игровым
 * ответом такой обход может только по существу.
 */
function distancesByName(fromName: string): Map<string, number> {
  const jumps = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const dist = new Map<string, number>([[fromName, 0]]);
  let frontier = [fromName];
  let step = 0;
  while (frontier.length > 0) {
    step += 1;
    const next: string[] = [];
    for (const name of frontier) {
      const file = 'abcdefgh'.indexOf(name[0]);
      const rank = Number(name[1]) - 1;
      for (const [df, dr] of jumps) {
        const f = file + df;
        const r = rank + dr;
        if (f < 0 || f > 7 || r < 0 || r > 7) continue;
        const target = `${'abcdefgh'[f]}${r + 1}`;
        if (dist.has(target)) continue;
        dist.set(target, step);
        next.push(target);
      }
    }
    frontier = next;
  }
  return dist;
}

function distanceByName(from: number, to: number): number {
  return distancesByName(squareName(from)).get(squareName(to)) as number;
}

/** НЕЗАВИСИМЫЙ разбор FEN: чистая работа со строкой, без chess.js и без board.ts. */
function parseFenByHand(fen: string): (string | null)[] {
  const rows = fen.split(' ')[0].split('/');
  const cells: (string | null)[] = new Array<string | null>(64).fill(null);
  rows.forEach((row, index) => {
    const rank = 7 - index; // первая строка FEN — восьмая горизонталь
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      cells[rank * 8 + file] = ch;
      file += 1;
    }
  });
  return cells;
}

function pieceLetter(piece: ChessPiece | null): string | null {
  if (!piece) return null;
  return piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
}

/** Поэлементное сравнение расстановок. Умеет краснеть — доказано отдельной пробой. */
function sameArrangement(a: ChessPosition, b: ChessPosition): boolean {
  if (a.squares.length !== b.squares.length) return false;
  for (let i = 0; i < a.squares.length; i += 1) {
    if (!samePiece(a.squares[i] ?? null, b.squares[i] ?? null)) return false;
  }
  return true;
}

function flipVertically(position: ChessPosition): ChessPosition {
  const squares: (ChessPiece | null)[] = new Array<ChessPiece | null>(BOARD_SQUARES).fill(null);
  for (let i = 0; i < BOARD_SQUARES; i += 1) {
    const rank = Math.floor(i / 8);
    const file = i % 8;
    squares[(7 - rank) * 8 + file] = position.squares[i] ?? null;
  }
  return { ...position, squares };
}

function block(key: string, timeMs: number, errors = 0, done = true): SeriesBlock {
  return { key, timeMs, errors, done };
}

/** Полный прогон серии по одной позиции: три блока, все доиграны. */
function playWholeSeries(level: number, seed: number): {
  states: ChessSeriesState[];
  run: ReturnType<typeof startSeries>;
} {
  const random = seeded(seed);
  const picked = positionForLevel(level, random);
  let state = openBlock(picked.position, 0, level, random);
  const states: ChessSeriesState[] = [];
  let run = startSeries('chess_blind', level, CHESS_SERIES_PLAN, 0);
  for (let i = 0; i < CHESS_SERIES_PLAN.length; i += 1) {
    if (i > 0) state = nextBlock(state, random);
    states.push(state);
    let playing = state;
    while (!blockDone(playing)) {
      const question = playing.questions[playing.step];
      playing = answerQuestion(playing, question.answer).state;
    }
    run = recordBlock(run, block(blockKeyAt(i), 1000 + i * 400, playing.errors, blockDone(playing)));
    state = playing;
  }
  return { states, run };
}

/* ── A. Обёртка над chess.js: три партии доигрываются до мата ───────────────── */

describe('три партии разыгрываются нашей обёрткой до мата', () => {
  for (const game of CHESS_GAMES) {
    it(`🔴 ${game.id}: ${game.plies} полуходов, последний ${game.lastMove}, мат`, () => {
      const outcome = gameOutcome(game.pgn);
      expect(`${game.id}: полуходов ${outcome.plies} · последний ${outcome.lastMove} · мат ${outcome.checkmate}`)
        .toBe(`${game.id}: полуходов ${game.plies} · последний ${game.lastMove} · мат true`);
    });

    it(`${game.id}: заявленное число ходов сходится с разыгранным`, () => {
      expect(Math.ceil(gameOutcome(game.pgn).plies / 2)).toBe(game.moves);
      expect(gameMoves(game.pgn).length).toBe(game.plies);
    });

    it(`${game.id}: на доске в конце и правда стоят фигуры`, () => {
      const final = gameOutcome(game.pgn).position;
      expect(pieceCount(final)).toBeGreaterThan(10);
      expect(final.squares.length).toBe(BOARD_SQUARES);
    });
  }

  it('партия не доигралась бы при кривом разборе: у каждого полухода своя расстановка', () => {
    const line = replayGame(CHESS_GAMES[1].pgn);
    expect(line.length).toBe(CHESS_GAMES[1].plies + 1);
    const seen = new Set(line.map((p) => boardFen(p)));
    expect(seen.size).toBe(line.length);
  });
});

/* ── B. Перевод координат: посимвольная сверка с чужой записью ──────────────── */

describe('перевод координат доказан посимвольно, а не «сошлось число фигур»', () => {
  it('🔴 корпус: расстановка, собранная обратно, СОВПАДАЕТ со строкой FEN', () => {
    const bad: string[] = [];
    for (const entry of corpusEntries()) {
      const position = positionFromFen(entry.fen);
      const mine = boardFen(position);
      const theirs = entry.fen.split(' ')[0];
      if (mine !== theirs) bad.push(`${entry.fen}: собрано ${mine}`);
    }
    expect(bad).toEqual([]);
    expect(corpusEntries().length).toBe(2000);
  });

  it('🔴 корпус: каждая фигура на своём поле по НЕЗАВИСИМОМУ разбору строки', () => {
    const bad: string[] = [];
    for (const entry of corpusEntries()) {
      const position = positionFromFen(entry.fen);
      const byHand = parseFenByHand(entry.fen);
      for (let i = 0; i < BOARD_SQUARES; i += 1) {
        if (pieceLetter(position.squares[i] ?? null) !== byHand[i]) {
          bad.push(`${entry.fen}: ${squareName(i)} — у нас ${pieceLetter(position.squares[i] ?? null)}, в строке ${byHand[i]}`);
        }
      }
      if (bad.length > 5) break;
    }
    expect(bad).toEqual([]);
  });

  it('🔴 корпус: число фигур на доске совпадает с заявленным в записи', () => {
    const bad: string[] = [];
    for (const entry of corpusEntries()) {
      const real = pieceCount(positionFromFen(entry.fen));
      if (real !== entry.pieces) bad.push(`${entry.fen}: на доске ${real}, заявлено ${entry.pieces}`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 партии: разыгранная нашим кодом расстановка совпадает с её же FEN', () => {
    const bad: string[] = [];
    for (const game of CHESS_GAMES) {
      for (const position of replayGame(game.pgn)) {
        if (boardFen(position) !== position.fen.split(' ')[0]) {
          bad.push(`${game.id} полуход ${position.ply}: ${boardFen(position)} ≠ ${position.fen.split(' ')[0]}`);
        }
        const byHand = parseFenByHand(position.fen);
        for (let i = 0; i < BOARD_SQUARES; i += 1) {
          if (pieceLetter(position.squares[i] ?? null) !== byHand[i]) {
            bad.push(`${game.id} полуход ${position.ply}: разошлось на ${squareName(i)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('⚠️ сверка умеет КРАСНЕТЬ: перевёрнутая доска даёт другую строку', () => {
    const position = positionFromFen(corpusEntries()[7].fen);
    const flipped = flipVertically(position);
    expect(pieceCount(flipped)).toBe(pieceCount(position));   // фигур столько же…
    expect(boardFen(flipped)).not.toBe(boardFen(position));   // …а расстановка другая
    expect(sameArrangement(flipped, position)).toBe(false);
  });

  it('a1 — тёмное поле, h8 — тёмное, h1 — светлое: нумерация не перепутана', () => {
    expect(squareName(0)).toBe('a1');
    expect(squareName(BOARD_SQUARES - 1)).toBe('h8');
    expect(squareIndex('h1')).toBe(7);
    expect(lightByName('a1')).toBe(false);
    expect(lightByName('h1')).toBe(true);
    expect(sameSquareColor(squareIndex('a1'), squareIndex('h8'))).toBe(true);
  });
});

/* ── C. Уровень = полоса по числу фигур ────────────────────────────────────── */

describe('уровень задаёт число фигур на доске', () => {
  it('полос ровно пять, и они идут от бедной доски к густой', () => {
    expect(PIECE_BANDS.length).toBe(chessMaxLevel());
    expect(PIECE_BANDS[0]).toEqual({ min: 4, max: 8 });
    expect(PIECE_BANDS[PIECE_BANDS.length - 1]).toEqual({ min: 27, max: 32 });
    for (let i = 1; i < PIECE_BANDS.length; i += 1) {
      expect(PIECE_BANDS[i].min).toBeGreaterThan(PIECE_BANDS[i - 1].max);
    }
    for (const band of PIECE_BANDS) expect(corpusBandSize(band)).toBe(400);
  });

  it('🔴 позиция уровня и правда попадает в свою полосу — по СЧЁТУ ФИГУР на доске', () => {
    const bad: string[] = [];
    for (let level = 1; level <= chessMaxLevel(); level += 1) {
      const band = bandForLevel(level);
      for (let seed = 1; seed <= 40; seed += 1) {
        const picked = positionForLevel(level, seeded(seed * 977 + level));
        const real = pieceCount(picked.position);
        if (real < band.min || real > band.max) bad.push(`уровень ${level}: фигур ${real}, полоса ${band.min}–${band.max}`);
        if (real !== picked.pieces) bad.push(`уровень ${level}: заявлено ${picked.pieces}, на доске ${real}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 уровни различимы: на пятом фигур строго больше, чем на первом', () => {
    const low = positionForLevel(1, seeded(11)).pieces;
    const high = positionForLevel(chessMaxLevel(), seeded(11)).pieces;
    expect(high).toBeGreaterThan(low);
  });

  it('единственная дверь за позицией отдаёт нашу расстановку, а не строку', () => {
    const got = positionWithPieces({ min: 9, max: 14 }, seeded(5));
    expect(got.position.squares.length).toBe(BOARD_SQUARES);
    expect(pieceCount(got.position)).toBeGreaterThanOrEqual(9);
    expect(pieceCount(got.position)).toBeLessThanOrEqual(14);
    expect(got.source).toBe('lichess');
    expect(typeof got.rating).toBe('number');
  });

  it('запасной источник живой: полоса вне корпуса приводит к партиям', () => {
    const got = positionWithPieces({ min: 33, max: 40 }, seeded(3));
    expect(got.source).toBe('game');
    expect(got.game).not.toBeNull();
    expect(pieceCount(got.position)).toBeGreaterThan(0);
  });

  it('рейтинг задачи в уровень не вмешивается: он лежит рядом и только', () => {
    const ratings = new Set<number>();
    for (let seed = 1; seed <= 30; seed += 1) {
      const picked = positionForLevel(3, seeded(seed * 31));
      ratings.add(picked.rating ?? -1);
      expect(picked.level).toBe(3);
    }
    // Один уровень — разные рейтинги: значит рейтинг уровнем не управляет.
    expect(ratings.size).toBeGreaterThan(5);
  });

  it('корпус назван и лицензия записана', () => {
    expect(POSITION_CORPUS.size).toBe(2000);
    expect(POSITION_CORPUS.source).toContain('lichess');
    expect(POSITION_CORPUS.license).toContain('CC0');
  });
});

/* ── D. Одна позиция на все три блока ──────────────────────────────────────── */

describe('все три блока идут по ОДНОЙ И ТОЙ ЖЕ позиции', () => {
  it('🔴 расстановка совпадает ПОЭЛЕМЕНТНО во всех трёх блоках', () => {
    const { states } = playWholeSeries(4, 2026);
    expect(states.length).toBe(3);
    expect(pieceCount(states[0].position)).toBeGreaterThan(0);
    const holes: string[] = [];
    for (let i = 1; i < states.length; i += 1) {
      for (let sq = 0; sq < BOARD_SQUARES; sq += 1) {
        const first = states[0].position.squares[sq] ?? null;
        const later = states[i].position.squares[sq] ?? null;
        if (!samePiece(first, later)) holes.push(`блок ${i + 1}: ${squareName(sq)} разошлось`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 позиция ПЕРЕНОСИТСЯ, а не пересобирается: это тот же объект', () => {
    const random = seeded(77);
    const picked = positionForLevel(2, random);
    const first = openBlock(picked.position, 0, 2, random);
    const second = nextBlock(first, random);
    const third = nextBlock(second, random);
    expect(second.position).toBe(first.position);
    expect(third.position).toBe(first.position);
    expect(second.level).toBe(first.level);
  });

  it('⚠️ сравнение умеет КРАСНЕТЬ: сдвинутая фигура ломает совпадение', () => {
    const picked = positionForLevel(4, seeded(9));
    const moved = { ...picked.position, squares: [...picked.position.squares] };
    const busy = moved.squares.findIndex((cell) => cell !== null);
    const free = moved.squares.findIndex((cell) => cell === null);
    moved.squares[free] = moved.squares[busy];
    moved.squares[busy] = null;
    expect(pieceCount(moved as ChessPosition)).toBe(pieceCount(picked.position));
    expect(sameArrangement(moved as ChessPosition, picked.position)).toBe(false);
    expect(sameArrangement(picked.position, picked.position)).toBe(true);
  });

  it('порядок блоков не рандомизируется', () => {
    expect([...CHESS_SERIES_PLAN]).toEqual(['square', 'knight', 'recall']);
    expect(blockKeyAt(0)).toBe('square');
    expect(blockKeyAt(1)).toBe('knight');
    expect(blockKeyAt(2)).toBe('recall');
    expect(blockKeyAt(99)).toBe('recall');
  });

  it('в каждом блоке ровно столько вопросов, сколько заявлено', () => {
    const { states } = playWholeSeries(3, 4242);
    for (const state of states) expect(state.questions.length).toBe(QUESTIONS_PER_BLOCK);
  });
});

/* ── E. Блок «поле»: вопрос про ДВА поля ───────────────────────────────────── */

describe('блок «поле» спрашивает про отношение двух полей', () => {
  function squareQuestions(count: number): SquareQuestion[] {
    const out: SquareQuestion[] = [];
    for (let seed = 1; seed <= count; seed += 1) {
      const random = seeded(seed * 7919);
      const picked = positionForLevel(2, random);
      const state = openBlock(picked.position, 0, 2, random);
      for (const q of state.questions) if (q.kind === 'square') out.push(q);
    }
    return out;
  }

  it('🔴 в вопросе ДВА РАЗНЫХ поля, и ответ — их отношение', () => {
    const questions = squareQuestions(60);
    expect(questions.length).toBe(60 * QUESTIONS_PER_BLOCK);
    const bad: string[] = [];
    for (const q of questions) {
      if (q.a === q.b) bad.push(`${squareName(q.a)}: спрошено про одно поле дважды`);
      const truth = lightByName(squareName(q.a)) === lightByName(squareName(q.b));
      if (q.answer !== truth) bad.push(`${squareName(q.a)}/${squareName(q.b)}: ответ ${q.answer}, а на деле ${truth}`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 решатель, видящий ОДНО поле, остаётся на уровне угадывания', () => {
    const questions = squareQuestions(60);
    const share = (guess: (q: SquareQuestion) => boolean): number =>
      questions.filter((q) => guess(q) === q.answer).length / questions.length;
    const byFirst = share((q) => lightByName(squareName(q.a)));
    const bySecond = share((q) => lightByName(squareName(q.b)));
    const always = share(() => true);
    // Приём «цвет одного поля» здесь не работает: он и есть то, чем брали бы
    // однопольный вопрос. Если бы блок спрашивал про одно поле, доля стала бы 1.
    expect(`первое ${byFirst > 0.42 && byFirst < 0.58} · второе ${bySecond > 0.42 && bySecond < 0.58} · всегда да ${always > 0.42 && always < 0.58}`)
      .toBe('первое true · второе true · всегда да true');
  });

  it('🔴 доля ответов «да» в блоке — ровно половина', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const random = seeded(seed * 131);
      const picked = positionForLevel(2, random);
      const state = openBlock(picked.position, 0, 2, random);
      const yes = state.questions.filter((q) => q.answer).length;
      expect(`зерно ${seed}: да ${yes} из ${state.questions.length}`)
        .toBe(`зерно ${seed}: да ${QUESTIONS_PER_BLOCK / 2} из ${QUESTIONS_PER_BLOCK}`);
    }
  });

  it('подпись вопроса называет ОБА поля', () => {
    const strings = getChessBlindStrings('ru');
    const random = seeded(1234);
    const picked = positionForLevel(2, random);
    const state = openBlock(picked.position, 0, 2, random);
    for (const q of state.questions) {
      if (q.kind !== 'square') continue;
      const text = questionText(strings, q);
      expect(text).toContain(squareName(q.a));
      expect(text).toContain(squareName(q.b));
    }
  });
});

/* ── F. Блок «конь»: двоичный вопрос, маршрут по пустой доске ───────────────── */

describe('блок «конь»: маршрут по ПУСТОЙ доске и двоичный ответ', () => {
  it('🔴 расстояние сходится с НЕЗАВИСИМЫМ обходом на всех 4096 парах', () => {
    const bad: string[] = [];
    for (let from = 0; from < BOARD_SQUARES; from += 1) {
      const mine = distancesByName(squareName(from));
      for (let to = 0; to < BOARD_SQUARES; to += 1) {
        if (knightDistance(from, to) !== mine.get(squareName(to))) {
          bad.push(`${squareName(from)}→${squareName(to)}: игра ${knightDistance(from, to)}, обход ${mine.get(squareName(to))}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(knightDistance(squareIndex('a1'), squareIndex('h8'))).toBe(6);
    expect(knightDistance(squareIndex('b1'), squareIndex('c3'))).toBe(1);
  });

  it('🔴 маршрут и правда маршрут: каждый шаг — ход коня, длина равна расстоянию', () => {
    const bad: string[] = [];
    for (let from = 0; from < BOARD_SQUARES; from += 3) {
      for (let to = 0; to < BOARD_SQUARES; to += 5) {
        if (from === to) continue;
        const path = knightPath(from, to);
        if (path.length !== distanceByName(from, to) + 1) bad.push(`${squareName(from)}→${squareName(to)}: длина ${path.length}`);
        if (path[0] !== from || path[path.length - 1] !== to) bad.push(`${squareName(from)}→${squareName(to)}: концы не те`);
        for (let i = 1; i < path.length; i += 1) {
          if (distanceByName(path[i - 1], path[i]) !== 1) bad.push(`${squareName(path[i - 1])}→${squareName(path[i])}: не ход коня`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 чётность расстояния = цвет полей — вот почему неверный ответ даётся через N+2', () => {
    const bad: string[] = [];
    for (let from = 0; from < BOARD_SQUARES; from += 1) {
      for (let to = 0; to < BOARD_SQUARES; to += 1) {
        const even = distanceByName(from, to) % 2 === 0;
        if (even !== sameSquareColor(from, to)) bad.push(`${squareName(from)}→${squareName(to)}`);
      }
    }
    expect(bad).toEqual([]);
    expect(KNIGHT_WRONG_GAP % 2).toBe(0);
  });

  it('🔴 подсказки по цвету в блоке нет: решатель «по цвету» получает ровно половину', () => {
    const questions = knightQuestions(60);
    const byColour = questions.filter((q) => sameSquareColor(q.from, q.to) === q.answer).length / questions.length;
    // Верные и неверные пары одного цвета — значит цвет об ответе не говорит НИЧЕГО.
    expect(`цветом угадывается ${byColour > 0.42 && byColour < 0.58}`).toBe('цветом угадывается true');
  });

  function knightQuestions(runs: number, level = 2): KnightQuestion[] {
    const out: KnightQuestion[] = [];
    for (let seed = 1; seed <= runs; seed += 1) {
      const random = seeded(seed * 3571 + level);
      const picked = positionForLevel(level, random);
      let state = openBlock(picked.position, 0, level, random);
      state = nextBlock(state, random);
      for (const q of state.questions) if (q.kind === 'knight') out.push(q);
    }
    return out;
  }

  it('🔴 «да» — ровно N ходов, «нет» — ровно N+2, и обе доли по половине', () => {
    for (const level of [1, 3, 5]) {
      const questions = knightQuestions(30, level);
      expect(questions.length).toBe(30 * QUESTIONS_PER_BLOCK);
      const bad: string[] = [];
      for (const q of questions) {
        const truth = distanceByName(q.from, q.to);
        if (q.distance !== truth) bad.push(`${squareName(q.from)}→${squareName(q.to)}: заявлено ${q.distance}, на деле ${truth}`);
        if (q.answer !== (truth <= q.moves)) bad.push(`${squareName(q.from)}→${squareName(q.to)}: ответ ${q.answer} при ${truth} ходах за ${q.moves}`);
        if (q.answer && truth !== q.moves) bad.push(`«да» на расстоянии ${truth}, а спрошено ${q.moves}`);
        if (!q.answer && truth !== q.moves + KNIGHT_WRONG_GAP) bad.push(`«нет» на расстоянии ${truth}, а спрошено ${q.moves}`);
        if (q.moves < 2 || q.moves > 3) bad.push(`спрошено ${q.moves} ходов — вне 2…3`);
      }
      expect(`уровень ${level}: ${bad.slice(0, 3).join(' | ')}`).toBe(`уровень ${level}: `);
      const yes = questions.filter((q) => q.answer).length / questions.length;
      expect(`уровень ${level}: половина да — ${Math.abs(yes - 0.5) < 0.001}`).toBe(`уровень ${level}: половина да — true`);
    }
  });

  it('🔴 маршрут НЕ ЗАВИСИТ от фигур: те же вопросы на пустой и на густой доске', () => {
    const bare = positionFromFen('8/8/8/8/8/8/8/K6k w - - 0 1');
    const dense = positionForLevel(5, seeded(31)).position;
    expect(pieceCount(dense)).toBeGreaterThan(pieceCount(bare) + 20);
    const onBare = openBlock(bare, 1, 5, seeded(555)).questions;
    const onDense = openBlock(dense, 1, 5, seeded(555)).questions;
    expect(onBare.length).toBe(QUESTIONS_PER_BLOCK);
    expect(onDense.map((q) => JSON.stringify(q))).toEqual(onBare.map((q) => JSON.stringify(q)));
  });

  it('🔴 и это не пустая победа: фигуры и правда стоят на КАЖДОМ кратчайшем маршруте', () => {
    let blockedQuestions = 0;
    let checked = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const random = seeded(seed * 613);
      const picked = positionForLevel(5, random);
      const state = openBlock(picked.position, 1, 5, random);
      for (const q of state.questions) {
        if (q.kind !== 'knight') continue;
        checked += 1;
        if (allShortestRoutesBlocked(picked.position, q)) blockedQuestions += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Если бы маршрут считался с учётом фигур, эти вопросы были бы ДРУГИМИ.
    expect(`перекрытых маршрутов ${blockedQuestions > 0}`).toBe('перекрытых маршрутов true');
  });

  /** Все ли кратчайшие маршруты проходят через занятые клетки. Обход свой. */
  function allShortestRoutesBlocked(position: ChessPosition, q: KnightQuestion): boolean {
    const total = distanceByName(q.from, q.to);
    const fromStart = distancesByName(squareName(q.from));
    const fromEnd = distancesByName(squareName(q.to));
    for (let mid = 0; mid < BOARD_SQUARES; mid += 1) {
      if (mid === q.from || mid === q.to) continue;
      const a = fromStart.get(squareName(mid)) as number;
      const b = fromEnd.get(squareName(mid)) as number;
      if (a + b !== total) continue;             // не на кратчайшем маршруте
      if (!position.squares[mid]) return false;  // нашлась свободная промежуточная
    }
    return total > 1;
  }

  it('разбор после ответа считает то же самое', () => {
    const questions = knightQuestions(5);
    for (const q of questions) {
      const truth = knightTruth(q);
      expect(truth.distance).toBe(distanceByName(q.from, q.to));
      expect(truth.reachable).toBe(q.answer);
    }
  });

  it('потолок N = 3 обоснован числом пар, а не вкусом', () => {
    expect(pairsAtDistanceCount(6)).toBe(4);
    expect(pairsAtDistanceCount(5)).toBeGreaterThan(100);
    for (let level = 1; level <= chessMaxLevel(); level += 1) {
      expect(knightMovesForLevel(level)).toBeGreaterThanOrEqual(2);
      expect(knightMovesForLevel(level)).toBeLessThanOrEqual(3);
    }
    expect(knightMovesForLevel(1)).toBe(2);
    expect(knightMovesForLevel(chessMaxLevel())).toBe(3);
  });
});

/* ── G. Блок «память»: утверждение про поле ────────────────────────────────── */

describe('блок «память» спрашивает про то, что стояло на поле', () => {
  function recallRun(level: number, seed: number): { position: ChessPosition; questions: RecallQuestion[] } {
    const random = seeded(seed);
    const picked = positionForLevel(level, random);
    let state = openBlock(picked.position, 0, level, random);
    state = nextBlock(state, random);
    state = nextBlock(state, random);
    return {
      position: picked.position,
      questions: state.questions.filter((q): q is RecallQuestion => q.kind === 'recall'),
    };
  }

  it('🔴 истина вопроса взята с ТОЙ ЖЕ доски, а ответ — сверка утверждения с ней', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const { position, questions } = recallRun(4, seed * 271);
      expect(questions.length).toBe(QUESTIONS_PER_BLOCK);
      for (const q of questions) {
        const onBoard = position.squares[q.square] ?? null;
        if (!samePiece(q.truth, onBoard)) bad.push(`${squareName(q.square)}: истина не с доски`);
        if (q.answer !== samePiece(q.claim, q.truth)) bad.push(`${squareName(q.square)}: ответ не сходится с утверждением`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 утверждение ПРАВДОПОДОБНО: названа фигура, которая на доске есть', () => {
    const bad: string[] = [];
    let checked = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { position, questions } = recallRun(3, seed * 353);
      const onBoard = new Set(position.squares.filter(Boolean).map((p) => `${p?.color}${p?.type}`));
      for (const q of questions) {
        checked += 1;
        const code = `${q.claim.color}${q.claim.type}`;
        if (!onBoard.has(code)) bad.push(`${squareName(q.square)}: названа ${code}, которой на доске нет`);
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBe(40 * QUESTIONS_PER_BLOCK);
  });

  /**
   * 🔴 «ПУСТО» УТВЕРЖДЕНИЕМ НЕ БЫВАЕТ. На доске из 20 фигур пусто 44 клетки из
   * 64: утверждение «здесь было пусто» верно почти всегда, и отвечать на него
   * выгоднее «да», ничего не вспоминая. Одна такая подсказка обнуляет блок.
   */
  it('🔴 утверждение — всегда фигура, а не «пусто»', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const q of recallRun(3, seed * 619).questions) {
        if (!q.claim) bad.push(`${squareName(q.square)}: утверждением стало «пусто»`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 НИ НОМЕР ВОПРОСА, НИ НАЗВАННАЯ ФИГУРА НЕ ПОДСКАЗЫВАЮТ ОТВЕТ. Правило вроде
   * «каждый второй вопрос про пустое поле» замечают за один прогон, и дальше блок
   * мерит наблюдательность, а не память.
   */
  it('🔴 решатель по номеру вопроса и решатель по названной фигуре — на уровне угадывания', () => {
    const byIndex: { yes: number; total: number }[] = Array.from(
      { length: QUESTIONS_PER_BLOCK },
      () => ({ yes: 0, total: 0 }),
    );
    const byPiece = new Map<string, { yes: number; total: number }>();
    for (let seed = 1; seed <= 200; seed += 1) {
      recallRun(3, seed * 1013).questions.forEach((q, i) => {
        byIndex[i].total += 1;
        if (q.answer) byIndex[i].yes += 1;
        const code = `${q.claim.color}${q.claim.type}`;
        const seen = byPiece.get(code) ?? { yes: 0, total: 0 };
        seen.total += 1;
        if (q.answer) seen.yes += 1;
        byPiece.set(code, seen);
      });
    }
    const skewedIndex = byIndex.filter((b) => Math.abs(b.yes / b.total - 0.5) > 0.12);
    const skewedPiece = [...byPiece.values()].filter((b) => b.total > 60 && Math.abs(b.yes / b.total - 0.5) > 0.2);
    expect(byIndex[0].total).toBe(200);
    expect(`перекошено по номеру ${skewedIndex.length} · по фигуре ${skewedPiece.length}`)
      .toBe('перекошено по номеру 0 · по фигуре 0');
  });

  it('🔴 самая бедная полоса (4 фигуры) всё равно даёт полный блок с половиной «да»', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { position, questions } = recallRun(1, seed * 733);
      expect(`зерно ${seed}: фигур ${pieceCount(position) >= 4} · вопросов ${questions.length} · да ${questions.filter((q) => q.answer).length}`)
        .toBe(`зерно ${seed}: фигур true · вопросов ${QUESTIONS_PER_BLOCK} · да ${QUESTIONS_PER_BLOCK / 2}`);
    }
  });

  it('🔴 доля «да» — половина, и поля в блоке не повторяются', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { questions } = recallRun(2, seed * 97);
      const yes = questions.filter((q) => q.answer).length;
      const squares = new Set(questions.map((q) => q.square));
      expect(`зерно ${seed}: да ${yes} · полей ${squares.size}`)
        .toBe(`зерно ${seed}: да ${QUESTIONS_PER_BLOCK / 2} · полей ${QUESTIONS_PER_BLOCK}`);
    }
  });

  it('спрашивают и про занятые поля, и про пустые', () => {
    let occupied = 0;
    let empty = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const q of recallRun(3, seed * 811).questions) {
        if (q.truth) occupied += 1; else empty += 1;
      }
    }
    expect(`занятых ${occupied > 20} · пустых ${empty > 20}`).toBe('занятых true · пустых true');
  });

  it('утверждение подписывается фигурным знаком, а пустое поле в разборе — словом', () => {
    const strings = getChessBlindStrings('ja');
    const { questions } = recallRun(4, 1717);
    let emptyTruths = 0;
    for (const q of questions) {
      expect(claimLabel(strings, q.claim)).toBe(pieceGlyph(q.claim));
      expect(questionText(strings, q)).toContain(squareName(q.square));
      if (!q.truth) {
        emptyTruths += 1;
        expect(truthLabel(strings, q)).toBe(strings.emptySquare);
      } else {
        expect(truthLabel(strings, q)).toBe(pieceGlyph(q.truth));
      }
    }
    expect(emptyTruths).toBeGreaterThan(0);
  });
});

/* ── H. Ответы, ошибки, конец блока ────────────────────────────────────────── */

describe('ответ — одно касание, одинаково во всех трёх блоках', () => {
  it('верный ответ двигает вперёд, неверный считается ошибкой', () => {
    const random = seeded(505);
    const picked = positionForLevel(2, random);
    let state = openBlock(picked.position, 0, 2, random);
    const first = answerQuestion(state, state.questions[0].answer);
    expect(first.result).toBe('hit');
    expect(first.state.step).toBe(1);
    expect(first.state.errors).toBe(0);
    const second = answerQuestion(first.state, !first.state.questions[1].answer);
    expect(second.result).toBe('miss');
    expect(second.state.step).toBe(2);
    expect(second.state.errors).toBe(1);
    state = second.state;
    while (!blockDone(state)) state = answerQuestion(state, state.questions[state.step].answer).state;
    expect(blockDone(state)).toBe(true);
    expect(answerQuestion(state, true).result).toBe('ignored');
  });

  it('кнопки ответа одни и те же во всех блоках', () => {
    const strings = getChessBlindStrings('ru');
    const labels = answerLabels(strings);
    expect(labels).toEqual({ yes: strings.answerYes, no: strings.answerNo });
    expect(labels.yes).not.toBe(labels.no);
  });
});

/* ── I. Серия пишет ОДНУ сессию; прерванная не даёт разностей ───────────────── */

describe('серия пишет одну сессию, и разности берутся только с полной', () => {
  it('🔴 полная серия: одна сессия, три блока внутри, обе разности на месте', () => {
    const { run } = playWholeSeries(3, 8080);
    const session = seriesSession(run);
    const details = session.details as Record<string, unknown>;
    expect(session.game_type).toBe('chess_blind');
    expect(details.series_complete).toBe(true);
    expect((details.blocks as unknown[]).length).toBe(3);
    expect(session.time_seconds).toBeCloseTo((1000 + 1400 + 1800) / 1000, 6);
    const diffs = details.diffs as Record<string, number>;
    expect(diffs).toEqual({ knight_minus_square: 400, recall_minus_square: 800 });
    expect(session.mode).toBe('series-l3');
  });

  it('🔴 прерванная серия: блоки записаны, ключа разностей НЕТ ВОВСЕ', () => {
    let run = startSeries('chess_blind', 3, CHESS_SERIES_PLAN, 0);
    run = recordBlock(run, block('square', 1000));
    run = recordBlock(run, block('knight', 1400, 0, false));
    const session = seriesSession(run);
    const details = session.details as Record<string, unknown>;
    expect(seriesDiffs(run)).toBeNull();
    expect(details.series_complete).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(details, 'diffs')).toBe(false);
    expect(session.score).toBe(0);
    expect((details.blocks as unknown[]).length).toBe(2);
  });

  it('разбор серии говорит то же самое словами', () => {
    const strings = getChessBlindStrings('ru');
    const { run } = playWholeSeries(3, 8080);
    const recap = seriesRecap(strings, run);
    expect(recap.note).toBeNull();
    expect(recap.rows.map((r) => r.key)).toEqual(['square', 'knight', 'recall']);
    expect(recap.rows.map((r) => r.ms)).toEqual([1000, 400, 800]);
    expect(recap.rows.map((r) => r.label)).toEqual([strings.coordSpeed, strings.knightCost, strings.holdCost]);

    let broken = startSeries('chess_blind', 3, CHESS_SERIES_PLAN, 0);
    broken = recordBlock(broken, block('square', 1000));
    const half = seriesRecap(strings, broken);
    expect(half.rows).toEqual([]);
    expect(half.note).toBe(strings.notFinished);
  });
});

/* ── J. Уровень двигается устойчивостью, а не одной удачей ──────────────────── */

describe('уровень растёт только от устойчивости всех трёх блоков', () => {
  it('одной чистой серии мало, двух хватает', () => {
    const { run } = playWholeSeries(2, 4004);
    let progress = EMPTY_CHESS_PROGRESS;
    const first = afterSeriesRun(progress, run);
    expect(first.raised).toBe(false);
    expect(first.runsLeft).toBe(STABLE_RUNS - 1);
    progress = first.progress;
    const second = afterSeriesRun(progress, run);
    expect(`подряд ${STABLE_RUNS}: вырос ${second.raised}`).toBe(`подряд ${STABLE_RUNS}: вырос true`);
    expect(second.nextLevel).toBe(run.level + 1);
    expect(second.band).toEqual(bandForLevel(run.level + 1));
  });

  it('🔴 прерванная серия не двигает ничего', () => {
    let broken = startSeries('chess_blind', 2, CHESS_SERIES_PLAN, 0);
    broken = recordBlock(broken, block('square', 1000));
    const outcome = afterSeriesRun(EMPTY_CHESS_PROGRESS, broken);
    expect(outcome.raised).toBe(false);
    expect(outcome.progress).toBe(EMPTY_CHESS_PROGRESS);
  });

  it('грязный блок держит уровень: ошибок больше допуска — блок не взят', () => {
    expect(blockTaken(block('square', 1000, CHESS_BLOCK_MAX_ERRORS))).toBe(true);
    expect(blockTaken(block('square', 1000, CHESS_BLOCK_MAX_ERRORS + 1))).toBe(false);
    expect(blockTaken(block('square', 1000, 0, false))).toBe(false);
  });

  it('вход в серию берёт минимум по блокам и показывает прежние уровни', () => {
    const progress = { levels: { square: 4, knight: 2, recall: 5 }, streaks: { square: 0, knight: 0, recall: 0 } };
    const entry = seriesEntry(progress);
    expect(entry.level).toBe(2);
    expect(entry.band).toEqual(bandForLevel(2));
    expect(entry.perBlock).toEqual({ square: 4, knight: 2, recall: 5 });
  });
});

/* ── K. Подписи: словарь и правда используется партией ─────────────────────── */

describe('подписи собираются ядром и называют то, что происходит', () => {
  it('шапка и врезка блока называют номер, правило и «позиция та же»', () => {
    const strings = getChessBlindStrings('ru');
    const random = seeded(606);
    const picked = positionForLevel(5, random);
    const first = openBlock(picked.position, 0, 5, random);
    const second = nextBlock(first, random);
    expect(blockHeader(strings, first).counter).toBe('Блок 1 из 3');
    expect(blockHeader(strings, second).title).toBe(strings.blockKnight);
    expect(blockHeader(strings, second).rule).toContain(String(knightMovesForLevel(5)));
    const interlude = blockInterlude(strings, second);
    expect(interlude.same).toBe(strings.samePosition);
    expect(interlude.heading).toBe(strings.ruleChanges);
    expect(memorizeLine(strings)).toBe(strings.memorize);
  });

  it('вход и разбор уровня подставляют полосу, а не выдуманное число', () => {
    const strings = getChessBlindStrings('en');
    const band = bandForLevel(3);
    const intro = seriesIntro(strings, band, { square: 3, knight: 3, recall: 3 });
    expect(intro.startsAt).toContain(String(band.min));
    expect(intro.startsAt).toContain(String(band.max));
    expect(intro.entry).toBe(strings.entry);
    const held = levelMoveLine(strings, { raised: false, band, weakest: 'recall', runsLeft: 2 });
    expect(held).toContain('2');
    expect(levelMoveLine(strings, { raised: true, band, weakest: 'square', runsLeft: 0 })).toContain(String(band.max));
  });

  it('происхождение позиции подписывается игроками и годом', () => {
    const strings = getChessBlindStrings('ru');
    const game = CHESS_GAMES[0];
    const caption = positionCaption(strings, { white: game.white, black: game.black, year: game.year, ply: 30 });
    expect(caption).toContain(game.white);
    expect(caption).toContain(String(game.year));
    expect(caption).toContain('15');
  });

  it('словарь знает все двенадцать языков', () => {
    expect(CHESS_BLIND_LOCALES.length).toBe(12);
    for (const locale of CHESS_BLIND_LOCALES) {
      expect(getChessBlindStrings(locale).blockKnight.length).toBeGreaterThan(0);
    }
  });
});
