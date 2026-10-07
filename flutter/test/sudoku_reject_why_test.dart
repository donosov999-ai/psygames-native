import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОЧЕМУ ЦИФРА НЕ ПОДОШЛА — ОТВЕТ НАТИВА = ОТВЕТ ЖИВОГО rejectionReason (п.6 b5df5096).
///
/// Повод — три ночных отчёта Вали 22.08 («удаляю программу»): неверная цифра оставалась без
/// объяснения. Сверка — по эталону правил: у каждого неверного хода `why` — выгрузка живого
/// `rejectionReason` веба (`tools/export-sudoku-boards.cjs`, словарь-заглушка отдаёт ключ):
/// '' — молчим, иначе ключ правила или `sudokuWhyNotLocal`. 26 вариантов лестницы и режимов.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final data = jsonDecode(File('test/fixtures/sudoku-rules-reference.json').readAsStringSync())
      as Map<String, Object?>;
  final boards = (data['boards'] as List).cast<Map<String, Object?>>();

  test('🔴 причина отказа КАЖДОГО неверного хода эталона совпадает с живым TS', () {
    var checked = 0, named = 0, silent = 0;
    final wrong = <String>[];
    for (final board in boards) {
      final variant = board['variant'] as String;
      final n = (board['n'] as num).toInt(), br = (board['br'] as num).toInt(), bc = (board['bc'] as num).toInt();
      final grid = [for (final row in board['grid'] as List) [for (final x in row as List) (x as num).toInt()]];
      final geometry = BoardGeometry.fromJson((board['extras'] as Map).cast<String, Object?>());
      for (final cs in (board['cases'] as List).cast<Map<String, Object?>>()) {
        if (!cs.containsKey('why')) continue;   // верная цифра — причину не спрашивают
        final r = (cs['r'] as num).toInt(), c = (cs['c'] as num).toInt(), val = (cs['val'] as num).toInt();
        final placed = [for (final row in grid) [...row]]..[r][c] = val;
        final got = rejectionKey(placed, r, c, val, n: n, br: br, bc: bc, variant: variant, geometry: geometry);
        final want = (cs['why'] as String).isEmpty ? null : cs['why'] as String;
        if (got != want) wrong.add('$variant ($r,$c)=$val: натив $got, веб $want');
        checked++;
        if (want == null) silent++;
        if (want != null && want != 'sudokuWhyNotLocal') named++;
      }
    }
    expect(wrong, isEmpty, reason: 'расхождения с живым TS:\n${wrong.take(12).join('\n')}');
    expect(checked, greaterThan(300), reason: 'неверных ходов проверено мало — не сломан ли перебор');
    expect(named, greaterThan(100), reason: 'эталон обязан содержать случаи, где правило НАЗВАНО');
    expect(silent, greaterThan(0), reason: 'и случаи молчания (базовый конфликт)');
  });

  test('🔴 у каждого ключа правила — текст во всех 12 словарях (сырой ключ на экране — дефект)', () {
    final missing = <String>[];
    for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      final dict = jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map<String, Object?>;
      for (final k in sudokuRuleKeys) {
        final v = dict[k];
        if (v is! String || v.trim().isEmpty || v == k) missing.add('$lang:$k');
      }
    }
    expect(missing, isEmpty);
  });

  // ─────────────────────────── экран: нажатиями ───────────────────────────

  late SharedState state;

  Future<void> boot(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '5'});   // классика 9×9
    await tester.runAsync(() async {
      state = await SharedState.open();
      await L.load('ru');
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  int valueAt(WidgetTester tester, int r, int c) {
    for (final e in find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text)).evaluate()) {
      final t = e.widget as Text;
      final v = int.tryParse(t.data ?? '');
      if (t.key == null && v != null) return v;
    }
    return 0;
  }

  String? why(WidgetTester tester) {
    final f = find.byKey(const Key('sudoku-why'));
    return f.evaluate().isEmpty ? null : tester.widget<Text>(f).data;
  }

  testWidgets('🔴 неверная цифра без местного конфликта — строка «смотри строку, столбец и квадрат»; верная гасит', (tester) async {
    await boot(tester);
    final raw = (jsonDecode(state.get('psygames_resume_sudoku_nzt48')!) as Map)['state'] as Map;
    final sol = [for (final row in raw['solution'] as List) [for (final v in row as List) (v as num).toInt()]];
    final grid = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) valueAt(tester, r, c)]];
    // Пустая клетка и цифра не по решению, которая НЕ спорит со строкой, столбцом и квадратом.
    late int r0, c0, v0;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        if (grid[r][c] != 0) continue;
        for (var v = 1; v <= 9 && !found; v++) {
          if (v != sol[r][c] && isValid(grid, r, c, v, 9, 3, 3)) {
            (r0, c0, v0) = (r, c, v);
            found = true;
          }
        }
      }
    }
    expect(found, isTrue);
    expect(why(tester), isNull, reason: 'до ошибки строки нет');
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$v0')));
    expect(why(tester), L.t('sudokuWhyNotLocal'), reason: 'вину доказать нечем — так и сказано');
    expect(why(tester), isNot('sudokuWhyNotLocal'), reason: 'текст из словаря, не сырой ключ');

    await tap(tester, find.byKey(Key('digit${sol[r0][c0]}')));
    expect(why(tester), isNull, reason: 'верная цифра гасит строку причины');
  });

  testWidgets('🔴 цифра, которая уже стоит в строке, — строки причины нет: конфликт виден на доске', (tester) async {
    await boot(tester);
    late int r0, c0, dup;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      final row = [for (var c = 0; c < 9; c++) valueAt(tester, r, c)];
      for (var c = 0; c < 9 && !found; c++) {
        if (row[c] == 0 && row.any((v) => v != 0)) {
          (r0, c0, dup) = (r, c, row.firstWhere((v) => v != 0));
          found = true;
        }
      }
    }
    expect(found, isTrue);
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$dup')));
    expect(why(tester), isNull);
  });
}
