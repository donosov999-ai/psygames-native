import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/targets/model.dart';
import 'package:psygames_flutter/games/targets/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «МИШЕНИ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает ЦВЕТА С ЭКРАНА и сама решает, мишень это или нет, — тем же
/// правилом, что объявлено человеку. Спутай экран круг с квадратом или покажи
/// не те фигуры, и партия покраснеет.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_targets_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Что сейчас на поле: круг и квадраты, прочитанные по ключам фигур.
  ({String circle, List<String> squares})? onField(WidgetTester tester) {
    String? circle;
    final squares = <String>[];
    for (final w in tester.widgetList<Container>(find.byType(Container))) {
      final k = w.key;
      if (k is! ValueKey<String>) continue;
      final parts = k.value.split('-');
      if (parts.length != 4 || parts[0] != 'targets' || parts[1] != 'shape') continue;
      if (parts[2] == 'circle') {
        circle = parts[3];
      } else {
        squares.add(parts[3]);
      }
    }
    if (circle == null) return null;
    return (circle: circle, squares: squares);
  }

  Future<({String circle, List<String> squares})?> waitField(WidgetTester tester) async {
    for (var i = 0; i < 60; i++) {
      final f = onField(tester);
      if (f != null) return f;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return null;
  }

  testWidgets('🔴 «Поле»: мишень — совпадение внутри раунда, читается с экрана', (tester) async {
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(17))));
    await tester.pumpAndSettle();
    expect(find.text(L.t('field')), findsOneWidget, reason: 'режим не назван до начала');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(onField(tester), isNull, reason: 'фигуры показаны раньше паузы 500 мс');

    var hits = 0, rejects = 0;
    for (var i = 1; i <= 9; i++) {
      final f = await waitField(tester);
      expect(f, isNotNull, reason: 'раунд $i: фигур нет');
      expect(f!.squares.length, TargetsLevel.of(1).numSquares, reason: 'раунд $i: не то число квадратов');
      final all = [f.circle, ...f.squares];
      final isTarget = all.length != all.toSet().length;
      if (isTarget) {
        await tester.tap(find.byKey(const Key('targets-press')));
        await tester.pump();
        expect(find.byKey(const Key('targets-hit')), findsOneWidget, reason: 'раунд $i: попадание не засчитано');
        hits++;
        await tester.pump(const Duration(milliseconds: targetsFeedbackMs + targetsGapMs));
      } else {
        // Не жмём: окно L1 — 1990 мс, верное торможение отклика не даёт.
        await tester.pump(const Duration(milliseconds: 2000));
        expect(find.byKey(const Key('targets-miss')), findsNothing, reason: 'раунд $i: торможение зачли пропуском');
        rejects++;
        await tester.pump(const Duration(milliseconds: targetsGapMs));
      }
    }
    expect(hits, greaterThan(0), reason: 'ни одной мишени за 9 раундов');
    // ⚠️ В «Поле» подсказки быть НЕ должно: сличать надо внутри раунда, и память
    // не при чём. Без этой строки подмена «показывать подсказку всегда» проходила.
    expect(find.byKey(const Key('targets-prev-circle')), findsNothing,
        reason: 'в «Поле» показана подсказка «Джокера»');
    expect(rejects, greaterThan(0), reason: 'ни одной не-мишени за 9 раундов');
    // Жизни целы: безупречная игра ничего не стоила.
    expect(find.text('${3 + TargetsLevel.of(1).lifeBonus}'), findsWidgets);
  });

  testWidgets('🔴 экран играет партию СИДА: один сид — одна раскладка', (tester) async {
    // ⚠️ Без этой пробы сид можно было выбросить из экрана, и все остальные
    // пробы просто снова стали бы плавать: то краснеть, то зеленеть. Плавающая
    // проба не сторожит ничего.
    // ⚠️ Свой ключ на каждый заход: без него второй pumpWidget обновил бы тот же
    // экран на месте, состояние осталось бы от первой партии, и «Начать» на
    // экране уже не было бы.
    Future<List<String>> play(int run) async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
          home: TargetsScreen(key: ValueKey('run$run'), state: state, rnd: Random(31))));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final out = <String>[];
      // Четыре раунда, а не один: две случайные раскладки могут совпасть в
      // первом раунде примерно раз на сотню, в четырёх — практически никогда.
      for (var i = 0; i < 4; i++) {
        final f = await waitField(tester);
        expect(f, isNotNull, reason: 'раунд ${i + 1}: фигур нет');
        out.add('${f!.circle}|${f.squares.join(',')}');
        await tester.pump(const Duration(milliseconds: 2000 + targetsGapMs));
      }
      return out;
    }

    final first = await play(1);
    final second = await play(2);
    expect(first.length, 4);
    expect(second, first, reason: 'один сид дал две разные раскладки — сид до партии не доходит');
  });

  testWidgets('🔴 круг нарисован КРУГОМ, квадраты — квадратами', (tester) async {
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(17))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final f = await waitField(tester);
    expect(f, isNotNull);

    BoxShape shapeOf(String prefix) {
      for (final w in tester.widgetList<Container>(find.byType(Container))) {
        final k = w.key;
        if (k is! ValueKey<String> || !k.value.startsWith(prefix)) continue;
        return (w.decoration! as BoxDecoration).shape;
      }
      throw StateError('нет фигуры $prefix');
    }

    // ⚠️ Ключ фигуры не зависит от её формы, поэтому пробы, читающие только
    // цвета, подмену круга на квадрат не видели.
    expect(shapeOf('targets-shape-circle-'), BoxShape.circle, reason: 'круг нарисован не кругом');
    for (var i = 0; i < f!.squares.length; i++) {
      expect(shapeOf('targets-shape-$i-'), BoxShape.rectangle, reason: 'квадрат $i нарисован не квадратом');
    }
  });

  testWidgets('🔴 десятый раунд поднимает уровень и сохраняет его СРАЗУ', (tester) async {
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(17))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 1; i <= 10; i++) {
      final f = await waitField(tester);
      expect(f, isNotNull, reason: 'раунд $i: фигур нет');
      final all = [f!.circle, ...f.squares];
      if (all.length != all.toSet().length) {
        await tester.tap(find.byKey(const Key('targets-press')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: targetsFeedbackMs + targetsGapMs));
      } else {
        await tester.pump(const Duration(milliseconds: 2000 + targetsGapMs));
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
    // ⚠️ Уровень записан ПО ХОДУ партии, а не в её конце: партия кончается
    // потерей жизней, и ждать конца значило бы терять взятую ступень.
    expect(state.get(_levelKey), '2', reason: 'взятая ступень не сохранена');
  });

  testWidgets('🔴 нажатие на не-мишень отнимает жизнь, а партия без жизней кончается', (tester) async {
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(17))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var guard = 0;
    while (guard++ < 200) {
      final f = await waitField(tester);
      if (f == null) break;
      // Жмём ВСЕГДА: на не-мишенях это ошибка торможения.
      await tester.tap(find.byKey(const Key('targets-press')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: targetsFeedbackMs + targetsGapMs));
      if (find.byKey(const Key('targets-verdict')).evaluate().isNotEmpty) break;
    }
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('targets-verdict')), findsOneWidget, reason: 'жизни не кончились от «жать всегда»');
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'проигрыш назван пройденным уровнем');
  });

  testWidgets('🔴 разброс доезжает до КАДРА у КАЖДОЙ фигуры, а не только у части', (tester) async {
    // Уровень 13: разброс 24 px. На первом уровне его нет вовсе, и проба,
    // игравшая только L1, подмену «разброс до экрана не доезжает» не видела.
    SharedPreferences.setMockInitialValues({_levelKey: '13'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(23))));
    await tester.pumpAndSettle();
    final swing = TargetsLevel.of(13).jitterPx;
    expect(swing, 24, reason: 'замер оси разброса протух');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    /// Сдвиг конкретной фигуры: у её Container ищем Transform-родителя.
    double shiftOf(String keyPrefix) {
      for (final w in tester.widgetList<Container>(find.byType(Container))) {
        final k = w.key;
        if (k is! ValueKey<String> || !k.value.startsWith(keyPrefix)) continue;
        final tr = tester.widget<Transform>(
            find.ancestor(of: find.byKey(k), matching: find.byType(Transform)).first);
        return tr.transform.storage[13];
      }
      return double.nan;
    }

    // ⚠️ Каждая позиция проверяется ОТДЕЛЬНО. Проба «хоть что-то сдвинуто»
    // зеленела, когда обнулялся только круг: квадраты сдвиг всё равно получали.
    final seen = <String, bool>{'targets-shape-circle-': false, 'targets-shape-0-': false, 'targets-shape-4-': false};
    // ⚠️ Ровно ДЕВЯТЬ раундов: десятый поднял бы уровень, и размах стал бы 26 —
    // проверка «сдвиг не больше размаха» сравнивала бы с чужим числом.
    for (var i = 1; i <= 9; i++) {
      final f = await waitField(tester);
      expect(f, isNotNull, reason: 'раунд $i: фигур нет');
      for (final prefix in seen.keys) {
        final d = shiftOf(prefix);
        expect(d.isNaN, isFalse, reason: 'раунд $i: фигуры $prefix нет на экране');
        expect(d.abs(), lessThanOrEqualTo(swing.toDouble()), reason: 'сдвиг больше размаха уровня');
        if (d != 0) seen[prefix] = true;
      }
      final all = [f!.circle, ...f.squares];
      if (all.length != all.toSet().length) {
        await tester.tap(find.byKey(const Key('targets-press')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: targetsFeedbackMs + targetsGapMs));
      } else {
        await tester.pump(Duration(milliseconds: TargetsLevel.of(13).delayMs + 50 + targetsGapMs));
      }
    }
    for (final e in seen.entries) {
      expect(e.value, isTrue, reason: '${e.key}: за 9 раундов НИ РАЗУ не сдвинулась — разброс до неё не доехал');
    }
  });

  testWidgets('🔴 «Джокер» показывает круг ПРОШЛОГО раунда, а «Поле» — нет', (tester) async {
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, mode: TargetsMode.joker, rnd: Random(5))));
    await tester.pumpAndSettle();
    expect(find.text(L.t('joker')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final first = await waitField(tester);
    expect(first, isNotNull);
    expect(find.byKey(const Key('targets-prev-circle')), findsNothing,
        reason: 'в первом раунде «Джокера» сличать не с чем');
    // Не жмём — первый раунд мишенью быть не может.
    await tester.pump(const Duration(milliseconds: 2000 + targetsGapMs));
    final second = await waitField(tester);
    expect(second, isNotNull);
    expect(find.byKey(const Key('targets-prev-circle')), findsOneWidget, reason: 'подсказка «Джокера» пропала');
    final hint = tester.widget<Container>(find.byKey(const Key('targets-prev-circle')));
    final shown = (hint.decoration! as BoxDecoration).color!;
    expect(shown, Color(int.parse(first!.circle.substring(1), radix: 16) | 0xFF000000),
        reason: 'показан круг не прошлого раунда');
  });
}
