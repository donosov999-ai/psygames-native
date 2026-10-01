library;

import '../../shell/board_puzzle.dart';
import 'model.dart';

/// «ОЧЕРЕДЬ ЗВЕРЕЙ» ПОД ОБЩИМ ДОГОВОРОМ ДОСКИ — и разбор работает через общий
/// решатель каркаса, как у ханоя. Своих правил здесь нет: снимок, ходы, «решено»
/// берутся у `AnimalQueue`.
class AnimalQueuePuzzle extends BoardPuzzle<AnimalQueue, int> {
  const AnimalQueuePuzzle();

  @override
  String keyOf(AnimalQueue s) => s.key;

  @override
  bool solved(AnimalQueue s) => s.done;

  @override
  List<int> movesFrom(AnimalQueue s) => s.legal();

  @override
  AnimalQueue? apply(AnimalQueue s, int move) => s.play(move);
}
