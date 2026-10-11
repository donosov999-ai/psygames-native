import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/recovery.dart';

void main() {
  test('reversible dead ends have a recovery action, not a fabricated outcome', () {
    expect(puzzleNeedsRecovery('Mines', 0, 'DEAD!'), isTrue);
    expect(puzzleNeedsRecovery('Mines', 0, '[0:08] DEAD!  Deaths: 1'), isTrue);
    expect(puzzleNeedsRecovery('Inertia', 0, 'DEAD!'), isTrue);
    expect(puzzleNeedsRecovery('Same Game', 0, 'Cannot move! Score: 80'), isTrue);
    expect(puzzleNeedsRecovery('Same Game', 0, '[1:02] Cannot move! Score: 80'), isTrue);
    expect(puzzleNeedsRecovery('Mines', 0, '10 mines remaining'), isFalse);
    expect(puzzleNeedsRecovery('Inertia', 0, 'Gems: 3'), isFalse);
    expect(puzzleNeedsRecovery('Same Game', 0, 'Score: 80'), isFalse);
    expect(puzzleNeedsRecovery('Mines', -1, 'DEAD!'), isFalse);
    expect(puzzleNeedsRecovery('Mines', 1, 'COMPLETED!'), isFalse);
    expect(puzzleNeedsRecovery('Solo', 0, 'DEAD!'), isFalse);
  });
}
