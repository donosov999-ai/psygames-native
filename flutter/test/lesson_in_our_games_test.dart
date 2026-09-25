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
    /*
     * 🔴 ЖДЁМ СОБЫТИЯ, А НЕ ВРЕМЕНИ. Здесь стояло `pump(150 мс)` — и это работало
     * лишь пока уровни успевали загрузиться в один оборот. `pump(Duration)`
     * двигает ВЫДУМАННЫЕ часы, а чтение ассета — настоящая асинхронность, и
     * крутится она только внутри `runAsync`.
     * 📍 Поймано 24.09.2026: лестница башен Лондона пересобрана и выросла с
     * 15,9 КБ до 51,8 КБ — проба тут же покраснела «кнопки разбора нет», хотя
     * кнопка на месте. Красил её размер файла, а не поломка.
     */
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: screen));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        if (find.byKey(const Key('game-lesson')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: '$what: кнопки разбора нет');
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('game-lesson')));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        if (find.byKey(const Key('lesson-counter')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

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
