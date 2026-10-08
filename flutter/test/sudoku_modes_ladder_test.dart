import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/mode_board.dart';
import 'package:psygames_flutter/games/sudoku/resume.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НАШИ НЕБОСКРЁБЫ И НЕРАВЕНСТВА — ВАРИАНТЫ ЛЕСТНИЦЫ (письмо раздела уровней 2d8320ed, блоки 153+).
/// Общее поле лестницы ни кольца подсказок, ни знаков между клетками не рисует — их рисует поле
/// режимов (`ModeBoard`). Проба: доска лестницы с вариантом 'towers'/'unequal' (снимок партии —
/// на лестнице её ещё нет) показывается полем режимов с подсказками; классика — общим полем.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const key = 'psygames_resume_sudoku_nzt48';
  late SharedState state;

  final data = jsonDecode(File('test/fixtures/sudoku-rules-reference.json').readAsStringSync()) as Map<String, Object?>;
  Map<String, Object?> refOf(String v) => (data['boards'] as List).cast<Map<String, Object?>>().firstWhere((b) => b['variant'] == v);

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });

  Future<void> mount(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  for (final variant in ['towers', 'unequal']) {
    testWidgets('🔴 $variant на лестнице — поле режимов с подсказками, а не общее поле', (tester) async {
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
      await tester.runAsync(() async => state = await SharedState.open());
      await mount(tester);
      expect(find.byType(ModeBoard), findsNothing, reason: 'классика — общим полем');
      await tap(tester, find.byKey(const Key('cell_0_0')));
      await tap(tester, find.byKey(const Key('digit5')));
      await tester.pumpWidget(const SizedBox());
      await tester.pump();

      final ref = refOf(variant);
      final n = ref['n']! as int;
      final grid = ref['grid']! as List;
      final extras = (ref['extras']! as Map).cast<String, Object?>();
      final env = (jsonDecode(state.get(key)!) as Map).cast<String, Object?>();
      final s = (env['state'] as Map).cast<String, Object?>()
        ..addAll(webGeometry(extras))
        ..['variant'] = variant
        ..['dims'] = {'N': n, 'BR': ref['br'], 'BC': ref['bc']}
        ..['puzzle'] = grid
        ..['solution'] = ref['solution']
        ..['grid'] = grid
        ..['given'] = [for (final row in grid) [for (final v in row as List) v != 0]]
        ..['marks'] = List.generate(n, (_) => List.filled(n, 0))
        ..['cellColors'] = List.generate(n, (_) => List.filled(n, noSudokuColor))
        ..['history'] = {'past': <Object>[], 'future': <Object>[]}
        ..['errors'] = 0;
      env['state'] = s;
      await tester.runAsync(() => state.set(key, jsonEncode(env)));
      await mount(tester);

      expect(find.byType(ModeBoard), findsOneWidget, reason: '$variant рисует поле режимов');
      expect(find.byType(SudokuBoardView), findsNothing);
      if (variant == 'towers') {
        expect(find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('clue_')),
            findsWidgets, reason: 'кольцо подсказок на месте');
      }
      // Ход по полю режимов доходит до партии.
      final (r, c) = [for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) if ((grid[i] as List)[j] == 0) (i, j)].first;
      await tap(tester, find.byKey(Key('cell_${r}_$c')));
      await tap(tester, find.byKey(Key('digit${((ref['solution']! as List)[r] as List)[c]}')));
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      final st = ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();
      expect(((st['grid']! as List)[r] as List)[c], ((ref['solution']! as List)[r] as List)[c], reason: 'ход записан');
    });
  }
}
