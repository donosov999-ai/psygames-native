import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corsi/model.dart';
import 'package:psygames_flutter/games/corsi/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗБОР «КУБИКОВ КОРСИ»: ПОКАЗАННОЕ ОБЯЗАНО СОВПАДАТЬ С ИГРОЙ.
///
/// Разбор, который называет верным не то, что засчитывает партия, хуже отсутствия
/// разбора: он учит не той игре. Поэтому номера на доске разбора СЧИТЫВАЮТСЯ С
/// ЭКРАНА и прогоняются через настоящую партию Корси с тем же уровнем и рядом.
void main() {
  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  /// Номера блоков, как их видит человек на доске разбора: блок → шаг ответа.
  Future<Map<int, String>> readArt(WidgetTester tester, CorsiLessonArt art) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: art))));
    final out = <int, String>{};
    for (var i = 0; i < corsiBlocks; i++) {
      final f = find.byKey(Key('corsi-lesson-block-$i'));
      if (f.evaluate().isNotEmpty) out[i] = tester.widget<Text>(f).data!;
    }
    return out;
  }

  testWidgets('🔴 каждый показанный ответ засчитывает настоящая партия', (tester) async {
    final trials = corsiLessonTrials(rnd: Random(5));
    var played = 0;
    for (final t in trials) {
      final art = t.art! as CorsiLessonArt;
      if (art.missedStep != null) continue;   // пример про ошибку, ответа в нём нет
      final seen = await readArt(tester, art);
      expect(seen.length, art.sequence.length, reason: 'на доске пронумерован каждый блок ряда');
      final taps = seen.entries.toList()..sort((a, b) => int.parse(a.value).compareTo(int.parse(b.value)));
      final game = CorsiGame(level: art.level, sequence: art.sequence);
      TapOutcome last = TapOutcome.ignored;
      for (final e in taps) {
        last = game.tap(e.key);
        expect(last == TapOutcome.roundLost, isFalse, reason: 'L${art.level}: партия отвергла нажатие по номерам разбора');
      }
      expect(last, TapOutcome.roundWon, reason: 'L${art.level}: ответ из разбора берёт круг');
      played++;
    }
    expect(played, 2, reason: 'сыграны оба примера с ответом — прямой и обратный');
  });

  testWidgets('🔴 обратный пример пронумерован в порядке НАЖАТИЯ, а не показа', (tester) async {
    final art = corsiLessonTrials(rnd: Random(11))
        .map((t) => t.art! as CorsiLessonArt)
        .firstWhere((a) => LevelParams.of(a.level).reverse);
    final seen = await readArt(tester, art);
    final first = seen.entries.firstWhere((e) => e.value == '1').key;
    expect(first, art.sequence.last, reason: 'первым нажимают блок, вспыхнувший последним');
  });

  testWidgets('пример про взгляд: пропущенная вспышка показана «?», маршрут не нарисован', (tester) async {
    final art = corsiLessonTrials(rnd: Random(3))
        .map((t) => t.art! as CorsiLessonArt)
        .firstWhere((a) => a.missedStep != null);
    final seen = await readArt(tester, art);
    expect(seen.values.where((v) => v == '?').length, 1);
    expect(find.byType(CustomPaint).evaluate().whereType<Element>().where((e) {
      final w = e.widget as CustomPaint;
      return w.painter != null && w.painter.runtimeType.toString() == '_RoutePainter';
    }).length, 0, reason: 'рваный маршрут не рисуется целой линией');
  });

  testWidgets('примеры — из генератора игры: разные блоки, длина уровня', (tester) async {
    for (final seed in [1, 2, 3, 4, 5]) {
      for (final t in corsiLessonTrials(rnd: Random(seed))) {
        final art = t.art! as CorsiLessonArt;
        expect(art.sequence.toSet().length, art.sequence.length, reason: 'блоки ряда не повторяются');
        expect(art.sequence.every((b) => b >= 0 && b < corsiBlocks), isTrue);
      }
    }
    final trials = corsiLessonTrials(rnd: Random(1));
    expect((trials.first.art! as CorsiLessonArt).sequence.length, LevelParams.of(2).startSpan,
        reason: 'прямой пример — ряд той длины, с которой начинается L2');
  });

  testWidgets('🔴 разбор открывается ДО партии и показывает доску самой игры', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: CorsiScreen(state: state)));
    await tester.pump();
    await tester.pump();
    expect(find.text(L.t('start')), findsOneWidget, reason: 'экран на готовности — партия не начата');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.byType(CorsiBoardView), findsOneWidget, reason: 'в разборе та же доска, что в партии');
    expect(find.byType(DemoCard), findsOneWidget);
    expect(LessonUsed.inRound, isTrue, reason: 'партия с разбором не засчитывается');
  });

  // На 375×667 и 360×640 разбор вылезал за край из-за общего плеера (замер 30.09,
  // задача 01746b4c) — починено в #22, проверки малых экранов снова включены.
  for (final size in const [Size(390, 844), Size(375, 667), Size(360, 640)]) {
    testWidgets('🔴 разбор целиком помещается на ${size.width.toInt()}×${size.height.toInt()} — все три шага',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: CorsiScreen(state: state)));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      // Переполнение столбца во Flutter — исключение отрисовки: проба упадёт на нём сама.
      for (var step = 0; step < 3; step++) {
        expect(find.byType(CorsiBoardView), findsOneWidget, reason: 'шаг ${step + 1}: доска на месте');
        final board = tester.getRect(find.byType(CorsiBoardView));
        expect(board.right <= size.width && board.bottom <= size.height, isTrue,
            reason: 'шаг ${step + 1}: доска внутри экрана');
        await tester.pump(const Duration(seconds: 12));
      }
    });
  }

  testWidgets('🔴 новая раздача после разбора снова зачётная', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: CorsiScreen(state: state)));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
    expect(LessonUsed.inRound, isTrue);
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
    expect(LessonUsed.inRound, isFalse,
        reason: 'отметка разбора общая на всё приложение: не снять её — заморозить лестницу всех игр');
  });
}
