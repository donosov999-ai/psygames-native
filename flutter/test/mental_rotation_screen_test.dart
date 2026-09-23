import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mental_rotation/rng.dart';
import 'package:psygames_flutter/games/mental_rotation/screen.dart';
import 'package:psygames_flutter/games/mental_rotation/session.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ ТЫЧКАМИ, А НЕ ВЫЗОВОМ ПРАВИЛ.
///
/// 🔴 ЗДЕСЬ ДВА РАЗНЫХ ВИДА ПРОБ, И ТОЛЬКО ОДИН ЛОВИТ ПОДМЕНУ ВЕРДИКТА.
///
/// Проба, которая тычет наугад и читает ответ экрана, проверяет цепочку «ответ → счётчик →
/// следующая проба» — но НЕ правило: экран остаётся согласен сам с собой, как ни переверни его
/// суждение. Замер мутацией 23.09.2026: «верный вариант — это НЕверный» такую пробу не покраснил.
/// Поэтому рядом стоит проба с семенной случайностью: она строит те же задания ядром, знает
/// верный номер заранее и тычет именно в него. Её эта мутация валит с числом в причине.
///
/// Вторая мутация — «поле берёт высоту у ОКНА, а не у каркаса» — роняет обе пробы, которые ищут
/// разбор: рисунок эталона вырастает, и разбор уезжает за нижний край поля.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, {Size size = const Size(390, 844), Rng? rng}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: rng == null
            ? MentalRotationScreen(state: state)
            : MentalRotationScreen(state: state, rng: rng),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  /// Сколько вариантов сейчас на экране.
  int optionCount(WidgetTester tester) {
    var n = 0;
    while (find.byKey(Key('вариант$n')).evaluate().isNotEmpty) {
      n++;
    }
    return n;
  }

  /// Один ответ: тычок в первый вариант. Возвращает `true`, если экран признал ответ верным.
  Future<bool> answer(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('вариант0')));
    await tester.pump();
    expect(
      find.text('верный ответ'),
      findsOneWidget,
      reason: 'после ответа верная карточка обязана подписаться — иначе разбор не о чем',
    );
    final missed = find.byKey(const Key('следующий-раунд')).evaluate().isNotEmpty;
    if (missed) {
      expect(
        find.byKey(const Key('разбор')),
        findsOneWidget,
        reason: 'промах обязан открыть разбор: вердикт без объяснения ничему не учит',
      );
      await tester.tap(find.byKey(const Key('следующий-раунд')));
    }
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pump();
    return !missed;
  }

  testWidgets('🔴 партия из пяти заданий играется тычками и считается по-честному', (tester) async {
    await boot(tester);
    expect(find.text('Мысленное вращение'), findsOneWidget);
    expect(find.text('Уровень 1'), findsOneWidget);

    await tester.tap(find.byKey(const Key('заданий5')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    var hits = 0;
    for (var round = 1; round <= 5; round++) {
      expect(find.text('$round/5'), findsOneWidget, reason: 'счётчик раундов идёт по порядку');
      expect(optionCount(tester), greaterThanOrEqualTo(2), reason: 'варианты нарисованы');
      if (await answer(tester)) hits++;
    }

    expect(find.byKey(const Key('итог-партии')), findsOneWidget, reason: 'партия кончилась итогом');
    expect(
      find.text('$hits из 5'),
      findsOneWidget,
      reason: 'в итоге ровно столько верных, сколько экран признал по ходу партии',
    );
  });

  testWidgets('🔴 экран судит ответ по ПРАВИЛАМ ЯДРА, а не по-своему', (tester) async {
    // 🔴 ЭТА ПРОБА — ЕДИНСТВЕННАЯ, КОТОРАЯ ЗНАЕТ ВЕРНЫЙ ОТВЕТ ЗАРАНЕЕ, и потому единственная,
    // которая ловит подмену вердикта. Проба, которая тычет наугад и читает ответ экрана, зелена
    // и с перевёрнутым правилом: экран остаётся согласен сам с собой. Замер 23.09.2026: мутация
    // «верный вариант — это НЕверный» первую пробу не покраснила, эту — краснит.
    const seed = 'проба-вращение';
    await boot(tester, rng: createRng(seed));
    await tester.tap(find.byKey(const Key('заданий5')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    // Тот же поток случайности с той же стороны и в том же порядке: сперва план партии, потом по
    // заданию на раунд. Разойдись порядок — задания разъедутся, и проба скажет об этом сразу.
    final replay = createRng(seed);
    final plan = planTaskKinds(1, 5, replay);
    for (var i = 0; i < 5; i++) {
      final task = buildTask(plan[i], 1, replay);
      await tester.tap(find.byKey(Key('вариант${task.correctIdx}')));
      await tester.pump();
      expect(
        find.byKey(const Key('следующий-раунд')),
        findsNothing,
        reason: 'ядро назвало верным вариант ${task.correctIdx} — экран обязан согласиться',
      );
      await tester.pump(const Duration(milliseconds: 900));
      await tester.pump();
    }
    expect(find.text('5 из 5'), findsOneWidget, reason: 'пять верных из пяти');

    // Партия без единой ошибки — уровень вырос: правило лестницы тоже проверяется тычками.
    await tester.tap(find.byKey(const Key('ещё-раз')));
    await tester.pump();
    expect(find.text('Уровень 2'), findsOneWidget);
  });

  testWidgets('🔴 заведомо неверный вариант открывает разбор, а не засчитывается', (tester) async {
    const seed = 'проба-промах';
    await boot(tester, rng: createRng(seed));
    await tester.tap(find.byKey(const Key('заданий5')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    final replay = createRng(seed);
    final plan = planTaskKinds(1, 5, replay);
    final task = buildTask(plan[0], 1, replay);
    final wrong = task.correctIdx == 0 ? 1 : 0;
    await tester.tap(find.byKey(Key('вариант$wrong')));
    await tester.pump();
    expect(
      find.byKey(const Key('следующий-раунд')),
      findsOneWidget,
      reason: 'промах обязан остановить партию на разборе',
    );
    expect(find.byKey(const Key('разбор')), findsOneWidget);
    expect(find.text('Эталон поворачивается шаг за шагом к правильному ответу.'), findsOneWidget);
  });

  testWidgets(
    '🔴 отработка одного вида: выбор списком, свой уровень, уровень игрока не двигается',
    (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const Key('вид-заданий')));
      await tester.pump();
      expect(find.byKey(const Key('список-видов')), findsOneWidget);

      // «Сечение» открывается только с 24-го уровня, но выбрать его можно с первого:
      // решение Дениса 17.09.2026 — «режимы для ротации, чтобы доступны были те новые».
      // Список из двенадцати строк прокручивается внутри себя — до последнего вида доходим им же.
      await tester.scrollUntilVisible(
        find.byKey(const Key('вид-oblique')),
        80,
        scrollable: find.descendant(
          of: find.byKey(const Key('список-видов')),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('вид-oblique')));
      await tester.pump();
      expect(find.byKey(const Key('про-отработку')), findsOneWidget);
      expect(
        find.textContaining('задания уровня 24'),
        findsOneWidget,
        reason: 'задания строятся не ниже порога вида, а не первого уровня',
      );

      await tester.tap(find.byKey(const Key('заданий5')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();

      expect(find.text('Задание: Сечение'), findsOneWidget);
      for (var round = 1; round <= 5; round++) {
        await answer(tester);
      }
      expect(find.text('Отработка: Сечение'), findsOneWidget);

      // Уровень игрока от отработки не меняется — ни вверх, ни вниз.
      await tester.tap(find.byKey(const Key('ещё-раз')));
      await tester.pump();
      expect(find.text('Уровень 1'), findsOneWidget);
    },
  );

  testWidgets('🔴 поле берёт высоту у каркаса: на 360×640 ничего не вылезает', (tester) async {
    await boot(tester, size: const Size(360, 640));
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    expect(tester.takeException(), isNull, reason: 'переполнения на узком экране быть не должно');
    expect(find.byKey(const Key('вопрос')), findsOneWidget);
    expect(find.byKey(const Key('вариант0')), findsOneWidget);

    // Ряд вариантов обязан остаться НАД нижним краем окна: именно этим кончались жалобы
    // веб-версии — кнопки ответа уезжали под край экрана.
    final card = tester.getRect(find.byKey(const Key('вариант0')));
    expect(card.bottom, lessThanOrEqualTo(640), reason: 'карточка ответа не уходит за экран');
  });

  testWidgets('🔴 уход с экрана гасит таймеры партии', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 5));
    expect(tester.takeException(), isNull);
  });
}
