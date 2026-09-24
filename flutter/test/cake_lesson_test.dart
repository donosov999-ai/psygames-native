import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cake_sort/board.dart' show CakeSkin;
import 'package:psygames_flutter/games/cake_sort/model.dart';
import 'package:psygames_flutter/games/cake_sort/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ТОРТЫ»: РАЗБОР ПРОИГРЫВАЕТ ЗАПИСАННОЕ РЕШЕНИЕ, А НЕ ИЩЕТ СВОЁ.
///
/// Ветвление тортов такое, что поиск пути на телефоне стоит секунды (замер
/// веб-стороны: L10 — 24 954 мс). Поэтому путь каждого уровня посчитан заранее
/// и лежит в `assets/levels/cake_solutions.json`.
///
/// ⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ МЕРИТСЯ, — НЕ КНОПКА, А ЗАПИСЬ. Кнопка разбора может
/// стоять на месте и открывать плеер, показывая при этом мусор: доска после
/// проигрывания не собралась. Поэтому первая проба прогоняет КАЖДУЮ запись
/// через тот же `moveType`, которым ходит экран, и требует собранной доски.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  test('🔴 каждая записанная партия действительно собирает доску', () async {
    final set = CakeLevelSet.fromJsonString(
        await rootBundle.loadString('assets/levels/cake_sort.json'));
    final sol = jsonDecode(await rootBundle.loadString('assets/levels/cake_solutions.json'))
        as Map<String, dynamic>;
    final moves = (sol['moves'] as Map<String, dynamic>).map(
      (k, v) => MapEntry(int.parse(k), (v as List).cast<int>()),
    );

    expect(moves.length, set.levels.length,
        reason: 'записей ${moves.length}, уровней ${set.levels.length} — часть уровней без разбора');

    final broken = <String>[];
    for (final level in set.levels) {
      final flat = moves[level.level];
      if (flat == null || flat.length < 3) {
        broken.add('L${level.level}: записи нет');
        continue;
      }
      var b = level.freshBoard();
      var step = 0;
      for (var i = 0; i + 2 < flat.length; i += 3) {
        final next = moveType(b, flat[i], flat[i + 1], flat[i + 2]);
        if (next == null) {
          broken.add('L${level.level}: ход ${step + 1} (${flat[i]}→${flat[i + 2]}) невозможен');
          break;
        }
        b = next;
        step += 1;
      }
      if (!b.isCleared && !broken.any((s) => s.startsWith('L${level.level}:'))) {
        broken.add('L${level.level}: $step ходов проиграно, доска не собрана');
      }
    }
    expect(broken, isEmpty, reason: 'записи разошлись с уровнями:\n${broken.join('\n')}');
  });

  testWidgets('🔴 кнопка разбора есть и открывает плеер', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    // ⚠️ Экран грузит уровни и решения из ассетов: без ожидания проба увидит
    // пустой экран и скажет «кнопки нет» там, где её ещё не нарисовали.
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: CakeSortScreen(
            state: state, gameId: 'cake_sort', title: 'Торты', skin: CakeSkin.cake),
      ));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 15));
        if (find.byKey(const Key('game-lesson')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('game-lesson')));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 15));
        if (find.byKey(const Key('lesson-counter')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: 'плеер не открылся');
    expect(find.textContaining('Шаг 1 из'), findsOneWidget);
    expect(LessonUsed.inRound, isTrue);
  });
}
