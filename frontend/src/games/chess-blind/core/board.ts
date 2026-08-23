/* psygames-chess-blind-board · VER 1 · 23.08.2026 */
/**
 * ДОСКА В НАШЕМ ВИДЕ — ТОНКАЯ ОБЁРТКА НАД `chess.js`, А НЕ СВОЙ ДВИЖОК.
 *
 * Разбор нотации и генерация допустимых ходов — решённая задача: «Nf3» не
 * говорит, КАКОЙ конь идёт, и снять неоднозначность без полного перебора ходов
 * нельзя. Писать это заново значит изобретать велосипед, поэтому счета
 * разыгрывает `chess.js` (BSD-2-Clause), а здесь ровно одно: перевод её ответа в
 * НАШИ типы и НАШУ нумерацию полей.
 *
 * 🔴 ЗАЧЕМ ВООБЩЕ ОБЁРТКА, ЕСЛИ БИБЛИОТЕКА УЖЕ ВСЁ УМЕЕТ. Чтобы экран, блоки и
 * пробы не знали чужого API. Свой порядок полей у библиотеки другой: `board()`
 * отдаёт строки сверху вниз, первая строка — восьмая горизонталь. Наш индекс
 * считается снизу вверх (0 = a1, 63 = h8), потому что так же считает конь в
 * `knight.ts` и так же кладётся сетка на экране. Один перевод координат в одном
 * месте — и ошибка в нём ловится одной пробой; двадцать переводов по экрану
 * ловятся жалобой пользователя.
 *
 * ⚠️ РАСКЛАДКА ОТДАЁТСЯ ВМЕСТЕ С FEN, И ЭТО НЕ ИЗБЫТОЧНОСТЬ. FEN — независимая
 * запись той же позиции, сделанная ЧУЖИМ кодом. Проба разбирает её сама и
 * сверяет с нашими 64 клетками поштучно: перевёрнутая по вертикали доска
 * содержит ровно столько же фигур и выглядит совершенно нормально, а ошибка в
 * переводе координат — самая вероятная из возможных здесь.
 *
 * ⚠️ ФИГУРЫ ПОДПИСЫВАЮТСЯ ЗНАКОМ, А НЕ СЛОВОМ. `pieceGlyph` отдаёт фигурный
 * символ (♞), одинаковый во всех двенадцати языках. Двенадцать переводов слова
 * «конь» — двенадцать возможностей ошибиться там, где переводить нечего.
 */
import { Chess } from 'chess.js';

export type ChessPieceColor = 'w' | 'b';
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface ChessPiece {
  readonly color: ChessPieceColor;
  readonly type: ChessPieceType;
}

export const BOARD_SIDE = 8;
export const BOARD_SQUARES = BOARD_SIDE * BOARD_SIDE;

const FILES = 'abcdefgh';

/** Файл поля: 0 = a … 7 = h. */
export function fileOf(index: number): number {
  return index % BOARD_SIDE;
}

/** Горизонталь поля: 0 = первая … 7 = восьмая. */
export function rankOf(index: number): number {
  return Math.floor(index / BOARD_SIDE);
}

/** Имя поля по индексу: 0 → «a1», 63 → «h8». */
export function squareName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SQUARES) {
    throw new Error(`Нет такого поля: ${index}`);
  }
  return `${FILES[fileOf(index)]}${rankOf(index) + 1}`;
}

/** Индекс поля по имени: «a1» → 0, «h8» → 63. */
export function squareIndex(name: string): number {
  const file = FILES.indexOf(name[0]);
  const rank = Number(name[1]) - 1;
  if (file < 0 || !Number.isInteger(rank) || rank < 0 || rank >= BOARD_SIDE || name.length !== 2) {
    throw new Error(`Нет такого поля: ${name}`);
  }
  return rank * BOARD_SIDE + file;
}

/**
 * Светлое ли поле. a1 тёмное — отсюда и знак: сумма координат ЧЁТНАЯ у тёмных.
 * Это и есть тот самый приём, которым цвет ОДНОГО поля берётся за секунду; ровно
 * поэтому блок «поле» спрашивает про ОТНОШЕНИЕ двух полей, а не про одно.
 */
export function isLightSquare(index: number): boolean {
  return (fileOf(index) + rankOf(index)) % 2 === 1;
}

export function sameSquareColor(a: number, b: number): boolean {
  return isLightSquare(a) === isLightSquare(b);
}

/** Позиция партии на конкретном полуходе. `squares` — 64 клетки, 0 = a1. */
export interface ChessPosition {
  readonly squares: readonly (ChessPiece | null)[];
  /** Сколько полуходов сыграно от начальной расстановки. */
  readonly ply: number;
  /** Та же позиция чужой записью — для независимой сверки. */
  readonly fen: string;
  /** Ход, приведший сюда, в нотации партии. У начальной расстановки — null. */
  readonly lastMove: string | null;
  readonly checkmate: boolean;
}

export function pieceAt(position: ChessPosition, index: number): ChessPiece | null {
  return position.squares[index] ?? null;
}

/** Сколько фигур на доске. Считается ПО ДОСКЕ, а не по номеру полухода. */
export function pieceCount(position: ChessPosition): number {
  return position.squares.reduce<number>((n, cell) => (cell ? n + 1 : n), 0);
}

export function occupiedSquares(position: ChessPosition): number[] {
  const out: number[] = [];
  for (let i = 0; i < BOARD_SQUARES; i += 1) if (position.squares[i]) out.push(i);
  return out;
}

export function emptySquares(position: ChessPosition): number[] {
  const out: number[] = [];
  for (let i = 0; i < BOARD_SQUARES; i += 1) if (!position.squares[i]) out.push(i);
  return out;
}

const GLYPHS: Record<ChessPieceColor, Record<ChessPieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

/** Фигурный символ. Язык здесь ни при чём: знак один во всех двенадцати. */
export function pieceGlyph(piece: ChessPiece): string {
  return GLYPHS[piece.color][piece.type];
}

export function samePiece(a: ChessPiece | null, b: ChessPiece | null): boolean {
  if (!a || !b) return a === b || (!a && !b);
  return a.color === b.color && a.type === b.type;
}

function snapshot(game: Chess, ply: number, lastMove: string | null): ChessPosition {
  const squares: (ChessPiece | null)[] = new Array<ChessPiece | null>(BOARD_SQUARES).fill(null);
  const rows = game.board();
  // rows[0] — ВОСЬМАЯ горизонталь: у библиотеки доска считается сверху вниз.
  for (let row = 0; row < BOARD_SIDE; row += 1) {
    for (let col = 0; col < BOARD_SIDE; col += 1) {
      const cell = rows[row][col];
      if (!cell) continue;
      squares[(BOARD_SIDE - 1 - row) * BOARD_SIDE + col] = { color: cell.color, type: cell.type };
    }
  }
  return { squares, ply, fen: game.fen(), lastMove, checkmate: game.isCheckmate() };
}

/**
 * Позиция из строки FEN. Разбор строки — чужой, ПЕРЕВОД КООРДИНАТ — наш, и
 * именно он здесь опасен: у библиотеки доска считается сверху вниз, у нас снизу
 * вверх. Перевёрнутая доска содержит ровно столько же фигур и выглядит совершенно
 * нормально, поэтому ловится она только обратной сборкой строки (`boardFen`).
 */
export function positionFromFen(fen: string): ChessPosition {
  return snapshot(new Chess(fen), 0, null);
}

/**
 * Обратная сборка: наши 64 клетки → расстановочное поле FEN. Нужна ровно затем,
 * чтобы сверить перевод координат ПОСИМВОЛЬНО с той строкой, из которой позиция
 * пришла. Совпало число фигур — не доказательство; совпала строка — доказательство.
 */
export function boardFen(position: ChessPosition): string {
  const rows: string[] = [];
  for (let rank = BOARD_SIDE - 1; rank >= 0; rank -= 1) {
    let row = '';
    let gap = 0;
    for (let file = 0; file < BOARD_SIDE; file += 1) {
      const piece = position.squares[rank * BOARD_SIDE + file];
      if (!piece) {
        gap += 1;
        continue;
      }
      if (gap > 0) {
        row += String(gap);
        gap = 0;
      }
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (gap > 0) row += String(gap);
    rows.push(row);
  }
  return rows.join('/');
}

/** Ходы партии в нотации — по одному на полуход. Неоднозначность снимает библиотека. */
export function gameMoves(pgn: string): string[] {
  const game = new Chess();
  game.loadPgn(pgn);
  return game.history();
}

/**
 * Партия, разыгранная по полуходам: `[0]` — начальная расстановка, `[n]` —
 * позиция ПОСЛЕ n-го полухода. Один прогон на всю партию: `positions.ts` ищет по
 * этому списку полуход с нужным числом фигур, и перезапускать разбор на каждый
 * запрос незачем.
 */
export function replayGame(pgn: string): ChessPosition[] {
  const moves = gameMoves(pgn);
  const game = new Chess();
  const out: ChessPosition[] = [snapshot(game, 0, null)];
  moves.forEach((san, i) => {
    const done = game.move(san);
    if (!done) throw new Error(`Ход не разыгрался: ${san}`);
    out.push(snapshot(game, i + 1, san));
  });
  return out;
}

/** Итог партии: сколько полуходов, чем кончилась и мат ли это. */
export function gameOutcome(pgn: string): {
  plies: number;
  lastMove: string;
  checkmate: boolean;
  position: ChessPosition;
} {
  const line = replayGame(pgn);
  const final = line[line.length - 1];
  return {
    plies: line.length - 1,
    lastMove: final.lastMove ?? '',
    checkmate: final.checkmate,
    position: final,
  };
}
