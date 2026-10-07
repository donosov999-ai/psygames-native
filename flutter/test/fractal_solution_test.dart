import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/rules.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ПОКАЗАТЬ РЕШЕНИЕ» ВО «ФРАКТАЛЕ» — КАК У ВЕБА (сверка 138f7818, строка 34, «высокая»;
/// запрос Дениса 18.09, отзыв 585fc14c: партия из десяти сеток без выхода к ответу).
///
/// Показ — сдача: ступень не засчитана и не опущена, флаг в снимке; ответ ставится обычными
/// ходами движка; итог разбора — ПОД ответом, без выброса с доски. Всё нажатиями.
void main() {
  setUpAll(() async => L.load('ru'));
  const key = 'psygames_resume_sudoku_fractal_nzt48';
  const levelKey = 'psygames_sudoku_fractal_level_nzt48';
  late SharedState state;
  late List<Map<String, dynamic>> reports;

  setUp(() async {
    SharedPreferences.setMockInitialValues({levelKey: '1'});
    state = await SharedState.open();
    reports = [];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });
  tearDown(() => SessionReport.sink = null);

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  Map<String, Object?> stored() => ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();
  List<List<int>> grid9(Object? v) => [for (final row in v as List) [for (final x in row as List) (x as num).toInt()]];

  int digitAt(WidgetTester tester, String prefix, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('$prefix${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    return int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0;
  }

  List<List<int>> read(WidgetTester tester, String prefix) =>
      [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, prefix, r, c)]];

  Future<void> askAndConfirm(WidgetTester tester) async {
    await tap(tester, find.byKey(const Key('show-solution')));
    expect(find.byKey(const Key('fractal-solution-ask')), findsOneWidget, reason: 'сначала вопрос');
    await tap(tester, find.byKey(const Key('fractal-solution-confirm')));
  }

  testWidgets('🔴 лампочка спрашивает на месте клавиатуры; «Отмена» не трогает партию', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('show-solution')));
    expect(find.text(L.t('fractalSolutionAskAll')), findsOneWidget, reason: 'на карте — вопрос про всю судоку');
    expect(find.byKey(const Key('digit1')), findsNothing, reason: 'вопрос стоит вместо клавиш');
    final before = read(tester, 'root_');
    await tap(tester, find.byKey(const Key('fractal-solution-cancel')));
    expect(read(tester, 'root_'), before);
    expect(stored()['solverUsed'], false);

    await tap(tester, find.byKey(const Key('tile0')));
    await tap(tester, find.byKey(const Key('show-solution')));
    expect(find.text(L.t('fractalSolutionAskChild')), findsOneWidget, reason: 'в нижней — вопрос про неё');
  });

  testWidgets('🔴 ответ нижней сетки: сетка сошлась, партия сдана, отмены нет, ступень та же', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final sol = grid9((((stored()['puzzle'] as Map)['children'] as List)[0] as Map)['solution']);
    // Ход ДО показа: после показа его отмена разобрала бы ответ по клетке.
    final g = read(tester, 'cell_');
    final r0 = [for (var i = 0; i < 9; i++) i].firstWhere((i) => g[i].contains(0));
    final c0 = g[r0].indexOf(0);
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit${sol[r0][c0]}')));
    await askAndConfirm(tester);
    expect(find.byKey(const Key('cell_0_0')), findsOneWidget, reason: 'с нижней сетки на карту не уводит');
    expect(read(tester, 'cell_'), sol, reason: 'показан ответ сетки');
    expect(stored()['solverUsed'], true, reason: 'сдача — в снимке');
    expect(find.byKey(const Key('fractal-solution-used')), findsOneWidget, reason: 'строка «решение показано»');
    await tap(tester, find.byTooltip(L.t('btn_undo')));
    expect(read(tester, 'cell_'), sol, reason: 'показанное не отменяется — отмена ничего не разбирает');
    expect(state.get(levelKey), '1');
    expect(reports, isEmpty, reason: 'партия идёт дальше — отчёта ещё нет');
  });

  testWidgets('🔴 ответ всей судоку: разбор под ответом, отчёт solver_used, ступень не тронута', (tester) async {
    await boot(tester);
    await askAndConfirm(tester);
    expect(state.get(key), isNull, reason: 'разбор окончен — продолжать нечего, снимок стёрт');
    expect(find.byKey(const Key('fractal-solution-shown')), findsOneWidget, reason: 'итог — под ответом');
    expect(find.byKey(const Key('root_0_0')), findsOneWidget, reason: 'доска с ответом осталась на экране');
    expect(read(tester, 'root_').expand((r) => r).contains(0), isFalse, reason: 'корень заполнен');
    expect(reports, hasLength(1));
    expect(reports.single['score'], 0);
    expect((reports.single['details'] as Map)['solver_used'], true);
    expect(state.get(levelKey), '1', reason: 'ступень не засчитана и не опущена');

    await tap(tester, find.byKey(const Key('fractal-retry')));
    await tester.pump();
    expect(find.byKey(const Key('fractal-solution-shown')), findsNothing);
    expect(stored()['solverUsed'], false, reason: 'новая партия — без сдачи');
  });

  testWidgets('🔴 сдача переживает уход: строка «решение показано» снова на месте', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    await askAndConfirm(tester);
    await tester.pumpWidget(const SizedBox());
    await boot(tester);
    expect(find.byKey(const Key('fractal-solution-used')), findsOneWidget, reason: 'выход и вход не отмывают показ');
  });

  testWidgets('🔴 после показа корень, дособранный рукой, — разбор, а не победа', (tester) async {
    await boot(tester);
    for (var k = 0; k < 9; k++) {
      await tap(tester, find.byKey(Key('tile$k')));
      await askAndConfirm(tester);
      await tap(tester, find.byTooltip(L.t('sdkToMap')));
    }
    final pz = (stored()['puzzle'] as Map)['root'] as Map;
    final sol = grid9(pz['solution']), puzzle = grid9(pz['puzzle']);
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (!rootEditable(puzzle, r, c) || digitAt(tester, 'root_', r, c) != 0) continue;
        await tap(tester, find.byKey(Key('root_${r}_$c')));
        await tap(tester, find.byKey(Key('digit${sol[r][c]}')));
      }
    }
    expect(find.byKey(const Key('fractal-solution-shown')), findsOneWidget, reason: 'партия сдана — итог разбора');
    expect(find.byKey(const Key('next')), findsNothing, reason: 'не «следующий уровень»');
    expect(state.get(levelKey), '1', reason: 'ступень за сданную партию не растёт');
    expect((reports.single['details'] as Map)['solver_used'], true);
  });
}
