import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/ant/model.dart';
import 'package:psygames_flutter/games/ant/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В ANT ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает С ЭКРАНА, куда смотрит ЦЕНТРАЛЬНАЯ стрелка, и жмёт туда же.
/// Фланги при этом смотрят в другую сторону на трети проб — начни экран
/// принимать ответ «по флангам», и партия покраснеет ровно на них.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_ant_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Куда смотрит центральная стрелка, если мишень на экране.
  Direction? centerOnScreen() {
    for (final d in Direction.values) {
      if (find.byKey(Key('ant-center-${d.name}')).evaluate().isNotEmpty) return d;
    }
    return null;
  }

  /// В какой строке мишень.
  String? targetSlot() {
    for (final s in ['top', 'bottom']) {
      if (find.byKey(Key('ant-target-$s')).evaluate().isNotEmpty) return s;
    }
    return null;
  }

  Future<Direction?> waitTarget(WidgetTester tester) async {
    for (var i = 0; i < 120; i++) {
      final d = centerOnScreen();
      if (d != null) return d;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return null;
  }

  testWidgets('🔴 партия L1 проходится ПО ЦЕНТРАЛЬНОЙ стрелке, уровень берётся', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: AntScreen(key: const ValueKey('a'), state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    expect(find.text(L.t('start')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    // Мишень приходит только после пред-паузы (≥400 мс) и паузы после подсказки.
    expect(centerOnScreen(), isNull, reason: 'мишень показана без пауз');

    final trials = AntLevel.of(1).trials;
    for (var i = 1; i <= trials; i++) {
      final d = await waitTarget(tester);
      expect(d, isNotNull, reason: 'проба $i: мишени нет');
      expect(targetSlot(), isNotNull, reason: 'проба $i: мишень вне обеих строк');
      await tester.tap(find.byKey(Key('ant-answer-${d!.name}')));
      await tester.pump();
      expect(find.byKey(const Key('ant-hit')), findsOneWidget, reason: 'проба $i: ответ по центру не засчитан');
      await tester.pump(const Duration(milliseconds: antFeedbackMs + 50));
    }
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ant-verdict')), findsOneWidget);
    expect(find.text(L.t('levelDone').replaceAll('{n}', '1')), findsOneWidget);
    expect(state.get(_levelKey), '2', reason: 'лестница не шагнула');
    // Три сети показаны порознь: по общему числу не понять, какая просела.
    expect(find.byKey(const Key('ant-alerting')), findsOneWidget);
    expect(find.byKey(const Key('ant-orienting')), findsOneWidget);
    expect(find.byKey(const Key('ant-executive')), findsOneWidget);
  });

  testWidgets('🔴 ответ ПО ФЛАНГАМ не проходит: на конфликтных пробах это ошибка', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: AntScreen(key: const ValueKey('b'), state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var wrong = 0;
    final trials = AntLevel.of(1).trials;
    for (var i = 1; i <= trials; i++) {
      final d = await waitTarget(tester);
      expect(d, isNotNull, reason: 'проба $i: мишени нет');
      // Жмём ПРОТИВ центра — на конфликтных это как раз «по флангам».
      final opp = d == Direction.left ? Direction.right : Direction.left;
      await tester.tap(find.byKey(Key('ant-answer-${opp.name}')));
      await tester.pump();
      expect(find.byKey(const Key('ant-wrong')), findsOneWidget, reason: 'проба $i: неверный ответ засчитан');
      wrong++;
      await tester.pump(const Duration(milliseconds: antFeedbackMs + 50));
    }
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(wrong, trials);
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'уровень взят при нуле верных');
    expect(state.get(_levelKey) ?? '1', '1');
  });

  testWidgets('🔴 9 верных из 12 — уровень НЕ берётся: порог 80 %, а не «больше половины»', (tester) async {
    // ⚠️ 9/12 = 0,75 лежит МЕЖДУ 0,5 и 0,8. Партии «всё верно» и «всё мимо»
    // проходят при любом пороге из этой пары и подмены порога не видят.
    await tester.pumpWidget(MaterialApp(
        home: AntScreen(key: const ValueKey('p'), state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final trials = AntLevel.of(1).trials;
    expect(trials, 12, reason: 'объём L1 протух — расклад 9/12 больше не лежит между порогами');
    for (var i = 1; i <= trials; i++) {
      final d = await waitTarget(tester);
      expect(d, isNotNull, reason: 'проба $i: мишени нет');
      final opp = d == Direction.left ? Direction.right : Direction.left;
      final pick = i <= 9 ? d! : opp;
      await tester.tap(find.byKey(Key('ant-answer-${pick.name}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: antFeedbackMs + 50));
    }
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(find.textContaining('${L.t('hud_correct')}: 9/12'), findsOneWidget);
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: '0,75 засчитано как проход');
    expect(state.get(_levelKey) ?? '1', '1', reason: 'лестница шагнула на 0,75');
  });

  testWidgets('🔴 окно ответа — ровно окно УРОВНЯ: раньше промаха нет, позже есть', (tester) async {
    // ⚠️ Партия, где всегда отвечают быстро, окна не проверяет вовсе: подмена
    // окна на минуту проходила незамеченной.
    await tester.pumpWidget(MaterialApp(
        home: AntScreen(key: const ValueKey('w'), state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    final window = AntLevel.of(1).windowMs;
    expect(window, 3000, reason: 'замер окна L1 протух');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(await waitTarget(tester), isNotNull, reason: 'мишени нет');

    await tester.pump(Duration(milliseconds: window - 200));
    expect(find.byKey(const Key('ant-miss')), findsNothing, reason: 'промах засчитан ДО конца окна');
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const Key('ant-miss')), findsOneWidget, reason: 'окно не закрылось в срок');
    // Промах — ошибка, и она видна в исходе партии.
    await tester.pump(const Duration(milliseconds: antFeedbackMs + 50));
    expect(await waitTarget(tester), isNotNull, reason: 'после промаха проба не пошла дальше');
  });

  testWidgets('🔴 пространственная подсказка стоит НАД той строкой, куда придёт мишень', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: AntScreen(key: const ValueKey('c'), state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var spatial = 0, doubled = 0, plain = 0;
    for (var i = 1; i <= 12 && (spatial < 2 || doubled < 1); i++) {
      // Ловим кадр с подсказкой: она висит 100 мс.
      String? cueSlots;
      for (var k = 0; k < 120; k++) {
        final top = find.byKey(const Key('ant-cue-top')).evaluate().isNotEmpty;
        final bottom = find.byKey(const Key('ant-cue-bottom')).evaluate().isNotEmpty;
        if (top || bottom) {
          cueSlots = '${top ? 'T' : ''}${bottom ? 'B' : ''}';
          break;
        }
        if (centerOnScreen() != null) break;
        await tester.pump(const Duration(milliseconds: 20));
      }
      final d = await waitTarget(tester);
      expect(d, isNotNull, reason: 'проба $i: мишени нет');
      final slot = targetSlot();
      if (cueSlots == 'TB') {
        // Двойная: говорит «сейчас», но не говорит «где».
        doubled++;
      } else if (cueSlots != null) {
        // Пространственная: обязана стоять над той же строкой.
        expect(cueSlots, slot == 'top' ? 'T' : 'B',
            reason: 'проба $i: подсказка над $cueSlots, а мишень в $slot');
        spatial++;
      } else {
        plain++;
      }
      await tester.tap(find.byKey(Key('ant-answer-${d!.name}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: antFeedbackMs + 50));
    }
    expect(spatial, greaterThanOrEqualTo(2), reason: 'пространственных подсказок не набралось');
    expect(doubled, greaterThanOrEqualTo(1), reason: 'двойных подсказок не набралось');
    expect(plain, greaterThanOrEqualTo(1), reason: 'проб без видимой подсказки не набралось');
  });

  testWidgets('🔴 экран играет партию СИДА: один сид — одна последовательность', (tester) async {
    Future<List<String>> play(int run) async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
          home: AntScreen(key: ValueKey('run$run'), state: state, rnd: Random(19))));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final out = <String>[];
      for (var i = 0; i < 6; i++) {
        final d = await waitTarget(tester);
        expect(d, isNotNull, reason: 'проба ${i + 1}: мишени нет');
        out.add('${d!.name}|${targetSlot()}');
        await tester.tap(find.byKey(Key('ant-answer-${d.name}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: antFeedbackMs + 50));
      }
      return out;
    }

    final first = await play(1);
    final second = await play(2);
    expect(first.length, 6);
    expect(second, first, reason: 'один сид дал две разные партии — сид до партии не доходит');
  });
}
