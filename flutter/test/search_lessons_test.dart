/// РАЗБОР ПЯТИ ЭКРАНОВ РАЗДЕЛА НЕ УЧИТ НЕПРАВДЕ И НЕ ЗАМОРАЖИВАЕТ ЛЕСТНИЦУ.
///
/// Гейт `lesson_census_test.dart` проверяет, что кнопка разбора ЕСТЬ. Здесь —
/// две вещи, которые он не видит:
///  · показанное в разборе верно: у «Собери сумму» клетки дают цель, у SET
///    тройка — действительно сет (там стоит запасной вариант, который сетом
///    быть не обязан);
///  · отметку «разбор смотрели» снимает новая партия. Отметка общая на всё
///    приложение, и замер 30.09.2026 показал, что снимает её одно место из
///    сорока: без сброса один открытый разбор выключал рост уровня навсегда.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/screen.dart';
import 'package:psygames_flutter/games/set_game/model.dart' as set_model;
import 'package:psygames_flutter/shell/js_compat.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  tearDown(LessonUsed.reset);

  testWidgets('🔴 разбор «Собери сумму»: показанные клетки ДАЮТ цель', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: CounterScreen(state: state, rnd: createRng('probe'))));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    // Цель — крупный стимул карточки, слагаемые — подпись под ним «a + b».
    final goal = int.parse(tester.widget<Text>(find.byKey(const Key('demo-stimulus'))).data!);
    final sub = find.textContaining(' + ');
    expect(sub, findsOneWidget, reason: 'в разборе не показано, из чего собрана цель');
    final parts = tester.widget<Text>(sub).data!.split(' + ').map(int.parse).toList();
    expect(parts.fold<int>(0, (a, b) => a + b), goal,
        reason: 'разбор учит неправде: ${parts.join(' + ')} ≠ $goal');
    expect(LessonUsed.inRound, isTrue, reason: 'открытый разбор обязан снять зачёт партии');
  });

  test('🔴 разбор SET: на доске разбора сет ЕСТЬ, и запасной вариант не срабатывает', () {
    // Тот же генератор и то же зерно, что у экрана разбора.
    final board = set_model.buildBoard(createRng('lesson'));
    final found = set_model.findAnySet(board);
    expect(found, isNotNull, reason: 'на доске разбора нет сета — показались бы три случайные карты');
    expect(set_model.isSet(board[found![0]], board[found[1]], board[found[2]]), isTrue);
  });

  testWidgets('🔴 новая партия снимает отметку разбора — уровень снова растёт', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    LessonUsed.mark();   // разбор открыли в ЛЮБОЙ игре раньше
    await tester.pumpWidget(MaterialApp(home: CounterScreen(state: state, rnd: createRng('probe'))));
    await tester.pump();
    await tester.pump();
    expect(LessonUsed.inRound, isFalse,
        reason: 'новая партия не сняла отметку — рост уровня выключен навсегда');
  });
}
