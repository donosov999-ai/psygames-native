library;

import '../../shell/board_puzzle.dart';
import 'model.dart';

typedef TolMove = ({int from, int to});

/// БАШНИ ЛОНДОНА ПОД ОБЩИМ ДОГОВОРОМ.
///
/// ⚠️ ОТЛИЧИЕ ОТ ХАНОЯ — В ЦЕЛИ, И ОНО ВАЖНО. У ханоя цель встроена в правила
/// («все диски на последнем стержне»), у башен цель СВОЯ у каждой задачи: надо
/// прийти в заданное положение. Поэтому цель приходит параметром, а не берётся
/// из состояния: иначе разбор решал бы не ту задачу, что показана человеку.
class TolPuzzleAdapter extends BoardPuzzle<TolState, TolMove> {
  const TolPuzzleAdapter(this.goalKey);

  /// Ключ ЦЕЛЕВОГО положения (`TolState.key`).
  final String goalKey;

  @override
  String keyOf(TolState s) => s.key;

  @override
  bool solved(TolState s) => s.key == goalKey;

  @override
  List<TolMove> movesFrom(TolState s) => s.legalMoves();

  @override
  TolState? apply(TolState s, TolMove m) => s.move(m.from, m.to);
}
