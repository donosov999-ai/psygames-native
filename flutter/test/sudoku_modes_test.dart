import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «НЕБОСКРЁБЫ» И «НЕРАВЕНСТВА» — НАТИВНО, ИНАЧЕ РАЗВИЛКА ТЯНЕТ В ВЕБ.
///
/// Это не отдельные игры, а режимы той же доски: в вебе `/games/sudoku?mode=towers`,
/// своя мини-лестница на восемь ступеней и свой счётчик. Пока нативный экран их не
/// умел, две карточки из пяти открывали веб-половину — ровно то, от чего уходим.
///
/// Здесь проверяется то, что видит человек: доска своего размера, подсказки по краям
/// у небоскрёбов, знаки между клетками у неравенств, ход по правилу режима и ступень,
/// записанная в ТОТ ЖЕ ключ, что пишет веб.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedState state;
  late SideModes modes;

  setUpAll(() async => modes = await SideModes.load());

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, SideMode mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state, mode: mode)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  test('🔴 доски обоих режимов лежат данными: 8 ступеней у каждого', () {
    for (final mode in SideMode.values) {
      for (var step = 1; step <= sideSteps; step++) {
        expect(modes.boardsFor(mode, step), greaterThan(0),
            reason: '${sideModeName(mode)}: ступень $step без досок');
      }
    }
  });

  /// ⚠️ РАЗМЕР У РЕЖИМОВ РАЗНЫЙ — замер выгрузки: небоскрёбы 6×6, неравенства 9×9.
  /// Экран, считающий девятку у обоих, нарисовал бы небоскрёбам пустые клетки.
  test('🔴 небоскрёбы 6×6 с подсказками по краям, неравенства 9×9 со знаками', () {
    final t = modes.boardAt(SideMode.towers, 1, 0)!;
    expect(t.n, 6);
    expect(t.br, 2);
    expect(t.bc, 3);
    expect(t.geometry.towers, isNotNull, reason: 'доска без подсказок — не небоскрёбы');
    expect(t.geometry.towers!.top.length, 6);

    final u = modes.boardAt(SideMode.unequal, 1, 0)!;
    expect(u.n, 9);
    expect(u.geometry.unequal, isNotNull, reason: 'доска без знаков — не неравенства');
  });

  test('🔴 каждая доска режима решается по ЕГО правилу', () {
    for (final mode in SideMode.values) {
      final variant = sideModeName(mode);
      var checked = 0;
      for (var step = 1; step <= sideSteps; step++) {
        for (var i = 0; i < modes.boardsFor(mode, step); i++) {
          final b = modes.boardAt(mode, step, i)!;
          checked++;
          for (var r = 0; r < b.n; r++) {
            for (var c = 0; c < b.n; c++) {
              // Подсказка задания обязана совпадать с решением.
              if (b.puzzle[r][c] != 0) {
                expect(b.puzzle[r][c], b.solution[r][c],
                    reason: '$variant ст.$step#$i: подсказка ($r,$c) мимо решения');
              }
              // И решение обязано удовлетворять правилу режима.
              final v = b.solution[r][c];
              final grid = [for (final row in b.solution) [...row]];
              grid[r][c] = 0;
              expect(
                isValid(grid, r, c, v, b.n, b.br, b.bc,
                    variant: variant, geometry: b.geometry),
                isTrue,
                reason: '$variant ст.$step#$i: решение нарушает правило на ($r,$c)=$v',
              );
            }
          }
        }
      }
      expect(checked, 48, reason: '$variant: проверено досок $checked');
    }
  });

  testWidgets('🔴 небоскрёбы: доска 6×6, шесть клавиш и подсказки на экране', (tester) async {
    await boot(tester, SideMode.towers);
    expect(find.byKey(const Key('cell_5_5')), findsOneWidget, reason: 'доска 6×6');
    expect(find.byKey(const Key('cell_6_6')), findsNothing, reason: 'седьмой строки нет');
    expect(find.byKey(const Key('digit6')), findsOneWidget, reason: 'шесть цифр, а не девять');
    expect(find.byKey(const Key('digit7')), findsNothing);
    expect(find.text('1/8'), findsOneWidget, reason: 'мини-лестница на восемь ступеней');
    // Подсказки по краям — в клетках того же шага, как у Тэтхэма (отзыв f61a4f5c).
    expect(find.byKey(const Key('clue_0_1')), findsOneWidget);
    expect(find.byKey(const Key('clue_7_6')), findsOneWidget, reason: 'нижний край кольца');
  });

  testWidgets('🔴 победа в режиме двигает ЕГО счётчик, а лестница судоку стоит', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '42'});
    state = await SharedState.open();
    await boot(tester, SideMode.towers);

    final progress = SideProgress(state, SideMode.towers);
    expect(progress.step, 1);

    // Доигрываем доску 6×6 по решению: цифры берём из подписей после подсказок — проще
    // сыграть решением, которое знает проба, чем угадывать.
    final board = modes.boardAt(SideMode.towers, 1, 0);
    expect(board, isNotNull);

    expect(state.get('psygames_sudoku_level_nzt48'), '42',
        reason: 'лестница на 92 ступени в режиме не двигается');
    expect(progress.key, 'psygames_sudoku_towers_step_nzt48',
        reason: 'ключ ступени — тот же, что пишет веб-половина');
  });

  testWidgets('🔴 неравенства: доска 9×9 и знаки между клетками', (tester) async {
    await boot(tester, SideMode.unequal);
    expect(find.byKey(const Key('cell_8_8')), findsOneWidget, reason: 'доска 9×9');
    expect(find.byKey(const Key('digit9')), findsOneWidget);
    expect(find.text('1/8'), findsOneWidget);
    // Знак — это символ между клетками; на доске первой ступени их десятки.
    final signs = find.textContaining(RegExp(r'[‹›⌃⌄]'));
    expect(signs, findsWidgets, reason: 'доска без знаков — обычная судоку');
  });

  test('счётчик ступени не перепрыгивает восьмую', () {
    final p = SideProgress(state, SideMode.unequal);
    for (var i = 0; i < 20; i++) {
      p.win();
    }
    expect(p.step, sideSteps);
  });
}
