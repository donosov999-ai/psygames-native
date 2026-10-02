import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';

/// 🔴 БОЙ С БОССОМ И МЕГАБОСС В НАТИВНОЙ «СУДОКУ» (задача 217f50de).
///
/// В вебе (`frontend/app/games/sudoku.tsx`) после каждого третьего засчитанного уровня
/// открывался бой из мешка трёх заданий, а каждый пятнадцатый — приглашение в «Самурая».
/// При переносе на Flutter оба слоя пропали молча. Партии здесь играются НАЖАТИЯМИ;
/// решение для ходов — `solveGrid` (проба проверяет веху, а не правила вариантов).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const ladderKey = 'psygames_sudoku_level_nzt48';
  setUpAll(() async => L.load('ru'));

  group('мешок и вехи сверены с вебом', () {
    final web = File('../frontend/app/games/sudoku.tsx').readAsStringSync();

    test('состав мешка — тот же, что у веба', () {
      final m = RegExp(r'SUDOKU_BOSS_BAG\.push\(\.\.\.shuffle\(\[([^\]]+)\]').firstMatch(web);
      expect(m, isNotNull, reason: 'в sudoku.tsx не найден мешок SUDOKU_BOSS_BAG — где он теперь?');
      final names = RegExp(r"'(\w+)'").allMatches(m!.group(1)!).map((x) => x.group(1)).toSet();
      expect(names, {for (final t in sudokuBossTypes) t.name});
    });

    test('веха боя и мегабосса — те же числа, что у веба', () {
      int webConst(String name) => int.parse(RegExp('const $name = (\\d+);').firstMatch(web)!.group(1)!);
      expect(BossRound.every, webConst('BOSS_EVERY'));
      expect(sudokuMegaBossEvery, webConst('MEGA_BOSS_EVERY'));
    });

    test('мешок: каждые три вехи — все три задания, без повторов внутри тройки', () {
      fillSudokuBossBag(const []);
      final rnd = Random(7);
      for (var round = 0; round < 5; round++) {
        final three = {for (var i = 0; i < 3; i++) nextSudokuBoss(rnd)};
        expect(three, sudokuBossTypes.toSet(), reason: 'тройка $round');
      }
    });
  });

  group('экран', () {
    late SharedState state;
    late SudokuLevels levels;

    Future<void> boot(WidgetTester tester, int level) async {
      SharedPreferences.setMockInitialValues({ladderKey: '$level', 'language': 'ru'});
      // Прежний экран снять: тот же виджет на том же месте дерева сохранил бы состояние,
      // и «новая партия» оказалась бы выигранной старой.
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
      final s = tester.widget<Text>(text.first).data ?? '';
      return int.tryParse(s) ?? 0;
    }

    /// Доиграть уже открытую партию нажатиями.
    Future<void> finish(WidgetTester tester, int level) async {
      final cfg = levels.config(level);
      final grid = [for (var r = 0; r < cfg.n; r++) [for (var c = 0; c < cfg.n; c++) digitAt(tester, r, c)]];
      final solution = solveGrid(grid, cfg.n, cfg.br, cfg.bc, variant: cfg.variant);
      expect(solution, isNotNull, reason: 'L$level: доску не решить');
      for (var r = 0; r < cfg.n; r++) {
        for (var c = 0; c < cfg.n; c++) {
          if (grid[r][c] != 0) continue;
          await tester.tap(find.byKey(Key('cell_${r}_$c')));
          await tester.pump();
          await tester.tap(find.byKey(Key('digit${solution![r][c]}')));
          await tester.pump();
        }
      }
    }

    /// Открыть экран на уровне и довести партию до победы нажатиями.
    Future<void> play(WidgetTester tester, int level) async {
      await boot(tester, level);
      await finish(tester, level);
    }

    testWidgets('🔴 веха: после 3-го уровня бой из мешка и его итог в итоге партии, после 2-го — боя нет',
        (tester) async {
      fillSudokuBossBag(const [BossType.lightning, BossType.finderror]);   // тянется с конца
      await expectBossAfterWin(
        tester,
        play: (level) => play(tester, level),
        won: find.text('Следующий уровень'),
        hudKey: 'bossHudFinderror',
      );
    });

    testWidgets('🔴 мешок тянется только на вехе: после 2-го уровня задание не тратится', (tester) async {
      fillSudokuBossBag(const [BossType.lightning, BossType.finderror]);
      await play(tester, 2);
      await tester.pump(const Duration(seconds: 3));
      expect(find.byKey(const Key('boss-round')), findsNothing);
      await play(tester, 3);
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(BossRound.introTime);
      expect(tester.widget<Text>(find.byKey(const Key('boss-hud'))).data, '⚔️ ${L.t('bossHudFinderror')}',
          reason: 'на 3-м пришло не первое задание мешка — значит, 2-й уровень его потратил');
      await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
    });

    testWidgets('🔴 партия с разбором вехи не открывает — ни боя, ни мегабосса', (tester) async {
      fillSudokuBossBag(const [BossType.finderror]);
      for (final level in [3, 15]) {
        await boot(tester, level);
        LessonUsed.mark();   // как будто человек открыл разбор в этой партии
        await finish(tester, level);
        await tester.pump(const Duration(seconds: 3));
        expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'L$level: разбор — победа не засчитана');
        expect(find.byKey(const Key('megaboss-offer')), findsNothing, reason: 'L$level');
        LessonUsed.reset();
      }
    });

    testWidgets('🔴 мегабосс на 15-м: приглашение вместо боя, «Позже» не отнимает уровень', (tester) async {
      fillSudokuBossBag(const [BossType.lightning]);
      await play(tester, 15);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('megaboss-offer')), findsOneWidget, reason: 'на 15-м — приглашение в «Самурая»');
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'мегабосс вытесняет обычный бой');
      expect(state.get(ladderKey), '16', reason: 'уровень засчитан до приглашения');
      // Текст — словом, а не ключом: ключи megaBoss* Dart зовёт впервые, без пересборки
      // словаря диалог показал бы «megaBossTitle».
      expect(find.text('⚔️ ${L.t('megaBossTitle')}'), findsOneWidget);
      expect(L.t('megaBossTitle'), isNot('megaBossTitle'), reason: 'ключ не собран в словарь Flutter');
      expect(L.t('megaBossGo'), isNot('megaBossGo'));
      await tester.tap(find.byKey(const Key('megaboss-later')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('megaboss-offer')), findsNothing);
      expect(find.text('Следующий уровень'), findsOneWidget, reason: '«Позже» возвращает к итогу партии');
      expect(find.byType(SamuraiScreen), findsNothing);
    });

    testWidgets('мегабосс: «В бой» открывает «Самурая» с меткой вехи', (tester) async {
      await play(tester, 15);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('megaboss-go')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(SamuraiScreen), findsOneWidget);
      expect(tester.widget<SamuraiScreen>(find.byType(SamuraiScreen)).megabossFrom, 15);
    });
  });
}
