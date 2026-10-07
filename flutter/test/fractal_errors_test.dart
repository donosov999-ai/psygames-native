import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/rules.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ОШИБКИ «ФРАКТАЛА» — ТОЛЬКО ДОКАЗУЕМЫЕ, КАК У ВЕБА (сверка 138f7818, строка 25, «высокая»).
///
/// Было: `conflictsInChild` лежал в rules.dart, экран его не звал — ни счётчика, ни красной
/// цифры; корень закрывался только точным совпадением, и человек не узнавал, где неверно.
/// Правило веба (sudoku-fractal.tsx, placeDigit): в дочерней ошибка — повтор в строке/столбце/
/// блоке (сетка порознь неоднозначна нарочно, цифра не по решению — законный ход), в корне —
/// цифра не по решению. Решения пробы берут из снимка партии — того же, что пишет экран.
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

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  Map<String, Object?> stored() => ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();

  List<List<int>> grid9(Object? v) => [for (final row in v as List) [for (final x in row as List) (x as num).toInt()]];

  Text textAt(WidgetTester tester, String prefix, int r, int c) =>
      tester.widget<Text>(find.descendant(of: find.byKey(Key('$prefix${r}_$c')), matching: find.byType(Text)).first);

  int digitAt(WidgetTester tester, String prefix, int r, int c) => int.tryParse(textAt(tester, prefix, r, c).data ?? '') ?? 0;

  List<List<int>> read(WidgetTester tester, String prefix) =>
      [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, prefix, r, c)]];

  Color errorColor(WidgetTester tester) => Theme.of(tester.element(find.byType(FractalScreen))).colorScheme.error;

  String? hint(WidgetTester tester) {
    final f = find.byKey(const Key('fractal-move-hint'));
    return f.evaluate().isEmpty ? null : tester.widget<Text>(f).data;
  }

  testWidgets('🔴 дочерняя: повтор в строке — ошибка, цифра красная, подпись объясняет красное', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final g = read(tester, 'cell_');
    late int r0, c0, v;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        if (g[r][c] != 0) continue;
        final inRow = g[r].where((x) => x != 0);
        if (inRow.isEmpty) continue;
        (r0, c0, v) = (r, c, inRow.first);
        found = true;
      }
    }
    expect(found, isTrue);
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$v')));
    expect(stored()['errors'], 1, reason: 'повтор в строке — доказуемая ошибка');
    expect(textAt(tester, 'cell_', r0, c0).style?.color, errorColor(tester), reason: 'неверная цифра — красная');
    expect(hint(tester), L.t('fractalRedDigit'), reason: 'красное объяснено словами');

    // Следующее действие убирает подпись.
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    expect(hint(tester), isNull);
  });

  testWidgets('🔴 дочерняя: цифра не по решению, но без повтора — НЕ ошибка, сказано «не определено»', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('tile0')));
    final sol = grid9((((stored()['puzzle'] as Map)['children'] as List)[0] as Map)['solution']);
    final g = read(tester, 'cell_');
    late int r0, c0, v;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        if (g[r][c] != 0) continue;
        for (var d = 1; d <= 9 && !found; d++) {
          if (d != sol[r][c] && !conflictsInChild(g, r, c, d)) {
            (r0, c0, v) = (r, c, d);
            found = true;
          }
        }
      }
    }
    expect(found, isTrue, reason: 'нашлась законная, но не решённая цифра');
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$v')));
    expect(stored()['errors'], 0, reason: 'законный ход не наказывается');
    expect(textAt(tester, 'cell_', r0, c0).style?.color, isNot(errorColor(tester)));
    expect(hint(tester), L.t('fractalUndecided'));

    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit${sol[r0][c0]}')));
    expect(hint(tester), isNull, reason: 'верная цифра — без подписи');
    expect(stored()['errors'], 0);
  });

  testWidgets('🔴 корень: цифра не по решению — ошибка и красная; ошибки переживают уход', (tester) async {
    await boot(tester);
    final pz = (stored()['puzzle'] as Map)['root'] as Map;
    final sol = grid9(pz['solution']), puzzle = grid9(pz['puzzle']);
    late int r0, c0;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        if (rootEditable(puzzle, r, c)) {
          (r0, c0) = (r, c);
          found = true;
        }
      }
    }
    expect(found, isTrue);
    final wrong = sol[r0][c0] % 9 + 1;
    await tap(tester, find.byKey(Key('root_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$wrong')));
    expect(stored()['errors'], 1, reason: 'корень единственен — не та цифра есть ошибка');
    expect(textAt(tester, 'root_', r0, c0).style?.color, errorColor(tester));

    await tester.pumpWidget(const SizedBox());   // уход
    await boot(tester);
    await tester.pumpWidget(const SizedBox());   // и снова уход — снимок пишется заново
    expect(stored()['errors'], 1, reason: 'ошибки поднялись из снимка и не обнулились');
  });
}
