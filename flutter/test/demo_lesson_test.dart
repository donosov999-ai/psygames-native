import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stroop/model.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
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
}
