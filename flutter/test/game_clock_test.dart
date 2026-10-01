import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';

/// 🔴 ЧАСЫ ПАРТИИ СТОЯТ, ПОКА ПОВЕРХ ИГРЫ ПАУЗА ИЛИ РАЗБОР (задача 430d1299).
///
/// Перенос веб-правила `gamePause.ts`: во Flutter пауза и разбор — страницы поверх игры,
/// и без общих часов игра под ними жила дальше (64 нативные игры из 74 на своих
/// `Timer`/`DateTime.now`). Настенное время в пробах подменяется поддельным временем
/// `testWidgets`, иначе часы шли бы вместе с настоящими часами машины.
void main() {
  var fakeNow = 0;
  setUp(() {
    resetGameClock();
    fakeNow = 1000000;
    gameWallMs = () => fakeNow;
  });

  test('часы стоят, пока держат паузу, и идут после; удержания вложенные', () {
    final t0 = gameNow();
    fakeNow += 500;
    expect(gameNow() - t0, 500);

    final a = holdGame();
    final b = holdGame();
    fakeNow += 3000;
    expect(gameNow() - t0, 500, reason: 'на паузе часы стоят');
    a();
    a(); // повторное снятие ничего не делает
    fakeNow += 1000;
    expect(isGameHeld(), isTrue, reason: 'снят один из двух — пауза держится');
    expect(gameNow() - t0, 500);
    b();
    fakeNow += 200;
    expect(gameNow() - t0, 700, reason: 'после снятия последнего часы пошли, пауза вычтена');
    expect(heldTotalMs(), 4000);
  });

  testWidgets('таймер партии на паузе не стреляет и после неё дожидается остатка', (tester) async {
    gameWallMs = () => fakeNow;
    var fired = 0;
    gameTimeout(const Duration(milliseconds: 1000), () => fired++);

    Future<void> advance(int ms) async {
      fakeNow += ms;
      await tester.pump(Duration(milliseconds: ms));
    }

    await advance(600);
    final release = holdGame();
    await advance(5000);
    expect(fired, 0, reason: 'под паузой срок не истёк — прошло 600 мс игрового времени');
    release();
    await advance(300);
    expect(fired, 0, reason: 'остаток 400 мс, прошло 300');
    await advance(150);
    expect(fired, 1, reason: 'остаток дождался — сработал ровно один раз');
    await advance(3000);
    expect(fired, 1);
  });

  testWidgets('интервал партии: сетка тиков по игровым часам, на паузе тиков нет', (tester) async {
    var ticks = 0;
    final t = gameInterval(const Duration(milliseconds: 100), () => ticks++);
    Future<void> advance(int ms) async {
      fakeNow += ms;
      await tester.pump(Duration(milliseconds: ms));
    }

    for (var i = 0; i < 5; i++) {
      await advance(100);
    }
    expect(ticks, 5);
    final release = holdGame();
    for (var i = 0; i < 10; i++) {
      await advance(100);
    }
    expect(ticks, 5, reason: 'на паузе интервал не тикает');
    release();
    for (var i = 0; i < 3; i++) {
      await advance(100);
    }
    expect(ticks, 8);
    t.cancel();
    await advance(500);
    expect(ticks, 8, reason: 'снятый интервал молчит');
  });

  testWidgets('меню паузы каркаса держит часы, пока открыто', (tester) async {
    await L.load('ru');
    await tester.pumpWidget(MaterialApp(
      home: GameShell(title: 'Проба', field: (_, _) => const SizedBox.expand()),
    ));
    expect(isGameHeld(), isFalse);
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-resume')), findsOneWidget, reason: 'меню паузы не открылось');
    expect(isGameHeld(), isTrue, reason: 'пауза открыта — часы партии обязаны стоять');
    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pumpAndSettle();
    expect(isGameHeld(), isFalse, reason: 'пауза закрыта — часы пошли');
  });

  testWidgets('экран разбора держит часы, пока открыт', (tester) async {
    await L.load('ru');
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      return TextButton(
        key: const Key('open'),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => LessonPlayerScreen(
            title: 'Разбор',
            steps: const [LessonStep(text: 'Шаг')],
            board: (_, _, _) => const SizedBox(),
          ),
        )),
        child: const Text('open'),
      );
    })));
    await tester.tap(find.byKey(const Key('open')));
    await tester.pumpAndSettle();
    expect(isGameHeld(), isTrue, reason: 'разбор поверх партии — часы стоят');
    Navigator.of(tester.element(find.byType(LessonPlayerScreen))).pop();
    await tester.pumpAndSettle();
    expect(isGameHeld(), isFalse);
  });
}
