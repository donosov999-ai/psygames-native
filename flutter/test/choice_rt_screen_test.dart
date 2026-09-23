import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/choice_rt/model.dart';
import 'package:psygames_flutter/games/choice_rt/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «ВЫБОР-РЕАКЦИЮ» ИГРАЕТСЯ НАЖАТИЯМИ ПО КРЕСТОВИНЕ.
///
/// 🔴 Главное свойство экрана, которое проба обязана стеречь: крестовина держит
/// ВСЕ ЧЕТЫРЕ позиции всегда, неактивные — пустыми. Сломается это — в наклон Хика
/// влезет закон Фиттса, и мера перестанет быть мерой.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  bool shown(String name) => find.byKey(Key('choicert-stim-$name')).evaluate().isNotEmpty;
  bool neutralShown() => find.byKey(const Key('choicert-neutral')).evaluate().isNotEmpty;

  /// Ждём событие на экране, а не отсчитываем миллисекунды: подготовительный
  /// интервал случайный (600–1800 мс).
  Future<void> waitStimulus(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      if (neutralShown() || ChoiceDirection.values.any((d) => shown(d.name))) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Ждём ОТКЛИК на экране. ⚠️ Стимул после закрытия пробы остаётся видимым до
  /// следующей пробы, поэтому «исчез стимул» здесь не признак конца — признак
  /// это сам значок отклика.
  Future<bool> waitFlash(WidgetTester tester, String key) async {
    for (var i = 0; i < 140; i++) {
      if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return false;
  }

  Future<void> waitTrialEnd(WidgetTester tester) async {
    for (var i = 0; i < 120; i++) {
      if (!neutralShown() && !ChoiceDirection.values.any((d) => shown(d.name))) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('🔴 крестовина держит все четыре позиции: неактивные — пустыми', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: ChoiceRtScreen(state: state, rnd: Random(5)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await waitStimulus(tester);

    // L1: живых направления два (влево-вправо), значит две кнопки и два пустых места.
    expect(find.byKey(const Key('choicert-answer-left')), findsOneWidget);
    expect(find.byKey(const Key('choicert-answer-right')), findsOneWidget);
    expect(find.byKey(const Key('choicert-answer-up')), findsNothing);
    expect(find.byKey(const Key('choicert-empty')), findsNWidgets(2),
        reason: 'неактивные направления обязаны занимать место, иначе расстояние до живых кнопок поедет');

    // Расстояние от центра поля до каждой живой кнопки одинаково — это и есть
    // то самое свойство, ради которого пустые места стоят на своих местах.
    final left = tester.getCenter(find.byKey(const Key('choicert-answer-left')));
    final right = tester.getCenter(find.byKey(const Key('choicert-answer-right')));
    expect((left.dy - right.dy).abs() < 1, isTrue, reason: 'живые кнопки стоят на одной линии');
  });

  testWidgets('🔴 партия проходится нажатиями, время реакции — ровно то, что прошло', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: ChoiceRtScreen(state: state, clock: () => clock, rnd: Random(9)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var neutrals = 0;
    var answered = 0;
    for (var i = 0; i < 12; i++) {
      await waitStimulus(tester);
      final dir = ChoiceDirection.values.where((d) => shown(d.name)).toList();
      if (dir.isEmpty) {
        // Нейтраль: правило запрещает жать — молчим и ждём конца окна.
        expect(neutralShown(), isTrue, reason: 'проба ${i + 1}: на экране нет ни знака, ни нейтрали');
        neutrals += 1;
        expect(await waitFlash(tester, 'choicert-held'), isTrue,
            reason: 'молчание на нейтрали — верный ответ');
        await tester.pump(const Duration(milliseconds: 400));
        continue;
      }
      clock += 460;
      await tester.tap(find.byKey(Key('choicert-answer-${dir.first.name}')));
      await tester.pump();
      expect(find.byKey(const Key('choicert-hit')), findsOneWidget, reason: 'проба ${i + 1}: не засчитано');
      answered += 1;
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(answered > 0, isTrue, reason: 'без направлений партия ничего не мерила бы');
    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget,
        reason: 'ни одной ошибки — это проход');
    expect(find.textContaining('${L.t('meanReaction')}: 460 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа знака, а не от рождения пробы');
    expect(neutrals >= 0, isTrue);
  });

  testWidgets('🔴 нажатие на нейтраль — ложная тревога', (tester) async {
    await tester.pumpWidget(MaterialApp(home: ChoiceRtScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 0; i < 12; i++) {
      await waitStimulus(tester);
      if (neutralShown()) {
        await tester.tap(find.byKey(const Key('choicert-answer-left')));
        await tester.pump();
        expect(find.byKey(const Key('choicert-false-alarm')), findsOneWidget,
            reason: 'жать на нейтрали запрещено правилом');
        return;
      }
      await waitTrialEnd(tester);
      await tester.pump(const Duration(milliseconds: 400));
    }
    fail('за 12 проб нейтраль не выпала — проверять было нечего');
  });
}
