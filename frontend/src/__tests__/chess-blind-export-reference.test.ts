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
import {
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

  const reference = {
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
