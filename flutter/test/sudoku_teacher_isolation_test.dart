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

  Future<void> boot(WidgetTester t, String branch, {int level = 5}) async {
    t.view.physicalSize = const Size(800, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({
      'language': 'ru', 'psygames_sudoku_level_nzt48': '$level',
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

  /// Ответы ЭТОЙ доски уже показаны (её решение в реестре — так помечает разбор учителя) — и
  /// приложение открыто заново: партия поднимается из снимка.
  Future<void> knownAnswersReopen(WidgetTester t, String branch) async {
    await SudokuRevealedBoards(state).mark(id(t));
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    await mount(t, branch);
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

    testWidgets('$branch: one hint is help → counts, rating not raised, not practice', (t) async {
      await boot(t, branch);
      final store = GeneratorStore(state);
      final ratingBefore = (store.load().skillRating, store.load().adaptiveWins);
      await revealCurrent(t);
      expect(find.text(L.t('sudokuPracticeBadge')), findsNothing, reason: 'one digit is not a shown solution');
      await finish(t);
      final details = reports.single['details'] as Map;
      expect(details['lesson'], isNot(true));
      expect(details['hint_uses'], 1);
      expect((store.load().skillRating, store.load().adaptiveWins), ratingBefore,
          reason: 'Outcome.assisted: hints neither raise nor lower the adaptive rating');
      if (branch == 'ladder') expect(state.get('psygames_sudoku_level_nzt48'), '6');
      if (branch == 'junior') expect(state.get('psygames_sudoku_junior_level_nzt48'), '2');
      if (['towers', 'unequal', 'killer'].contains(branch)) {
        expect(state.get('psygames_sudoku_${branch}_step_nzt48'), '2');
      }
      expect(find.text(L.t('sudokuPracticeOnly')), findsNothing);
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

  testWidgets('ladder: answers of this board shown → exit → restore → completion remains practice', (t) async {
    await boot(t, 'ladder');
    final active = id(t);
    final store = GeneratorStore(state);
    final before = store.load().encode();
    await knownAnswersReopen(t, 'ladder');
    expect(id(t), active);
    await finish(t);
    final details = reports.single['details'] as Map;
    expect(details['lesson'], true);
    expect(details['completed'], false);
    expect(details['practice_completed'], true);
    expect(reports.single['score'], 0);
    expect(store.load().encode(), before, reason: 'No adaptive or shadow rating change');
    expect(state.get('psygames_sudoku_level_nzt48'), '5');
    expect(find.text(L.t('sudokuPracticeOnly')), findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('towers: answers of this board shown → restore → practice, step stays', (t) async {
    await boot(t, 'towers');
    await knownAnswersReopen(t, 'towers');
    await finish(t);
    expect((reports.single['details'] as Map)['lesson'], true);
    expect(state.get('psygames_sudoku_towers_step_nzt48'), anyOf(isNull, '1'));
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('L78: pencil note and a hint, exit, restore, finish → L79', (t) async {
    await boot(t, 'ladder', level: 78);
    final b = board(t);
    final blank = [for (var r = 0; r < b.puzzle.length; r++)
      for (var c = 0; c < b.puzzle.length; c++)
        if (b.puzzle[r][c] == 0) (r: r, c: c)].first;
    await click(t, find.byKey(Key('cell_${blank.r}_${blank.c}')));
    await click(t, find.byKey(const Key('pencil')));
    await click(t, find.byKey(Key('digit${b.solution[blank.r][blank.c]}')));
    await click(t, find.byKey(const Key('pencil')));
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing,
        reason: 'Player-authored pencil notes are not revealed answers');
    await revealCurrent(t);
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    await mount(t, 'ladder');
    await finish(t);
    expect((reports.single['details'] as Map)['lesson'], isNot(true));
    expect(state.get('psygames_sudoku_level_nzt48'), '79');
    await t.pumpWidget(const SizedBox());
  });

  // Партия, начатая на 2.56.24–2.56.31: подсказка записала в снимок `answersRevealed: true` и решение
  // доски — в реестр. После обновления она доигрывается и засчитывается, а не остаётся учебной.
  testWidgets('L78 hinted under the 04.10 rule (flag + ledger from the hint) → restore → L79', (t) async {
    await boot(t, 'ladder', level: 78);
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    final envelope = jsonDecode(state.get('psygames_resume_sudoku_nzt48')!) as Map;
    final snap = envelope['state'] as Map;
    snap['answersRevealed'] = true;
    snap['hintUses'] = 1;
    await state.set('psygames_resume_sudoku_nzt48', jsonEncode(envelope));
    await mount(t, 'ladder');
    await SudokuRevealedBoards(state).mark(id(t));
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    await mount(t, 'ladder');
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    await finish(t);
    expect((reports.single['details'] as Map)['lesson'], isNot(true));
    expect(state.get('psygames_sudoku_level_nzt48'), '79');
    await t.pumpWidget(const SizedBox());
  });

  // 🔴 Отзывы «Релакс» 16.10 (2.56.29, L79: «ВСЁ ЕЩЁ УЧЕБНЫЙ УРОВЕНЬ», «как это может быть учебная
  // попытка, если это обычный судоку») и бэкап 15.10: каждая партия с L74 — ровно одна подсказка
  // (`hint_uses=1`); L74–75 засчитаны, с L76 (правило 04.10) — учебные. Подсказка открывает ОДНУ
  // цифру — это помощь, а не показанное решение: ступень засчитывается, рейтинг — нет.
  testWidgets('L78: one hint is help, not a revealed solution → L79, not practice', (t) async {
    await boot(t, 'ladder', level: 78);
    await revealCurrent(t);
    expect(SudokuRevealedBoards(state).contains(id(t)), false, reason: 'one digit does not reveal the board');
    await finish(t);
    final details = reports.single['details'] as Map;
    expect(details['lesson'], isNot(true));
    expect(details['hint_uses'], 1);
    expect(state.get('psygames_sudoku_level_nzt48'), '79');
    expect(find.text(L.t('sudokuPracticeOnly')), findsNothing);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('practice badge: none after a hint, visible when this board\'s answers were shown', (t) async {
    await boot(t, 'ladder');
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    await revealCurrent(t);
    expect(find.text(L.t('sudokuPracticeBadge')), findsNothing);
    await t.pumpWidget(const SizedBox());
    // Отдельная чистая партия, чьи ответы показаны (учитель помечает ТОЛЬКО свою доску; на доске с
    // подсказками запись в реестре — от правила 04.10, см. пробу выше).
    await boot(t, 'ladder');
    await knownAnswersReopen(t, 'ladder');
    expect(find.text(L.t('sudokuPracticeBadge')), findsOneWidget);
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

  testWidgets('legacy level 77 without disclosure evidence advances to 78', (t) async {
    await boot(t, 'ladder', level: 77);
    await t.pumpWidget(const SizedBox());
    await t.pumpAndSettle();
    final envelope = jsonDecode(state.get('psygames_resume_sudoku_nzt48')!) as Map;
    final snapshot = envelope['state'] as Map;
    snapshot.remove('answersRevealed');
    expect(sudokuFromSnapshot(snapshot.cast<String, Object?>())!.answersRevealed, false);
    for (final (evidence, shown) in [
      ({'lesson': true}, true),
      ({'answersRevealed': true, 'hintUses': 0}, true),
      // Подсказка — не показанное решение; флаг рядом с подсказками поставила она (правило 04.10).
      ({'hintUses': 1}, false),
      ({'answersRevealed': true, 'hintUses': 1}, false),
    ]) {
      final revealed = <String, Object?>{...snapshot.cast<String, Object?>(), ...evidence};
      expect(sudokuFromSnapshot(revealed)!.answersRevealed, shown,
          reason: 'legacy metadata: $evidence');
    }
    await state.set('psygames_resume_sudoku_nzt48', jsonEncode(envelope));
    await mount(t, 'ladder');
    await finish(t);
    expect((reports.single['details'] as Map)['lesson'], isNot(true));
    expect(state.get('psygames_sudoku_level_nzt48'), '78');
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('hint on a given or already-correct cell does not disclose answers', (t) async {
    await boot(t, 'ladder');
    final b = board(t);
    final given = [for (var r = 0; r < b.puzzle.length; r++)
      for (var c = 0; c < b.puzzle.length; c++)
        if (b.puzzle[r][c] != 0) (r: r, c: c)].first;
    await click(t, find.byKey(Key('cell_${given.r}_${given.c}')));
    await click(t, find.byTooltip(L.t('btn_hint')));
    expect(SudokuRevealedBoards(state).contains(id(t)), false);
    final blank = [for (var r = 0; r < b.puzzle.length; r++)
      for (var c = 0; c < b.puzzle.length; c++)
        if (b.puzzle[r][c] == 0) (r: r, c: c)].first;
    await click(t, find.byKey(Key('cell_${blank.r}_${blank.c}')));
    await click(t, find.byKey(Key('digit${b.solution[blank.r][blank.c]}')));
    await click(t, find.byTooltip(L.t('btn_hint')));
    expect(SudokuRevealedBoards(state).contains(id(t)), false);
    await finish(t);
    expect((reports.single['details'] as Map)['hint_uses'], 0);
    expect((reports.single['details'] as Map)['lesson'], isNot(true));
    expect(state.get('psygames_sudoku_level_nzt48'), '6');
    await t.pumpWidget(const SizedBox());
  });
}
