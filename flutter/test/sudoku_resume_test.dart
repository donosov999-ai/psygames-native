import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/resume.dart';
import 'package:psygames_flutter/games/sudoku/roads.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НЕЗАКОНЧЕННАЯ ПАРТИЯ ЛЕСТНИЦЫ «СУДОКУ» ПЕРЕЖИВАЕТ УХОД — СНИМОК В ФОРМАТЕ ВЕБА.
///
/// Сверка «веб против натива» 138f7818, задача b5df5096 п.3 (строка 114). Пробы: цифра, пометка
/// и цвет → уход → вход — всё на месте, отмена работает; поля снимка = поля `SudokuResume` из
/// исходника веба; геометрия КАЖДОЙ вариантной ступени переживает перевод в форму веба и обратно;
/// проигрыш стирает снимок; чужая дорога не поднимает партию.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const key = 'psygames_resume_sudoku_nzt48';
  late SharedState state;

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });

  Future<void> boot(WidgetTester tester, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues({'language': 'ru', ...prefs});
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Вход в ту же общую память (настройки уже лежат в `state`).
  Future<void> reboot(WidgetTester tester) async {
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

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    return int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0;
  }

  ({int r, int c}) firstEmpty(WidgetTester tester, int n, {({int r, int c})? skip}) {
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (skip != null && skip.r == r && skip.c == c) continue;
        if (digitAt(tester, r, c) == 0) return (r: r, c: c);
      }
    }
    fail('пустой клетки нет');
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  Map<String, Object?> stored() => ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();

  testWidgets('🔴 цифра и пометка → уход → вход: обе на месте, отмена работает; снимок v4 лестницы', (tester) async {
    await boot(tester, {'psygames_sudoku_level_nzt48': '5'});
    final d = firstEmpty(tester, 9);
    await tap(tester, find.byKey(Key('cell_${d.r}_${d.c}')));
    await tap(tester, find.byKey(const Key('digit5')));
    final m = firstEmpty(tester, 9, skip: d);
    await tap(tester, find.byKey(Key('cell_${m.r}_${m.c}')));
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit3')));
    await leave(tester);

    final env = jsonDecode(state.get(key)!) as Map;
    expect(env['v'], sudokuResumeVersion, reason: 'версия — та же, что у веба (SUDOKU_RESUME_V)');
    expect(stored()['mode'], 'levels');
    expect(stored()['road'], 'normal');

    await reboot(tester);
    expect(digitAt(tester, d.r, d.c), 5, reason: 'цифра поднялась');
    expect(find.byKey(Key('marks_${m.r}_${m.c}')), findsOneWidget, reason: 'пометка поднялась');
    await tap(tester, find.byTooltip(L.t('btn_undo')));   // отменяет пометку
    await tap(tester, find.byTooltip(L.t('btn_undo')));   // отменяет цифру
    expect(digitAt(tester, d.r, d.c), 0, reason: 'лента пережила уход — отмена работает');
  });

  testWidgets('🔴 поля снимка — ровно поля SudokuResume веба (app/games/sudoku.tsx)', (tester) async {
    await boot(tester, {'psygames_sudoku_level_nzt48': '50'});
    await leave(tester);
    final web = File('../frontend/app/games/sudoku.tsx').readAsStringSync();
    final body = RegExp(r'interface SudokuResume \{([\s\S]*?)\n\}').firstMatch(web)!.group(1)!
        .replaceAll(RegExp(r'/\*\*[\s\S]*?\*/'), '');
    final webFields = RegExp(r'^\s*(\w+)\??:', multiLine: true).allMatches(body).map((x) => x.group(1)!).toSet();
    expect(webFields.length, greaterThan(30));
    expect(stored().keys.toSet(), webFields, reason: 'натив и веб пишут одни и те же поля');
    expect(web, contains('const RESUME_V = $sudokuResumeVersion;'));
    expect(stored()['variant'], 'thermocage');
    expect(stored()['cages'], isNotNull, reason: 'клетки-суммы термо-клеток в снимке');
    expect(stored()['thermo'], isNotNull, reason: 'термометры в снимке');
  });

  test('🔴 геометрия КАЖДОЙ вариантной ступени переживает перевод в форму веба и обратно', () async {
    final levels = await SudokuLevels.load();
    var checked = 0;
    for (var lv = 1; lv <= levels.lastLevel; lv++) {
      final b = levels.boardAt(lv, 0);
      if (b == null || b.geometryJson.isEmpty) continue;
      final back = exportGeometry(webGeometry(b.geometryJson));
      String canon(Object? v) {
        if (v is Map) {
          final keys = v.keys.map((k) => '$k').toList()..sort();
          return '{${[for (final k in keys) '$k:${canon(v[k])}'].join(',')}}';
        }
        if (v is List) return '[${v.map(canon).join(',')}]';
        return '$v';
      }

      final orig = Map<String, Object?>.from(b.geometryJson);
      // cells клеток-сумм восстанавливаются из cageOf — порядок клеток внутри группы не важен.
      Map<String, Object?> norm(Map<String, Object?> g) {
        final cages = g['cages'];
        if (cages is! Map) return {for (final e in g.entries) if (e.value != null) e.key: e.value};
        final cells = [
          for (final cage in (cages['cells'] as List)) ((cage as List?) ?? const []).map((p) => '$p').toList()..sort(),
        ];
        return {
          for (final e in g.entries) if (e.value != null && e.key != 'cages') e.key: e.value,
          'cages': {'cageOf': cages['cageOf'], 'sum': cages['sum'], 'anchor': cages['anchor'] ?? const [], 'cells': cells},
        };
      }

      expect(canon(norm(back)), canon(norm(orig)), reason: 'ступень $lv (${b.variant}): геометрия разошлась');
      checked++;
    }
    expect(checked, greaterThan(50), reason: 'вариантных ступеней проверено мало — не сломан ли перебор');
  });

  testWidgets('🔴 проигрыш стирает снимок', (tester) async {
    await boot(tester, {'psygames_sudoku_level_nzt48': '5'});
    expect(state.get(key), isNotNull, reason: 'свежая доска сразу ложится снимком');
    final hud = find.byWidgetPredicate((w) => w is Text && RegExp(r'^0/\d+$').hasMatch(w.data ?? ''));
    final limit = int.parse(tester.widget<Text>(hud).data!.split('/').last);
    var made = 0;
    for (var r = 0; r < 9 && made < limit; r++) {
      for (var c = 0; c < 9 && made < limit; c++) {
        if (digitAt(tester, r, c) != 0) continue;
        final row = [for (var j = 0; j < 9; j++) digitAt(tester, r, j)].where((v) => v != 0);
        if (row.isEmpty) continue;
        await tap(tester, find.byKey(Key('cell_${r}_$c')));
        await tap(tester, find.byKey(Key('digit${row.first}')));
        made++;
      }
    }
    expect(state.get(key), isNull, reason: 'проигранная партия не поднимается');
  });

  testWidgets('🔴 снимок чужой дороги не поднимается', (tester) async {
    await boot(tester, {'psygames_sudoku_level_nzt48': '5'});
    final d = firstEmpty(tester, 9);
    await tap(tester, find.byKey(Key('cell_${d.r}_${d.c}')));
    await tap(tester, find.byKey(const Key('digit5')));
    await leave(tester);
    state.set(sudokuRoadKey('nzt48'), 'easy');   // дорогу сменили — партия «обычной» не её
    await reboot(tester);
    expect(stored()['road'], 'easy', reason: 'раздана своя доска «полегче» — снимок перезаписан');
  });

  testWidgets('выход с лестницы обещает сохранение', (tester) async {
    await tester.runAsync(() async {
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (c) => Scaffold(
            body: ElevatedButton(
              key: const Key('hub'),
              onPressed: () => Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => SudokuScreen(state: state))),
              child: const Text('hub'),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('hub')));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pumpAndSettle();
    final d = firstEmpty(tester, 9);
    await tap(tester, find.byKey(Key('cell_${d.r}_${d.c}')));
    await tap(tester, find.byKey(const Key('digit5')));
    await tester.tap(find.byTooltip(L.t('back')));
    await tester.pumpAndSettle();
    expect(find.text(L.t('exitConfirmSaved')), findsOneWidget, reason: 'лестница хранит партию — вопрос обещает сохранение');
  });
}
