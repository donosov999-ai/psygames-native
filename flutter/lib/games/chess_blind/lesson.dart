/// РАЗБОР «ДОСКИ В УМЕ» ПО ШАГАМ: как держать позицию и ходы в голове.
///
/// Материал — партия той же ступени, собранная теми же правилами, что «Начать»
/// (`ChessBlindGame.start`): позиция из корпуса живых партий, ходы вслепую той же
/// цепочкой. Разбор открывается ДО партии.
///
/// 🔴 КАЖДЫЙ ШАГ НАЗВАН ПРИЁМОМ:
///   · показ — «запоминай связками, а не по клетке» (позиции из живых партий,
///     связки в них есть всегда — ради этого корпус и заменил случайные доски);
///   · ход — «обнови картинку: откуда ушла, куда пришла» с именем фигуры и полями;
///   · ответ — «стоит с показа» или «пришла ходом N»: отвечать по ПОСЛЕДНЕМУ
///     ходу фигуры, а не по первой картинке.
/// Ходы и ответы берутся из самой партии (`moves`, `piecesAfter`) — разбор не
/// может показать ход, которого в цепочке не было.
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'game.dart';
import 'options.dart';
import 'questions.dart';
import 'screen.dart' show cbPieceName, cbSquareName;

/// Ключи приёмов — списком: шаг получает ключ переменной, а сборщик словаря
/// видит только литералы и такие списки.
const chessBlindLessonKeys = <String>[
  'teachChessBlindChunks',
  'teachChessBlindMove',
  'teachChessBlindStayed',
  'teachChessBlindMoved',
  'teachChessBlindCount',
];

/// Сколько ходов вслепую показывает разбор: дальше приём тот же, а разбор
/// превратился бы в отдельную партию.
const int chessBlindLessonMoves = 4;

/// Что рисует доска шага.
class ChessBlindLessonFrame {
  const ChessBlindLessonFrame({
    required this.pieces,
    required this.masked,
    this.from,
    this.to,
    this.reveal,
  });
  final List<PuzzlePiece> pieces;
  final bool masked;
  final int? from;
  final int? to;

  /// Клетка, где фишка открыта в фигуру — ответ шага.
  final int? reveal;
}

LessonStep _step(
  String key,
  ChessBlindLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

String _name(PuzzlePiece p) => cbPieceName((type: p.type, white: p.white));

/// Шаги разбора по партии [g].
List<LessonStep> chessBlindLessonSteps(ChessBlindGame g) {
  final shown = g.moves.length < chessBlindLessonMoves
      ? g.moves.length
      : chessBlindLessonMoves;
  final out = <LessonStep>[
    _step(
      'teachChessBlindChunks',
      ChessBlindLessonFrame(pieces: g.start, masked: false),
    ),
  ];
  // Последний ход, приведший фигуру на клетку: номер хода по клетке прихода.
  final arrivedAt = <int, int>{};
  for (var i = 0; i < shown; i++) {
    final m = g.moves[i];
    final piece = g.start[m.pieceIndex];
    arrivedAt.remove(m.from);
    arrivedAt[m.to] = i + 1;
    out.add(
      _step(
        'teachChessBlindMove',
        ChessBlindLessonFrame(
          pieces: g.piecesAfter(i + 1),
          masked: true,
          from: m.from,
          to: m.to,
        ),
        {
          'n': '${i + 1}',
          'piece': _name(piece),
          'from': cbSquareName(m.from),
          'to': cbSquareName(m.to),
        },
      ),
    );
  }
  if (g.examples.isNotEmpty) {
    out.add(
      _step(
        'teachChessBlindCount',
        ChessBlindLessonFrame(pieces: g.piecesAfter(shown), masked: true),
      ),
    );
  }
  // Два ответа: фигура, пришедшая последним ходом, и фигура, стоящая с показа.
  final after = g.piecesAfter(shown);
  PuzzlePiece? moved;
  PuzzlePiece? stayed;
  for (final p in after) {
    final n = arrivedAt[p.sq];
    if (n != null && (moved == null || n > arrivedAt[moved.sq]!)) moved = p;
    if (n == null && stayed == null) stayed = p;
  }
  for (final p in [?moved, ?stayed]) {
    final n = arrivedAt[p.sq];
    out.add(
      _step(
        n == null ? 'teachChessBlindStayed' : 'teachChessBlindMoved',
        ChessBlindLessonFrame(pieces: after, masked: true, reveal: p.sq),
        {'sq': cbSquareName(p.sq), 'piece': _name(p), 'n': '${n ?? 0}'},
      ),
    );
  }
  return out;
}

/// Для проб: вариант ответа, который разбор называет на шаге-ответе.
Combo? lessonAnswer(ChessBlindLessonFrame f) {
  final sq = f.reveal;
  if (sq == null) return null;
  for (final p in f.pieces) {
    if (p.sq == sq) return (type: p.type, white: p.white);
  }
  return null;
}
