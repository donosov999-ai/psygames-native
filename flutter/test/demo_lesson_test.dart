import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/choice_rt/model.dart';
import 'package:psygames_flutter/games/choice_rt/screen.dart';
import 'package:psygames_flutter/games/flanker/model.dart';
import 'package:psygames_flutter/games/gonogo/model.dart';
import 'package:psygames_flutter/games/posner/model.dart';
import 'package:psygames_flutter/games/posner/screen.dart';
import 'package:psygames_flutter/games/simon/model.dart';
import 'package:psygames_flutter/games/simon/screen.dart';
import 'package:psygames_flutter/games/gonogo/screen.dart';
import 'package:psygames_flutter/games/flanker/screen.dart';
import 'package:psygames_flutter/games/stroop/model.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗБОР ИГР НА РЕАКЦИЮ: ПОКАЗ ПРАВИЛА, А НЕ ПОИСК ХОДА.
///
/// У Струпа решать нечего: проба длится секунду, и «верно» задано правилом.
/// Поэтому второй генератор показывает КАРТОЧКУ стимула, имя правила и ответ.
///
/// ⚠️ ГЛАВНОЕ ЗДЕСЬ — НЕ КНОПКА, А СОВПАДЕНИЕ С ИГРОЙ. Разбор, который называет
/// верным не то, что засчитывает партия, хуже отсутствия разбора: он учит не той
/// игре. Поэтому каждый пример прогоняется через настоящую партию.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  test('🔴 ответ из разбора партия засчитывает как верный', () {
    for (final palette in [stroopColorsDefault, stroopColorsColorblind]) {
      final demo = stroopDemoTrials(palette);
      expect(demo.length, greaterThanOrEqualTo(3), reason: 'примеров меньше трёх');
      for (final d in demo) {
        final g = StroopGame(level: 1, mode: d.rule, palette: palette, rnd: Random(1));
        expect(g.nextTrial(), isTrue);
        // Подменяем пробу на разбираемую: интересует не раздача, а засчитывание.
        g.trial = d.trial;
        g.trialRule = d.rule;
        // ⚠️ ПРАВИЛО ЗДЕСЬ ПЕРЕСКАЗАНО СВОИМИ СЛОВАМИ, А НЕ ВЗЯТО У КОДА.
        // Позвать `stroopCorrect` и сверить с ним же — значит не проверить ничего:
        // мутация «поменять чернила и слово местами» прошла бы зелёной (померено).
        // «Чернила» — цвет, которым слово НАПИСАНО; «слово» — что в нём написано.
        final expected = d.rule == 'ink' ? d.trial.ink : d.trial.word;
        expect(stroopCorrect(d.trial, d.rule), expected.name,
            reason: 'разбор по правилу ${d.rule} зовёт верным не ${expected.name}');
        expect(g.answer(expected), StroopOutcome.hit,
            reason: 'партия не засчитала ${expected.name}, а разбор его показывает');
      }
    }
  });

  test('🔴 примеры показывают и согласованную пробу, и конфликтную', () {
    final demo = stroopDemoTrials(stroopColorsDefault);
    expect(demo.any((d) => d.trial.word.name == d.trial.ink.name), isTrue,
        reason: 'нет согласованной пробы — не с чем сравнить конфликт');
    expect(demo.any((d) => d.trial.word.name != d.trial.ink.name), isTrue,
        reason: 'нет конфликтной пробы — а ради неё игра и существует');
    expect(demo.any((d) => d.rule == 'word'), isTrue,
        reason: 'обратное правило не показано, а с 5-го уровня оно встречается в партии');
  });

  testWidgets('🔴 кнопка разбора открывает карточку со стимулом и ответом', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('demo-stimulus')), findsOneWidget, reason: 'стимула на карточке нет');
    expect(find.byKey(const Key('demo-answer')), findsOneWidget, reason: 'ответа на карточке нет');
    expect(find.textContaining('Верно: '), findsOneWidget);
    expect(find.text('По цвету чернил'), findsOneWidget, reason: 'правило не названо');
    expect(LessonUsed.inRound, isTrue);
  });

  test('🔴 фланкер: верен ЦЕНТР, а не фланги — и партия это засчитывает', () {
    final demo = flankerDemoTrials();
    expect(demo.length, greaterThanOrEqualTo(3), reason: 'примеров меньше трёх');
    expect(demo.any((t) => t.kind == FlankerKind.incongruent), isTrue,
        reason: 'нет конфликтной пробы — ради неё упражнение и существует');
    expect(demo.any((t) => t.kind == FlankerKind.neutral), isTrue,
        reason: 'нет нейтральной пробы — не с чем сравнить помеху');

    for (final t in demo) {
      // ⚠️ Правило пересказано своими словами: отвечаем направлением ЦЕНТРАЛЬНОЙ
      // стрелки. На конфликтной пробе фланги смотрят в другую сторону, и ответ
      // обязан РАЗОЙТИСЬ с ними — иначе разбор учил бы смотреть на фланги.
      expect(flankerCorrect(t), t.center, reason: 'разбор зовёт верным не центр');
      if (t.kind == FlankerKind.incongruent) {
        expect(flankerCorrect(t) == t.flankers!.first, isFalse,
            reason: 'на конфликтной пробе ответ совпал с флангами');
      }
      final g = FlankerGame(level: 1, rnd: Random(1));
      expect(g.nextTrial(), isTrue);
      g.trial = t;
      g.showStimulus();
      expect(g.answer(t.center), FlankerOutcome.hit,
          reason: 'партия не засчитала ответ, который показывает разбор');
    }
  });

  testWidgets('🔴 фланкер: карточка показывает ТОТ ЖЕ ряд стрелок, что и партия', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(FlankerRow), findsOneWidget,
        reason: 'ряд нарисован не виджетом игры — разбор показывает не ту задачу');
    expect(find.byKey(const Key('demo-answer')), findsOneWidget);
    expect(find.text('Верно: Вправо'), findsOneWidget, reason: 'ответ не назван словом');
  });

  test('🔴 go/no-go: жмём на круг, держимся на квадрате — и партия считает так же', () {
    // ⚠️ Правило пересказано своими словами: нажимать надо на GO и только на него.
    expect(gonogoShouldPress(GoNoGoStim.go), isTrue);
    expect(gonogoShouldPress(GoNoGoStim.nogo), isFalse);

    // Партия: нажатие на GO — попадание, нажатие на NO-GO — ложная тревога.
    for (final stim in GoNoGoStim.values) {
      final g = GoNoGoGame(level: 1, rnd: Random(1));
      expect(g.nextTrial(), isTrue);
      g.stimulus = stim;
      expect(
        g.respond(),
        gonogoShouldPress(stim) ? GoNoGoOutcome.hit : GoNoGoOutcome.falseAlarm,
        reason: 'партия судит нажатие на $stim не так, как показывает разбор',
      );
    }
  });

  testWidgets('🔴 go/no-go: карточка рисует стимул виджетом игры', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: GoNoGoScreen(state: state)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(GoNoGoStimulus), findsOneWidget, reason: 'стимул нарисован не виджетом игры');
    expect(find.text('Верно: нажать'), findsOneWidget, reason: 'первый пример — GO, и ответ «нажать»');
  });

  test('🔴 выбор-реакция: сторона ответа — сторона знака, на нейтрали не жмём', () {
    for (final d in [ChoiceDirection.left, ChoiceDirection.right]) {
      final g = ChoiceRtGame(level: 1, rnd: Random(1));
      expect(g.nextTrial(), isTrue);
      g.stimulus = d;
      g.showStimulus();
      // ⚠️ Правило пересказано: жмём кнопку ТОЙ ЖЕ стороны, что и знак.
      expect(g.answer(d), ChoiceOutcome.hit, reason: 'партия не засчитала ответ той же стороны');
    }
    // Нейтраль — пустой круг: любое нажатие ложная тревога, и разбор говорит «не нажимать».
    //
    // ⚠️ Нейтраль НЕ подделывается присваиванием `stimulus = null`: признак
    // нейтрали ставится при раздаче, и подделка давала бы `wrong` вместо
    // `falseAlarm` (померено). Поэтому ждём настоящую нейтральную пробу.
    final g = ChoiceRtGame(level: 1, rnd: Random(1));
    var neutral = false;
    for (var i = 0; i < 400 && !neutral; i++) {
      if (!g.nextTrial()) break;
      neutral = g.isNeutral;
      if (!neutral) {
        g.showStimulus();
        g.answer(g.stimulus!);
      }
    }
    expect(neutral, isTrue, reason: 'нейтральная проба ни разу не выпала за партию');
    g.showStimulus();
    expect(g.answer(ChoiceDirection.left), ChoiceOutcome.falseAlarm,
        reason: 'нажатие на нейтрали должно быть ложной тревогой');
  });

  testWidgets('🔴 выбор-реакция: знак в карточке — того начертания, что на уровне', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: ChoiceRtScreen(state: state)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // 1-й уровень рисует стрелки (с 4-го шевроны, с 9-го скобки).
    // ⚠️ Ищем знак ВНУТРИ карточки: те же стрелки нарисованы на кнопках ответа
    // экрана под плеером, и без сужения проба видела два совпадения.
    expect(
      find.descendant(
        of: find.byType(DemoCard),
        matching: find.byIcon(choiceGlyphIcon(ChoiceGlyph.arrow, ChoiceDirection.left)),
      ),
      findsOneWidget,
      reason: 'в карточке не тот знак, что показывает партия на этом уровне',
    );
    expect(find.text('Верно: Влево'), findsOneWidget);
  });

  test('🔴 Саймон: сторона ответа по ЦВЕТУ, даже когда позиция тянет в другую', () {
    final demo = simonDemoTrials();
    expect(demo.any((t) => t.kind == SimonKind.incongruent), isTrue,
        reason: 'нет конфликтной пробы — а в ней весь эффект Саймона');
    for (final t in demo) {
      // ⚠️ Правило пересказано: синий — левая кнопка, красный — правая, и позиция
      // вспышки на ответ не влияет.
      final expected = t.color == SimonColor.blue ? SimonSide.left : SimonSide.right;
      expect(correctSide(t.color), expected, reason: 'разбор зовёт верным не цвет');
      if (t.kind == SimonKind.incongruent) {
        expect(expected == t.position, isFalse,
            reason: 'конфликтная проба, а ответ совпал с позицией');
      }
      final g = SimonGame(level: 1, rnd: Random(1));
      expect(g.nextTrial(), isTrue);
      g.trial = t;
      g.showStimulus();
      expect(g.answer(expected), SimonOutcome.hit,
          reason: 'партия не засчитала ответ по цвету');
    }
  });

  test('🔴 Познер: отвечаем по МИШЕНИ, даже если подсказка мигнула не там', () {
    final demo = posnerDemoTrials();
    expect(demo.any((t) => t.validity == CueValidity.invalid), isTrue,
        reason: 'нет обманувшей подсказки — ради неё упражнение и существует');
    for (final t in demo) {
      // ⚠️ Правило пересказано: верна СТОРОНА МИШЕНИ, подсказка ни при чём.
      if (t.validity == CueValidity.invalid) {
        expect(t.cueDir == t.targetSide, isFalse, reason: 'обман не обманывает');
      }
      final g = PosnerGame(level: 1, rnd: Random(1));
      expect(g.nextTrial(), isTrue);
      g.trial = t;
      g.showCue();
      g.showTarget();
      expect(g.answer(t.targetSide), PosnerOutcome.hit,
          reason: 'партия не засчитала ответ по мишени');
    }
  });

  testWidgets('🔴 Саймон и Познер рисуют в карточке свои же поля стимула', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();

    for (final (screen, art) in [
      (SimonScreen(state: state), find.byType(SimonStimulus)),
      (PosnerScreen(state: state), find.byType(PosnerBoxes)),
    ]) {
      await tester.pumpWidget(MaterialApp(home: screen));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(DemoCard), matching: art), findsOneWidget,
          reason: 'стимул в карточке нарисован не виджетом игры');
      expect(find.byKey(const Key('demo-answer')), findsOneWidget);
      LessonUsed.reset();
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    }
  });
}
