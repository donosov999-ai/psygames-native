import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cloze/model.dart';
import 'package:psygames_flutter/games/cloze/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
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
      await tester.tap(find.byKey(Key('cloze-option-${answerOf(tester)}')));
      await tester.pump(const Duration(milliseconds: 500));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('cloze-score')), findsOneWidget);
    expect(state.get(SharedState.levelKey('cloze', 'nzt48')), '2');
    expect(sent, hasLength(1));
    expect(sent.single['game_type'], 'cloze');
    expect((sent.single['details'] as Map)['time_limit_ms'], clozeLevelParams(1).timeLimitMs);
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
    final right = tester.widget<FilledButton>(find.byKey(Key('cloze-option-${answerOf(tester)}')));
    expect(right.onPressed, isNull);
    await tester.pump(const Duration(milliseconds: 1300));
    expect(find.text('2/${clozeLevelParams(1).rounds}'), findsOneWidget, reason: 'дальше само');
  });

  testWidgets('шаг зарядки: сам стартует, без лимита времени, число раундов из адреса', (tester) async {
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'rounds': '4'});
    var now = 1000;
    await tester.pumpWidget(app(() => now));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cloze-start')), findsNothing);
    expect(find.text('1/4'), findsOneWidget);
    expect(find.byIcon(Icons.timer_outlined), findsNothing, reason: 'шагу зарядки лимит не ставится');
  });

  testWidgets('разбор до партии — фраза корпуса и её ответ', (tester) async {
    await tester.pumpWidget(app(() => 1000));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.textContaining('I like ___ now'), findsWidgets);
  });
}
