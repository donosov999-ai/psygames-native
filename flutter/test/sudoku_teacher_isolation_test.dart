import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/attempt.dart';
import 'package:psygames_flutter/games/sudoku/generator/store.dart';
import 'package:psygames_flutter/games/sudoku/mode_board.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/resume.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() => SessionReport.sink = null);
  const branches = ['ladder', 'adaptive', 'junior', 'towers', 'unequal', 'killer', 'free'];
  late SharedState state;
  late List<Map<String, dynamic>> reports;

  Widget screen(String branch) => SudokuScreen(
    state: state, junior: branch == 'junior', mode: sideModeFrom(branch),
  );

  Future<void> mount(WidgetTester t, String branch) async {
    await t.runAsync(() async {
      await t.pumpWidget(MaterialApp(home: screen(branch)));
      for (var i = 0; i < 100; i++) {
        await t.pump(const Duration(milliseconds: 20));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await t.pump();
    expect(find.byKey(const Key('cell_0_0')), findsOneWidget);
  }

  Future<void> boot(WidgetTester t, String branch) async {
    t.view.physicalSize = const Size(800, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({
      'language': 'ru', 'psygames_sudoku_level_nzt48': '5',
      'psygames_sudoku_skin_nzt48': 'digits',
      if (branch == 'adaptive') 'psygames_sudoku_adaptive_on_nzt48': '1',
    });
    state = await SharedState.open();
    reports = [];
    SessionReport.sink = (s) async => reports.add(jsonDecode(s) as Map<String, dynamic>);
    await mount(t, branch);
  }

  ({List<List<int>> puzzle, List<List<int>> solution}) board(WidgetTester t) {
    final side = find.byType(ModeBoard);
    if (side.evaluate().isNotEmpty) {
      final b = t.widget<ModeBoard>(side.last).board;
      return (puzzle: b.puzzle, solution: b.solution);
    }
    final b = t.widget<SudokuBoardView>(find.byType(SudokuBoardView).last).board;
    return (puzzle: b.puzzle, solution: b.solution);
  }

  String id(WidgetTester t) {
    final b = board(t);
    return sudokuAnswerId(b.puzzle, b.solution);
  }

  Future<void> click(WidgetTester t, Finder f) async {
    await t.ensureVisible(f);
    await t.tap(f);
    await t.pumpAndSettle();
  }

  Future<String> teacher(WidgetTester t) async {
    await click(t, find.byKey(const Key('game-lesson')));
    await t.runAsync(() async => Future<void>.delayed(const Duration(milliseconds: 30)));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('lesson-close')), findsOneWidget);
    return id(t);
  }

  Future<void> finish(WidgetTester t) async {
    final b = board(t);
    for (var r = 0; r < b.puzzle.length; r++) {
      for (var c = 0; c < b.puzzle.length; c++) {
        if (b.puzzle[r][c] != 0) continue;
        await click(t, find.byKey(Key('cell_${r}_$c')));
        await click(t, find.byKey(Key('digit${b.solution[r][c]}')));
      }
    }
    await t.runAsync(() async => Future<void>.delayed(const Duration(milliseconds: 30)));
    await t.pumpAndSettle();
    expect(reports, hasLength(1));
  }

  Future<void> revealCurrent(WidgetTester t) async {
    final b = board(t);
    for (var r = 0; r < b.puzzle.length; r++) {
      for (var c = 0; c < b.puzzle.length; c++) {
        if (b.puzzle[r][c] != 0) continue;
        await click(t, find.byKey(Key('cell_${r}_$c')));
        await click(t, find.byTooltip(L.t('btn_hint')));
        return;
      }
    }
    fail('No blank cell');
  }

  for (final branch in branches) {
    testWidgets('$branch: separate teacher → return → independent completion', (t) async {
      await boot(t, branch);
      final active = id(t);
      final training = await teacher(t);
      expect(training, isNot(active));
      expect(SudokuRevealedBoards(state).contains(training), isTrue);
      await click(t, find.byKey(const Key('lesson-close')));
      expect(id(t), active);
      // Persist/reopen the app: ladder restores its attempt; the other branches
      // currently deal again. Neither path may deal the demonstrated answers.
      await t.pumpWidget(const SizedBox());
      await t.pumpAndSettle();
      state = await SharedState.open();
      await mount(t, branch);
      expect(id(t), isNot(training));
      if (branch == 'ladder') expect(id(t), active);
      await finish(t);
      expect(reports.single['score'], greaterThan(0));
      expect((reports.single['details'] as Map)['lesson'], isNot(true));
      if (branch == 'ladder') expect(state.get('psygames_sudoku_level_nzt48'), '6');
      if (branch == 'junior') expect(state.get('psygames_sudoku_junior_level_nzt48'), '2');
      if (branch == 'adaptive') expect(GeneratorStore(state).load().adaptiveWins, 1);
      if (['towers', 'unequal', 'killer'].contains(branch)) {
        expect(state.get('psygames_sudoku_${branch}_step_nzt48'), '2');
      }
      await t.pumpWidget(const SizedBox());
    });

    testWidgets('$branch: revealed current attempt → no progression or rating', (t) async {
      await boot(t, branch);
      final store = GeneratorStore(state);
      final before = store.load().encode();
      final levelsBefore = Map.of(state.snapshot())..removeWhere((k, v) => !k.contains('_level_') && !k.contains('_step_'));
      await revealCurrent(t);
      await finish(t);
      final details = reports.single['details'] as Map;
      expect(details['lesson'], true);
      expect(details['completed'], false);
      expect(details['practice_completed'], true);
      expect(reports.single['score'], 0);
      expect(store.load().encode(), before, reason: 'No adaptive or shadow rating change');
      final levelsAfter = Map.of(state.snapshot())..removeWhere((k, v) => !k.contains('_level_') && !k.contains('_step_'));
      expect(levelsAfter, levelsBefore);
      expect(find.text(L.t('sudokuPracticeOnly')), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    });

    testWidgets('$branch: try independently → new, unrevealed board', (t) async {
      await boot(t, branch);
      final original = id(t);
      final training = await teacher(t);
      await click(t, find.byKey(const Key('lesson-new-board')));
      expect(id(t), isNot(original));
      expect(id(t), isNot(training));
      expect(SudokuRevealedBoards(state).contains(id(t)), false);
      await finish(t);
      expect(reports.single['score'], greaterThan(0));
      expect((reports.single['details'] as Map)['lesson'], isNot(true));
      await t.pumpWidget(const SizedBox());
    });
  }

  testWidgets('ladder: revealed → exit → restore → completion remains practice', (t) async {
    await boot(t, 'ladder');
    final active = id(t);
    await revealCurrent(t);
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    final raw = jsonDecode(state.get('psygames_resume_sudoku_nzt48')!) as Map;
    expect((raw['state'] as Map)['answersRevealed'], true);
    await mount(t, 'ladder');
    expect(id(t), active);
    await finish(t);
    expect((reports.single['details'] as Map)['lesson'], true);
    expect(state.get('psygames_sudoku_level_nzt48'), '5');
    await t.pumpWidget(const SizedBox());
  });

  test('answer identity survives different givens, restart and profile change', () async {
    SharedPreferences.setMockInitialValues({});
    final s = await SharedState.open();
    final ledger = SudokuRevealedBoards(s);
    final solution = [[1, 2], [2, 1]];
    final a = sudokuAnswerId([[0, 2], [2, 0]], solution);
    final b = sudokuAnswerId([[1, 0], [0, 1]], solution);
    await ledger.mark(a);
    await s.set('psygames_active_profile', 'free');
    expect(SudokuRevealedBoards(await SharedState.open()).contains(b), true);
    expect(sudokuDistinctBoard<String>(draw: (i) => b, identity: (v) => v,
      reject: ledger.contains), isNull);
    expect(sudokuDistinctBoard<String>(draw: (i) => i == 0 ? b : 'fresh', identity: (v) => v,
      reject: ledger.contains), 'fresh');
  });

  test('corrupt ledger fails closed', () async {
    SharedPreferences.setMockInitialValues({SudokuRevealedBoards.key: '{broken'});
    expect(SudokuRevealedBoards(await SharedState.open()).contains('any'), true);
  });

  testWidgets('legacy resume without disclosure flag is practice, not an invented clean attempt', (t) async {
    await boot(t, 'ladder');
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    final envelope = jsonDecode(state.get('psygames_resume_sudoku_nzt48')!) as Map;
    final snapshot = envelope['state'] as Map;
    snapshot.remove('answersRevealed');
    expect(sudokuFromSnapshot(snapshot.cast<String, Object?>())!.answersRevealed, true);
    await state.set('psygames_resume_sudoku_nzt48', jsonEncode(envelope));
    await mount(t, 'ladder');
    await finish(t);
    expect((reports.single['details'] as Map)['lesson'], true);
    expect(state.get('psygames_sudoku_level_nzt48'), '5');
    await t.pumpWidget(const SizedBox());
  });
}
