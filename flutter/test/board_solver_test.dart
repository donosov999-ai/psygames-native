import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/model.dart';
import 'package:psygames_flutter/games/hanoi/puzzle.dart';
import 'package:psygames_flutter/games/tower_london/model.dart';
import 'package:psygames_flutter/games/tower_london/puzzle.dart';
import 'package:psygames_flutter/shell/board_solver.dart';

/// 🔴 ОДИН РЕШАТЕЛЬ РЕШАЕТ РАЗНЫЕ ИГРЫ — ТО, ЧЕГО У НАС НЕ БЫЛО.
///
/// Вопрос Дениса 24.09.2026: «почему на остальные наши игры так одним заходом
/// нельзя? надо чтобы тоже было стандартизировано, как у Тэтхэма». У Тэтхэма 42
/// игры стоят за одним API, поэтому одна интеграция дала разбор 37 режимам. У нас
/// 37 отдельных ядер — общего не было ничего.
///
/// Здесь общее заведено: игра отдаёт снимок, ходы, «применить» и «решено», а поиск
/// один на всех. Проба проверяет это ДВУМЯ разными играми одним и тем же решателем.
void main() {
  group('ханой', () {
    test('🔴 решение найдено и оно КРАТЧАЙШЕЕ: 2^n − 1 ходов', () {
      for (final discs in [3, 4, 5]) {
        final moves = BoardSolver.solve(
          const HanoiPuzzle(),
          HanoiState.ofDiscs(discs, 3),
        );
        // Классический ханой на трёх стержнях: минимум ровно 2^n − 1.
        expect(moves.length, (1 << discs) - 1, reason: 'дисков $discs');
      }
    });

    test('🔴 путь законный: каждый ход применяется, и в конце победа', () {
      const game = HanoiPuzzle();
      var s = HanoiState.ofDiscs(4, 3);
      final moves = BoardSolver.solve(game, s);
      for (final m in moves) {
        final next = game.apply(s, m);
        expect(next, isNotNull, reason: 'разбор предложил незаконный ход $m');
        s = next!;
      }
      expect(game.solved(s), isTrue, reason: 'путь не довёл до решения');
    });

    test('уже решено — ходов ноль, а не выдуманный путь', () {
      const game = HanoiPuzzle();
      final s = HanoiState([[], [], [3, 2, 1]], 3);
      expect(game.solved(s), isTrue);
      expect(BoardSolver.solve(game, s), isEmpty);
    });
  });

  group('башни Лондона — ТОТ ЖЕ решатель, другая игра', () {
    test('🔴 приходит ровно в заданную цель', () {
      final start = TolState([
        ['красный', 'зелёный'],
        ['синий'],
        <String>[],
      ], [3, 2, 1]);
      final goal = TolState([
        ['красный'],
        ['зелёный'],
        ['синий'],
      ], [3, 2, 1]);
      final game = TolPuzzleAdapter(goal.key);

      final moves = BoardSolver.solve(game, start);
      expect(moves, isNotEmpty, reason: 'решения не нашлось там, где оно есть');

      var s = start;
      for (final m in moves) {
        s = game.apply(s, m)!;
      }
      expect(s.key, goal.key, reason: 'пришли не в ту позицию');
    });

    test('🔴 вместимость стержня соблюдена — ход через край не предлагается', () {
      // Третий стержень вмещает один: положить на него второй предмет нельзя.
      final start = TolState([
        ['красный', 'зелёный'],
        <String>[],
        ['синий'],
      ], [3, 2, 1]);
      final game = TolPuzzleAdapter('|red|');
      for (final m in game.movesFrom(start)) {
        expect(m.to == 2, isFalse, reason: 'предложен ход на заполненный стержень вместимостью 1');
      }
    });
  });

  test('🔴 не уложились в потолок — отдаём ПУСТО, а не почти-решение', () {
    // Потолок в один разобранный узел: решения заведомо не найти.
    final moves = BoardSolver.solve(
      const HanoiPuzzle(),
      HanoiState.ofDiscs(5, 3),
      maxStates: 1,
    );
    expect(moves, isEmpty,
        reason: 'неполный путь хуже отсутствия: человек дошёл бы до тупика с нашей подачи');
  });
}
