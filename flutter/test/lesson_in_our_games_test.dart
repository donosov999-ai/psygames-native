import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/games/sort_tubes/board.dart';
import 'package:psygames_flutter/games/sort_tubes/screen.dart';
import 'package:psygames_flutter/games/tower_london/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗБОР ЕСТЬ НЕ ТОЛЬКО У ТЭТХЭМА, А И У НАШИХ ИГР.
///
/// Цель Дениса 24.09.2026: «решатель и учитель для наших игр, чтобы был у всех хабов
/// и игр». У Тэтхэма разбор дал движок — писать было нечего. У наших писать пришлось
/// бы по одному на игру, поэтому заведён общий договор доски: игра отдаёт снимок,
/// ходы, «применить» и «решено», а поиск один на всех.
///
/// ⚠️ Проба поднимает ТРИ игры с разной механикой хода. Две похожие ничего не
/// доказывают: ханой и башни — «снять верхнее, положить сверху», а колбы переливают
/// сразу несколько шариков, и сколько — решает сама игра.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  Future<void> check(WidgetTester tester, Widget screen, String what) async {
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: '$what: кнопки разбора нет');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: '$what: плеер не открылся');
    expect(find.textContaining('Шаг 1 из'), findsOneWidget, reason: '$what: шагов нет');
    expect(LessonUsed.inRound, isTrue,
        reason: '$what: партия после разбора обязана перестать быть зачётной');
  }

  testWidgets('🔴 «Ханойская башня» — разбор открывается', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await check(tester, HanoiScreen(state: state), 'ханой');
  });

  testWidgets('🔴 «Башня Лондона» — тот же решатель, цель у каждой задачи своя', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await check(tester, TowerLondonScreen(state: state), 'башни Лондона');
  });

  testWidgets('🔴 «Пробирки» — ход переливает несколько шариков, договор выдержал', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await check(
      tester,
      SortTubesScreen(state: state, gameId: 'water_sort', title: 'Пробирки', skin: TubeSkin.water),
      'колбы',
    );
  });
}
