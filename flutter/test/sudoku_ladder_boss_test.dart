import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_transition.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 БОССЫ ЛЕСТНИЦЫ «СУДОКУ» — ОДНО ПРАВИЛО, ИЗ ФАЙЛА (задача 4e3d3443, решение Дениса
/// 07.10.2026: «босса чаще или реже — лучше привязать к смене модели генерации, но минимум
/// каждые 10 уровней»; схема — с разделом «Судоку», 92c42801).
///
/// Веха — строка `boss` в `sudoku-ladder-transit.json`: конец каждой модели и промежуточная
/// (75 внутри банка 66–80). Со `bossGame` — большой босс в другой игре (96, 112, 128, 144,
/// 160, 176, 192) приглашением «Позже / В бой»; без него — бой из мешка. Мегабосса «каждый
/// 15-й» и мешка «каждый 3-й» больше нет.
///
/// Партии играются НАЖАТИЯМИ. Решение берётся из выгрузки той же ступени: доску на экране
/// узнаём по подсказкам среди досок уровня, — решатель без правил линий тут не годится.
/// Чужую игру босса подменяет экран-заглушка через `LevelTransition.resolve`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const ladderKey = 'psygames_sudoku_level_nzt48';
  setUpAll(() async => L.load('ru'));

  late SharedState state;
  late SudokuLevels levels;
  final opened = <String>[];

  setUp(() {
    opened.clear();
    LevelTransition.closeDelay = const Duration(milliseconds: 10);
    LevelTransition.resolve = (url) => switch (url) {
          '/games/sudoku-samurai' || '/games/sudoku-fractal' || '/games/sudoku-fractal-deep' => (s) {
              opened.add(url);
              return const _FakeBossGame();
            },
          _ => null,
        };
  });
  tearDown(() => LevelTransition.resolve = (_) => null);

  Future<void> boot(WidgetTester tester, int level) async {
    SharedPreferences.setMockInitialValues({ladderKey: '$level', 'language': 'ru'});
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(() async {
      state = await SharedState.open();
      levels = await SudokuLevels.load();
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

  /// Решение доски на экране: та доска уровня, чьи подсказки совпали с видимыми цифрами.
  List<List<int>> solutionOnScreen(WidgetTester tester, int level) {
    final n = levels.config(level).n;
    final grid = [for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) digitAt(tester, r, c)]];
    bool same(List<List<int>> a) =>
        [for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) a[r][c] == grid[r][c]].every((x) => x);
    for (var i = 0; i < levels.boardsFor(level); i++) {
      final b = levels.boardAt(level, i)!;
      if (same(b.puzzle)) return b.solution;
    }
    fail('L$level: доска на экране не найдена среди ${levels.boardsFor(level)} досок уровня');
  }

  Future<void> play(WidgetTester tester, int level) async {
    await boot(tester, level);
    final solution = solutionOnScreen(tester, level);
    final n = solution.length;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (digitAt(tester, r, c) != 0) continue;
        await tester.tap(find.byKey(Key('cell_${r}_$c')));
        await tester.pump();
        await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
        await tester.pump();
      }
    }
    await tester.pumpAndSettle();
  }

  /// Бой из мешка, если он открылся, доиграть до конца, чтобы не висели таймеры.
  Future<void> drainBag(WidgetTester tester) async {
    if (find.byKey(const Key('boss-round')).evaluate().isEmpty) return;
    await tester.pump(BossRound.introTime);
    await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
    await tester.pump(BossRound.doneTime);
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 96: победа на доске → приглашение большого босса из файла, «Самурай»', (tester) async {
    await play(tester, 96);
    expect(find.byKey(const Key('ladderboss-offer')), findsOneWidget);
    expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'один босс на победу: мешок молчит');
    expect(find.text('⚔️ ${L.t('bossTitle')}: ${L.t('samuraiTitle')}'), findsOneWidget);
    expect(state.get(ladderKey), '97', reason: 'уровень засчитан до приглашения');
  });

  testWidgets('🔴 96 → «В бой»: босс сыгран и выигран — уровень +1 ОДИН раз, а не два', (tester) async {
    await play(tester, 96);
    await tester.tap(find.byKey(const Key('ladderboss-go')));
    await tester.pumpAndSettle();
    expect(opened, ['/games/sudoku-samurai']);
    await tester.tap(find.byKey(const Key('fake-win')));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpAndSettle();
    expect(find.byType(_FakeBossGame), findsNothing, reason: 'после итога человек вернулся на ступень');
    expect(state.get(ladderKey), '97', reason: 'хозяин босса — временная лестница: доска дала +1, босс — ничего');
  });

  testWidgets('96 → «Позже»: уровень не отнят, чужая игра не открыта, мешок не добирает', (tester) async {
    await play(tester, 96);
    await tester.tap(find.byKey(const Key('ladderboss-later')));
    // Кадрами, а не одним скачком: окно закрывается анимацией, и только после неё
    // экран идёт дальше по победе — одним pump(1 с) бой не успел бы открыться и при дефекте.
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'после «Позже» второго босса быть не должно');
    await drainBag(tester);
    expect(opened, isEmpty);
    expect(state.get(ladderKey), '97');
  });

  testWidgets('112: большой босс из файла — «Фрактал»', (tester) async {
    await play(tester, 112);
    expect(find.text('⚔️ ${L.t('bossTitle')}: ${L.t('fractalTitle')}'), findsOneWidget);
    await tester.tap(find.byKey(const Key('ladderboss-go')));
    await tester.pumpAndSettle();
    expect(opened, ['/games/sudoku-fractal']);
    // Доиграть: брошенный переход оставил бы метку ступени-перехода, и лестница
    // следующей партии стояла бы как замороженная.
    await tester.tap(find.byKey(const Key('fake-win')));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpAndSettle();
    expect(state.get(ladderKey), '113');
  });

  /// Бой из мешка открылся (а большого приглашения нет) — и доигран до конца.
  Future<void> expectBag(WidgetTester tester, int level) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(find.byKey(const Key('ladderboss-offer')), findsNothing, reason: 'L$level: большого босса тут нет');
    expect(find.byKey(const Key('boss-round')), findsOneWidget, reason: 'L$level: конец модели — бой из мешка');
    await drainBag(tester);
  }

  testWidgets('🔴 конец модели без большого босса — бой из мешка: 13 (диагонали), 61 (банк), 100 (ренбан)',
      (tester) async {
    for (final level in [13, 61, 100]) {
      await play(tester, level);
      expect(state.get(ladderKey), '${level + 1}');
      await expectBag(tester, level);
    }
  });

  testWidgets('🔴 75: промежуточный босс внутри банка 66–80 (модель длиннее 10 ступеней)', (tester) async {
    await play(tester, 75);
    expect(state.get(ladderKey), '76');
    await expectBag(tester, 75);
  });

  testWidgets('🔴 середина модели — никакого боя: 3, 6, 9 («каждый 3-й» снят), 15, 90, 105 («каждый 15-й» снят), 95, 99',
      (tester) async {
    for (final level in [3, 6, 9, 15, 90, 105, 95, 99]) {
      await play(tester, level);
      expect(state.get(ladderKey), '${level + 1}', reason: 'L$level: победа засчитана');
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 500));
      }
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'L$level: не конец модели');
      expect(find.byKey(const Key('ladderboss-offer')), findsNothing, reason: 'L$level');
    }
  });
}

/// Чужая игра босса: одна кнопка, которая сообщает победу так же, как настоящие экраны.
class _FakeBossGame extends StatelessWidget {
  const _FakeBossGame();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: FilledButton(
            key: const Key('fake-win'),
            onPressed: () => LevelLadder.reportOutcome(true),
            child: const Text('win'),
          ),
        ),
      );
}
