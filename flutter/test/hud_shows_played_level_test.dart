import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/ladder.dart';
import 'package:psygames_flutter/games/cats/screen.dart';
import 'package:psygames_flutter/games/samurai/rules.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОСЛЕ ПОБЕДЫ ШАПКА НАЗЫВАЕТ СЫГРАННУЮ СТУПЕНЬ, А НЕ СЛЕДУЮЩУЮ (задача 074094df).
///
/// [LevelLadder.win] поднимает ступень сразу. До 21.10 шапка брала её у лестницы, и над решённой
/// доской с кнопкой «Далее» стояла уже следующая: замер на «Кошках», ступень 1 → «Уровень: 2».
/// Тот же дефект веба чинила ветка 17.09 `sudoku/cleared-card-level` — в натив он переехал вместе
/// с экраном. Пробы играют нажатиями и читают шапку так, как её читает человек (подписи доступности).
void main() {
  setUpAll(() async => L.load('ru'));
  late SharedState state;

  /// Значения шапки по подписи доступности («Уровень: 1» и т. п.) — ровно то, что видит человек.
  /// Подпись плитки — «метка: значение», а под ней строкой ещё раз значение; берётся первая строка.
  List<String> hud(WidgetTester tester, String label) => [
        for (var v = 1; v <= 400; v++)
          if (find.bySemanticsLabel(RegExp('^${RegExp.escape(label)}: $v(\n|\$)')).evaluate().isNotEmpty) '$label: $v',
      ];

  Future<void> mount(WidgetTester tester, Widget screen, String readyKey) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: screen));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(Key(readyKey)).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    await tester.pump();
  }

  testWidgets('🔴 «Кошки»: победа на 1-й — в шапке «Уровень: 1» до «Далее», после — 2', (tester) async {
    final semantics = tester.ensureSemantics();
    SharedPreferences.setMockInitialValues({});
    await tester.runAsync(() async => state = await SharedState.open());
    await mount(tester, CatsScreen(state: state), 'cell_0_0');
    final first = dealCatsLevel(1, 'cats|L1|A0')!.puzzle;
    for (var r = 0; r < first.board.n; r++) {
      await tester.longPress(find.byKey(Key('cell_${r}_${first.board.solution[r]}')));
      await tester.pump();
    }
    await settle(tester);
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'победа на экране');
    expect(state.get('${SharedState.prefix}cats_level_nzt48'), '2', reason: 'лестница уже поднята');
    expect(hud(tester, L.t('level')), ['${L.t('level')}: 1'], reason: 'над решённой доской — сыгранная ступень');
    await tester.tap(find.byKey(const Key('next')));
    await settle(tester);
    expect(hud(tester, L.t('level')), ['${L.t('level')}: 2'], reason: 'новая доска — новая ступень');
    semantics.dispose();
  });

  testWidgets('🔴 «Судоку»: доска 5-й ступени дорешена — в шапке 5, хотя лестница уже на 6', (tester) async {
    final semantics = tester.ensureSemantics();
    const resumeKey = 'psygames_resume_sudoku_nzt48', levelKey = 'psygames_sudoku_level_nzt48';
    const sol = [
      [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
      [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
      [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ];
    SharedPreferences.setMockInitialValues({'language': 'ru', levelKey: '5'});
    await tester.runAsync(() async => state = await SharedState.open());
    // Первый заход кладёт снимок своей формы — в него подставляется доска с двумя пустыми клетками.
    await mount(tester, SudokuScreen(state: state), 'cell_0_0');
    await tester.tap(find.byKey(const Key('cell_0_0')), warnIfMissed: false);
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    final puzzle = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) (r + c) % 3 == 0 ? 0 : sol[r][c]]];
    final grid = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) r == 0 && (c == 0 || c == 3) ? 0 : sol[r][c]]];
    final env = (jsonDecode(state.get(resumeKey)!) as Map).cast<String, Object?>();
    env['state'] = (env['state'] as Map).cast<String, Object?>()
      ..['variant'] = 'none'
      ..['puzzle'] = puzzle
      ..['solution'] = sol
      ..['grid'] = grid
      ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
      ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
      ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
      ..['history'] = {'past': <Object>[], 'future': <Object>[]}
      ..['errors'] = 0
      ..['answersRevealed'] = false
      ..['hintUses'] = 0;
    await tester.runAsync(() => state.set(resumeKey, jsonEncode(env)));
    await mount(tester, SudokuScreen(state: state), 'cell_0_0');
    for (final (cell, digit) in [('cell_0_0', 'digit5'), ('cell_0_3', 'digit6')]) {
      await tester.tap(find.byKey(Key(cell)), warnIfMissed: false);
      await tester.pump();
      await tester.tap(find.byKey(Key(digit)), warnIfMissed: false);
      await settle(tester);
    }
    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'доска дорешена');
    expect(state.get(levelKey), '6', reason: 'лестница уже поднята');
    expect(hud(tester, L.t('level')), ['${L.t('level')}: 5'], reason: 'над решённой доской — сыгранная ступень');
    await tester.pumpWidget(const SizedBox());
    semantics.dispose();
  });

  testWidgets('🔴 «Самурай»: последняя клетка поставлена — в шапке 1, хотя лестница уже на 2', (tester) async {
    final semantics = tester.ensureSemantics();
    const samuraiKey = 'psygames_resume_sudoku_samurai_nzt48';
    SharedPreferences.setMockInitialValues({'language': 'ru'});
    await tester.runAsync(() async => state = await SharedState.open());
    await mount(tester, SamuraiScreen(state: state), 'cell_0_0');
    final env = (jsonDecode(state.get(samuraiKey)!) as Map).cast<String, Object?>();
    final s = env['state'] as Map;
    final given = s['given'] as List;
    final solution = [for (final row in s['solution'] as List) [for (final v in row as List) v as int]];
    late int br, bc;
    outer:
    for (var r = 0; r < samuraiSize; r++) {
      for (var c = 0; c < samuraiSize; c++) {
        if (isSamuraiCell(r, c) && (given[r] as List)[c] != true) {
          br = r;
          bc = c;
          break outer;
        }
      }
    }
    s['grid'] = [
      for (var r = 0; r < samuraiSize; r++) [for (var c = 0; c < samuraiSize; c++) r == br && c == bc ? 0 : solution[r][c]],
    ];
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(() => state.set(samuraiKey, jsonEncode(env)));
    await mount(tester, SamuraiScreen(state: state), 'cell_0_0');
    final cell = find.byKey(Key('cell_${br}_$bc'));
    await tester.ensureVisible(cell);
    await tester.pump();
    await tester.tap(cell, warnIfMissed: false);
    await tester.pump();
    await tester.tap(find.byKey(Key('digit${solution[br][bc]}')), warnIfMissed: false);
    await settle(tester);
    expect(state.get('psygames_sudoku_samurai_level_nzt48'), '2', reason: 'победа подняла лестницу');
    expect(hud(tester, L.t('sdkHudStage')), ['${L.t('sdkHudStage')}: 1'], reason: 'над решённой доской — сыгранная ступень');
    await tester.pumpWidget(const SizedBox());
    semantics.dispose();
  });

  // Головоломки и «Фрактал»: короткой дороги к победе нажатиями у проб нет (Тэтхэм решается
  // только игрой, фрактал — девятью сетками), поэтому сторож стоит на исходнике: шапка не берёт
  // ступень у лестницы напрямую.
  test('🔴 шапка головоломок и «Фрактала» не читает ступень у лестницы', () {
    final puzzles = File('lib/games/puzzles/screen.dart').readAsStringSync();
    final fractal = File('lib/games/fractal/screen.dart').readAsStringSync();
    expect(puzzles.contains(r"value: '$_dealLevel/${_steps.length}'"), isTrue, reason: 'головоломки: номер — ступень раздачи');
    expect(puzzles.contains('_steps[(_ladder.level - 1)'), isFalse, reason: 'головоломки: имя доски — ступени раздачи');
    expect(fractal.contains(r"value: '$_hudLevel'"), isTrue, reason: 'фрактал: номер — сыгранная ступень');
    expect(fractal.contains("value: '\${_ladder.level}'"), isFalse);
  });
}
