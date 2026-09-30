/// «МНЕМОНИКА» ИГРАЕТСЯ НАЖАТИЯМИ — ВСЕ ТРИ РЕЖИМА.
///
/// Ядро сверено с TS отдельно (`mnemonics_test.dart`); здесь — доходит ли круг пальцем:
/// настройка → запоминание → окно удержания → порядок → итог, «Опоры» вопрос за вопросом,
/// лестница двигается только за чистую партию по уровню, разбор внутри партии её не засчитывает,
/// свободная тренировка лестницу не трогает, шаг зарядки режется потолком уровня.
library;

import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mnemonics/model.dart';
import 'package:psygames_flutter/games/mnemonics/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_mnemonics_level_nzt48';

void main() {
  late SharedState state;
  late MnemonicsContent content;

  setUpAll(() {
    content = MnemonicsContent.fromJsonString(File('assets/mnemonics.json').readAsStringSync());
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  tearDown(() {
    GamePreset.clear();
    LessonUsed.reset();
  });

  Future<MnemonicsScreenState> boot(WidgetTester tester, {int level = 1, int seed = 7}) async {
    if (level > 1) await state.set(_levelKey, '$level');
    await tester.pumpWidget(MaterialApp(home: MnemonicsScreen(state: state, content: content, random: Random(seed))));
    await tester.pump();
    await tester.pump();
    return tester.state<MnemonicsScreenState>(find.byType(MnemonicsScreen));
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final f = find.byKey(ValueKey(key));
    await tester.ensureVisible(f);
    await tester.tap(f);
    await tester.pump();
  }

  /// Восстановить порядок: сначала [wrong] неверных касаний, потом весь ряд по порядку.
  Future<void> restore(WidgetTester tester, MnemonicsScreenState s, {int wrong = 0}) async {
    for (var i = 0; i < wrong; i += 1) {
      await tap(tester, 'mnemonics-pick-${s.items.last}');
    }
    for (final item in [...s.items]) {
      await tap(tester, 'mnemonics-pick-$item');
    }
    await tester.pump();
  }

  testWidgets('🔴 «Слова» по уровню: чистый порядок поднимает уровень, ряд растёт 5 → 6', (tester) async {
    final s = await boot(tester);
    expect(find.byKey(const ValueKey('mnemonics-level-line')), findsOneWidget);
    await tap(tester, 'mnemonics-start');
    expect(s.phase, MnemoPhase.memorize);
    expect(s.items, hasLength(5));
    await tap(tester, 'mnemonics-check');
    expect(s.phase, MnemoPhase.check, reason: 'на 1-м уровне окна удержания нет');
    await restore(tester, s);
    expect(s.phase, MnemoPhase.result);
    expect(find.byKey(const ValueKey('mnemonics-result')), findsOneWidget);
    await tap(tester, 'mnemonics-start');
    expect(s.items, hasLength(6), reason: 'чистое воспроизведение обязано поднять уровень');
  });

  testWidgets('🔴 ошибка в порядке: считается, штраф в шапке, уровень не растёт', (tester) async {
    final s = await boot(tester);
    await tap(tester, 'mnemonics-start');
    await tap(tester, 'mnemonics-check');
    await tap(tester, 'mnemonics-pick-${s.items.last}');
    expect(s.errors, 1);
    expect(find.textContaining('(+15'), findsOneWidget, reason: 'штраф ошибки обязан быть виден');
    await restore(tester, s);
    expect(s.phase, MnemoPhase.result);
    await tap(tester, 'mnemonics-start');
    expect(s.items, hasLength(5), reason: 'партия с ошибкой уровень не поднимает');
  });

  testWidgets('«Числа»: под числом опора из кода, переключатель её прячет', (tester) async {
    final s = await boot(tester);
    await tap(tester, 'mnemonics-mode-numbers');
    expect(find.byKey(const ValueKey('mnemonics-aid')), findsOneWidget);
    await tap(tester, 'mnemonics-start');
    expect(s.items.every((x) => int.tryParse(x) != null && int.parse(x) >= 10 && int.parse(x) <= 99), isTrue);
    final table = content.pegsFor('ru')!;
    final first = tester.widget<Text>(find.byKey(const ValueKey('mnemonics-peg-word-0')));
    expect(first.data, table.words[int.parse(s.items.first)], reason: 'опора обязана браться из того же кода');
    await tap(tester, 'mnemonics-check');
    await restore(tester, s, wrong: 1);   // не поднимаем уровень, чтобы вернуться к той же настройке
    await tap(tester, 'mnemonics-setup');
    await tap(tester, 'mnemonics-aid');
    await tap(tester, 'mnemonics-start');
    expect(find.byKey(const ValueKey('mnemonics-peg-word-0')), findsNothing, reason: 'опора скрыта переключателем');
  });

  testWidgets('🔴 «Опоры»: партия вопрос за вопросом, верный ответ засчитан, уровень растёт', (tester) async {
    final s = await boot(tester);
    await tap(tester, 'mnemonics-mode-pegs');
    await tap(tester, 'mnemonics-start');
    expect(s.phase, MnemoPhase.pegs);
    var answered = 0;
    while (s.phase == MnemoPhase.pegs && answered < 30) {
      final q = s.question!;
      expect(find.text(q.prompt), findsOneWidget);
      await tap(tester, 'mnemonics-peg-option-${q.options.indexOf(q.answer)}');
      expect(find.byKey(const ValueKey('mnemonics-peg-feedback')), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 600));
      answered += 1;
    }
    expect(answered, pegQuizParams(1).count);
    expect(s.phase, MnemoPhase.result);
    expect(s.errors, 0);
    await tap(tester, 'mnemonics-start');
    expect(s.phase, MnemoPhase.pegs);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('🔴 «Опоры» с 12-го уровня: время на ответ истекает — вопрос засчитан ошибкой; под паузой время стоит',
      (tester) async {
    final s = await boot(tester, level: 12);
    await tap(tester, 'mnemonics-mode-pegs');
    await tap(tester, 'mnemonics-start');
    final limit = pegQuizParams(12).limitMs;
    expect(limit, greaterThan(0));
    // Страница поверх игры (как пауза каркаса) — часы стоят.
    final nav = tester.state<NavigatorState>(find.byType(Navigator));
    nav.push(MaterialPageRoute<void>(builder: (_) => const Scaffold(body: SizedBox())));
    await tester.pumpAndSettle();
    await tester.pump(Duration(milliseconds: limit + 2000));
    expect(s.errors, 0, reason: 'под паузой время на ответ не должно сгорать');
    nav.pop();
    await tester.pumpAndSettle();
    await tester.pump(Duration(milliseconds: limit + 200));
    expect(s.errors, 1, reason: 'истёкшее время — ошибка, как в вебе');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('правило уровня: до 7-го его нет, с 7-го — на настройке, в «Опорах» — нет', (tester) async {
    await boot(tester, level: 6);
    expect(find.byKey(const ValueKey('mnemonics-level-rule')), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await boot(tester, level: 7);
    expect(find.byKey(const ValueKey('mnemonics-level-rule')), findsOneWidget);
    expect(find.textContaining('lr_mnemonics'), findsNothing, reason: 'ключ словаря вместо текста');
    await tap(tester, 'mnemonics-mode-pegs');
    expect(find.byKey(const ValueKey('mnemonics-level-rule')), findsNothing);
  });

  testWidgets('окно удержания: с 5-го уровня пауза, с 9-го — примеры-помехи до проверки', (tester) async {
    final s = await boot(tester, level: 9);
    await tap(tester, 'mnemonics-start');
    await tap(tester, 'mnemonics-check');
    expect(s.phase, MnemoPhase.gap);
    final trials = levelParams(9).mathTrials;
    for (var i = 0; i < trials; i += 1) {
      final e = s.example!;
      // Сначала неверный — пример меняется, счёт не идёт.
      final wrong = e.options.firstWhere((v) => v != e.answer);
      await tap(tester, 'mnemonics-gap-$wrong');
      expect(s.phase, MnemoPhase.gap);
      await tap(tester, 'mnemonics-gap-${s.example!.answer}');
    }
    expect(s.phase, MnemoPhase.check);
  });

  testWidgets('🔴 разбор: до партии не метит её, внутри партии — партия не засчитана', (tester) async {
    final s = await boot(tester);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    expect(LessonUsed.inRound, isFalse, reason: 'разбор до партии не показывает её ряд');
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();

    await tap(tester, 'mnemonics-start');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(LessonUsed.inRound, isTrue, reason: 'разбор ТЕКУЩЕГО ряда делает партию незачётной');
    final text = tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '';
    expect(text, isNot(contains('teachMnemo')), reason: 'на экране ключ словаря вместо текста');
    await tester.tap(find.byKey(const Key('lesson-play')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
    await tap(tester, 'mnemonics-check');
    await restore(tester, s);
    await tap(tester, 'mnemonics-start');
    expect(s.items, hasLength(5), reason: 'чистая партия с разбором уровень не поднимает');
  });

  testWidgets('свободная тренировка: любое число элементов, лестница не двигается', (tester) async {
    final s = await boot(tester);
    await tap(tester, 'mnemonics-free-toggle');
    await tap(tester, 'mnemonics-free-8');
    await tap(tester, 'mnemonics-free-start');
    expect(s.items, hasLength(8));
    await tap(tester, 'mnemonics-check');
    await restore(tester, s);
    expect(s.phase, MnemoPhase.result);
    await tap(tester, 'mnemonics-start');
    expect(s.items, hasLength(5), reason: 'свободная партия уровень не меняет');
  });

  testWidgets('🔴 шаг зарядки: режим из шага, стартует сам, длина ряда не выше уровня + 2', (tester) async {
    GamePreset.set({'wu': '1', 'mode': 'numbers', 'itemCount': '20'});
    final s = await boot(tester);
    expect(s.phase, MnemoPhase.memorize, reason: 'шаг зарядки стартует сам');
    expect(s.items, hasLength(levelParams(1).itemCount + 2), reason: '20 из шага режутся потолком уровня');
    expect(int.tryParse(s.items.first), isNotNull, reason: 'режим «Числа» из шага');
  });
}
