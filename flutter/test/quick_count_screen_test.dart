import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/quick_count/model.dart';
import 'package:psygames_flutter/games/quick_count/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ, а число точек проба СЧИТАЕТ С ЭКРАНА — как человек.
///
/// ⚠️ Подписи «точек N» на экране НЕТ и быть не должно: она выдала бы ответ
/// любому, кто слушает экран чтецом. Поэтому проба считает нарисованные точки,
/// а не читает готовое число.
void main() {
  late SharedState state;
  var opens = 0;

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, int seed = 5}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}quick_count_level_nzt48': '$level',
    });
    state = await SharedState.open();
    // ⚠️ КЛЮЧ ОБЯЗАТЕЛЕН. Без него повторный pumpWidget переиспользует СТАРОЕ
    // состояние экрана: проба «открывала уровень 8», а меряла недоигранную
    // партию первого уровня — и находила не те кнопки.
    await tester.pumpWidget(MaterialApp(
      home: QuickCountScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: math.Random(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  int dotsOnScreen(WidgetTester tester) {
    var count = 0;
    for (var i = 0; i < maxDots + 5; i += 1) {
      if (find.byKey(Key('точка$i')).evaluate().isNotEmpty) count += 1;
    }
    return count;
  }

  /// Проходит одну пробу: смотрит, сколько точек, ждёт показ и задержку, отвечает.
  Future<int> playTrial(WidgetTester tester, LevelParams p, {bool correct = true}) async {
    final n = dotsOnScreen(tester);
    expect(n >= p.minN && n <= p.maxN, isTrue, reason: 'точек $n — внутри границ уровня ${p.minN}..${p.maxN}');
    await tester.pump(Duration(milliseconds: p.exposureMs + 10));
    if (p.holdMs > 0) {
      expect(find.byKey(Key('ответ$n')).evaluate().isEmpty, isTrue,
          reason: 'пока идёт задержка, кнопок ещё нет');
      await tester.pump(Duration(milliseconds: p.holdMs + 10));
    }
    final answer = correct ? n : (find.byKey(Key('ответ${n + 1}')).evaluate().isNotEmpty ? n + 1 : n - 1);
    await tester.tap(find.byKey(Key('ответ$answer')));
    await tester.pump();
    return n;
  }

  testWidgets('🔴 партия из двенадцати проб играется нажатиями и берёт уровень', (tester) async {
    final p = levelParams(1);
    await open(tester);
    expect(find.text('Быстрый счёт'), findsOneWidget);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    for (var i = 0; i < trialsPerRound; i += 1) {
      expect(find.text('${i + 1}/$trialsPerRound'), findsOneWidget, reason: 'проба ${i + 1}');
      await playTrial(tester, p);
    }
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'двенадцать из двенадцати — уровень взят');
  });

  testWidgets('🔴 верный ответ ВСЕГДА есть среди кнопок, и их не больше шести', (tester) async {
    for (final level in [1, 8, 20, 33]) {
      final p = levelParams(level);
      await open(tester, level: level, seed: level);
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();
      for (var i = 0; i < 4; i += 1) {
        final n = dotsOnScreen(tester);
        await tester.pump(Duration(milliseconds: p.exposureMs + p.holdMs + 20));
        expect(find.byKey(Key('ответ$n')), findsOneWidget, reason: 'L$level: кнопка с ответом $n на экране');
        var buttons = 0;
        for (var v = 0; v <= maxDots + 4; v += 1) {
          if (find.byKey(Key('ответ$v')).evaluate().isNotEmpty) buttons += 1;
        }
        expect(buttons <= answerMax, isTrue, reason: 'L$level: кнопок $buttons, не больше шести');
        await tester.tap(find.byKey(Key('ответ$n')));
        await tester.pump();
      }
    }
  });

  testWidgets('🔴 три ошибки из двенадцати уровень не берут — порог 80%', (tester) async {
    final p = levelParams(1);
    await open(tester);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    // Девять верных и три мимо — это 75 %, порога 80 % не хватает.
    for (var i = 0; i < trialsPerRound; i += 1) {
      await playTrial(tester, p, correct: i >= 3);
    }
    expect(find.text('Ещё раз'), findsOneWidget, reason: '75% — уровень не взят');
    expect(find.textContaining('нужно 80%'), findsOneWidget);
  });

  testWidgets('🔴 РАСКЛАДКА: точки внутри поля и не слипаются, ряд ответов 3×2 на 360 и 390', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      final p = levelParams(31);   // 18..20 точек — самая плотная раздача
      await open(tester, level: 31, screen: screen, seed: 3);
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();

      final field = tester.getRect(find.byKey(const Key('поле')));
      final n = dotsOnScreen(tester);
      expect(n >= p.minN, isTrue);
      final centers = <Offset>[];
      for (var i = 0; i < n; i += 1) {
        final dot = tester.getRect(find.byKey(Key('точка$i')));
        expect(dot.left >= field.left - 0.01 && dot.right <= field.right + 0.01, isTrue,
            reason: '$screen точка $i вылезла вбок: $dot против $field');
        expect(dot.top >= field.top - 0.01 && dot.bottom <= field.bottom + 0.01, isTrue,
            reason: '$screen точка $i вылезла по высоте: $dot против $field');
        centers.add(dot.center);
      }
      var tooClose = 0;
      for (var i = 0; i < centers.length; i += 1) {
        for (var j = i + 1; j < centers.length; j += 1) {
          if ((centers[i] - centers[j]).distance < 16 * 2.4) tooClose += 1;
        }
      }
      expect(tooClose, 0, reason: '$screen: слипшихся пар $tooClose — поле должно быть достаточным');

      await tester.pump(Duration(milliseconds: p.exposureMs + p.holdMs + 20));
      final row = tester.getRect(find.byKey(const Key('ряд-ответов')));
      final grid = answerGrid(answerMax, screen.width);
      expect(grid.cols, 3, reason: '$screen: три столбца на любом телефоне');
      expect(grid.rows, 2, reason: '$screen: два ряда');
      expect(row.height, closeTo(grid.rows * grid.size + (grid.rows - 1) * btnGap, 0.5),
          reason: '$screen: высота ряда — та, что считает правило, а не та, что вышла');
      expect(row.width <= screen.width, isTrue, reason: '$screen: ряд ответов помещается по ширине');
    }
  });
}
