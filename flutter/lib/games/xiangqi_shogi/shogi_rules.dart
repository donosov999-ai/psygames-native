/// ПРАВИЛА СЁГИ 9×9 — СВОЙ ДВИЖОК, БЕЗ ПИКСЕЛЕЙ.
///
/// Задача c33fb91b (цепочка «Шахматы: семь новых игр», игра 7). Готового движка с
/// разрешительной лицензией нет: в bishop (MIT) сёги помечены «work in progress, правила
/// сбросов не сделаны», Fairy-Stockfish — GPL. Правила не охраняются — пишем сами и
/// сверяем с Fairy-Stockfish ЛОКАЛЬНО (в приложение он не идёт): тот же путь ходов —
/// тот же набор ходов (`tools/shogi_dump.dart` + сверка в _local/chessgo-tools).
///
/// Запись — как у Fairy-Stockfish, чтобы сверка шла без перевода: поле — буква вертикали
/// a…i слева направо и номер горизонтали 1…9 снизу вверх (снизу — сэнтэ, первый игрок,
/// заглавные буквы); ход «e3e4», превращение «e7e8+», сброс «P@e5» (буква фигуры
/// заглавная у обеих сторон). FEN — тоже в его формате: «…[GPp] w 0 1».
///
/// Правила: превращение — если ход начинается или кончается в зоне соперника (три
/// дальних горизонтали); пешка и копьё на последней горизонтали, конь на двух последних
/// превращаются обязательно. Сброс: не на последнюю горизонталь (пешка, копьё), не на две
/// последние (конь); не вторая непревращённая пешка на вертикали (нифу); не мат сбросом
/// пешки (утифудзумэ). Взятая фигура уходит в руку непревращённой.
library;

const int sgSente = 0;
const int sgGote = 1;

/// Фигура: сторона и вид («P», «+P», «K» …).
class SgPiece {
  const SgPiece(this.side, this.kind);
  final int side;
  final String kind;

  bool get promoted => kind.startsWith('+');
  String get base => promoted ? kind.substring(1) : kind;

  @override
  bool operator ==(Object other) =>
      other is SgPiece && other.side == side && other.kind == kind;
  @override
  int get hashCode => side * 31 + kind.hashCode;
}

/// Виды для руки — в порядке записи FEN.
const List<String> sgHandKinds = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
const Set<String> _promotable = {'P', 'L', 'N', 'S', 'B', 'R'};

String sgSquare(int index) =>
    '${String.fromCharCode(97 + index % 9)}${9 - index ~/ 9}';

int sgIndex(String name) {
  final file = name.codeUnitAt(0) - 97;
  final rank = int.parse(name.substring(1));
  return (9 - rank) * 9 + file;
}

class ShogiPosition {
  ShogiPosition(List<SgPiece?> cells, List<Map<String, int>> hands, this.toMove)
    : cells = List.unmodifiable(cells),
      hands = [
        Map.unmodifiable(hands[0]),
        Map.unmodifiable(hands[1]),
      ];

  final List<SgPiece?> cells;
  final List<Map<String, int>> hands;
  final int toMove;

  static const String startFen =
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1';

  /// FEN Fairy-Stockfish: доска сверху (9-я горизонталь) вниз, «+» — превращённая,
  /// рука в скобках, «w» — ход сэнтэ.
  static ShogiPosition parse(String fen) {
    final parts = fen.split(' ');
    var board = parts[0];
    var hand = '';
    final open = board.indexOf('[');
    if (open >= 0) {
      hand = board.substring(open + 1, board.indexOf(']'));
      board = board.substring(0, open);
    }
    final cells = <SgPiece?>[];
    var promote = false;
    for (final ch in board.split('')) {
      if (ch == '/') continue;
      if (ch == '+') {
        promote = true;
        continue;
      }
      final n = int.tryParse(ch);
      if (n != null) {
        cells.addAll(List<SgPiece?>.filled(n, null));
        continue;
      }
      final side = ch == ch.toUpperCase() ? sgSente : sgGote;
      cells.add(SgPiece(side, '${promote ? '+' : ''}${ch.toUpperCase()}'));
      promote = false;
    }
    if (cells.length != 81) {
      throw ArgumentError('shogi fen: ${cells.length} cells');
    }
    final hands = [<String, int>{}, <String, int>{}];
    if (hand != '-') {
      for (final ch in hand.split('')) {
        final side = ch == ch.toUpperCase() ? sgSente : sgGote;
        final k = ch.toUpperCase();
        hands[side][k] = (hands[side][k] ?? 0) + 1;
      }
    }
    final toMove = parts.length > 1 && parts[1] == 'b' ? sgGote : sgSente;
    return ShogiPosition(cells, hands, toMove);
  }

  String fen() {
    final rows = <String>[];
    for (var r = 0; r < 9; r++) {
      var row = '';
      var empty = 0;
      for (var c = 0; c < 9; c++) {
        final p = cells[r * 9 + c];
        if (p == null) {
          empty++;
          continue;
        }
        if (empty > 0) row += '$empty';
        empty = 0;
        final letter = p.side == sgSente ? p.base : p.base.toLowerCase();
        row += '${p.promoted ? '+' : ''}$letter';
      }
      if (empty > 0) row += '$empty';
      rows.add(row);
    }
    var hand = '';
    for (final side in [sgSente, sgGote]) {
      for (final k in sgHandKinds) {
        final n = hands[side][k] ?? 0;
        hand += (side == sgSente ? k : k.toLowerCase()) * n;
      }
    }
    return '${rows.join('/')}[${hand.isEmpty ? '-' : hand}] ${toMove == sgSente ? 'w' : 'b'} 0 1';
  }

  int _forward(int side) => side == sgSente ? -1 : 1;

  /// Горизонтали зоны соперника: для сэнтэ — ряды 0–2 сверху.
  bool _inZone(int side, int row) => side == sgSente ? row <= 2 : row >= 6;

  /// Сколько горизонталей впереди у фигуры на ряду `row`.
  int _rowsAhead(int side, int row) => side == sgSente ? row : 8 - row;

  /// Поля, куда фигура на `from` бьёт или ходит (без проверки шаха). `as` — фигура,
  /// которую мысленно ставим на пустое поле (проверка шаха сбросом без хода).
  Iterable<int> targets(int from, [SgPiece? as]) sync* {
    final p = as ?? cells[from];
    if (p == null) return;
    final f = _forward(p.side);
    final r0 = from ~/ 9, c0 = from % 9;
    Iterable<int> slide(List<(int, int)> dirs) sync* {
      for (final (dr, dc) in dirs) {
        var r = r0 + dr, c = c0 + dc;
        while (r >= 0 && r < 9 && c >= 0 && c < 9) {
          final q = cells[r * 9 + c];
          if (q == null) {
            yield r * 9 + c;
          } else {
            if (q.side != p.side) yield r * 9 + c;
            break;
          }
          r += dr;
          c += dc;
        }
      }
    }

    const diag = [(-1, -1), (-1, 1), (1, -1), (1, 1)];
    const orth = [(-1, 0), (1, 0), (0, -1), (0, 1)];
    final gold = [(f, -1), (f, 0), (f, 1), (0, -1), (0, 1), (-f, 0)];
    final steps = switch (p.kind) {
      'P' => [(f, 0)],
      'N' => [(2 * f, -1), (2 * f, 1)],
      'S' => [(f, -1), (f, 0), (f, 1), (-f, -1), (-f, 1)],
      'G' || '+P' || '+L' || '+N' || '+S' => gold,
      'K' => [...diag, ...orth],
      '+B' => orth,
      '+R' => diag,
      _ => const <(int, int)>[],
    };
    for (final (dr, dc) in steps) {
      final r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
      final q = cells[r * 9 + c];
      if (q == null || q.side != p.side) yield r * 9 + c;
    }
    if (p.kind == 'L') yield* slide([(f, 0)]);
    if (p.kind == 'B' || p.kind == '+B') yield* slide(diag);
    if (p.kind == 'R' || p.kind == '+R') yield* slide(orth);
  }

  int? king(int side) {
    for (var i = 0; i < 81; i++) {
      final p = cells[i];
      if (p != null && p.side == side && p.kind == 'K') return i;
    }
    return null;
  }

  bool attacked(int square, int bySide) {
    for (var i = 0; i < 81; i++) {
      final p = cells[i];
      if (p == null || p.side != bySide) continue;
      for (final t in targets(i)) {
        if (t == square) return true;
      }
    }
    return false;
  }

  bool inCheck(int side) {
    final k = king(side);
    return k != null && attacked(k, 1 - side);
  }

  /// Ход без проверки законности: «e3e4», «e7e8+», «P@e5».
  ShogiPosition apply(String move) {
    final next = List<SgPiece?>.of(cells);
    final h = [Map<String, int>.of(hands[0]), Map<String, int>.of(hands[1])];
    final me = toMove;
    if (move.contains('@')) {
      final kind = move[0];
      final to = sgIndex(move.substring(2));
      next[to] = SgPiece(me, kind);
      h[me][kind] = h[me][kind]! - 1;
      if (h[me][kind] == 0) h[me].remove(kind);
    } else {
      final promote = move.endsWith('+');
      final body = promote ? move.substring(0, move.length - 1) : move;
      final split = body.indexOf(RegExp(r'[a-i]'), 1);
      final from = sgIndex(body.substring(0, split));
      final to = sgIndex(body.substring(split));
      final p = next[from]!;
      final taken = next[to];
      if (taken != null) h[me][taken.base] = (h[me][taken.base] ?? 0) + 1;
      next[from] = null;
      next[to] = promote ? SgPiece(me, '+${p.kind}') : p;
    }
    return ShogiPosition(next, h, 1 - me);
  }

  bool _hasPawnOnFile(int side, int file) {
    for (var r = 0; r < 9; r++) {
      final p = cells[r * 9 + file];
      if (p != null && p.side == side && p.kind == 'P') return true;
    }
    return false;
  }

  /// Поля, куда сброс закрывает шах: между единственной дальнобойной фигурой, давшей
  /// шах, и королём. Пусто — сбросом не закрыться (шах вплотную, конём или двойной).
  Set<int> _interpositions(int me) {
    final k = king(me);
    if (k == null) return const {};
    final checkers = <int>[];
    for (var i = 0; i < 81; i++) {
      final p = cells[i];
      if (p == null || p.side == me) continue;
      if (targets(i).contains(k)) checkers.add(i);
    }
    if (checkers.length != 1) return const {};
    final c = checkers.single;
    final dr = (k ~/ 9 - c ~/ 9).sign, dc = (k % 9 - c % 9).sign;
    final out = <int>{};
    var r = c ~/ 9 + dr, col = c % 9 + dc;
    while (r * 9 + col != k) {
      if ((k ~/ 9 - c ~/ 9).abs() <= 1 && (k % 9 - c % 9).abs() <= 1) break;
      if ((k ~/ 9 - c ~/ 9).abs() == 2 && (k % 9 - c % 9).abs() == 1) break; // конь
      out.add(r * 9 + col);
      r += dr;
      col += dc;
    }
    return out;
  }

  /// Ходы без проверки шаха своему королю и без запрета мата сбросом пешки.
  /// Под шахом сбросы — только на поля между дальнобойной фигурой и королём.
  List<String> _pseudo() {
    final me = toMove;
    final out = <String>[];
    final dropOnly = inCheck(me) ? _interpositions(me) : null;
    for (var from = 0; from < 81; from++) {
      final p = cells[from];
      if (p == null || p.side != me) continue;
      for (final to in targets(from)) {
        if (cells[to]?.kind == 'K') continue;
        final name = '${sgSquare(from)}${sgSquare(to)}';
        final canPromote =
            !p.promoted &&
            _promotable.contains(p.kind) &&
            (_inZone(me, from ~/ 9) || _inZone(me, to ~/ 9));
        final ahead = _rowsAhead(me, to ~/ 9);
        final forced =
            (p.kind == 'P' || p.kind == 'L') && ahead == 0 ||
            p.kind == 'N' && ahead <= 1;
        if (!forced) out.add(name);
        if (canPromote) out.add('$name+');
      }
    }
    for (final kind in sgHandKinds) {
      if ((hands[me][kind] ?? 0) == 0) continue;
      for (var to = 0; to < 81; to++) {
        if (cells[to] != null) continue;
        if (dropOnly != null && !dropOnly.contains(to)) continue;
        final ahead = _rowsAhead(me, to ~/ 9);
        if ((kind == 'P' || kind == 'L') && ahead == 0) continue;
        if (kind == 'N' && ahead <= 1) continue;
        if (kind == 'P' && _hasPawnOnFile(me, to % 9)) continue;
        out.add('$kind@${sgSquare(to)}');
      }
    }
    return out;
  }

  List<String> legalMoves({bool pawnDropMateRule = true}) {
    final me = toMove;
    final out = <String>[];
    for (final m in _pseudo()) {
      final next = apply(m);
      if (next.inCheck(me)) continue;
      if (pawnDropMateRule &&
          m.startsWith('P@') &&
          next.inCheck(1 - me) &&
          next.legalMoves(pawnDropMateRule: false).isEmpty) {
        continue; // утифудзумэ: мат сбросом пешки запрещён
      }
      out.add(m);
    }
    return out;
  }

  bool get checkmate => inCheck(toMove) && legalMoves().isEmpty;

  /// Законные ходы, дающие шах (атакующий в цумэ). Сбросы проверяются без хода: фигура
  /// мысленно ставится на поле и бьёт ли она короля; ходы по доске — ходом (там бывает
  /// вскрытый шах). Совпадает с `legalMoves().where(даёт шах)` — проба в тесте.
  List<String> checkingMoves() {
    final me = toMove;
    final k = king(1 - me);
    if (k == null) return const [];
    final out = <String>[];
    for (final m in _pseudo()) {
      if (m.contains('@')) {
        final to = sgIndex(m.substring(2));
        if (!targets(to, SgPiece(me, m[0])).contains(k)) continue;
      }
      final next = apply(m);
      if (!next.inCheck(1 - me) || next.inCheck(me)) continue;
      if (m.startsWith('P@') && next.legalMoves(pawnDropMateRule: false).isEmpty) {
        continue; // утифудзумэ
      }
      out.add(m);
    }
    return out;
  }
}
