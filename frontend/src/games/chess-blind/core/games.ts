/* psygames-chess-blind-games · VER 1 · 23.08.2026 */
/**
 * ТРИ ПАРТИИ — МАТЕРИАЛ УПРАЖНЕНИЯ. НЕ СЛУЧАЙНАЯ РАССТАНОВКА.
 *
 * 🔴 ПОЧЕМУ РЕАЛЬНЫЕ ПОЗИЦИИ, А НЕ 4–12 ФИГУР ВРАЗБРОС (как было). В настоящей
 * позиции фигуры стоят ОСМЫСЛЕННО: пешечная цепь, король за своими пешками,
 * ладья на открытой линии. Память цепляется за структуру и запоминает кусками, а
 * не по клетке; двенадцать случайных фигур такой опоры не дают — запоминаются
 * хуже и переносятся хуже. Замер при этом не портится: спрашивают всё равно про
 * одно поле.
 *
 * ⚠️ ОБЩЕСТВЕННОЕ ДОСТОЯНИЕ БЕЗ ОГОВОРОК. Все три партии — XIX век (1851, 1852,
 * 1858), игроки умерли более ста лет назад, счета публиковались тысячи раз. Ни
 * лицензии, ни ссылки на правообладателя здесь не нужно.
 *
 * ⚠️ ЧИСЛА В МЕТАДАННЫХ — НЕ УКРАШЕНИЕ, А ПРОВЕРЯЕМОЕ УТВЕРЖДЕНИЕ. `moves` и
 * `plies` записаны рядом со счётом нарочно: проба разыгрывает партию нашей
 * обёрткой и сверяет с ними. Кривой разбор нотации до конца партии не доходит —
 * либо ход не найдётся, либо найдётся не один, — а если дошёл, то последний ход
 * обязан быть МАТОМ. Это и есть главная проверка правильности разбора.
 */

export type ChessGameId = 'immortal' | 'opera' | 'evergreen';

export interface ChessGameRecord {
  readonly id: ChessGameId;
  readonly white: string;
  readonly black: string;
  readonly year: number;
  /** Ходов в партии (полных, как принято считать в шахматах). */
  readonly moves: number;
  /** Полуходов — их и разыгрывает обёртка. */
  readonly plies: number;
  /** Последний ход партии. Во всех трёх — мат. */
  readonly lastMove: string;
  readonly pgn: string;
}

export const CHESS_GAMES: readonly ChessGameRecord[] = [
  {
    id: 'immortal',
    white: 'Anderssen',
    black: 'Kieseritzky',
    year: 1851,
    moves: 23,
    plies: 45,
    lastMove: 'Be7#',
    pgn: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 '
      + '8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 '
      + '15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 '
      + '21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#',
  },
  {
    id: 'opera',
    white: 'Morphy',
    black: 'Duke of Brunswick & Count Isouard',
    year: 1858,
    moves: 17,
    plies: 33,
    lastMove: 'Rd8#',
    pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 '
      + '8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 '
      + '14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
  },
  {
    id: 'evergreen',
    white: 'Anderssen',
    black: 'Dufresne',
    year: 1852,
    moves: 24,
    plies: 47,
    lastMove: 'Bxe7#',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 '
      + '8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 '
      + '15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 '
      + '21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#',
  },
];

export function findGame(id: ChessGameId): ChessGameRecord {
  const found = CHESS_GAMES.find((g) => g.id === id);
  if (!found) throw new Error(`Нет такой партии: ${id}`);
  return found;
}
