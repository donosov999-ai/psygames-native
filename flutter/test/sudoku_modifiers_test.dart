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

/// 🔴 УДВОИТЕЛИ И ОТРИЦАТЕЛЬНЫЕ (6aecf181 п.13, типы 2 и 3; задача f46c796c): девять скрытых клеток —
/// по одной в ряду, цифры 1–9 по разу — в суммах групп считаются вдвое или со знаком минус. Натив
/// задачу не решает: доска из выгрузки (эталон — боевой путь ядра + ответ-нарушители для пробы).
/// Здесь: суммы сверены с ответом своим счётом; верный ход не отвергается невзвешенной суммой
/// (иначе экран выдал бы место нарушителя); повтор в группе — отвергается; причина отказа место
/// нарушителя не выдаёт; отрицательная сумма рисуется; нажатиями — верная цифра не ошибка,
/// неверная — ошибка; имена и правила на 12 языках.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final data = jsonDecode(File('test/fixtures/sudoku-modifiers-reference.json').readAsStringSync()) as Map<String, Object?>;
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];

  for (final (kind, weight) in const [('doublers', 2), ('negators', -1)]) {
    final ref = (data[kind]! as Map).cast<String, Object?>();
    final puzzle = ints(ref['puzzle']);
    final solution = ints(ref['solution']);
    final mods = ints(ref['mods']);
    final cagesJson = (ref['cages']! as Map).cast<String, Object?>();
    final cages = CageMap.fromJson(cagesJson)!;

    group(kind, () {
      test('разбор эталона своим счётом: нарушитель по одному в ряду, цифры 1–9; суммы взвешенные', () {
        for (var i = 0; i < 9; i++) {
          expect(mods[i].where((m) => m == 1), hasLength(1), reason: 'строка $i');
          expect([for (var r = 0; r < 9; r++) mods[r][i]].where((m) => m == 1), hasLength(1), reason: 'столбец $i');
          expect([for (var j = 0; j < 9; j++) mods[(i ~/ 3) * 3 + j ~/ 3][(i % 3) * 3 + j % 3]].where((m) => m == 1), hasLength(1));
        }
        expect(([for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (mods[r][c] == 1) solution[r][c]]..sort()), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (var k = 0; k < cages.cells.length; k++) {
          final sum = cages.cells[k].fold<int>(0, (t, rc) => t + solution[rc[0]][rc[1]] * (mods[rc[0]][rc[1]] == 1 ? weight : 1));
          expect(sum, cages.sum[k], reason: 'группа $k');
        }
        for (var r = 0; r < 9; r++) {
          for (var c = 0; c < 9; c++) {
            if (puzzle[r][c] != 0) expect(puzzle[r][c], solution[r][c]);
          }
        }
      });

      test('🔴 верный ход не отвергается невзвешенной суммой; повтор в группе — отвергается', () {
        // Группа с нарушителем: ставим в неё весь ответ, кроме одной клетки, — та, что осталась, верна.
        final k = [for (var i = 0; i < cages.cells.length; i++) if (cages.cells[i].any((rc) => mods[rc[0]][rc[1]] == 1)) i].first;
        final cells = cages.cells[k];
        final g = List.generate(9, (_) => List.filled(9, 0));
        for (final rc in cells.skip(1)) {
          g[rc[0]][rc[1]] = solution[rc[0]][rc[1]];
        }
        final (r, c) = (cells.first[0], cells.first[1]);
        final geo = BoardGeometry(cages: cages);
        expect(isValid(g, r, c, solution[r][c], 9, 3, 3, variant: kind, geometry: geo), isTrue);
        expect(isValid(g, r, c, solution[r][c], 9, 3, 3, variant: 'killer', geometry: geo), isFalse,
            reason: 'обычный киллер эту цифру отверг бы — взвешенная сумма другая');
        final other = cells[1];
        expect(isValid(g, r, c, solution[other[0]][other[1]], 9, 3, 3, variant: kind, geometry: geo), isFalse, reason: 'повтор в группе');
      });

      test('🔴 повтор в группе запрещён там, где классика его разрешает', () {
        // Группа-«уголок» через границу блоков: (2,2) и (3,3) — разные строка, столбец и блок, судит
        // только группа. Соседние клетки группы для этой пробы не годятся — их и так разводит строка.
        final cage = CageMap(
          cageOf: List.generate(9, (r) => List.generate(9, (c) => const [(2, 2), (2, 3), (3, 3)].contains((r, c)) ? 0 : -1)),
          sum: const [30],
          anchor: const [20],
          cells: const [[[2, 2], [2, 3], [3, 3]]],
        );
        final g = List.generate(9, (_) => List.filled(9, 0));
        g[2][2] = 5;
        expect(isValid(g, 3, 3, 5, 9, 3, 3), isTrue, reason: 'классика разрешает');
        expect(isValid(g, 3, 3, 5, 9, 3, 3, variant: kind, geometry: BoardGeometry(cages: cage)), isFalse, reason: 'группа — нет');
        expect(isValid(g, 3, 3, 6, 9, 3, 3, variant: kind, geometry: BoardGeometry(cages: cage)), isTrue);
      });

      test('причина отказа не выдаёт место нарушителя', () {
        // Неверная цифра, которую классика допускает и которая не повторяет цифру группы, — «доказать нечем».
        final g = [for (final row in puzzle) [...row]];
        late int r, c, v;
        var found = false;
        for (var i = 0; i < 9 && !found; i++) {
          for (var j = 0; j < 9 && !found; j++) {
            if (g[i][j] != 0) continue;
            for (var d = 1; d <= 9 && !found; d++) {
              if (d == solution[i][j] || !isValid(g, i, j, d, 9, 3, 3)) continue;
              if (!isValid(g, i, j, d, 9, 3, 3, variant: kind, geometry: BoardGeometry(cages: cages))) continue;
              (r, c, v) = (i, j, d);
              found = true;
            }
          }
        }
        expect(found, isTrue);
        final placed = [for (final row in g) [...row]]..[r][c] = v;
        expect(rejectionKey(placed, r, c, v, n: 9, br: 3, bc: 3, variant: kind, geometry: BoardGeometry(cages: cages)), 'sudokuWhyNotLocal');
      });

      testWidgets('суммы групп на доске — как в выгрузке, со знаком', (tester) async {
        final board = SudokuBoard(
          level: 149, n: 9, br: 3, bc: 3, variant: kind,
          puzzle: puzzle, solution: solution,
          geometry: BoardGeometry(cages: cages), geometryJson: {'cages': cagesJson},
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
                marks: List.generate(9, (_) => List.filled(9, 0)),
                colors: List.generate(9, (_) => List.filled(9, noSudokuColor)),
                selected: null,
                height: 460,
                onTap: (_, _) {},
              ),
            ),
          ),
        ));
        for (var k = 0; k < cages.cells.length; k++) {
          final a = cages.anchor[k];
          final f = find.byKey(Key('cage-sum-${a ~/ 9}_${a % 9}'));
          expect(tester.widget<Text>(f).data, '${cages.sum[k]}', reason: 'группа $k');
        }
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

        testWidgets('🔴 верная цифра — не ошибка, неверная — ошибка', (tester) async {
          // Доска приходит снимком партии: на лестнице её ещё нет (ступени ставит раздел уровней).
          SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
          await tester.runAsync(() async => state = await SharedState.open());
          await mount(tester);
          await tap(tester, find.byKey(const Key('cell_0_0')));
          await tap(tester, find.byKey(const Key('digit5')));
          await tester.pumpWidget(const SizedBox());
          await tester.pump();
          final env = (jsonDecode(state.get(key)!) as Map).cast<String, Object?>();
          final s = (env['state'] as Map).cast<String, Object?>()
            ..addAll(webGeometry({'cages': cagesJson}))
            ..['variant'] = kind
            ..['puzzle'] = puzzle
            ..['solution'] = solution
            ..['grid'] = puzzle
            ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
            ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
            ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
            ..['history'] = {'past': <Object>[], 'future': <Object>[]}
            ..['errors'] = 0;
          env['state'] = s;
          await tester.runAsync(() => state.set(key, jsonEncode(env)));
          await mount(tester);

          final a = cages.anchor.first;
          expect(find.byKey(Key('cage-sum-${a ~/ 9}_${a % 9}')), findsOneWidget, reason: 'снимок поднял группы');
          // Верная цифра в клетку-нарушитель — даже невзвешенная сумма тут не сошлась бы.
          final (mr, mc) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (puzzle[r][c] == 0 && mods[r][c] == 1) (r, c)].first;
          await tap(tester, find.byKey(Key('cell_${mr}_$mc')));
          await tap(tester, find.byKey(Key('digit${solution[mr][mc]}')));
          final (wr, wc) = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (puzzle[r][c] == 0 && (r, c) != (mr, mc)) (r, c)].first;
          await tap(tester, find.byKey(Key('cell_${wr}_$wc')));
          await tap(tester, find.byKey(Key('digit${solution[wr][wc] % 9 + 1}')));
          await tester.pumpWidget(const SizedBox());
          await tester.pump();
          final st = ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();
          expect((st['grid']! as List)[mr][mc], solution[mr][mc]);
          expect(st['errors'], 1, reason: 'ошибка — только неверная цифра');
        });
      });

      for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
        test('имя и правило словами — $lang', () async {
          await L.load(lang);
          final cap = kind[0].toUpperCase() + kind.substring(1);
          for (final k in ['sdkRule_$kind', 'sudokuRule$cap']) {
            expect(L.has(k), isTrue, reason: '$lang: нет $k');
          }
          expect(variantTitle(kind), L.t('sdkRule_$kind'));
          expect(variantRuleKey(kind), 'sudokuRule$cap');
        });
      }
    });
  }
}
