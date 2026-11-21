import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cloze/model.dart';
import 'package:psygames_flutter/games/cloze/screen.dart';
import 'package:psygames_flutter/games/languages/fresh_pool.dart';
import 'package:psygames_flutter/games/languages/json_asset.dart';
import 'package:psygames_flutter/shell/answer_feedback.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В CLOZE НАЖАТИЯМИ. Верный ответ выводится из ДАННЫХ (фраза → её answerEn
/// → слово словаря), а не из модели экрана.
void main() {
  late SharedState state;
  const vocab = <Map<String, String>>[
    {'en': 'to sleep', 'ru': 'спать', 'cat': 'verbs'},
    {'en': 'to read', 'ru': 'читать', 'cat': 'verbs'},
    {'en': 'to eat', 'ru': 'есть', 'cat': 'verbs'},
    {'en': 'to go', 'ru': 'идти', 'cat': 'verbs'},
    {'en': 'to give', 'ru': 'давать', 'cat': 'verbs'},
    {'en': 'to want', 'ru': 'хотеть', 'cat': 'verbs'},
  ];
  final phrases = <String, List<ClozePhrase>>{
    'en': [
      for (final w in ['to sleep', 'to read', 'to eat', 'to go', 'to give', 'to want', 'to sleep', 'to read', 'to eat', 'to go'])
        ClozePhrase('I like ___ now ($w)', w),
    ],
  };

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Widget app(int Function() clock) => MaterialApp(
        home: ClozeScreen(state: state, clock: clock, random: () => 0.0, vocabOverride: vocab, phrasesOverride: phrases),
      );

  String answerOf(WidgetTester tester) {
    final text = tester.widget<Text>(find.byKey(const Key('cloze-text'))).data!;
    return phrases['en']!.firstWhere((p) => p.text == text).answerEn;
  }

  final reviewNext = find.byKey(const Key('cloze-next'));
  final listen = find.byKey(const Key('cloze-listen-phrase'));

  testWidgets('🔴 все верно в лимит — уровень пройден и партия ушла одним отчётом', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await tester.pumpWidget(app(() => now));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cloze-start')));
    await tester.pump();
    final total = clozeLevelParams(1).rounds; // 6 раундов на первом уровне
    expect(find.text('1/$total'), findsOneWidget);
    for (var i = 0; i < total; i += 1) {
      now += 1000;
      final option = find.byKey(Key('cloze-option-${answerOf(tester)}'));
      await tester.tap(option);
      await tester.pump();
      expect(find.ancestor(of: option, matching: find.byKey(const Key('answer-mark-good'))), findsOneWidget);
      await tester.pump(AnswerFeedback.hold);
      expect(reviewNext, findsOneWidget);
      now += 6000; // Reading the review or listening is not timed gameplay.
      await tester.tap(reviewNext);
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('level-result')), findsOneWidget, reason: 'итог — общий каркаса');
    expect(state.get(SharedState.levelKey('cloze', 'nzt48')), '2');
    expect(sent, hasLength(1));
    expect(sent.single['game_type'], 'cloze');
    expect(sent.single['time_seconds'], total, reason: 'review time is not included');
    expect((sent.single['details'] as Map)['time_limit_ms'], clozeLevelParams(1).timeLimitMs);
  });

  testWidgets('ошибка: после обратной связи показывается верное слово, не выбранное', (tester) async {
    var now = 1000;
    await tester.pumpWidget(app(() => now));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cloze-start')));
    await tester.pump();
    final answer = answerOf(tester);
    final wrong = vocab.firstWhere(
      (w) => w['en'] != answer && find.byKey(Key('cloze-option-${w['en']}')).evaluate().isNotEmpty,
    )['en'];
    final picked = find.byKey(Key('cloze-option-$wrong'));
    final correct = find.byKey(Key('cloze-option-$answer'));
    await tester.tap(picked);
    await tester.pump();
    expect(find.ancestor(of: picked, matching: find.byKey(const Key('answer-mark-bad'))), findsOneWidget);
    expect(find.ancestor(of: correct, matching: find.byKey(const Key('answer-mark-good'))), findsOneWidget);
    await tester.pump(AnswerFeedback.hold);
    expect(tester.widget<Text>(find.byKey(const Key('cloze-reviewed-word'))).data, answer);
    await tester.tap(reviewNext);
    await tester.pump();
    expect(find.text('2/${clozeLevelParams(1).rounds}'), findsOneWidget);
  });

  testWidgets('🔴 время вышло — это ошибка, и верный ответ показан', (tester) async {
    var now = 1000;
    await tester.pumpWidget(app(() => now));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cloze-start')));
    await tester.pump();
    final limit = clozeLevelParams(1).timeLimitMs;
    now += limit + 10;
    await tester.pump(Duration(milliseconds: limit + 10));
    expect(find.text('1'), findsWidgets, reason: 'ошибок стало 1');
    // Кнопки заперты — ответ уже засчитан как просрочка.
    final correct = find.byKey(Key('cloze-option-${answerOf(tester)}'));
    final right = tester.widget<FilledButton>(correct);
    expect(right.onPressed, isNull);
    expect(find.ancestor(of: correct, matching: find.byKey(const Key('answer-mark-good'))), findsOneWidget);
    expect(find.byKey(const Key('answer-mark-bad')), findsNothing);
    await tester.pump(const Duration(milliseconds: 1300));
    expect(reviewNext, findsOneWidget, reason: 'разбор доступен и после таймаута');
    await tester.tap(reviewNext);
    await tester.pump();
    expect(find.text('2/${clozeLevelParams(1).rounds}'), findsOneWidget);
  });

  testWidgets('шаг зарядки: сам стартует, без лимита времени, число раундов из адреса', (tester) async {
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'rounds': '4'});
    var now = 1000;
    await tester.pumpWidget(app(() => now));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cloze-start')), findsNothing);
    expect(find.text('1/4'), findsOneWidget);
    expect(find.byIcon(Icons.timer_outlined), findsNothing, reason: 'шагу зарядки лимит не ставится');
    await tester.tap(find.byKey(Key('cloze-option-${answerOf(tester)}')));
    await tester.pump();
    await tester.pump(AnswerFeedback.hold);
    expect(find.text('2/4'), findsOneWidget, reason: 'зарядка продолжает автоматически');
    expect(reviewNext, findsNothing);
    expect(listen, findsNothing);
  });

  for (final (language, locale) in [('en', 'en-US'), ('es', 'es-ES')]) {
    testWidgets('$language: IPA and whole-sentence speech are available only after answering', (tester) async {
      final backend = _ClozeVoiceProbe();
      final voice = VoiceLayer(backend: backend, soundOn: () => true);
      GamePreset.set({'targetLang': language});
      await tester.pumpWidget(MaterialApp(home: ClozeScreen(state: state, clock: () => 1000, voice: voice)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('cloze-start')));
      await tester.pump();
      final prompt = tester.widget<Text>(find.byKey(const Key('cloze-text'))).data!;
      final ipaBadge = find.byKey(const Key('cloze-ipa'));
      expect(ipaBadge, findsNothing);
      expect(listen, findsNothing);
      expect(backend.spoken, isEmpty);

      final bank = await loadJsonAsset('assets/vocab/cloze-phrases.json') as Map;
      final extra = await loadJsonAsset('assets/vocab/cloze-phrases-expansion.json') as List;
      final answerKey = [
        for (final row in bank[language] as List) if (row['text'] == prompt) row['answerEn'],
        for (final row in extra) if (row[language] == prompt) row['answerEn'],
      ].single;
      final rows = await loadJsonAsset('assets/vocab/translation-vocab.json') as List;
      final target = rows.singleWhere((row) => row['en'] == answerKey)[language] as String;
      final completed = prompt.replaceFirst('___', target);
      await tester.tap(find.byKey(Key('cloze-option-$target')));
      await tester.pump();
      await tester.pump(AnswerFeedback.hold);
      expect(find.text(completed), findsOneWidget);
      expect(ipaBadge, findsOneWidget);
      expect(find.byIcon(Icons.timer_outlined), findsNothing);
      expect(backend.spoken, isEmpty, reason: 'speech is on demand');
      await tester.tap(listen);
      await tester.pumpAndSettle();
      expect(backend.spoken, [(completed, locale)]);
      await tester.tap(reviewNext);
      await tester.pump();
      expect(find.text('2/6'), findsOneWidget);
      expect(listen, findsNothing);
    });
  }

  testWidgets('разбор до партии — фраза корпуса и её ответ', (tester) async {
    await tester.pumpWidget(app(() => 1000));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.textContaining('I like ___ now'), findsWidgets);
  });

  testWidgets('native game shows new phrases even if the original 60 were seen', (tester) async {
    final base = await loadJsonAsset('assets/vocab/cloze-phrases.json') as Map;
    final extra = await loadJsonAsset('assets/vocab/cloze-phrases-expansion.json') as List;
    for (final lang in ['en', 'es']) {
      await writeSeen(state, clozeSeenPool(lang), [
        for (final row in base[lang] as List) row['text'] as String,
      ]);
    }
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'lang2': 'es', 'bilingual': '1', 'rounds': '4'});
    await tester.pumpWidget(MaterialApp(home: ClozeScreen(state: state, clock: () => 1000)));
    await tester.pumpAndSettle();
    final text = tester.widget<Text>(find.byKey(const Key('cloze-text'))).data;
    expect([
      for (final row in extra) ...[row['en'], row['es']],
    ], contains(text));
    expect(find.text('1/4'), findsOneWidget);
    for (final lang in ['en', 'es']) {
      expect(readSeen(state, clozeSeenPool(lang)).length, greaterThan(60));
    }
  });
}

class _ClozeVoiceProbe implements VoiceBackend {
  final spoken = <(String, String)>[];

  @override
  Future<void> cancel() async {}

  @override
  Future<bool> hasSystemVoice(String bcp47) async => true;

  @override
  Future<bool> playUrl(String url, double rate) async => false;

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    spoken.add((text, bcp47));
    return true;
  }
}
