import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЦЕНА ОШИБКИ — ПОЛЕ СТУПЕНИ (задача 1fa57de3).
///
/// Лимит ошибок берётся из выгрузки лестницы (`lives` = `levelConfig.lives` веба). Неверная
/// цифра для хода — та, что уже стоит в той же строке: решатель пробе не нужен.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() => SessionReport.sink = null);

  Future<List<Map<String, dynamic>>> boot(WidgetTester tester, int level) async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '$level', 'language': 'ru'});
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(() async {
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    return reports;
  }

  String textIn(WidgetTester tester, Finder f) => find
      .descendant(of: f, matching: find.byType(Text))
      .evaluate()
      .map((e) => (e.widget as Text).data ?? '')
      .join();

  /// Пустая клетка и цифры, которые уже стоят в её строке (заведомо неверные).
  ({int r, int c, List<int> wrong}) wrongMove(WidgetTester tester, int n) {
    for (var r = 0; r < n; r++) {
      final row = [for (var c = 0; c < n; c++) int.tryParse(textIn(tester, find.byKey(Key('cell_${r}_$c')))) ?? 0];
      final present = row.where((v) => v != 0).toList();
      final empty = row.indexOf(0);
      if (empty >= 0 && present.length >= 2) return (r: r, c: empty, wrong: present);
    }
    throw StateError('нет строки с пустой клеткой и двумя подсказками');
  }

  Future<void> makeErrors(WidgetTester tester, int n, int count) async {
    final m = wrongMove(tester, n);
    for (var i = 0; i < count; i++) {
      await tester.tap(find.byKey(Key('cell_${m.r}_${m.c}')));
      await tester.pump();
      await tester.tap(find.byKey(Key('digit${m.wrong[i % m.wrong.length]}')));
      await tester.pump();
    }
  }

  testWidgets('🔴 комбо-пояс (ступень 81, лимит 1): первая ошибка кончает партию, записка с числом', (tester) async {
    final reports = await boot(tester, 81);
    expect(find.text('0/1'), findsOneWidget, reason: 'в шапке — лимит ступени, а не прежние 3');
    await makeErrors(tester, 9, 1);
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'одна ошибка — партия окончена');
    expect(find.text('Ещё раз'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('lost-note'))).data,
        L.t('outOfLivesHint').replaceAll('{n}', '1'));
    expect(find.textContaining('Ошибок: 1 из 1'), findsOneWidget);
    expect(reports.where((r) => (r['details'] as Map)['lives'] == 1), isNotEmpty, reason: 'отчёт провала несёт лимит');
  });

  testWidgets('🔴 знакомство (ступень 1, лимит 5): четыре ошибки прощаются, пятая — нет', (tester) async {
    await boot(tester, 1);
    expect(find.text('0/5'), findsOneWidget);
    await makeErrors(tester, 6, 4);
    expect(find.byKey(const Key('next')), findsNothing, reason: 'четыре ошибки из пяти — партия идёт');
    await makeErrors(tester, 6, 1);
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'пятая ошибка — конец');
    expect(find.textContaining('Ошибок: 5 из 5'), findsOneWidget);
  });
}
