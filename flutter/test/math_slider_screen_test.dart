import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_slider/model.dart';
import 'package:psygames_flutter/games/math_slider/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ ПЕРЕТАСКИВАНИЕМ МАРКЕРА, а не вызовом правил.
///
/// Куда попал маркер, проба узнаёт из ПОДПИСИ на экране (Semantics), а не из
/// состояния экрана: так проверяется ровно то, что видит человек. Где лежит
/// ответ, проба знает из той же раздачи по зерну — уровень задаёт зерно
/// `math-slider-<уровень>`, поэтому доска у экрана и у пробы одна.
void main() {
  late SharedState state;

  Future<void> open(WidgetTester tester, {int level = 1}) async {
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}math_slider_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: MathSliderScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  double estimateOnScreen(WidgetTester tester) {
    final s = tester.widget<Semantics>(find.byKey(const Key('маркер')));
    final label = s.properties.label ?? '';
    final raw = label.split('оценка').last.trim().replaceAll(',', '.');
    return double.parse(raw);
  }

  /// Ведёт маркер пальцем к нужному значению шкалы и возвращает, что вышло.
  Future<double> dragTo(WidgetTester tester, MathSliderScale scale, double value) async {
    final rect = tester.getRect(find.byKey(const Key('шкала')));
    final from = rect.left +
        ((estimateOnScreen(tester) - scale.min) / scale.width).clamp(0.0, 1.0) * rect.width;
    final to = rect.left + ((value - scale.min) / scale.width).clamp(0.0, 1.0) * rect.width;
    await tester.dragFrom(Offset(from, rect.top + 50), Offset(to - from, 0));
    await tester.pump();
    return estimateOnScreen(tester);
  }

  testWidgets('🔴 партия проходится перетаскиванием: восемь заданий, уровень взят', (tester) async {
    // Та же раздача, что у экрана: одно зерно, один генератор.
    final questions = generateMathSliderQuestions('math-slider-1', 1, trialsPerRound);
    final training = generateTrainingQuestion('math-slider-1');

    await open(tester);
    expect(find.text('Математическая шкала'), findsOneWidget);
    expect(find.byKey(const Key('тренировка')), findsOneWidget, reason: 'первой идёт проба');
    expect(find.text(training.text), findsOneWidget);

    // Тренировочная попытка — и она НЕ должна попасть в счёт.
    await dragTo(tester, training.scale, training.answer);
    await tester.tap(find.byKey(const Key('подтвердить')));
    await tester.pump();
    expect(find.text('проба'), findsOneWidget, reason: 'счётчик заданий ещё не начался');
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();

    for (var i = 0; i < questions.length; i += 1) {
      final q = questions[i];
      expect(find.text('${i + 1}/${questions.length}'), findsOneWidget, reason: 'задание ${i + 1}');
      expect(find.text(q.text), findsOneWidget, reason: 'вопрос ${i + 1} тот же, что раздал генератор');
      final got = await dragTo(tester, q.scale, q.answer);
      expect((got - q.answer).abs() <= q.scale.keyboardStep, isTrue,
          reason: 'маркер встал на ответ с точностью до шага шкалы: $got против ${q.answer}');
      await tester.tap(find.byKey(const Key('подтвердить')));
      await tester.pump();
      expect(find.byKey(const Key('разбор')), findsOneWidget, reason: 'после ответа виден разбор');
      await tester.tap(find.byKey(const Key('дальше')));
      await tester.pump();
    }

    expect(find.byKey(const Key('итог')), findsOneWidget);
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'точность ≥ 90% — уровень взят');
  });

  testWidgets('🔴 куда бы ни попал палец, оценка прилипает к шагу шкалы', (tester) async {
    // ⚠️ УРОВЕНЬ ВЫБРАН ПО ШАГУ, А НЕ НАУГАД. На первом уровне шаг шкалы равен 1,
    // и «кратно шагу» выполняется для любого целого — проверка была бы слепой:
    // мутация «не прилипать» её не красила. Берём уровень с ДРОБНЫМ шагом.
    const level = 8;
    final training = generateTrainingQuestion('math-slider-$level');
    final first = generateMathSliderQuestions('math-slider-$level', level, trialsPerRound).first;
    await open(tester, level: level);
    expect(first.scale.keyboardStep > 1, isTrue,
        reason: 'шаг ${first.scale.keyboardStep} обязан быть больше 1, иначе проверка слепа');

    await dragTo(tester, training.scale, training.answer);
    await tester.tap(find.byKey(const Key('подтвердить')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();

    final scale = first.scale;
    final rect = tester.getRect(find.byKey(const Key('шкала')));

    for (final f in [0.07, 0.31, 0.5, 0.73, 0.99]) {
      await tester.dragFrom(Offset(rect.left + 1, rect.top + 50), Offset(rect.width * f - 1, 0));
      await tester.pump();
      final got = estimateOnScreen(tester);
      expect(got >= scale.min && got <= scale.max, isTrue, reason: 'оценка $got внутри шкалы');
      final steps = (got - scale.min) / scale.keyboardStep;
      expect((steps - steps.roundToDouble()).abs() < 1e-6, isTrue,
          reason: 'оценка $got кратна шагу ${scale.keyboardStep}');
    }
  });

  testWidgets('🔴 отпустил — засчитается само через три секунды', (tester) async {
    final training = generateTrainingQuestion('math-slider-1');
    await open(tester);

    // Пока шкалу не тронули, отсчёт не идёт: игра не засчитывает значение,
    // к которому никто не прикасался.
    await tester.pump(const Duration(seconds: 5));
    expect(find.byKey(const Key('подтвердить')), findsOneWidget, reason: 'без касания ничего не засчитано');

    await dragTo(tester, training.scale, training.answer);
    expect(find.text('Отпусти — засчитаю через 3 секунды'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 2500));
    expect(find.byKey(const Key('разбор')), findsNothing, reason: 'до трёх секунд ещё рано');
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byKey(const Key('разбор')), findsOneWidget, reason: 'через три секунды засчиталось само');
  });

  testWidgets('🔴 на уровне с фигурой вопрос задаётся площадью, а не выражением', (tester) async {
    await open(tester, level: 55);
    // Тренировка ВСЕГДА первого уровня — так же в вебе: пробный вопрос берётся
    // с отдельного зерна «…-training» и уровня 1, каким бы ни был текущий.
    final training = generateTrainingQuestion('math-slider-55');
    expect(find.text(training.text), findsOneWidget);
    await dragTo(tester, training.scale, training.answer);
    await tester.tap(find.byKey(const Key('подтвердить')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();

    expect(find.text('S ≈ ?'), findsOneWidget, reason: 'у интеграла подпись одна на все фигуры');
    final prompt = find.textContaining('площадь');
    expect(prompt, findsOneWidget, reason: 'спрашивают площадь под графиком');
    expect(find.byKey(const Key('шкала')), findsOneWidget);
  });

  testWidgets('🔴 порог уровня именно 90%: точность 80% его НЕ берёт', (tester) async {
    // ⚠️ Без этой пробы порог не проверен ничем: «мимо всей шкалы» не проходит
    // ни при 90%, ни при 50%, и подмена порога оставалась незамеченной.
    // Здесь маркер ставится ровно на пятую часть ширины от ответа — это 80%.
    final questions = generateMathSliderQuestions('math-slider-1', 1, trialsPerRound);
    final training = generateTrainingQuestion('math-slider-1');
    await open(tester);

    await dragTo(tester, training.scale, training.answer);
    await tester.tap(find.byKey(const Key('подтвердить')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();

    for (final q in questions) {
      final shift = q.scale.width * 0.2;
      final aim = q.answer + shift <= q.scale.max ? q.answer + shift : q.answer - shift;
      final got = await dragTo(tester, q.scale, aim);
      final accuracy = 1 - (got - q.answer).abs() / q.scale.width;
      expect(accuracy > 0.5 && accuracy < 0.9, isTrue,
          reason: 'точность попытки $accuracy обязана лежать между порогами');
      await tester.tap(find.byKey(const Key('подтвердить')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('дальше')));
      await tester.pump();
    }

    expect(find.text('Ещё раз'), findsOneWidget, reason: '80% — уровень не взят');
    expect(find.textContaining('нужно 90%'), findsOneWidget);
  });

  testWidgets('🔴 промах по всем заданиям уровень не засчитывает', (tester) async {
    final questions = generateMathSliderQuestions('math-slider-1', 1, trialsPerRound);
    final training = generateTrainingQuestion('math-slider-1');
    await open(tester);

    await dragTo(tester, training.scale, training.answer);
    await tester.tap(find.byKey(const Key('подтвердить')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();

    for (final q in questions) {
      // Промах на всю шкалу: ставим маркер у дальнего от ответа края.
      final far = (q.answer - q.scale.min) > (q.scale.max - q.answer) ? q.scale.min : q.scale.max;
      await dragTo(tester, q.scale, far);
      await tester.tap(find.byKey(const Key('подтвердить')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('дальше')));
      await tester.pump();
    }

    expect(find.text('Ещё раз'), findsOneWidget, reason: 'точность ниже 90% — уровень не взят');
  });
}
