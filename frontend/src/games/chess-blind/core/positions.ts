/* psygames-chess-blind-positions · VER 2 · 23.08.2026 */
/**
 * ОТКУДА БЕРЁТСЯ ПОЗИЦИЯ — И ЕДИНСТВЕННАЯ ДВЕРЬ ЗА НЕЙ.
 *
 * 🔴 ВСЁ ЯДРО ХОДИТ ЗА ПОЗИЦИЕЙ ТОЛЬКО ЧЕРЕЗ `positionWithPieces`. Снаружи не
 * знают и знать не должны, прочитана ли расстановка готовой строкой FEN или
 * разыграна из счёта партии: наружу уходят НАШИ координаты и НАШИ типы фигур.
 * Поэтому смена источника — правка одного этого файла, а не пересборка игры.
 *
 * ИСТОЧНИК ОСНОВНОЙ — выборка из базы задач Lichess (`../data/`, CC0, 2000
 * позиций по 400 на полосу). Живые партии, разные структуры, разные стадии.
 * ИСТОЧНИК ЗАПАСНОЙ — три партии XIX века (`./games.ts`): если полоса пуста,
 * позиция разыгрывается из счёта. Они же держат единственную сквозную проверку
 * нашей обёртки: партия, разыгранная нашим кодом, обязана дать ту же расстановку,
 * что и разбор её собственного FEN.
 *
 * 🔴 УРОВЕНЬ = ПОЛОСА ПО ЧИСЛУ ФИГУР, ОДНА НА ВСЕ ТРИ БЛОКА. Низкий уровень —
 * 4–8 фигур, высокий — 27–32. Число фигур нагружает и блок памяти, и работу с
 * доской, поэтому крутить два параметра по отдельности незачем.
 *
 * ⚠️ РЕЙТИНГ ЗАДАЧИ В УРОВЕНЬ НЕ ВХОДИТ. Рейтинг Lichess — это трудность ТАКТИЧЕСКОЙ
 * задачи, а мы задачу не решаем, мы позицию запоминаем. Он лежит в записи вторым
 * признаком на будущее и на сложность не влияет вовсе.
 *
 * ⚠️ ЧИСЛО ФИГУР БЕРЁТСЯ У ДОСКИ, А НЕ ИЗ ЗАПИСИ КОРПУСА И НЕ ИЗ НОМЕРА ХОДА.
 * Поле `pieces` в корпусе есть, но судья здесь `pieceCount` по 64 клеткам: иначе
 * ошибка в чужих данных молча стала бы нашим уровнем.
 */
import corpusFile from '../data/lichess-positions.json';
import { pieceCount, positionFromFen, replayGame, type ChessPosition } from './board';
import { CHESS_GAMES, type ChessGameRecord } from './games';

/** Полоса по числу фигур. Она же уровень серии. */
export interface PieceBand {
  readonly min: number;
  readonly max: number;
}

/** Полосы ровно те, по которым набран корпус: 400 позиций в каждой. */
export const PIECE_BANDS: readonly PieceBand[] = [
  { min: 4, max: 8 },
  { min: 9, max: 14 },
  { min: 15, max: 20 },
  { min: 21, max: 26 },
  { min: 27, max: 32 },
];

export const CHESS_MIN_LEVEL = 1;

export function chessMaxLevel(): number {
  return PIECE_BANDS.length;
}

export function clampLevel(level: number): number {
  const n = Math.round(Number.isFinite(level) ? level : CHESS_MIN_LEVEL);
  return Math.min(chessMaxLevel(), Math.max(CHESS_MIN_LEVEL, n));
}

export function bandForLevel(level: number): PieceBand {
  return PIECE_BANDS[clampLevel(level) - CHESS_MIN_LEVEL];
}

export const KNIGHT_MIN_MOVES = 2;
export const KNIGHT_MAX_MOVES = 3;

/**
 * Уровень → длина маршрута коня в блоке 2. Выше уровень — длиннее маршрут.
 * Потолок 3 не выдуман: неверный ответ строится расстоянием N + 2 (см. `knight.ts`),
 * а пар с расстоянием 6 на доске всего четыре.
 */
export function knightMovesForLevel(level: number): number {
  const half = Math.ceil(chessMaxLevel() / 2);
  return clampLevel(level) <= half ? KNIGHT_MIN_MOVES : KNIGHT_MAX_MOVES;
}

interface CorpusEntry {
  readonly fen: string;
  readonly rating: number;
  readonly pieces: number;
}

interface CorpusFile {
  readonly _source: string;
  readonly _license: string;
  readonly _method: string;
  readonly positions: readonly CorpusEntry[];
}

const CORPUS = corpusFile as CorpusFile;

/** Происхождение корпуса — для разбора и для проб. Читается, не переписывается. */
export const POSITION_CORPUS = {
  source: CORPUS._source,
  license: CORPUS._license,
  method: CORPUS._method,
  size: CORPUS.positions.length,
} as const;

export type PositionSource = 'lichess' | 'game';

export interface SourcePosition {
  /** Расстановка в НАШИХ координатах и наших типах фигур. */
  readonly position: ChessPosition;
  /** Фигур на доске — посчитано по доске. */
  readonly pieces: number;
  /** Рейтинг задачи Lichess. У запасного источника его нет. В уровень не входит. */
  readonly rating: number | null;
  readonly source: PositionSource;
  /** Партия и полуход — только у запасного источника. */
  readonly game: ChessGameRecord | null;
  readonly ply: number | null;
}

function inBand(pieces: number, band: PieceBand): boolean {
  return pieces >= band.min && pieces <= band.max;
}

function pickIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

let GAME_LINE: { game: ChessGameRecord; position: ChessPosition; pieces: number }[] | null = null;

/** Запасной источник: все позиции трёх партий по полуходам. Разбирается один раз. */
function gamePositions(): { game: ChessGameRecord; position: ChessPosition; pieces: number }[] {
  if (GAME_LINE) return GAME_LINE;
  const out: { game: ChessGameRecord; position: ChessPosition; pieces: number }[] = [];
  for (const game of CHESS_GAMES) {
    for (const position of replayGame(game.pgn)) {
      out.push({ game, position, pieces: pieceCount(position) });
    }
  }
  GAME_LINE = out;
  return out;
}

/**
 * 🔴 ЕДИНСТВЕННЫЙ ВХОД ЗА ПОЗИЦИЕЙ. Дай позицию с числом фигур из этой полосы.
 * Сначала корпус, и только если в полосе пусто — запасной источник из партий.
 * Пусто в обоих — берётся ближайшая по числу фигур, и `pieces` в ответе говорит
 * правду о том, что на доске, а не повторяет запрошенное.
 */
export function positionWithPieces(band: PieceBand, random: () => number = Math.random): SourcePosition {
  const fromCorpus = CORPUS.positions.filter((entry) => inBand(entry.pieces, band));
  if (fromCorpus.length > 0) {
    const entry = fromCorpus[pickIndex(fromCorpus.length, random)];
    const position = positionFromFen(entry.fen);
    return {
      position,
      pieces: pieceCount(position),
      rating: entry.rating,
      source: 'lichess',
      game: null,
      ply: null,
    };
  }

  const line = gamePositions();
  const fromGames = line.filter((entry) => inBand(entry.pieces, band));
  const pool = fromGames.length > 0 ? fromGames : nearestByPieces(line, band);
  const picked = pool[pickIndex(pool.length, random)];
  return {
    position: picked.position,
    pieces: picked.pieces,
    rating: null,
    source: 'game',
    game: picked.game,
    ply: picked.position.ply,
  };
}

function nearestByPieces<T extends { pieces: number }>(all: readonly T[], band: PieceBand): T[] {
  const target = Math.round((band.min + band.max) / 2);
  let best = Number.POSITIVE_INFINITY;
  for (const entry of all) best = Math.min(best, Math.abs(entry.pieces - target));
  return all.filter((entry) => Math.abs(entry.pieces - target) === best);
}

export interface LevelPosition extends SourcePosition {
  readonly level: number;
  readonly band: PieceBand;
}

/** Позиция под уровень. Уровень выбирает ПОЛОСУ, зерно — позицию внутри полосы. */
export function positionForLevel(level: number, random: () => number = Math.random): LevelPosition {
  const clamped = clampLevel(level);
  const band = bandForLevel(clamped);
  return { ...positionWithPieces(band, random), level: clamped, band };
}

/** Сколько позиций корпуса попадает в полосу. Для проб и разбора. */
export function corpusBandSize(band: PieceBand): number {
  return CORPUS.positions.filter((entry) => inBand(entry.pieces, band)).length;
}

/** Записи корпуса как есть — только для проб: игра ходит через `positionWithPieces`. */
export function corpusEntries(): readonly CorpusEntry[] {
  return CORPUS.positions;
}
