/// ПОЗИЦИЯ ДЛЯ ЭКРАНА: клетки, руки сёги, разбор записи хода. Без пикселей.
///
/// Индекс клетки — ряд сверху × число вертикалей + вертикаль. Сторона 0 — атакующий
/// (красные в сянци, сэнтэ в сёги), 1 — защита. Вид фигуры — буква движка заглавной,
/// у превращённой — «+».
library;

import 'ladder.dart';
import 'mate.dart';
import 'shogi_rules.dart';

class XsPiece {
  const XsPiece(this.side, this.kind);
  final int side;
  final String kind;
}

class XsView {
  const XsView(this.mode, this.cells, this.hands);
  final XsMode mode;
  final List<XsPiece?> cells;
  final List<Map<String, int>> hands;

  int get files => 9;
  int get ranks => mode == XsMode.xiangqi ? 10 : 9;
}

int xsFiles(XsMode mode) => 9;
int xsRanks(XsMode mode) => mode == XsMode.xiangqi ? 10 : 9;

String xsSquare(XsMode mode, int index) =>
    '${String.fromCharCode(97 + index % 9)}${xsRanks(mode) - index ~/ 9}';

int xsIndex(XsMode mode, String name) =>
    (xsRanks(mode) - int.parse(name.substring(1))) * 9 + name.codeUnitAt(0) - 97;

/// Разобранный ход: откуда (null у сброса), куда, превращение, вид сброса.
class XsMove {
  const XsMove({this.from, required this.to, this.promote = false, this.drop});
  final int? from;
  final int to;
  final bool promote;
  final String? drop;

  static XsMove parse(XsMode mode, String m) {
    if (m.contains('@')) {
      return XsMove(to: xsIndex(mode, m.substring(2)), drop: m[0]);
    }
    final promote = m.endsWith('+');
    final body = promote ? m.substring(0, m.length - 1) : m;
    final split = body.indexOf(RegExp(r'[a-i]'), 1);
    return XsMove(
      from: xsIndex(mode, body.substring(0, split)),
      to: xsIndex(mode, body.substring(split)),
      promote: promote,
    );
  }
}

XsView xsViewOf(XsMode mode, MateBoard board) {
  if (board is ShogiBoard) {
    final p = board.position;
    return XsView(mode, [
      for (final c in p.cells) c == null ? null : XsPiece(c.side, c.kind),
    ], p.hands);
  }
  return xsViewOfFen(mode, board.fen);
}

/// Позиция из FEN сянци (доска сверху вниз, заглавные — красные).
XsView xsViewOfFen(XsMode mode, String fen) {
  if (mode == XsMode.shogi) {
    final p = ShogiPosition.parse(fen);
    return XsView(mode, [
      for (final c in p.cells) c == null ? null : XsPiece(c.side, c.kind),
    ], p.hands);
  }
  final cells = <XsPiece?>[];
  final board = fen.split(' ').first;
  final rows = board.split('/');
  for (final r in rows) {
    var i = 0;
    while (i < r.length) {
      // Число пустых может быть двузначным только у досок шире 9 — у сянци нет.
      final ch = r[i];
      final n = int.tryParse(ch);
      if (n != null) {
        cells.addAll(List<XsPiece?>.filled(n, null));
      } else {
        cells.add(XsPiece(ch == ch.toUpperCase() ? 0 : 1, ch.toUpperCase()));
      }
      i++;
    }
  }
  return XsView(mode, cells, const [{}, {}]);
}

MateBoard xsBoard(XsMode mode, String fen) =>
    mode == XsMode.shogi ? ShogiBoard(fen) : XiangqiBoard(fen);
