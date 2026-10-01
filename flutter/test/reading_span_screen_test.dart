import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/reading_span/model.dart';
import 'package:psygames_flutter/games/reading_span/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ОБЪЁМ ПРИ ЧТЕНИИ» ИГРАЕТСЯ ЧТЕНИЕМ, НАЖАТИЯМИ И НАБОРОМ.
///
/// Предложение и его последнее слово проба читает С ЭКРАНА; смысл предложения она «знает»,
/// как знает язык человек, — по тексту предложения из словаря игры, а не из модели партии.
/// Последние слова набираются в поле ввода. Отчёт партии перехватывается: метки, details и
/// длительность в секундах.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];
  final sentences = [
    for (final e in jsonDecode(File('assets/reading_span/sentences.json').readAsStringSync()) as List)
      RspanSentence.fromJson((e as Map).cast<String, Object?>()),
  ];
  // Смысл предложения по его тексту на любом из двух языков — «знание языка» пробы.
  final senseOf = {for (final s in sentences) ...{s.ru: s.ok, s.en: s.ok}};

  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
  });

  Future<void> boot(WidgetTester tester, {int level = 1, bool rulesSeen = true, Map<String, String>? preset}) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'psygames_reading_span_level_nzt48': '$level',
      if (rulesSeen) LevelRules.seenKey('reading_span', 'load'): '1',
    });
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    if (preset != null) GamePreset.set(preset);
    // Поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22 и выдаёт почти одно и то же (01.10.2026).
    var st = 4242;
    double rng() {
      st = (st * 9301 + 49297) % 233280;
      return st / 233280;
    }
    await tester.pumpWidget(MaterialApp(
      home: ReadingSpanScreen(key: UniqueKey(), state: state, sentences: sentences, rng: rng),
    ));
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
  }

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  bool hud(WidgetTester tester, String label, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '$label: $value')
      .evaluate()
      .isNotEmpty;

  String sentenceOnScreen(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('rspan-sentence'))).data!;

  /// Последнее слово — из подсказки «Запомните: слово» на карточке.
  String lastWordOnScreen(WidgetTester tester) {
    final rich = tester.widget<Text>(find.byKey(const Key('rspan-last-word'))).textSpan! as TextSpan;
    return (rich.children!.last as TextSpan).text!;
  }

  /// Читает набор: на каждом предложении — суждение (верное или нарочно неверное на
  /// [wrongAt]) и запоминание последнего слова. Возвращает запомненные слова по порядку.
  Future<List<String>> readSet(WidgetTester tester, {Set<int> wrongAt = const {}}) async {
    final words = <String>[];
    for (var i = 0; i < 100 && find.byKey(const Key('rspan-sentence')).evaluate().isNotEmpty; i++) {
      final text = sentenceOnScreen(tester);
      words.add(lastWordOnScreen(tester));
      final ok = senseOf[text]!;
      final says = wrongAt.contains(i) ? !ok : ok;
      await tester.pump(const Duration(seconds: 2));   // человек читает
      await tester.tap(find.byKey(Key(says ? 'rspan-sense' : 'rspan-nonsense')));
      await tester.pump();
    }
    return words;
  }

  Future<void> answer(WidgetTester tester, String typed) async {
    await tester.enterText(find.byKey(const Key('rspan-input')), typed);
    await tester.pump();
    await tester.tap(find.byKey(const Key('rspan-check')));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('🔴 партия: прочитал, оценил, набрал слова по порядку — уровень взят, отчёт как у веба', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('rspan-start')));
    await tester.pump();
    final words = await readSet(tester);
    expect(words.length, 3, reason: 'на первом уровне набор из трёх предложений');
    expect(find.byKey(const Key('rspan-input')), findsOneWidget, reason: 'после набора — ввод слов');
    await answer(tester, words.join(', '));

    expect(find.byKey(const Key('rspan-passed')), findsOneWidget);
    expect(hud(tester, L.t('level'), '2'), isTrue, reason: 'все слова на местах — уровень растёт');
    final s = sent.single;
    expect(s['game_type'], 'reading_span');
    expect('${s['difficulty']} / ${s['mode']}', 'easy / 3-set', reason: 'метки — как пишет веб-экран');
    expect(s['details'], {'level': 1, 'judgments': 3, 'recalled': 3, 'expected': words.map((w) => w.toLowerCase()).join(' ')});
    expect(s['time_seconds'] as int, inInclusiveRange(5, 60), reason: 'секунды партии, а не отметка времени');
  });

  testWidgets('🔴 слова не в том порядке — ошибки; уровень не взят; неверное суждение не засчитано', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('rspan-start')));
    await tester.pump();
    final words = await readSet(tester, wrongAt: {1});
    await answer(tester, words.reversed.join(' '));
    expect(find.byKey(const Key('rspan-failed')), findsOneWidget);
    expect(sent.single['errors'], 2, reason: 'крайние слова переставлены, среднее на месте');
    expect((sent.single['details'] as Map)['judgments'], 2, reason: 'одно суждение нарочно неверное');
    expect(hud(tester, L.t('level'), '1'), isTrue);
  });

  testWidgets('🔴 интерфейс на английском — предложения и слова английские', (tester) async {
    await L.load('en');
    addTearDown(() => L.load('ru'));
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('rspan-start')));
    await tester.pump();
    final first = sentenceOnScreen(tester);
    expect(sentences.any((s) => s.en == first), isTrue, reason: 'предложение английское: «$first»');
    final words = await readSet(tester);
    await answer(tester, words.join(' '));
    expect(find.byKey(const Key('rspan-passed')), findsOneWidget);
    final english = {for (final s in sentences) s.lastEn.toLowerCase()};
    expect(((sent.single['details'] as Map)['expected'] as String).split(' ').every(english.contains), isTrue);
  });

  testWidgets('🔴 удержание (ось 3): за ёмкостью словаря ввод открывается не сразу', (tester) async {
    final top = sentences.length - 1;   // первый уровень, где набор упёрся в словарь и пошла задержка
    final p = RspanLevelParams.of(top, sentences.length);
    expect(p.holdMs, greaterThan(0));
    await boot(tester, level: top);
    await tester.tap(find.byKey(const Key('rspan-start')));
    await tester.pump();
    final words = await readSet(tester);
    expect(words.length, p.setSize);
    expect(find.byKey(const Key('rspan-hold')), findsOneWidget, reason: 'набор кончился, ввод ещё закрыт');
    expect(find.byKey(const Key('rspan-input')), findsNothing);
    await tester.pump(Duration(milliseconds: p.holdMs));
    await tester.pump();
    expect(find.byKey(const Key('rspan-input')), findsOneWidget, reason: 'после удержания ввод открылся');
  });

  testWidgets('🔴 шаг зарядки: стартует сам, набор из шага под потолком уровня, уровень не двигается', (tester) async {
    await boot(tester, level: 1, preset: {'wu': '1', 'setSize': '6'});
    expect(find.byKey(const Key('rspan-start')), findsNothing, reason: 'шаг стартует сам');
    final words = await readSet(tester);
    expect(words.length, 4, reason: 'шаг просит 6, освоено 3 — больше освоенного + 1 не даём');
    await answer(tester, words.join(' '));
    expect('${sent.single['difficulty']} / ${sent.single['mode']}', 'medium / 4-set');
    expect(hud(tester, L.t('level'), '1'), isTrue, reason: 'шаг зарядки личный уровень не двигает');
  });

  testWidgets('🔴 «Показать решение»: весь набор с пометкой смысла и словами по порядку; партия не засчитана', (tester) async {
    await boot(tester, level: 3);
    await tester.tap(find.byKey(const Key('rspan-start')));
    await tester.pump();
    final first = sentenceOnScreen(tester);
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    final solution = tester.widget<RspanSolution>(find.byType(RspanSolution));
    expect(solution.seq.length, RspanLevelParams.of(3, sentences.length).setSize, reason: 'раскрыт весь набор');
    expect(solution.seq.first.ru, first, reason: 'тот же набор, что шёл в партии');
    final labels = find
        .byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('rspan-sol-'))
        .evaluate()
        .map((e) => (e.widget as Semantics).properties.label!)
        .toList();
    expect(labels, [for (var i = 0; i < solution.seq.length; i++) 'rspan-sol-$i-${solution.seq[i].ok ? 'sense' : 'nonsense'}'],
        reason: 'пометка смысла — по флагу предложения, как засчитывает игра');
    expect(solution.answer, [for (final s in solution.seq) s.lastRu.toLowerCase()]);
    expect(sent, isEmpty, reason: 'показанное решение в статистику и лестницу не идёт');
    expect(hud(tester, L.t('level'), '3'), isTrue);
  });

  testWidgets('🔴 разбор открывается ДО партии; ответы примеров — по правилу самой игры', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.byType(DemoCard), findsOneWidget);
    expect(find.byType(RspanSentenceCard), findsOneWidget, reason: 'в разборе карточка предложения самой игры');
    final trials = readingSpanLessonTrials(sentences, 'ru');
    final cards = [for (final t in trials.take(2)) t.art! as RspanSentenceCard];
    expect([for (final c in cards) c.sentence.ok], [true, false], reason: 'пример смысла и пример бессмыслицы');
    for (var i = 0; i < 2; i++) {
      expect(trials[i].answer, L.t(cards[i].sentence.ok ? 'makesSense' : 'nonsense'), reason: 'ответ — подпись кнопки');
    }
    final recall = trials[2].art! as RspanSolution;
    expect(trials[2].text, recall.answer.join(' '), reason: 'слова примера — те, что засчитала бы проверка игры');
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
  });

  testWidgets('🔴 на 5-м уровне ДО партии — карточка правила «нагрузка»', (tester) async {
    await boot(tester, level: 5, rulesSeen: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(AlertDialog), findsOneWidget, reason: 'правило уровня объявлено в спокойный момент');
    expect(find.text(L.t('lr_reading_span_load_title')), findsWidgets);
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('rspan-start')), findsOneWidget, reason: 'после «Понятно» — экран старта');
  });
}
