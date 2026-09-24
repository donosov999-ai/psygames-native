library;

import '../../shell/board_puzzle.dart';
import 'model.dart';

/// Ход: снять верхний диск со стержня [from] и положить на [to].
typedef HanoiMove = ({int from, int to});

/// ХАНОЙ ПОД ОБЩИМ ДОГОВОРОМ ДОСКИ — восемнадцать строк, и разбор работает.
///
/// 🔴 ПОЧЕМУ ЭТО ТАК ДЁШЕВО. `HanoiState` уже умеет `canMove`, `move` и `solved` —
/// они написаны до всякого разбора, потому что нужны самой игре. Договор их
/// только называет общими именами: снимок, ходы, применить, решено. Ни одной
/// новой строки про правила игры здесь нет и быть не должно.
class HanoiPuzzle extends BoardPuzzle<HanoiState, HanoiMove> {
  const HanoiPuzzle();

  @override
  String keyOf(HanoiState s) => s.pegs.map((p) => p.join(',')).join('|');

  @override
  bool solved(HanoiState s) => s.solved;

  @override
  List<HanoiMove> movesFrom(HanoiState s) => [
        for (var from = 0; from < s.pegs.length; from += 1)
          for (var to = 0; to < s.pegs.length; to += 1)
            if (s.canMove(from, to)) (from: from, to: to),
      ];

  @override
  HanoiState? apply(HanoiState s, HanoiMove m) => s.move(m.from, m.to);
}
