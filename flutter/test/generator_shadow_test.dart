import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/generator/store.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ТЕНЕВОЙ ШАГ ПРОВЕРЯЕТСЯ НА ЖИВОМ ЭКРАНЕ, А НЕ НА ВЫЗОВЕ ФУНКЦИИ.
///
/// Смысл шага (§10.2): человек играет ПРЕЖНЮЮ доску прописанной лестницы, а генератор
/// рядом записывает, что выбрал бы, и учит рейтинг на настоящих исходах. Значит и
/// проверять надо ровно это: партия идёт как раньше, журнал пополняется, рейтинг
/// двигается, а ключи прописанного пути не шевелятся.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '5'});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  bool solveSimple(List<List<int>> g) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (g[r][c] != 0) continue;
        for (var v = 1; v <= 9; v++) {
          var ok = true;
          for (var i = 0; i < 9 && ok; i++) {
            if (g[r][i] == v || g[i][c] == v) ok = false;
          }
          final r0 = (r ~/ 3) * 3, c0 = (c ~/ 3) * 3;
          for (var i = 0; i < 3 && ok; i++) {
            for (var j = 0; j < 3 && ok; j++) {
              if (g[r0 + i][c0 + j] == v) ok = false;
            }
          }
          if (!ok) continue;
          g[r][c] = v;
          if (solveSimple(g)) return true;
          g[r][c] = 0;
        }
        return false;
      }
    }
    return true;
  }

  testWidgets('🔴 раздача пишет теневой выбор: что выдано и что выбрал бы генератор', (tester) async {
    await boot(tester);
    final store = GeneratorStore(state);
    final log = store.shadowLog();
    expect(log, isNotEmpty, reason: 'теневой журнал пуст — шаг не работает');

    final row = log.last;
    expect(row['level'], 5);
    final given = (row['given'] as Map).cast<String, Object?>();
    expect(given['id'], startsWith('sudoku:'), reason: 'шаблон выданной доски');
    expect(row['wouldPick'], isNotNull, reason: 'генератор обязан назвать свой выбор');
    expect(row['playerRating'], isA<int>());
  });

  testWidgets('🔴 человеку выдаётся доска ЛЕСТНИЦЫ, генератор на неё не влияет', (tester) async {
    await boot(tester);
    // Уровень 5 — классика 9×9 из банка: генератор мог бы предложить другое, но доска
    // пришла от лестницы, и это видно по её виду.
    expect(find.byKey(const Key('cell_8_8')), findsOneWidget);
    expect(find.text('5'), findsWidgets, reason: 'номер уровня прежний, из общего ключа');
    expect(state.get('psygames_sudoku_level_nzt48'), '5',
        reason: 'раздача не смеет двигать прописанный уровень');
  });

  testWidgets('🔴 победа учит рейтинг генератора, а прописанный ключ ведёт себя как прежде',
      (tester) async {
    await boot(tester);
    final store = GeneratorStore(state);
    final before = store.load();
    expect(before.adaptiveWins, 0);

    final grid = [
      for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, r, c)],
    ];
    final solution = [for (final row in grid) [...row]];
    expect(solveSimple(solution), isTrue);

    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] != 0) continue;
        await tester.tap(find.byKey(Key('cell_${r}_$c')));
        await tester.pump();
        await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
        await tester.pump();
      }
    }

    final after = store.load();
    expect(after.adaptiveWins, 1, reason: 'победа записана в счётчик генератора');
    expect(after.skillRating, isNot(before.skillRating), reason: 'рейтинг сдвинулся');
    // А прописанный путь живёт своей жизнью: уровень вырос ровно на один, как всегда.
    expect(state.get('psygames_sudoku_level_nzt48'), '6');
  });

  testWidgets('🔴 журнал теневого выбора — это данные, а не строка в коде', (tester) async {
    await boot(tester);
    final raw = state.get(GeneratorStore(state).shadowKey);
    expect(raw, isNotNull);
    final parsed = jsonDecode(raw!) as List;
    expect(parsed, isNotEmpty);
    expect((parsed.first as Map).containsKey('given'), isTrue);
  });
}
