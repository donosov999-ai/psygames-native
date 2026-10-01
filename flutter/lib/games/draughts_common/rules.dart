/// ПРАВИЛА РУССКИХ ШАШЕК — МОДУЛЬ БЕЗ ЭКРАНА (эталон «своего движка правил»).
///
/// Задача 41ac876c, игра 4 из семи новых в развилке «Шахматы». По образцу этого
/// модуля пишутся правила «Уголков», «Го», «Сянци и сёги»: чистый Dart без Flutter
/// (на нём же работает генератор задач `tools/draughts_corpus.dart`), позиция —
/// неизменяемое значение, ход — путь и взятые.
///
/// Перенос движка Chess & Go (`abstract-hub-flutter/lib/hub/draughts/draughts_engine.dart`,
/// наш код), только русские правила:
///   · бить обязательно, выбор между взятиями свободный (правила большинства нет);
///   · простая бьёт вперёд и назад, ходит только вперёд;
///   · дамка дальнобойная; встав после сбитой шашки, ОБЯЗАНА встать туда, откуда
///     бьёт дальше, если такое поле есть;
///   · простая, дошедшая до последнего ряда посреди боя, становится дамкой и
///     продолжает бой уже дамкой;
///   · турецкий удар: сбитые снимаются после хода, дважды одну шашку не бьют.
///
/// 🔴 ОРАКУЛ — pydraughts (локально, в продукт не идёт). Проба
/// `draughts_rules_test.dart` сверяет число ходов и perft(2) на 1 797 позициях
/// его случайных партий (та же фикстура, что у Chess & Go) — 0 расхождений.
library;

/// Клетка — `ряд * 8 + столбец`, ряд 0 — верх (8-я горизонталь). Белые (+1, дамка
/// +2) внизу и ходят вверх, чёрные (−1, −2) — наоборот.
class DraughtsPosition {
  DraughtsPosition(List<int> cells, {required this.turn})
    : cells = List.unmodifiable(cells);

  /// Начальная расстановка: по 12 шашек на тёмных полях трёх крайних рядов.
  factory DraughtsPosition.initial() {
    final cells = List<int>.filled(64, 0);
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        if ((r + c).isEven) continue;
        if (r < 3) cells[r * 8 + c] = -1;
        if (r > 4) cells[r * 8 + c] = 1;
      }
    }
    return DraughtsPosition(cells, turn: 1);
  }

  /// Запись позиции: 32 тёмных поля сверху вниз («w», «W» — белая шашка и дамка,
  /// «b», «B» — чёрные, «.» — пусто) и через пробел очередь: `w` или `b`.
  factory DraughtsPosition.parse(String code) {
    final parts = code.split(' ');
    final cells = List<int>.filled(64, 0);
    var i = 0;
    for (var sq = 0; sq < 64; sq++) {
      if ((sq ~/ 8 + sq % 8).isEven) continue;
      cells[sq] = switch (parts[0][i++]) {
        'w' => 1,
        'W' => 2,
        'b' => -1,
        'B' => -2,
        _ => 0,
      };
    }
    return DraughtsPosition(cells, turn: parts[1] == 'w' ? 1 : -1);
  }

  final List<int> cells;

  /// Чей ход: +1 белые, −1 чёрные.
  final int turn;

  String get code {
    final b = StringBuffer();
    for (var sq = 0; sq < 64; sq++) {
      if ((sq ~/ 8 + sq % 8).isEven) continue;
      b.write(switch (cells[sq]) {
        1 => 'w',
        2 => 'W',
        -1 => 'b',
        -2 => 'B',
        _ => '.',
      });
    }
    return '$b ${turn == 1 ? 'w' : 'b'}';
  }

  int count(int side) => cells.where((p) => p * side > 0).length;

  /// Материал стороны: простая 1, дамка 3.
  int material(int side) => cells.fold(
    0,
    (s, p) => p * side > 0 ? s + (p.abs() == 2 ? 3 : 1) : s,
  );
}

class DraughtsMove {
  const DraughtsMove({
    required this.path,
    required this.captures,
    required this.finalPiece,
  });

  /// Поля по порядку: откуда, затем каждое поле остановки.
  final List<int> path;

  /// Сбитые шашки (в порядке боя).
  final List<int> captures;

  /// Чем шашка стоит в конце хода (простая или дамка).
  final int finalPiece;

  bool get isCapture => captures.isNotEmpty;
  int get from => path.first;
  int get to => path.last;

  String get notation =>
      path.map(draughtsCellName).join(isCapture ? ':' : '-');
}

String draughtsCellName(int sq) =>
    '${'abcdefgh'[sq % 8]}${8 - sq ~/ 8}';

int draughtsCellOf(String name) =>
    (8 - int.parse(name.substring(1))) * 8 + name.codeUnitAt(0) - 97;

const _diagonals = [(1, 1), (1, -1), (-1, 1), (-1, -1)];

bool _inside(int r, int c) => r >= 0 && r < 8 && c >= 0 && c < 8;
int _side(int p) => p == 0 ? 0 : (p > 0 ? 1 : -1);

class _Jump {
  const _Jump(this.landing, this.captured, this.direction);
  final int landing;
  final int captured;
  final (int, int) direction;
}

/// Законные ходы стороны, чья очередь.
List<DraughtsMove> draughtsLegalMoves(DraughtsPosition p) {
  final captures = <DraughtsMove>[];
  for (var sq = 0; sq < 64; sq++) {
    final piece = p.cells[sq];
    if (_side(piece) != p.turn) continue;
    _search(List.of(p.cells), sq, piece, [sq], const {}, captures);
  }
  if (captures.isNotEmpty) return captures;
  return _quiet(p);
}

List<_Jump> _jumps(List<int> board, int sq, int piece, Set<int> captured) {
  final out = <_Jump>[];
  final r0 = sq ~/ 8, c0 = sq % 8;
  for (final d in _diagonals) {
    final (dr, dc) = d;
    if (piece.abs() == 2) {
      var r = r0 + dr, c = c0 + dc;
      while (_inside(r, c) && board[r * 8 + c] == 0) {
        r += dr;
        c += dc;
      }
      if (!_inside(r, c)) continue;
      final victim = r * 8 + c;
      if (_side(board[victim]) != -_side(piece) || captured.contains(victim)) {
        continue;
      }
      r += dr;
      c += dc;
      while (_inside(r, c) && board[r * 8 + c] == 0) {
        out.add(_Jump(r * 8 + c, victim, d));
        r += dr;
        c += dc;
      }
      continue;
    }
    final vr = r0 + dr, vc = c0 + dc, lr = r0 + 2 * dr, lc = c0 + 2 * dc;
    if (!_inside(lr, lc)) continue;
    final victim = vr * 8 + vc, landing = lr * 8 + lc;
    if (_side(board[victim]) == -_side(piece) &&
        !captured.contains(victim) &&
        board[landing] == 0) {
      out.add(_Jump(landing, victim, d));
    }
  }
  return out;
}

bool _promotes(int sq, int piece) =>
    piece > 0 ? sq ~/ 8 == 0 : sq ~/ 8 == 7;

void _search(
  List<int> board,
  int sq,
  int piece,
  List<int> path,
  Set<int> captured,
  List<DraughtsMove> out,
) {
  final options = _jumps(board, sq, piece, captured);
  if (options.isEmpty) {
    if (captured.isNotEmpty) {
      out.add(
        DraughtsMove(
          path: List.of(path),
          captures: captured.toList(),
          finalPiece: piece,
        ),
      );
    }
    return;
  }
  (List<int>, int) after(_Jump j) {
    final next = List.of(board)
      ..[sq] = 0
      ..[j.landing] = piece;
    var nextPiece = piece;
    if (piece.abs() == 1 && _promotes(j.landing, piece)) {
      nextPiece = piece > 0 ? 2 : -2;
      next[j.landing] = nextPiece;
    }
    return (next, nextPiece);
  }

  // Дамка обязана встать туда, откуда бьёт дальше, если такое поле есть.
  final continues = <_Jump, bool>{
    for (final j in options)
      j: piece.abs() == 2 &&
          _jumps(after(j).$1, j.landing, piece, {...captured, j.captured})
              .isNotEmpty,
  };
  final must = {
    for (final j in options)
      if (continues[j]!) (j.captured, j.direction),
  };
  for (final j in options) {
    if (must.contains((j.captured, j.direction)) && !continues[j]!) continue;
    final (next, nextPiece) = after(j);
    _search(
      next,
      j.landing,
      nextPiece,
      [...path, j.landing],
      {...captured, j.captured},
      out,
    );
  }
}

List<DraughtsMove> _quiet(DraughtsPosition p) {
  final out = <DraughtsMove>[];
  for (var sq = 0; sq < 64; sq++) {
    final piece = p.cells[sq];
    if (_side(piece) != p.turn) continue;
    final r0 = sq ~/ 8, c0 = sq % 8;
    final dirs = piece.abs() == 2
        ? _diagonals
        : [(piece > 0 ? -1 : 1, -1), (piece > 0 ? -1 : 1, 1)];
    for (final (dr, dc) in dirs) {
      var r = r0 + dr, c = c0 + dc;
      while (_inside(r, c) && p.cells[r * 8 + c] == 0) {
        final to = r * 8 + c;
        out.add(
          DraughtsMove(
            path: [sq, to],
            captures: const [],
            finalPiece: piece.abs() == 1 && _promotes(to, piece)
                ? piece * 2
                : piece,
          ),
        );
        if (piece.abs() != 2) break;
        r += dr;
        c += dc;
      }
    }
  }
  return out;
}

DraughtsPosition draughtsApply(DraughtsPosition p, DraughtsMove m) {
  final cells = List.of(p.cells);
  cells[m.from] = 0;
  for (final x in m.captures) {
    cells[x] = 0;
  }
  var piece = m.finalPiece;
  if (piece.abs() == 1 && _promotes(m.to, piece)) piece *= 2;
  cells[m.to] = piece;
  return DraughtsPosition(cells, turn: -p.turn);
}
