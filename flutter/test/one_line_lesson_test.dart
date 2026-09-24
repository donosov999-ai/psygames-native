import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ОДНА ЛИНИЯ»: РАЗБОР ИДЁТ ПО ЭТАЛОННОМУ МАРШРУТУ УРОВНЯ.
///
/// У графа обходов много, и свой поиск нашёл бы ДРУГОЙ — человек учился бы не тому
/// пути, который уровень проверяет. Поэтому берём `solutionEdgeIds` и начальную
/// вершину из эталона: без неё правило начала не сходилось у восьми уровней из
/// тридцати, это записано в самой модели.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  testWidgets('🔴 кнопка разбора есть и ведёт линию ребро за ребром', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    // ⚠️ Экран грузит набор уровней из ассета: без ожидания проба видит пустой
    // экран и говорит «кнопки нет» там, где её просто ещё не нарисовали.
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: OneLineScreen(state: state)));
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
