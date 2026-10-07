import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

    // Мегабосс веба «каждый 15-й» в нативе снят решением Дениса 07.10.2026 — боссы
    // лестницы ставит файл (`sudoku_ladder_boss_test.dart`); веха мешка — как у веба.
    test('веха боя — то же число, что у веба', () {
      int webConst(String name) => int.parse(RegExp('const $name = (\\d+);').firstMatch(web)!.group(1)!);
      expect(BossRound.every, webConst('BOSS_EVERY'));
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

    // Веха «Судоку» — строка `boss` файла лестницы (решение Дениса 07.10.2026: смена модели
    // генерации, минимум каждые 10), а не «каждый третий»: 4 — конец доски 6×6, 3 — середина.
    testWidgets('🔴 веха: после 4-го уровня (конец модели) бой из мешка и его итог в итоге партии, после 3-го — боя нет',
        (tester) async {
      fillSudokuBossBag(const [BossType.lightning, BossType.finderror]);   // тянется с конца
      await play(tester, 4);
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byKey(const Key('boss-round')), findsOneWidget, reason: 'после победы на 4-м уровне боя нет');
      await tester.pump(BossRound.introTime);
      expect(tester.widget<Text>(find.byKey(const Key('boss-hud'))).data, '⚔️ ${L.t('bossHudFinderror')}');
      await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'бой не закрылся');
      expect(find.text('Следующий уровень'), findsWidgets, reason: 'после боя нет итога взятого уровня');
      expect(find.byKey(const Key('boss-outcome')), findsOneWidget, reason: 'итог боя не показан в итоге партии');

      await play(tester, 3);
      await tester.pump(const Duration(seconds: 3));
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: '3 — середина модели: «каждый третий» снят');
      expect(find.byKey(const Key('boss-outcome')), findsNothing);
    });

    testWidgets('🔴 мешок тянется только на вехе: после 3-го уровня задание не тратится', (tester) async {
      fillSudokuBossBag(const [BossType.lightning, BossType.finderror]);
      await play(tester, 3);
      await tester.pump(const Duration(seconds: 3));
      expect(find.byKey(const Key('boss-round')), findsNothing);
      await play(tester, 4);
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(BossRound.introTime);
      expect(tester.widget<Text>(find.byKey(const Key('boss-hud'))).data, '⚔️ ${L.t('bossHudFinderror')}',
          reason: 'на 4-м пришло не первое задание мешка — значит, 3-й уровень его потратил');
      await tester.pump(const Duration(seconds: BossRound.roundSeconds + 1));
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
    });

    testWidgets('🔴 партия с разбором вехи не открывает — ни боя, ни босса лестницы', (tester) async {
      fillSudokuBossBag(const [BossType.finderror]);
      for (final level in [4, 8]) {
        await boot(tester, level);
        LessonUsed.mark();   // как будто человек открыл разбор в этой партии
        await finish(tester, level);
        await tester.pump(const Duration(seconds: 3));
        expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'L$level: разбор — победа не засчитана');
        expect(find.byKey(const Key('ladderboss-offer')), findsNothing, reason: 'L$level');
        LessonUsed.reset();
      }
    });
  });
}
