/// РАЗБОР «ПРОЧТИ ЭМОЦИЮ» — НА НАСТОЯЩЕМ МАТЕРИАЛЕ И НАЖАТИЯМИ.
///
/// Две половины. Ядро разбора (`lesson.dart`) проверяется на всём материале игры
/// (`assets/rmet.json`) и против того, что ЗАСЧИТЫВАЕТ партия (`RmetSession.answer`),
/// а не против своей же формулы. Экран — нажатиями: кнопка каркаса, шаги из
/// словаря, поле сравнения и выбора, отметка «партия с разбором».
library;

import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rmet/lesson.dart';
import 'package:psygames_flutter/games/rmet/model.dart';
import 'package:psygames_flutter/games/rmet/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late RmetContent content;
  setUpAll(() async {
    content = RmetContent.fromJsonString(File('assets/rmet.json').readAsStringSync());
    await L.load('ru');
  });
  tearDown(LessonUsed.reset);

  String say(String key, Map<String, String> args) => '$key ${args.values.join('|')}';

  test('📍 примеров, где есть с чем сравнить, столько же, сколько замерено в вебе: ru 11, en 6', () {
    int fit(String locale) => [
          for (var i = 0; i < content.items.length; i += 1)
            if (rmetNeighbors(content.items, i, locale).isNotEmpty) i,
        ].length;
    expect(content.items, hasLength(18));
    expect(fit('ru'), 11);
    expect(fit('en'), 6);
  });

  for (final locale in ['ru', 'en']) {
    test('🔴 $locale: выбор = слово, которое засчитывает партия; сравнение — только соседи из вариантов', () {
      for (var seed = 0; seed < 40; seed += 1) {
        final exclude = seed % content.items.length;
        final steps =
            rmetLessonSteps(say: say, items: content.items, locale: locale, exclude: exclude, random: Random(seed));
        final cards = [for (final s in steps) s.payload as RmetCard];
        expect(cards.first.item, isNull, reason: 'первый шаг — приём, без примера');
        expect(cards.last.item, isNull, reason: 'последний шаг — итог, без примера');
        final examples = {for (final c in cards) if (c.item != null) c.item!};
        expect(examples.length, inInclusiveRange(1, rmetExamples));
        expect(examples.contains(exclude), isFalse,
            reason: 'зерно $seed: пример совпал с текущим заданием — разбор показал бы ответ');
        for (final e in examples) {
          final item = content.items[e];
          final picks = cards.where((c) => c.item == e && c.picked != null).toList();
          expect(picks, hasLength(1), reason: 'у примера ровно один выбор');
          // Та же проверка, что в партии, — не своя формула.
          final session = RmetSession(items: [item], locale: locale)..answer(picks.single.picked!, 1000);
          expect(session.feedback!.correct, isTrue, reason: 'разбор назвал ответ, которого игра не засчитает');
          final compares = cards.where((c) => c.item == e && c.neighbor != null).toList();
          expect(compares.length, inInclusiveRange(1, rmetComparisons));
          for (final c in compares) {
            final word = content.items[c.neighbor!].correctFor(locale);
            expect(item.optionsFor(locale), contains(word), reason: 'сосед обязан быть вариантом пункта');
            expect(word, isNot(item.correctFor(locale)), reason: 'сравнение с самим ответом ничего не учит');
          }
        }
      }
    });
  }

  testWidgets('🔴 кнопка разбора открывает шаги из словаря; партия с разбором помечена', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: RmetScreen(state: state, content: content, trials: 3)));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('rmet-start')));
    await tester.pump();
    expect(LessonUsed.inRound, isFalse);

    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    expect(LessonUsed.inRound, isTrue, reason: 'партия с разбором обязана перестать быть зачётной');

    // Автопрокрутку на паузу — дальше листаем сами.
    await tester.tap(find.byKey(const Key('lesson-play')));
    await tester.pump();
    final texts = <String>[];
    var sawCompare = false;
    var sawPick = false;
    for (var i = 0; i < 12; i += 1) {
      texts.add(tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '');
      if (find.byKey(const ValueKey('rmet-lesson-neighbor')).evaluate().isNotEmpty) {
        sawCompare = true;
      }
      if (find.byKey(const ValueKey('rmet-lesson-photo')).evaluate().isNotEmpty && texts.last.contains('это и ответ')) {
        sawPick = true;
      }
      if (find.byKey(const Key('lesson-next')).evaluate().isEmpty) break;
      await tester.tap(find.byKey(const Key('lesson-next')));
      await tester.pump();
    }
    expect(texts.where((t) => t.contains('teachRmet')), isEmpty, reason: 'на экране ключ словаря вместо текста');
    expect(texts.where((t) => t.contains('{')), isEmpty, reason: 'подстановка не сработала');
    expect(texts.first, contains('ГЛАЗА'));
    expect(sawCompare, isTrue, reason: 'сравнение обязано показать снимок соседа');
    expect(sawPick, isTrue, reason: 'выбор обязан стоять на снимке примера');

    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
    expect(find.byType(LessonPlayerScreen), findsNothing);
  });
}
