import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/levels.dart';
import 'package:psygames_flutter/games/samurai/rules.dart';

/// 🔴 У КАЖДОЙ СТУПЕНИ ЕСТЬ ДОСКА, И КАЖДАЯ ДОСКА ЦЕЛАЯ.
///
/// Доски возятся данными, поэтому дыра в данных — это экран «доска не собралась» у
/// живого человека на конкретной ступени. Проверяются ВСЕ 72 доски, а не по одной на
/// ступень: мутация 23.09 на судоку показала, что выборка одной доски пропускает порчу.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SamuraiLevels levels;

  setUpAll(() async {
    levels = await SamuraiLevels.load();
  });

  test('🔴 у каждой из 12 ступеней есть доски', () {
    final empty = <int>[];
    for (var lv = 1; lv <= samuraiMaxLevel; lv++) {
      if (levels.boardsFor(lv) == 0) empty.add(lv);
    }
    expect(empty, isEmpty, reason: 'ступени без досок: ${empty.join(', ')}');
  });

  test('🔴 каждая доска целая: подсказки по решению, решение полное и законное', () {
    final broken = <String>[];
    var checked = 0;
    for (var lv = 1; lv <= samuraiMaxLevel; lv++) {
      for (var i = 0; i < levels.boardsFor(lv) && broken.length < 8; i++) {
        final b = levels.boardAt(lv, i)!;
        checked++;

        for (final cell in samuraiCells) {
          final r = cell[0], c = cell[1];
          final given = b.puzzle[r][c];
          if (given != 0 && given != b.solution[r][c]) {
            broken.add('L$lv#$i: подсказка ($r,$c)=$given, в решении ${b.solution[r][c]}');
            break;
          }
          if (b.solution[r][c] == 0) {
            broken.add('L$lv#$i: в решении пусто на ($r,$c)');
            break;
          }
        }

        // Решение не нарушает правил: снимаем клетку и проверяем, что цифра туда законна.
        final grid = [for (final row in b.solution) [...row]];
        for (final cell in samuraiCells) {
          final r = cell[0], c = cell[1];
          final v = grid[r][c];
          grid[r][c] = 0;
          final ok = isValid(grid, r, c, v);
          grid[r][c] = v;
          if (!ok) {
            broken.add('L$lv#$i: решение нарушает правило на ($r,$c)=$v');
            break;
          }
        }
      }
    }
    expect(broken, isEmpty, reason: broken.take(8).join(' · '));
    expect(checked, 72, reason: 'проверено досок: $checked');
  });

  /// ⚠️ ЗАМЕР, А НЕ ПОЖЕЛАНИЕ: лестница самурая сверху почти плоская. Пустых клеток
  /// 155 на первой ступени и 270–277 на ступенях с третьей по двенадцатую — десять
  /// ступеней отличаются семью клетками. Прочее различие ступеней несёт не доска, а
  /// цена ошибки (10 → 4) и потолок подсказок (4 → 1).
  test('ступени различимы хоть чем-то: числом называем, чем именно', () {
    double meanBlanks(int lv) {
      var sum = 0;
      for (var i = 0; i < levels.boardsFor(lv); i++) {
        sum += levels.boardAt(lv, i)!.blanks;
      }
      return sum / levels.boardsFor(lv);
    }

    final low = meanBlanks(1), high = meanBlanks(12);
    expect(high, greaterThan(low), reason: 'L1 $low пустых, L12 $high');
    // Доска сверху почти не меняется — вот число, по которому это видно.
    final spread = meanBlanks(12) - meanBlanks(5);
    expect(spread, lessThan(20),
        reason: 'разброс L5→L12 по доске: $spread клеток — ось трудности несёт не доска');
    // А цена ошибки и подсказки меняются на всём протяжении.
    expect(samuraiLevelParams(5).maxErrors - samuraiLevelParams(12).maxErrors, greaterThan(0));
    expect(samuraiLevelParams(5).hintMax - samuraiLevelParams(12).hintMax, greaterThan(0));
  });
}
