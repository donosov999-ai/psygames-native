import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/highlight.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОДСВЕТКА ЦИФР «СУДОКУ» — СОВПАДЕНИЯ, ЛИНИЯ, ОШИБКА (задача ecf9dc4f).
///
/// Три отчёта тестировщика 04.10 (2.56.12): «нажимаешь на шестёрку — раньше все шестёрки
/// подсвечивались», «ошибка никак не подсвечивается», «правильный и неправильный ответ одного
/// цвета». В нативном экране подсветки не было с переноса 23.09 — пробы проверяли ход, а не то,
/// что видно в клетке. Здесь читается ВИДИМОЕ: фон клетки и цвет цифры, нажатиями.
void main() {
  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });
  late SharedState state;

  Future<void> boot(WidgetTester tester, Widget Function(SharedState) screen, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: screen(state)));
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

  Color bgAt(WidgetTester tester, int r, int c) => tester
      .widget<Material>(find.ancestor(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Material)).first)
      .color!;

  ColorScheme schemeOf(WidgetTester tester) => Theme.of(tester.element(find.byKey(const Key('cell_0_0')))).colorScheme;

  /// Цифра клетки — текст БЕЗ ключа (у суммы группы ключ cage-sum; то же правило, что в
  /// sudoku_killer_free_test).
  Text? digitText(WidgetTester tester, int r, int c) {
    for (final e in find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text)).evaluate()) {
      final t = e.widget as Text;
      if (t.key == null && int.tryParse(t.data ?? '') != null) return t;
    }
    return null;
  }

  int valueAt(WidgetTester tester, int r, int c) => int.tryParse(digitText(tester, r, c)?.data ?? '') ?? 0;

  int sizeOf(WidgetTester tester) {
    var n = 0;
    while (find.byKey(Key('cell_0_$n')).evaluate().isNotEmpty) {
      n++;
    }
    return n;
  }

  /// Решение партии — из снимка, который экран пишет сразу после раздачи.
  List<List<int>>? storedSolution() {
    final raw = state.get('psygames_resume_sudoku_nzt48');
    if (raw == null) return null;
    final s = (jsonDecode(raw) as Map)['state'] as Map;
    return [for (final row in s['solution'] as List) [for (final v in row as List) (v as num).toInt()]];
  }

  Color hl(Color surface, double t) => Color.lerp(surface, sudokuHighlightAccent, t)!;

  testWidgets('🔴 касание цифры подсвечивает все такие же цифры, её строку и столбец; остальные — без подсветки', (tester) async {
    await boot(tester, (st) => SudokuScreen(state: st), {'psygames_sudoku_level_nzt48': '5'});   // классика 9×9 из банка
    final n = sizeOf(tester);
    // Выбираем подсказку, у которой есть тёзки вне её строки и столбца.
    late int r0, c0, d;
    var found = false;
    for (var r = 0; r < n && !found; r++) {
      for (var c = 0; c < n && !found; c++) {
        final v = valueAt(tester, r, c);
        if (v == 0) continue;
        for (var rr = 0; rr < n && !found; rr++) {
          for (var cc = 0; cc < n && !found; cc++) {
            if (rr != r && cc != c && valueAt(tester, rr, cc) == v) {
              (r0, c0, d) = (r, c, v);
              found = true;
            }
          }
        }
      }
    }
    expect(found, isTrue);
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    final surface = schemeOf(tester).surface;
    expect(bgAt(tester, r0, c0), sudokuSelectedFill, reason: 'выбранная клетка — своим цветом');
    expect(digitText(tester, r0, c0)!.style!.color, Colors.white, reason: 'на выбранной цифра белая (контраст ~6:1)');
    var same = 0, plain = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (r == r0 && c == c0) continue;
        final v = valueAt(tester, r, c);
        final line = r == r0 || c == c0;
        if (v == d) {
          expect(bgAt(tester, r, c), hl(surface, 0.16), reason: 'тёзка ($r,$c) подсвечена');
          same++;
        } else if (line) {
          expect(bgAt(tester, r, c), hl(surface, 0.09), reason: 'строка/столбец выбранной ($r,$c) подсвечены слабее');
        } else {
          expect(bgAt(tester, r, c), surface, reason: '($r,$c) не тёзка и не на линии — без подсветки');
          plain++;
        }
      }
    }
    expect(same, greaterThan(0));
    expect(plain, greaterThan(0));
  });

  testWidgets('🔴 неверная цифра — красный фон и красная цифра; верная — без них', (tester) async {
    await boot(tester, (st) => SudokuScreen(state: st), {'psygames_sudoku_level_nzt48': '5'});
    final n = sizeOf(tester);
    final sol = storedSolution()!;
    final empties = [
      for (var r = 0; r < n; r++)
        for (var c = 0; c < n; c++)
          if (valueAt(tester, r, c) == 0) (r: r, c: c),
    ];
    final bad = empties[0], good = empties[1];
    final wrong = sol[bad.r][bad.c] % n + 1;
    await tap(tester, find.byKey(Key('cell_${bad.r}_${bad.c}')));
    await tap(tester, find.byKey(Key('digit$wrong')));
    expect(bgAt(tester, bad.r, bad.c), sudokuWrongSelectedFill, reason: 'ошибка видна сразу, на выбранной клетке');

    await tap(tester, find.byKey(Key('cell_${good.r}_${good.c}')));
    expect(bgAt(tester, bad.r, bad.c), sudokuWrongFill, reason: 'ошибка остаётся видна, когда выбрана другая клетка');
    expect(digitText(tester, bad.r, bad.c)!.style!.color, sudokuWrongInk, reason: 'неверная цифра — красная');

    await tap(tester, find.byKey(Key('digit${sol[good.r][good.c]}')));
    await tap(tester, find.byKey(Key('cell_${bad.r}_${bad.c}')));   // увести выбор с верной
    final scheme = schemeOf(tester);
    expect(bgAt(tester, good.r, good.c), isNot(anyOf(sudokuWrongFill, sudokuWrongSelectedFill)),
        reason: 'верная цифра — без красного фона');
    expect(digitText(tester, good.r, good.c)!.style!.color, scheme.primary,
        reason: 'верная своя цифра — цветом темы, не цветом ошибки');
  });

  testWidgets('🔴 режим «Небоскрёбы»: та же подсветка совпадений и ошибки', (tester) async {
    await boot(tester, (st) => SudokuScreen(state: st, mode: SideMode.towers), {});
    final n = sizeOf(tester);
    final surface = schemeOf(tester).surface;
    // Пустая клетка и цифра, уже стоящая в её строке, — заведомо неверная.
    late int r0, c0, dup;
    var found = false;
    for (var r = 0; r < n && !found; r++) {
      final row = [for (var c = 0; c < n; c++) valueAt(tester, r, c)];
      for (var c = 0; c < n && !found; c++) {
        if (row[c] == 0 && row.any((v) => v != 0)) {
          (r0, c0, dup) = (r, c, row.firstWhere((v) => v != 0));
          found = true;
        }
      }
    }
    expect(found, isTrue);
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$dup')));
    expect(bgAt(tester, r0, c0), sudokuWrongSelectedFill, reason: 'ошибка в режиме видна');
    // Касание тёзки: другие такие же — подсвечены.
    final twin = [for (var c = 0; c < n; c++) c].firstWhere((c) => c != c0 && valueAt(tester, r0, c) == dup);
    await tap(tester, find.byKey(Key('cell_${r0}_$twin')));
    var lit = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (r == r0 || c == twin) continue;
        if (valueAt(tester, r, c) == dup) {
          expect(bgAt(tester, r, c), hl(surface, 0.16));
          lit++;
        }
      }
    }
    expect(lit, greaterThan(0), reason: 'тёзки вне строки и столбца выбранной подсвечены');
    expect(bgAt(tester, r0, c0), sudokuWrongFill, reason: 'ошибка — поверх совпадения и линии');
  });

  testWidgets('🔴 малыши 4×4 со зверями: тёзки подсвечены', (tester) async {
    await boot(tester, (st) => SudokuScreen(state: st, junior: true), {});
    final n = sizeOf(tester);
    expect(n, 4);
    final surface = schemeOf(tester).surface;
    // У зверей в клетке картинка, а не текст, — поэтому сверяем линию выбора: она подсвечена
    // при любом значении (совпадение — сильнее, просто линия — слабее).
    await tap(tester, find.byKey(const Key('cell_0_0')));
    final selected = bgAt(tester, 0, 0);
    expect(selected == sudokuSelectedFill || selected == sudokuWrongSelectedFill, isTrue);
    var lineLit = 0;
    for (var c = 1; c < n; c++) {
      final bg = bgAt(tester, 0, c);
      if (bg == hl(surface, 0.09) || bg == hl(surface, 0.16)) lineLit++;
    }
    expect(lineLit, n - 1, reason: 'строка выбранной у малышей подсвечена');
  });
}
