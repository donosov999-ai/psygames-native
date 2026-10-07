import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/resume.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ТУМАН ВОЙНЫ (6aecf181 п.11, задача efb63126): доска закрыта, кроме окон старта; верная цифра в
/// открытой клетке — подсказка или ход — расчищает соседей крестом. Здесь: расчистка натива ход за
/// ходом сверена с живым ядром (эталон выгрузки — партия с верными, неверными ходами и ходами под
/// туман); на доске закрытая клетка без цифры и без касания; нажатиями по экрану — под туманом ни
/// выбрать, ни поставить, неверная цифра не открывает ничего, верная открывает положенное; имя и
/// правило на 12 языках; снимок партии хранит окна.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final ref = jsonDecode(File('test/fixtures/sudoku-fog-reference.json').readAsStringSync()) as Map<String, Object?>;
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
  final puzzle = ints(ref['puzzle']);
  final solution = ints(ref['solution']);
  final fog = ints(ref['fog']);
  final steps = (ref['steps'] as List).cast<Map<String, Object?>>();
  int openCount(List<List<bool>> o) => o.expand((row) => row).where((v) => v).length;

  test('🔴 расчистка натива = ядро: партия эталона ход за ходом', () {
    final grid = [for (final row in puzzle) [...row]];
    expect(steps, hasLength(greaterThanOrEqualTo(40)));
    expect(steps.where((s) => s['val'] != solution[s['r']! as int][s['c']! as int]), isNotEmpty, reason: 'в эталоне есть неверные');
    for (final (i, s) in steps.indexed) {
      final r = s['r']! as int, c = s['c']! as int, val = s['val']! as int;
      grid[r][c] = val;
      final open = fogRevealed(fog, grid, solution);
      expect([for (final row in open) row.map((v) => v ? '1' : '0').join()], s['open'], reason: 'ход $i: ($r,$c)=$val');
      if (s['kept'] != true) grid[r][c] = 0;
    }
  });

  test('правило: крест, не 3×3; неверная и под туманом — ничего; каскад по подсказкам', () {
    final w = List.generate(9, (_) => List.filled(9, 0));
    for (var r = 3; r <= 5; r++) {
      for (var c = 3; c <= 5; c++) {
        w[r][c] = 1;
      }
    }
    final g = List.generate(9, (_) => List.filled(9, 0));
    expect(openCount(fogRevealed(w, g, solution)), 9);
    g[3][4] = solution[3][4];
    var o = fogRevealed(w, g, solution);
    expect(o[2][4], isTrue);
    expect(o[2][3] || o[2][5], isFalse, reason: 'крест');
    g[3][4] = solution[3][4] % 9 + 1;
    expect(openCount(fogRevealed(w, g, solution)), 9, reason: 'неверная');
    g[3][4] = 0;
    g[0][0] = solution[0][0];
    expect(openCount(fogRevealed(w, g, solution)), 9, reason: 'под туманом');
    g[3][5] = solution[3][5];
    g[2][5] = solution[2][5];
    o = fogRevealed(w, g, solution);
    expect(o[1][5] && o[2][4] && o[2][6], isTrue, reason: 'открывшаяся цифра расчищает дальше');
  });

  testWidgets('на доске: закрытая клетка — без цифры и пометок, со значком тумана; касание до экрана не доходит', (tester) async {
    final taps = <(int, int)>[];
    final board = SudokuBoard(
      level: 137, n: 9, br: 3, bc: 3, variant: 'fog',
      puzzle: puzzle, solution: solution,
      geometry: BoardGeometry(fog: fog), geometryJson: {'fog': fog},
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 400,
          height: 460,
          child: SudokuBoardView(
            board: board,
            grid: puzzle,
            given: [for (final row in puzzle) [for (final v in row) v != 0]],
            marks: List.generate(9, (_) => List.filled(9, 0x1ff)),
            colors: List.generate(9, (_) => List.filled(9, noSudokuColor)),
            selected: null,
            height: 460,
            onTap: (r, c) => taps.add((r, c)),
          ),
        ),
      ),
    ));
    final open = fogRevealed(fog, puzzle, solution);
    var hidden = 0;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final cell = find.byKey(Key('cell_${r}_$c'));
        if (open[r][c]) {
          expect(find.byKey(Key('fog_${r}_$c')), findsNothing);
          continue;
        }
        hidden++;
        expect(find.byKey(Key('fog_${r}_$c')), findsOneWidget);
        expect(find.descendant(of: cell, matching: find.byType(Text)), findsNothing, reason: '($r,$c): ни цифры, ни пометок');
      }
    }
    expect(hidden, 81 - openCount(open));
    expect(hidden, greaterThanOrEqualTo(15));
    final (fr, fc) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (!open[r][c]) (r, c)].first;
    final (or, oc) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (open[r][c]) (r, c)].first;
    await tester.tap(find.byKey(Key('cell_${fr}_$fc')), warnIfMissed: false);
    await tester.tap(find.byKey(Key('cell_${or}_$oc')));
    expect(taps, [(or, oc)], reason: 'закрытая клетка касание не передаёт');
  });

  group('нажатиями по экрану', () {
    const key = 'psygames_resume_sudoku_nzt48';
    late SharedState state;

    setUpAll(() async {
      await L.load('ru');
      await WordokuWords.load();
    });

    Future<void> mount(WidgetTester tester) async {
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

    Future<void> tap(WidgetTester tester, Finder f) async {
      await tester.tap(f, warnIfMissed: false);
      await tester.pump();
    }

    int fogged() => find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('fog_')).evaluate().length;
    bool foggedAt(int r, int c) => find.byKey(Key('fog_${r}_$c')).evaluate().isNotEmpty;

    testWidgets('🔴 под туманом ни выбрать, ни поставить; неверная цифра не открывает ничего, верная — крест', (tester) async {
      // Доска тумана приходит снимком партии: на лестнице её ещё нет (ступени ставит раздел уровней).
      // Снимок берётся живой — ход на 5-й ступени, — и в нём подменяются доска и окна.
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
      await tester.runAsync(() async => state = await SharedState.open());
      await mount(tester);
      await tap(tester, find.byKey(const Key('cell_0_0')));
      await tap(tester, find.byKey(const Key('digit5')));
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      final env = (jsonDecode(state.get(key)!) as Map).cast<String, Object?>();
      final s = (env['state'] as Map).cast<String, Object?>();
      s
        ..['variant'] = 'fog'
        ..['puzzle'] = puzzle
        ..['solution'] = solution
        ..['grid'] = puzzle
        ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
        ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
        ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
        ..['history'] = {'past': <Object>[], 'future': <Object>[]}
        ..['errors'] = 0
        ..['fog'] = fog;
      env['state'] = s;
      await tester.runAsync(() => state.set(key, jsonEncode(env)));
      await mount(tester);

      final open0 = fogRevealed(fog, puzzle, solution);
      expect(fogged(), 81 - openCount(open0), reason: 'снимок поднял окна тумана');

      // Под туманом: касание не выбирает, цифра не ставится.
      final (fr, fc) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (!open0[r][c]) (r, c)].first;
      await tap(tester, find.byKey(Key('cell_${fr}_$fc')));
      await tap(tester, find.byKey(Key('digit${solution[fr][fc]}')));
      expect(foggedAt(fr, fc), isTrue);
      expect(fogged(), 81 - openCount(open0));

      // Открытая пустая клетка с соседом крестом под туманом.
      late int r0, c0, nr, nc;
      var found = false;
      for (var r = 0; r < 9 && !found; r++) {
        for (var c = 0; c < 9 && !found; c++) {
          if (!open0[r][c] || puzzle[r][c] != 0) continue;
          for (final (dr, dc) in const [(-1, 0), (1, 0), (0, -1), (0, 1)]) {
            final rr = r + dr, cc = c + dc;
            // Сосед пустой: в него потом пробуем поставить цифру после отмены.
            if (rr < 0 || rr > 8 || cc < 0 || cc > 8 || open0[rr][cc] || puzzle[rr][cc] != 0) continue;
            (r0, c0, nr, nc) = (r, c, rr, cc);
            found = true;
            break;
          }
        }
      }
      expect(found, isTrue, reason: 'на старте есть клетка у кромки тумана');
      final right = solution[r0][c0];
      final wrong = right % 9 + 1;
      await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
      await tap(tester, find.byKey(Key('digit$wrong')));
      expect(foggedAt(nr, nc), isTrue, reason: 'неверная цифра не открывает');
      expect(fogged(), 81 - openCount(open0));

      await tap(tester, find.byKey(const Key('erase')));
      await tap(tester, find.byKey(Key('digit$right')));
      expect(foggedAt(nr, nc), isFalse, reason: 'верная цифра открывает соседа крестом');
      final after = [for (final row in puzzle) [...row]]..[r0][c0] = right;
      expect(fogged(), 81 - openCount(fogRevealed(fog, after, solution)), reason: 'открыто ровно положенное');

      // Отмена возвращает туман — и над ВЫБРАННОЙ клеткой: цифра в неё не встаёт.
      await tap(tester, find.byKey(Key('cell_${nr}_$nc')));
      await tap(tester, find.byTooltip(L.t('btn_undo')));
      expect(foggedAt(nr, nc), isTrue, reason: 'отмена вернула туман');
      await tap(tester, find.byKey(Key('digit${solution[nr][nc]}')));
      await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
      await tap(tester, find.byKey(Key('digit$right')));
      expect(foggedAt(nr, nc), isFalse);
      expect(find.descendant(of: find.byKey(Key('cell_${nr}_$nc')), matching: find.text('${solution[nr][nc]}')), findsNothing,
          reason: 'нажатая под туманом цифра не встала');
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });
  });

  test('снимок партии хранит окна и поднимает их обратно', () {
    final web = webGeometry({'fog': fog});
    expect(web['fog'], fog);
    expect(BoardGeometry.fromJson(exportGeometry(web)).fog, fog);
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило тумана словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_fog', 'sudokuRuleFog']) {
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('fog'), L.t('sdkRule_fog'));
      expect(variantRuleKey('fog'), 'sudokuRuleFog');
    });
  }
}
