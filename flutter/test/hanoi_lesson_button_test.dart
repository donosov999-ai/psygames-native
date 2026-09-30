import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КНОПКА РАЗБОРА ЕСТЬ И В НАШЕЙ ИГРЕ, НЕ ТОЛЬКО У ТЭТХЭМА.
///
/// Ради этого и заводился общий договор доски: у ханоя своего учителя никто не
/// писал — игра отдала снимок, ходы и «решено», остальное сделал общий решатель.
/// Проба жмёт кнопку и смотрит, что открылось.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  testWidgets('🔴 кнопка разбора открывает плеер с шагами решения', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: HanoiScreen(state: state)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');

    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: 'плеер не открылся');
    expect(find.textContaining('Шаг 1 из'), findsOneWidget);
    expect(LessonUsed.inRound, isTrue, reason: 'партия после разбора обязана перестать быть зачётной');
  });
}
