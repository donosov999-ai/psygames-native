import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НЕЗАКОНЧЕННАЯ ПАРТИЯ РЕЖИМА ПОДНИМАЕТСЯ («Небоскрёбы», «Неравенства», «Киллер», «Свободно»;
/// b5df5096 п.3, сверка 138f7818 строка 114).
///
/// Лестница сохранялась с #221, режимы — нет: «назад» посреди доски режима терял её молча.
/// Проверяется нажатиями: ход и ошибка → уход с экрана → вход → та же доска, тот же ход, тот же
/// счёт ошибок. Слот у режима свой: недорешённая доска лестницы не стирается. Чужая ступень не
/// поднимается, выигранная партия не поднимается.
void main() {
  late SharedState state;
  late SideModes modes;

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
    modes = await SideModes.load();
  });

  const ladderSlot = 'psygames_resume_sudoku_nzt48';
  const ladderSnapshot = '{"v":4,"savedAt":1,"state":{"mode":"levels"}}';
  String slot(SideMode m) => 'psygames_resume_sudoku_${sideModeName(m)}_nzt48';

  Future<void> open(WidgetTester tester, SideMode mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(key: UniqueKey(), state: state, mode: mode)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> boot(WidgetTester tester, SideMode mode, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues({
      ladderSlot: ladderSnapshot,
      // Карточка «новое правило» тут не нужна — ходы она не держит, но и проверять её не здесь.
      for (final m in SideMode.values) 'psygames_sudoku_rulehint_${sideModeName(m)}': '1',
      ...prefs,
    });
    await tester.runAsync(() async => state = await SharedState.open());
    await open(tester, mode);
  }

  /// Уйти с экрана: dispose пишет снимок; дождаться диска.
  Future<void> leave(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(const SizedBox());
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
  }

  int valueAt(WidgetTester tester, int r, int c) {
    for (final e in find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text)).evaluate()) {
      final t = e.widget as Text;
      final v = int.tryParse(t.data ?? '');
      if (t.key == null && v != null) return v;
    }
    return 0;
  }

  int sideOf(WidgetTester tester) {
    var n = 0;
    while (find.byKey(Key('cell_${n}_0')).evaluate().isNotEmpty) {
      n++;
    }
    return n;
  }

  List<List<int>> read(WidgetTester tester) {
    final n = sideOf(tester);
    return [for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) valueAt(tester, r, c)]];
  }

  /// Доска на экране — из данных режима: та, чьё задание совпало с видимыми подсказками.
  SideBoard dealt(WidgetTester tester, SideMode mode, int step) {
    final g = read(tester);
    for (var i = 0; i < modes.boardsFor(mode, step); i++) {
      final b = modes.boardAt(mode, step, i)!;
      if (b.n != g.length) continue;
      var ok = true;
      for (var r = 0; r < b.n && ok; r++) {
        for (var c = 0; c < b.n && ok; c++) {
          if (b.puzzle[r][c] != g[r][c]) ok = false;
        }
      }
      if (ok) return b;
    }
    throw StateError('${sideModeName(mode)}: доски на экране нет в данных ступени $step');
  }

  Future<void> put(WidgetTester tester, int r, int c, int v) async {
    await tester.tap(find.byKey(Key('cell_${r}_$c')));
    await tester.pump();
    await tester.tap(find.byKey(Key('digit$v')));
    await tester.pump();
  }

  for (final mode in SideMode.values) {
    final name = sideModeName(mode);
    testWidgets('🔴 «$name»: ушёл посреди доски — вернулся к ней же; доска лестницы цела', (tester) async {
      await boot(tester, mode, {});
      final b = dealt(tester, mode, 1);
      final empty = [
        for (var r = 0; r < b.n; r++)
          for (var c = 0; c < b.n; c++)
            if (b.puzzle[r][c] == 0) (r, c),
      ];
      final (r1, c1) = empty[0];
      final (r2, c2) = empty[1];
      await put(tester, r1, c1, b.solution[r1][c1]);
      final wrong = b.solution[r2][c2] % b.n + 1;   // мимо решения — ошибка
      await put(tester, r2, c2, wrong);
      expect(find.text('1/3'), findsOneWidget, reason: 'ошибка засчитана');
      final before = read(tester);

      await leave(tester);
      final raw = state.get(slot(mode));
      expect(raw, isNotNull, reason: 'уход записал снимок в слот режима');
      final snap = (jsonDecode(raw!) as Map)['state'] as Map;
      expect(snap['mode'], name);
      expect(snap['level'], 1, reason: 'в level — ступень режима, как у веба');
      expect(state.get(ladderSlot), ladderSnapshot, reason: 'слот лестницы не тронут');

      await open(tester, mode);
      expect(read(tester), before, reason: 'та же доска с теми же ходами');
      expect(valueAt(tester, r1, c1), b.solution[r1][c1]);
      expect(find.text('1/3'), findsOneWidget, reason: 'счёт ошибок поднят');
    });
  }

  testWidgets('🔴 снимок другой ступени не поднимается — своя доска, снимок перезаписан', (tester) async {
    await boot(tester, SideMode.towers, {});
    final b = dealt(tester, SideMode.towers, 1);
    final (r, c) = [for (var r = 0; r < b.n; r++) for (var c = 0; c < b.n; c++) if (b.puzzle[r][c] == 0) (r, c)].first;
    await put(tester, r, c, b.solution[r][c]);
    await leave(tester);

    await tester.runAsync(() => state.set('psygames_sudoku_towers_step_nzt48', '2'));
    await open(tester, SideMode.towers);
    dealt(tester, SideMode.towers, 2);   // бросит, если на экране не доска ступени 2
    final snap = (jsonDecode(state.get(slot(SideMode.towers))!) as Map)['state'] as Map;
    expect(snap['level'], 2, reason: 'новая доска сразу легла своим снимком');
  });

  testWidgets('🔴 выигранная партия не поднимается: снимок стёрт', (tester) async {
    await boot(tester, SideMode.free, {});
    final b = dealt(tester, SideMode.free, 1);
    for (var r = 0; r < b.n; r++) {
      for (var c = 0; c < b.n; c++) {
        if (b.puzzle[r][c] == 0) await put(tester, r, c, b.solution[r][c]);
      }
    }
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    expect(state.get(slot(SideMode.free)), isNull, reason: 'доиграна — продолжать нечего');
    await leave(tester);
    expect(state.get(slot(SideMode.free)), isNull, reason: 'уход после победы снимок не воскрешает');
  });
}
