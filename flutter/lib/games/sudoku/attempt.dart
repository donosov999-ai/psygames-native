import 'dart:convert';

import '../../shell/shared_state.dart';

/// Board identity is independent of skin, profile, seed and restart. Showing the
/// same answers again must not turn a familiar puzzle into an independent task.
String sudokuAnswerId(List<List<int>> puzzle, List<List<int>> solution) =>
    jsonEncode(solution);

class SudokuRevealedBoards {
  SudokuRevealedBoards(this.state);
  final SharedState state;
  static const key = '${SharedState.prefix}sudoku_revealed_boards';

  Set<String> _read() {
    final raw = state.get(key);
    if (raw == null) return {};
    try {
      return (jsonDecode(raw) as List).cast<String>().toSet();
    } catch (_) {
      // A damaged ledger must not silently grant independent completion.
      return {'*'};
    }
  }

  bool contains(String id) {
    final ids = _read();
    return ids.contains('*') || ids.contains(id);
  }

  Future<void> mark(String id) => state.set(key, jsonEncode((_read()..add(id)).toList()));
}

/// Bounded selection: no endless reroll and no fallback to the revealed board.
T? sudokuDistinctBoard<T>({
  required T? Function(int offset) draw,
  required String Function(T board) identity,
  required bool Function(String id) reject,
  int tries = 64,
}) {
  for (var i = 0; i < tries; i++) {
    final board = draw(i);
    if (board != null && !reject(identity(board))) return board;
  }
  return null;
}
