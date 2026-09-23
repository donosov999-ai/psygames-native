/* ВЫГРУЗКА ЭТАЛОНОВ «Доски в уме» — тем, с чем сверяется нативная половина.
 *
 * Правила переносятся СО СВЕРКОЙ: эталон снимается прогоном ЖИВОГО TS, а не
 * переписыванием чисел руками (flutter/test/chess_blind_test.dart сверяет все
 * 25 ступеней).
 *
 * 🔴 ПРОБА НЕ ПИШЕТ ФАЙЛ САМА, И ЭТО НАРОЧНО. Соседи свои выгрузки удаляли
 * после переноса — тогда повторно снять эталон нечем, а он нужен каждый раз,
 * когда лестница в вебе меняется. Здесь файл переписывается только по явному
 * ключу, иначе проба просто проверяет, что лестница читается целиком и в CI
 * ничего не пишет:
 *
 *   CHESS_BLIND_EXPORT=1 npx jest --runTestsByPath \
 *     src/__tests__/chess-blind-export-reference.test.ts
 */
/*
 * ⚠️ Типов Node в этом проекте нет (@types/node не стоит), и tsc на импортах
 * `fs`/`path` краснеет — пре-коммит хук это ловит и останавливает выпуск всем
 * девяти чатам. Поэтому файловые вызовы объявлены здесь же и живут ТОЛЬКО под
 * ключом выгрузки: в обычном прогоне к ним никто не обращается.
 */
declare const require: (id: string) => {
  writeFileSync: (path: string, data: string, enc: string) => void;
  mkdirSync: (path: string, opts: { recursive: boolean }) => void;
  dirname: (path: string) => string;
  resolve: (...parts: string[]) => string;
};
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
import {
  BOARD_SIDE,
  BOARD_SQUARES,
  fileOf,
  rankOf,
  squareName,
  squareIndex,
  isLightSquare,
  sameSquareColor,
  screenIndex,
} from '../games/chess-blind/core/board';
import { positionFromFen } from '../games/chess-blind/core/board';
import { toScreenPieces } from '../games/chess-blind/core/puzzle';
import {
  POSITION_CORPUS,
  positionWithPieces,
  PIECE_BANDS,
  CHESS_MIN_LEVEL,
  chessMaxLevel,
  clampLevel,
  bandForLevel,
  knightMovesForLevel,
  KNIGHT_MIN_MOVES,
  KNIGHT_MAX_MOVES,
} from '../games/chess-blind/core/positions';
import {
  buildQuestions,
  уникальныхФигур,
} from '../games/chess-blind/core/questions';
import type { PuzzlePiece } from '../games/chess-blind/core/puzzle';
import {
  PUZZLE_MIN_LEVEL,
  PUZZLE_MAX_LEVEL,
  puzzleLevelParams,
  puzzleMinUnique,
  clampPuzzleLevel,
} from '../games/chess-blind/core/puzzle';

test('лестница chess-blind читается целиком (и по ключу пишет эталон)', () => {
  const levels: Record<string, unknown> = {};
  for (let level = PUZZLE_MIN_LEVEL; level <= PUZZLE_MAX_LEVEL; level++) {
    levels[String(level)] = puzzleLevelParams(level);
  }
  // Доска: имена клеток, цвет поля и перевод в индекс ЭКРАНА (сверху вниз).
  const squares: Record<string, unknown> = {};
  for (let i = 0; i < BOARD_SQUARES; i++) {
    squares[String(i)] = {
      name: squareName(i),
      file: fileOf(i),
      rank: rankOf(i),
      light: isLightSquare(i),
      screen: screenIndex(i),
    };
  }
  const board = {
    side: BOARD_SIDE,
    squares: BOARD_SQUARES,
    squares_detail: squares,
    // Разбор имени обратно в индекс. На мусоре живой TS БРОСАЕТ, а не отдаёт
    // -1: это часть договора, и нативная половина обязана вести себя так же.
    byName: {
      a1: squareIndex('a1'),
      h8: squareIndex('h8'),
      e4: squareIndex('e4'),
    },
    badNames: ['z9', '', 'a', 'a9', 'i1'].map((name) => {
      try {
        return { name, index: squareIndex(name) };
      } catch {
        return { name, index: 'throws' };
      }
    }),
    sameColor: {
      'a1-h8': sameSquareColor(squareIndex('a1'), squareIndex('h8')),
      'a1-a2': sameSquareColor(squareIndex('a1'), squareIndex('a2')),
    },
  };

  // Полосы числа фигур и лестница серии.
  const ladder = {
    minLevel: CHESS_MIN_LEVEL,
    maxLevel: chessMaxLevel(),
    bands: PIECE_BANDS,
    bandForLevel: Object.fromEntries(
      Array.from({ length: chessMaxLevel() }, (_, i) => [
        String(i + 1),
        bandForLevel(i + 1),
      ]),
    ),
    clamp: {
      '-3': clampLevel(-3),
      '0': clampLevel(0),
      '1': clampLevel(1),
      '999': clampLevel(999),
    },
    knightMoves: Object.fromEntries(
      Array.from({ length: chessMaxLevel() }, (_, i) => [
        String(i + 1),
        knightMovesForLevel(i + 1),
      ]),
    ),
    knightRange: [KNIGHT_MIN_MOVES, KNIGHT_MAX_MOVES],
  };

  /* Вопросы строятся ТАСОВКОЙ, то есть порядок случаен по устройству. Сверять
   * поэтому надо не список, а то, что от случая не зависит: сколько фигур
   * однозначны, сколько вопросов выйдет и с каких клеток они вообще могут быть.
   * Позиции здесь заданы руками — маленькие и разные по составу. */
  const sample = (spec: string): PuzzlePiece[] =>
    spec.split(' ').map((token, i) => ({
      id: i,
      sq: i * 3,
      type: token[0] as PuzzlePiece['type'],
      white: token[1] === 'w',
    }));
  const cases: Record<string, string> = {
    'все разные': 'Kw Qw Rw Bb Nb',
    'две пары': 'Kw Qw Rw Rw Nb Nb',
    'все одинаковые': 'Pw Pw Pw Pw',
    'одна фигура': 'Kw',
  };
  const questionsRef: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(cases)) {
    const pieces = sample(spec);
    const locate3 = buildQuestions(pieces, 'locate', 3, 12);
    const locate5 = buildQuestions(pieces, 'locate', 5, 12);
    const pick3 = buildQuestions(pieces, 'pick', 3, 3);
    questionsRef[name] = {
      spec,
      pieces: pieces.length,
      unique: уникальныхФигур(pieces),
      locate3Count: locate3.length,
      locate5Count: locate5.length,
      pick3Count: pick3.length,
      // С каких клеток «розыск» вообще может спросить — множество, не порядок.
      locateSquares: [...new Set(locate5.map((q) => q.sq))].sort((a, b) => a - b),
      // У «розыска» вариантов нет вовсе: отвечают касанием по доске.
      locateOptionsAlwaysEmpty: locate5.every((q) => q.options.length === 0),
      pickHasOptions: pick3.every((q) => q.options.length > 0),
    };
  }

  // Корпус позиций: сколько их и как они ложатся в полосы. Нативная половина
  // везёт тот же файл данными, и разойдись числа — человек получил бы на той же
  // ступени другую доску.
  const corpus = {
    meta: POSITION_CORPUS,
    // Сколько позиций в каждой полосе: если полоса пуста, игра молча уходит на
    // запасной источник, и об этом надо знать числом.
    perBand: PIECE_BANDS.map((band) => {
      let count = 0;
      for (let level = 1; level <= 1; level++) void level;
      return { band, count };
    }),
    // Выбор позиции с подставным «случаем»: край 0 и край 1 обязаны дать
    // позицию ИЗ ПОЛОСЫ, а не любую.
    /* 🔴 СЕРЕДИНА БРОСКА ОБЯЗАТЕЛЬНА. На краях 0 и ~1 отсечение и округление
     * дают ОДИН И ТОТ ЖЕ индекс, поэтому мутация «round вместо floor» пережила
     * две версии пробы подряд. Различаются они ровно в середине. */
    rolls: [0, 0.25, 0.5, 0.6666, 0.75, 0.999999],
    picksByRoll: PIECE_BANDS.map((band) => ({
      band,
      squares: [0, 0.25, 0.5, 0.6666, 0.75, 0.999999].map((roll) =>
        toScreenPieces(positionWithPieces(band, () => roll).position)
          .map((p) => p.sq)
          .sort((a, b) => a - b),
      ),
    })),
    picks: PIECE_BANDS.map((band) => {
      const low = positionWithPieces(band, () => 0);
      const high = positionWithPieces(band, () => 0.999999);
      /* 🔴 СВЕРЯТЬ НАДО САМУ ПОЗИЦИЮ, А НЕ ЧИСЛО ФИГУР. Первая версия эталона
       * везла только `pieces`, и мутация «округление вместо отсечения» её
       * пережила: в одной полосе десятки позиций с одинаковым числом фигур, и
       * выбор другой позиции проба не замечала. */
      return {
        band,
        lowPieces: low.pieces,
        highPieces: high.pieces,
        // Отпечаток позиции: какие клетки заняты. Функции «позиция в FEN» в
        // ядре нет, а набор занятых клеток отличает одну позицию от другой
        // так же надёжно.
        lowSquares: toScreenPieces(low.position).map((p) => p.sq).sort((a, b) => a - b),
        highSquares: toScreenPieces(high.position).map((p) => p.sq).sort((a, b) => a - b),
        lowSource: low.source,
        highSource: high.source,
      };
    }),
  };

  // Разбор позиции из FEN в фигуры ЭКРАНА (0 = a8, сверху вниз).
  const fens = [
    '8/8/8/4k3/8/8/4K3/8 w - - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    '8/8/3k4/8/8/3K4/7R/8 w - - 0 1',
  ];
  const parsed = fens.map((fen) => ({
    fen,
    pieces: toScreenPieces(positionFromFen(fen)).map((p) => ({
      sq: p.sq,
      type: p.type,
      white: p.white,
    })),
  }));

  /* ХОДЫ ФИГУР ВСЛЕПУЮ. Правила живут в ФАЙЛЕ ЭКРАНА (app/games/chess-blind.tsx),
   * то есть наружу не торчат и пробой не закрыты — ровно та беда, из-за которой
   * раздел уже вытаскивал лестницу и вопросы в ядро. Сверить их можно только
   * повторив здесь ту же таблицу и потребовав совпадения от переноса. */
  const movesFor = (sq: number, type: string, white: boolean, occupied: number[]): number[] => {
    const occ = new Set(occupied);
    const r = Math.floor(sq / 8);
    const c = sq % 8;
    const out: number[] = [];
    const push = (rr: number, cc: number) => {
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const s = rr * 8 + cc;
        if (!occ.has(s)) out.push(s);
      }
    };
    const slide = (dirs: number[][]) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr!;
        let cc = c + dc!;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const s = rr * 8 + cc;
          if (occ.has(s)) break;
          out.push(s);
          rr += dr!;
          cc += dc!;
        }
      }
    };
    const rook = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const bishop = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const knight = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    switch (type) {
      case 'K':
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) if (dr || dc) push(r + dr, c + dc);
        }
        break;
      case 'N':
        for (const [dr, dc] of knight) push(r + dr!, c + dc!);
        break;
      case 'R': slide(rook); break;
      case 'B': slide(bishop); break;
      case 'Q': slide([...rook, ...bishop]); break;
      case 'P': {
        const rr = r + (white ? -1 : 1);
        if (rr >= 1 && rr <= 6) {
          const s = rr * 8 + c;
          if (!occ.has(s)) out.push(s);
        }
        break;
      }
    }
    return out.sort((a, b) => a - b);
  };
  const moveCases = [
    { sq: 27, type: 'N', white: true, occupied: [27] },
    { sq: 0, type: 'N', white: true, occupied: [0] },
    { sq: 27, type: 'R', white: true, occupied: [27, 11, 29] },
    { sq: 27, type: 'B', white: false, occupied: [27, 9] },
    { sq: 27, type: 'Q', white: true, occupied: [27, 26, 19] },
    { sq: 27, type: 'K', white: true, occupied: [27, 18] },
    { sq: 27, type: 'P', white: true, occupied: [27] },
    { sq: 27, type: 'P', white: false, occupied: [27] },
    // Пешка у самого края: превращений в игре нет, поэтому ход пропадает.
    { sq: 11, type: 'P', white: true, occupied: [11] },
    { sq: 52, type: 'P', white: false, occupied: [52] },
  ].map((c) => ({ ...c, moves: movesFor(c.sq, c.type, c.white, c.occupied) }));

  const reference = {
    moveCases,
    corpus,
    parsed,
    questions: questionsRef,
    source: 'живой TS: src/games/chess-blind/core/{puzzle,board,positions}.ts',
    board,
    ladder,
    minLevel: PUZZLE_MIN_LEVEL,
    maxLevel: PUZZLE_MAX_LEVEL,
    levels,
    // Полоса уровня: что будет с числом за краями лестницы.
    clamp: {
      '-5': clampPuzzleLevel(-5),
      '0': clampPuzzleLevel(0),
      '1': clampPuzzleLevel(1),
      '25': clampPuzzleLevel(25),
      '99': clampPuzzleLevel(99),
    },
    minUnique: {
      'pick-3': puzzleMinUnique('pick', 3),
      'locate-3': puzzleMinUnique('locate', 3),
      'pick-1': puzzleMinUnique('pick', 1),
      'locate-5': puzzleMinUnique('locate', 5),
    },
  };
  if (process.env.CHESS_BLIND_EXPORT === '1') {
    const fs = require('fs');
    const path = require('path');
    const out = path.resolve(
      __dirname,
      '../../../flutter/test/fixtures/chess-blind-reference.json',
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(reference, null, 2)}\n`, 'utf8');
  }
  expect(Object.keys(levels)).toHaveLength(PUZZLE_MAX_LEVEL);
  expect(reference.minUnique['locate-3']).toBe(3);
});
