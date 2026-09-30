import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/shared_level_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КНОПКА РАЗБОРА СТОИТ В ИГРЕ И ОТКРЫВАЕТ ПЛЕЕР — ПРОВЕРЯЕТСЯ НАЖАТИЕМ.
///
/// Решение Дениса 24.09.2026: «кнопку решателя и учителя не забудь поставить в игры».
/// Проба не читает исходник на наличие пропса: она поднимает экран, жмёт кнопку и
/// смотрит, что открылось и что стало с лестницей.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final libPath = '${Directory.current.path}/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');
    await PuzzleModes.load();
    if (!File(libPath).existsSync()) {
      Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: Directory.current.path);
    }
    expect(File(libPath).existsSync(), isTrue, reason: 'движок не собран — проверять нечего');
  });

  tearDown(LessonUsed.reset);

  Future<void> boot(WidgetTester tester, String mode) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath),
      ));
      // ⚠️ Ждём дольше сорока тактов: «Сапёр» раздаёт доску заметно медленнее
      // судоку, и короткое ожидание читалось бы как «игра не открылась».
      for (var i = 0; i < 200; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('game-lesson')).evaluate().isNotEmpty) break;
        if (i > 60 && find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  testWidgets('🔴 у решаемой игры кнопка есть и открывает разбор по шагам', (tester) async {
    await boot(tester, 'Solo');
    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');

    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('game-lesson')));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('lesson-counter')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: 'плеер не открылся');
    expect(find.textContaining('Шаг 1 из'), findsOneWidget);
    expect(find.byKey(const Key('lesson-text')), findsOneWidget);
  });

  testWidgets('🔴 у НЕрешаемой игры кнопки нет — объяснять нечего и нечем', (tester) async {
    // «Сапёр»: решателя нет по устройству игры, ответ прячется от игрока намеренно.
    await boot(tester, 'Mines');
    expect(find.byKey(const Key('board')), findsOneWidget, reason: 'игра не открылась');
    expect(find.byKey(const Key('game-lesson')), findsNothing);
  });

  test('🔴 партия с разбором в уровень не засчитывается', () async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_probe_level_nzt48': '5',
    });
    final state = await SharedState.open();
    final ladder = LevelLadder(gameId: 'probe', store: SharedLevelStore(state), maxLevel: 20);
    await ladder.load();
    expect(ladder.level, 5);

    LessonUsed.mark();
    await ladder.win();
    expect(ladder.level, 5, reason: 'решение показали — мерить по нему человека нечестно');

    LessonUsed.reset();   // новая раздача
    await ladder.win();
    expect(ladder.level, 6, reason: 'без разбора партия обязана засчитываться');
  });
}
