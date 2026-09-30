import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/story_recall/model.dart';
import 'package:psygames_flutter/games/story_recall/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ «STORY RECALL» НАЖАТИЯМИ И НАБОРОМ. Рассказ — свой, короткий: число
/// ключей и ответ на пример выводятся из ДАННЫХ, а не из модели экрана.
///
/// ⚠️ Экран поднимается БЕЗ `runAsync`: таймеры фаз должны двигаться `pump`-ом,
/// иначе проба «чтение само уходит дальше» зеленела бы и без автоперехода.
void main() {
  late SharedState state;
  const story = Story(
    ru: 'Анна Морозова работает в больнице. Вечером она купила велосипед.',
    en: 'Anna Miller works at the hospital. In the evening she bought a bicycle.',
    keywordsRu: ['Анна', 'Морозова', 'больнице', 'вечером', 'велосипед'],
    keywordsEn: ['Anna', 'Miller', 'hospital', 'evening', 'bicycle'],
    readSeconds: 30,
  );

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> boot(WidgetTester tester, int Function() clock) async {
    await tester.pumpWidget(MaterialApp(
      home: StoryRecallScreen(state: state, clock: clock, random: () => 0.3, storiesOverride: const [story]),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  int mathAnswer(WidgetTester tester) {
    final t = tester.widget<Text>(find.byKey(const Key('story-math'))).data!;
    final m = RegExp(r'(\d+) ([+-]) (\d+)').firstMatch(t)!;
    final a = int.parse(m[1]!), b = int.parse(m[3]!);
    return m[2] == '+' ? a + b : a - b;
  }

  testWidgets('🔴 партия целиком: пересказы засчитаны по ключам, отчёт один, уровень вырос', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await boot(tester, () => now);
    await tester.tap(find.byKey(const Key('story-start')));
    await tester.pump();
    expect(find.byKey(const Key('story-text')), findsOneWidget);
    // Кнопка перехода подписана — отчёт 3c7b98c5.
    expect(find.text(L.t('storyReadDone')), findsOneWidget);
    await tester.tap(find.byKey(const Key('story-read-done')));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('story-math-input')), '${mathAnswer(tester)}');
    await tester.tap(find.byKey(const Key('story-math-ok')));
    await tester.pump();
    expect(find.text('1'), findsWidgets, reason: 'верный пример засчитан');
    await tester.tap(find.byKey(const Key('story-ready')));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('story-recall1')), 'Анна Морозова, больница, вечером купила велосипед');
    await tester.tap(find.byKey(const Key('story-done')));
    await tester.pump();
    // Отложенный пересказ открывается сам, когда вторая помеха кончилась.
    final d2 = distractorSecondsFor(storyDistractor2Sec, 1);
    now += d2 * 1000 + 300;
    await tester.pump(Duration(milliseconds: d2 * 1000 + 300));
    expect(find.byKey(const Key('story-recall2')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('story-recall2')), 'анна велосипед');
    await tester.tap(find.byKey(const Key('story-done')));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('story-hits1')), findsOneWidget);
    expect(sent, hasLength(1));
    final s = sent.single;
    expect(s['game_type'], 'story_recall');
    expect(s['score'], (5 + 2) * 50);
    expect(s['errors'], 5 - 2);
    expect(s['mode'], 'standard');
    final d = s['details'] as Map;
    expect(d['immediate_recall_count'], 5);
    expect(d['delayed_recall_count'], 2);
    expect(d['retention_rate'], 0.4);
    expect(d['distractor_score'], 1);
    expect(state.get(SharedState.levelKey('story_recall', 'nzt48')), '2');
  });

  testWidgets('🔴 чтение уходит дальше само, и об этом сказано', (tester) async {
    var now = 1000;
    await boot(tester, () => now);
    await tester.tap(find.byKey(const Key('story-start')));
    await tester.pump();
    final read = readSecondsFor(story.readSeconds, 1);
    expect(find.text(L.t('storyReadAuto').replaceAll('{n}', '$read')), findsOneWidget);
    now += read * 1000 + 300;
    await tester.pump(Duration(milliseconds: read * 1000 + 300));
    expect(find.byKey(const Key('story-math')), findsOneWidget, reason: 'после чтения — помеха');
  });

  testWidgets('шаг зарядки: сразу чтение, без экрана настроек', (tester) async {
    GamePreset.set({'wu': '1'});
    await boot(tester, () => 1000);
    expect(find.byKey(const Key('story-start')), findsNothing);
    expect(find.byKey(const Key('story-text')), findsOneWidget);
  });

  testWidgets('разбор до партии — рассказ и ключевые детали', (tester) async {
    await boot(tester, () => 1000);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Анна Морозова'), findsWidgets);
  });
}
