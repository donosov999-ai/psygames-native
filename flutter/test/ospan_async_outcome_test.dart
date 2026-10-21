import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/ospan/model.dart';
import 'package:psygames_flutter/games/ospan/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

String textOf(WidgetTester tester, String key) =>
    tester.widget<Text>(find.byKey(Key(key))).data!;

// Solve only the displayed low-level equations and remember displayed letters.
// Every transition uses WidgetTester input on the exported screen.
Future<String> recallRound(WidgetTester tester, {required bool passed}) async {
  final seen = <String>[];
  for (var i = 0; i < 9; i++) {
    if (find.byKey(const Key('ввод')).evaluate().isNotEmpty) break;
    final parts = textOf(tester, 'равенство').split(' = ');
    final operands = parts[0].split(' ');
    final a = int.parse(operands[0]);
    final b = int.parse(operands[2]);
    final actual = operands[1] == '+' ? a + b : a - b;
    await tester.tap(
      find.byKey(Key(actual == int.parse(parts[1]) ? 'верно' : 'неверно')),
    );
    await tester.pump();
    seen.add(textOf(tester, 'буква'));
    await tester.pump(const Duration(milliseconds: 1120));
  }
  expect(find.byKey(const Key('ввод')), findsOneWidget);
  expect(seen, isNotEmpty);
  // One real recall error, not a synthetic failure flag; the pool excludes Ё.
  final typed = passed ? seen.join() : 'Ё${seen.skip(1).join()}';
  await tester.enterText(find.byKey(const Key('ввод')), typed);
  return seen.join(' ');
}

Future<void> boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: OspanScreen(state: state, rnd: createRng('async-outcome')),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('равенство')), findsOneWidget);
}

void launch(String kind) {
  if (kind == 'wu') {
    GamePreset.set({'wu': '1', 'diff': 'ospan-step', 'mode': 'ospan-mode'});
  } else if (kind == 'transit') {
    GamePreset.set({'ladderGame': 'sudoku', 'ladderLevel': '77', 'lvl': '1'});
  }
}

void checkReport(Map<String, dynamic> report, String kind) {
  expect(report['game_type'], 'ospan');
  expect(report['score'], 0);
  expect(report['time_seconds'], 0);
  if (kind == 'wu') {
    expect(report['difficulty'], 'ospan-step');
    expect(report['mode'], 'ospan-mode');
  }
  if (kind == 'transit') {
    expect(report['details']['ladderGame'], 'sudoku');
    expect(report['details']['ladderLevel'], 77);
  }
}

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() {
    SharedPreferences.setMockInitialValues({
      'psygames_ospan_level_nzt48': '1',
      'psygames_ospan_best_nzt48': '1',
    });
    GamePreset.clear();
  });
  tearDown(() {
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
    GamePreset.clear();
  });

  for (final kind in ['ordinary', 'wu', 'transit']) {
    for (final passed in [true, false]) {
      testWidgets(
        '$kind passed=$passed: double submit, frozen input, actual result and replay',
        (tester) async {
          launch(kind);
          final state = await SharedState.open();
          final gate = Completer<void>();
          final reports = <Map<String, dynamic>>[];
          final outcomes = <bool>[];
          SessionReport.sink = (body) async {
            reports.add(jsonDecode(body) as Map<String, dynamic>);
            await gate.future;
          };
          LevelLadder.onOutcome = (result, lesson) {
            expect(lesson, isFalse);
            outcomes.add(result);
          };
          await boot(tester, state);
          final truth = await recallRound(tester, passed: passed);
          final submit = find.byKey(const Key('проверить'));
          await tester.tap(submit);
          await tester.tap(submit);
          await tester.pumpAndSettle();
          expect(
            outcomes,
            isEmpty,
            reason: 'outcome follows the existing save contract',
          );
          final disabled =
              tester.widget<FilledButton>(submit).onPressed == null;
          final inputFrozen = tester
              .widget<TextField>(find.byKey(const Key('ввод')))
              .readOnly;
          await tester.tap(submit);
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('итог')), findsNothing);
          gate.complete();
          await tester.pumpAndSettle();
          expect(
            reports,
            hasLength(1),
            reason: 'one report for one submitted attempt',
          );
          expect(outcomes, [
            passed,
          ], reason: 'one actual outcome, including frozen presets');
          expect(disabled, isTrue, reason: 'submit is disabled while saving');
          expect(
            inputFrozen,
            isTrue,
            reason: 'recall input is frozen while saving',
          );
          checkReport(reports.single, kind);
          expect(
            state.get('psygames_ospan_level_nzt48'),
            kind == 'ordinary' && passed ? '2' : '1',
          );
          expect(textOf(tester, 'правда'), truth);
          expect(
            textOf(tester, 'итог'),
            passed
                ? L.f('ospanResultWin', {'n': '${truth.split(' ').length}'})
                : L.f('ospanResultFail', {'n': '1'}),
          );
          expect(
            find.text(L.t(passed ? 'nextLabel' : 'retry')),
            findsOneWidget,
          );
          await tester.tap(find.byKey(const Key('дальше')));
          await tester.pumpAndSettle();
          await recallRound(tester, passed: passed);
          await tester.tap(submit);
          await tester.pumpAndSettle();
          expect(
            reports,
            hasLength(2),
            reason: 'explicit replay is a new attempt',
          );
          expect(outcomes, [passed, passed]);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );

      testWidgets(
        '$kind passed=$passed: restart survives late old save and new attempt still reports',
        (tester) async {
          launch(kind);
          final state = await SharedState.open();
          final gate = Completer<void>();
          final reports = <Map<String, dynamic>>[];
          final outcomes = <bool>[];
          SessionReport.sink = (body) async {
            reports.add(jsonDecode(body) as Map<String, dynamic>);
            await gate.future;
          };
          LevelLadder.onOutcome = (result, lesson) => outcomes.add(result);
          await boot(tester, state);
          await recallRound(tester, passed: passed);
          await tester.tap(find.byKey(const Key('проверить')));
          await tester.pumpAndSettle();
          expect(reports, hasLength(1));
          expect(outcomes, isEmpty);
          await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
          await tester.pumpAndSettle();
          final equation = textOf(tester, 'равенство');
          gate.complete();
          await tester.pumpAndSettle();
          expect(outcomes, [
            passed,
          ], reason: 'submitted old attempt still finishes its report');
          expect(
            find.byKey(const Key('равенство')),
            findsOneWidget,
            reason:
                'late old completion must not replace the restarted equation',
          );
          expect(textOf(tester, 'равенство'), equation);
          expect(find.byKey(const Key('итог')), findsNothing);
          await recallRound(tester, passed: !passed);
          await tester.tap(find.byKey(const Key('проверить')));
          await tester.pumpAndSettle();
          expect(reports, hasLength(2));
          expect(outcomes, [passed, !passed]);
          expect(
            find.text(L.t(passed ? 'retry' : 'nextLabel')),
            findsOneWidget,
          );
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }

  // Ответ — набор букв: автозамена клавиатуры не должна его переписывать
  // (отчёт 6589e751: «ЛВБ» превратилось в «ДУБ»). Мерим то, что уходит в
  // клавиатуру платформы, — EditableText, а не обёртку TextField.
  testWidgets('recall field turns off autocorrect and suggestions', (
    tester,
  ) async {
    final state = await SharedState.open();
    await boot(tester, state);
    await recallRound(tester, passed: true);
    final editable = tester.widget<EditableText>(
      find.descendant(
        of: find.byKey(const Key('ввод')),
        matching: find.byType(EditableText),
      ),
    );
    expect(editable.autocorrect, isFalse);
    expect(editable.enableSuggestions, isFalse);
    expect(
      editable.spellCheckConfiguration?.spellCheckEnabled ?? false,
      isFalse,
    );
  });

  testWidgets('unmounted screen ignores delayed completion', (tester) async {
    final state = await SharedState.open();
    final gate = Completer<void>();
    var reports = 0;
    final outcomes = <bool>[];
    SessionReport.sink = (_) async {
      reports += 1;
      await gate.future;
    };
    LevelLadder.onOutcome = (result, lesson) => outcomes.add(result);
    await boot(tester, state);
    await recallRound(tester, passed: false);
    await tester.tap(find.byKey(const Key('проверить')));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    gate.complete();
    await tester.pumpAndSettle();
    expect(reports, 1);
    expect(outcomes, [false]);
    expect(tester.takeException(), isNull);
  });
}
