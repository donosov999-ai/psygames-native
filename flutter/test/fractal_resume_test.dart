import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/resume.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НЕЗАКОНЧЕННАЯ ПАРТИЯ «ФРАКТАЛА» ПЕРЕЖИВАЕТ УХОД — СНИМОК В ФОРМАТЕ ВЕБА.
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.3 (строка 331). Пробы играют
/// нажатиями: цифра и пометка в дочерней сетке → уход → вход — обе на месте, цифра
/// отменяется; поля снимка — ровно поля `FractalResume` веба (сверка с исходником); снимок
/// чужой ступени не поднимается.
void main() {
  setUpAll(() async => L.load('ru'));
  const key = 'psygames_resume_sudoku_fractal_nzt48';
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_fractal_level_nzt48': '1'});
    state = await SharedState.open();
  });

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

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    return int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0;
  }

  ({int r, int c}) firstEmpty(WidgetTester tester, {({int r, int c})? skip}) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (skip != null && skip.r == r && skip.c == c) continue;
        if (digitAt(tester, r, c) == 0) return (r: r, c: c);
      }
    }
    fail('в сетке нет пустой клетки');
  }

  Map<String, Object?> stored() => ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();

  testWidgets('🔴 цифра и пометка в дочерней → уход → вход: обе на месте, цифра отменяется', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final d = firstEmpty(tester);
    await tap(tester, find.byKey(Key('cell_${d.r}_${d.c}')));
    await tap(tester, find.byKey(const Key('digit5')));
    final m = firstEmpty(tester, skip: d);
    await tap(tester, find.byKey(Key('cell_${m.r}_${m.c}')));
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit3')));
    await leave(tester);

    final env = jsonDecode(state.get(key)!) as Map;
    expect(env['v'], fractalResumeVersion, reason: 'версия — та же, что у веба (RESUME_V 3)');

    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    expect(digitAt(tester, d.r, d.c), 5, reason: 'цифра поднялась');
    expect(find.byKey(Key('marks_cell_${m.r}_${m.c}')), findsOneWidget, reason: 'пометка поднялась');
    await tap(tester, find.byTooltip(L.t('btn_undo')));
    expect(digitAt(tester, d.r, d.c), 0, reason: 'лента цифр пережила уход — отмена работает');
  });

  testWidgets('🔴 поля снимка — ровно поля FractalResume веба (sudoku-fractal.tsx)', (tester) async {
    await boot(tester);
    await leave(tester);
    final web = File('../frontend/app/games/sudoku-fractal.tsx').readAsStringSync();
    final body = RegExp(r'interface FractalResume \{([\s\S]*?)\n\}').firstMatch(web)!.group(1)!
        .replaceAll(RegExp(r'/\*\*[\s\S]*?\*/'), '');
    final webFields = RegExp(r'^\s*(\w+)\??:', multiLine: true).allMatches(body).map((x) => x.group(1)!).toSet();
    expect(webFields, isNotEmpty);
    expect(stored().keys.toSet(), webFields, reason: 'натив и веб пишут одни и те же поля');
    expect(web, contains('const RESUME_V = $fractalResumeVersion;'), reason: 'версия снимка — как у веба');
    // Снимок разбирается обратно в ту же доску.
    final again = fractalFromSnapshot(stored())!;
    expect(again.puzzle.rootSolution, (stored()['puzzle'] as Map)['root']['solution']);
    expect(again.puzzle.children.length, 9);
  });

  testWidgets('🔴 снимок чужой ступени не поднимается', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final d = firstEmpty(tester);
    await tap(tester, find.byKey(Key('cell_${d.r}_${d.c}')));
    await tap(tester, find.byKey(const Key('digit5')));
    await leave(tester);
    state.set('psygames_sudoku_fractal_level_nzt48', '2');
    await boot(tester);
    expect(stored()['level'], 2, reason: 'раздана своя доска второй ступени — снимок перезаписан');
  });
}
