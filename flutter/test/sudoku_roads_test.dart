import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/roads.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ДОРОГИ «СУДОКУ» НА НАТИВЕ — КАК В ВЕБЕ: ТРИ СЧЁТЧИКА, ПЕРЕНОС ТОЛЬКО ВНИЗ, ВЫБОР В ПАУЗЕ.
///
/// Сверка «веб против натива» 138f7818 (задача b5df5096): ключи `_easy`/`_hard` и
/// `psygames_sudoku_road_<профиль>` натив не читал, сдвиг полосы банка лежал без дела, отчёт
/// всегда нёс `road: 'normal'`. Правило — `frontend/src/services/sudoku-roads.ts`; ключи и
/// порядок дорог сверяются С ЕГО ИСХОДНИКОМ, а не переписываются сюда руками.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const pid = 'nzt48';
  final web = File('../frontend/src/services/sudoku-roads.ts').readAsStringSync();

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });

  group('правило дорог', () {
    late SharedState state;
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
    });

    test('🔴 порядок, ключи и подписи дорог — те же, что в веб-исходнике', () {
      expect(web, contains("SUDOKU_ROADS = ['easy', 'normal', 'hard'] as const"));
      expect([for (final r in SudokuRoad.values) r.name], ['easy', 'normal', 'hard']);
      expect(web, contains(r'const base = `psygames_sudoku_level_${profileId}`;'));
      expect(web, contains(r'road === DEFAULT_SUDOKU_ROAD ? base : `${base}_${road}`'));
      expect(web, contains(r'`psygames_sudoku_road_${profileId}`'));
      expect(sudokuLevelKey(pid, SudokuRoad.normal), 'psygames_sudoku_level_nzt48', reason: 'у обычной дороги ключ прежний');
      expect(sudokuLevelKey(pid, SudokuRoad.easy), 'psygames_sudoku_level_nzt48_easy');
      expect(sudokuLevelKey(pid, SudokuRoad.hard), 'psygames_sudoku_level_nzt48_hard');
      expect(sudokuRoadKey(pid), 'psygames_sudoku_road_nzt48');
      for (final r in SudokuRoad.values) {
        expect(web, contains("${r.name}: '${sudokuRoadNameKey(r)}'"), reason: 'подпись ${r.name} — ключ веба');
      }
    });

    test('🔴 пройденное переносится только ВНИЗ по сложности и считается при чтении', () {
      int at(SudokuRoad r) => effectiveRoadLevel(state, pid, r);
      state.set(sudokuLevelKey(pid, SudokuRoad.hard), '12');
      expect([at(SudokuRoad.easy), at(SudokuRoad.normal), at(SudokuRoad.hard)], [12, 12, 12],
          reason: 'двенадцать на тяжёлой засчитаны на лёгкой и обычной');
      state.set(sudokuLevelKey(pid, SudokuRoad.easy), '20');
      expect([at(SudokuRoad.easy), at(SudokuRoad.normal), at(SudokuRoad.hard)], [20, 12, 12],
          reason: 'двадцать на лёгкой вверх не переносятся');
      state.set(sudokuLevelKey(pid, SudokuRoad.hard), '25');
      expect([at(SudokuRoad.easy), at(SudokuRoad.normal), at(SudokuRoad.hard)], [25, 25, 25],
          reason: 'тяжёлая ушла вперёд — лёгкие подтянуты ЧТЕНИЕМ, без разового переноса');
    });

    test('🔴 хранилище дороги пишет только свой счётчик и только вверх', () async {
      final easy = SudokuRoadStore(state, SudokuRoad.easy, profile: pid);
      state.set(sudokuLevelKey(pid, SudokuRoad.easy), '10');
      await easy.writeInt('sudoku.level', 7);
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.easy)), '10', reason: 'переигровка не срезает достигнутое');
      await easy.writeInt('sudoku.level', 11);
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.easy)), '11');
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.normal)), isNull, reason: 'чужие дороги не тронуты');
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.hard)), isNull);
    });

    test('жизни и подсказки на дороге — как roadLevelConfig веба', () {
      expect(web, contains("const lives = road === 'easy' ? cfg.lives + 1 : Math.max(1, cfg.lives - 1);"));
      expect(web, contains("const hintMax = road === 'easy' ? cfg.hintMax + 1 : Math.max(0, cfg.hintMax - 1);"));
      expect([sudokuRoadLives(3, SudokuRoad.easy), sudokuRoadLives(3, SudokuRoad.normal), sudokuRoadLives(3, SudokuRoad.hard)], [4, 3, 2]);
      expect(sudokuRoadLives(1, SudokuRoad.hard), 1, reason: 'не ниже одной ошибки');
      expect([sudokuRoadHintMax(2, SudokuRoad.easy), sudokuRoadHintMax(0, SudokuRoad.hard)], [3, 0]);
    });
  });

  group('доски дорог', () {
    late SudokuLevels levels;
    setUpAll(() async => levels = await SudokuLevels.load());

    test('🔴 на вариантной ступени дорога играет СВОИ доски, на банке — сдвинутую полосу', () {
      final rows = (jsonDecode(File('assets/levels/sudoku-road-boards.json').readAsStringSync()) as Map)['boards'] as List;
      final easy9 = {for (final b in rows.cast<Map>()) if (b['level'] == 9 && b['road'] == 'easy') b['puzzle'] as String};
      expect(easy9, isNotEmpty, reason: 'у ступени 9 есть доски «полегче»');
      expect(levels.roadBoardsFor(9, SudokuRoad.easy), easy9.length);
      for (var seed = 1; seed <= 12; seed++) {
        final b = levels.boardFor(9, seed: seed, road: SudokuRoad.easy)!;
        final flat = b.puzzle.expand((r) => r).join();
        expect(easy9, contains(flat), reason: 'зерно $seed: доска не из пула «полегче»');
      }
      // Банк (ступень 60): полоса на ступень ниже/выше обычной.
      expect(levels.bankRating(60, shift: -1), lessThan(levels.bankRating(60)));
      expect(levels.boardFor(60, seed: 3, road: SudokuRoad.easy)!.rating, levels.bankRating(60, shift: -1));
      expect(levels.boardFor(60, seed: 3, road: SudokuRoad.hard)!.rating, levels.bankRating(60, shift: 1));
    });
  });

  group('экран', () {
    late SharedState state;
    late List<Map<String, Object?>> sent;
    setUp(() {
      sent = [];
      SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, Object?>);
    });
    tearDown(() => SessionReport.sink = null);

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

    int digitAt(WidgetTester tester, int r, int c) {
      final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
      if (text.evaluate().isEmpty) return 0;
      return int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0;
    }

    List<List<int>> solve(List<List<int>> grid) {
      final g = [for (final row in grid) [...row]];
      bool ok(int r, int c, int v) {
        for (var i = 0; i < 9; i++) {
          if (g[r][i] == v || g[i][c] == v) return false;
        }
        final r0 = r - r % 3, c0 = c - c % 3;
        for (var i = 0; i < 3; i++) {
          for (var j = 0; j < 3; j++) {
            if (g[r0 + i][c0 + j] == v) return false;
          }
        }
        return true;
      }

      bool walk(int k) {
        if (k == 81) return true;
        final r = k ~/ 9, c = k % 9;
        if (g[r][c] != 0) return walk(k + 1);
        for (var v = 1; v <= 9; v++) {
          if (!ok(r, c, v)) continue;
          g[r][c] = v;
          if (walk(k + 1)) return true;
          g[r][c] = 0;
        }
        return false;
      }

      if (!walk(0)) fail('доска не решается');
      return g;
    }

    String errorsHud(WidgetTester tester) => tester
        .widget<Text>(find.byWidgetPredicate((w) => w is Text && RegExp(r'^0/\d+$').hasMatch(w.data ?? '')))
        .data!;

    testWidgets('🔴 «Полегче» в паузе: уровень дороги виден до выбора, выбор помнится, победа пишет СВОЙ счётчик, отчёт несёт дорогу',
        (tester) async {
      await boot(tester, {sudokuLevelKey(pid, SudokuRoad.normal): '5', sudokuLevelKey(pid, SudokuRoad.hard): '8'});
      final ladder = (jsonDecode(File('assets/levels/sudoku-ladder.json').readAsStringSync()) as Map)['ladder'] as List;
      final lives8 = ((ladder[7] as Map)['lives'] as num).toInt();
      expect(errorsHud(tester), '0/$lives8', reason: 'обычная дорога: уровень 8 (перенос с тяжёлой), жизни ступени');

      await tester.tap(find.byTooltip(L.t('teachPause')));
      await tester.pumpAndSettle();
      final easyLabel = '${L.t('sudokuRoadEasy')} · ${L.t('label_level_short')}8';
      expect(find.text(easyLabel), findsOneWidget, reason: 'уровень «полегче» виден до выбора: 8 — перенос сверху');
      expect(find.text('${L.t('sudokuRoadHard')} · ${L.t('label_level_short')}8'), findsOneWidget);
      await tester.tap(find.text(easyLabel));
      await tester.pumpAndSettle();
      expect(state.get(sudokuRoadKey(pid)), 'easy', reason: 'выбор дороги помнится');
      expect(errorsHud(tester), '0/${lives8 + 1}', reason: '«полегче» прощает на одну ошибку больше');

      final grid = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) digitAt(tester, r, c)]];
      final sol = solve(grid);
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (grid[r][c] != 0) continue;
          await tester.tap(find.byKey(Key('cell_${r}_$c')), warnIfMissed: false);
          await tester.pump();
          await tester.tap(find.byKey(Key('digit${sol[r][c]}')), warnIfMissed: false);
          await tester.pump();
        }
      }
      await tester.pump(const Duration(milliseconds: 50));
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.easy)), '9', reason: 'победа на лёгкой двигает лёгкую');
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.normal)), '5', reason: 'обычная не тронута');
      expect(state.get(sudokuLevelKey(pid, SudokuRoad.hard)), '8', reason: 'вверх не переносится');
      final won = sent.where((m) => m['game_type'] == 'sudoku').last;
      expect((won['details'] as Map)['road'], 'easy', reason: 'партия несёт свою дорогу');
    });
  });
}
