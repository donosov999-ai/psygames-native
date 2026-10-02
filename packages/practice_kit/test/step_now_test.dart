import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

/// 🔴 ЧТО ДЕЛАТЬ СЕЙЧАС И СКОЛЬКО ЕЩЁ — ВИДНО И ОЩУТИМО.
///
/// Денис, 01.10.2026: «по животу вообще непонятно, когда держать, когда
/// отпускать… текстов нет; по сути только Кегель понятен и дыхание». Тексты есть в
/// данных у всех шагов, но экран показывал их мелкой строкой без отсчёта, а
/// «Живот» не вибрировал вовсе.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final engine = Practices(jsonDecode(File('assets/practices.json').readAsStringSync()));

  Json abdomen() => engine.plan({
        'mode': 'solo',
        'durationMs': 60000,
        'locale': 'ru',
        'selections': [
          {'setId': 'abdomen', 'programId': 'level-2'},
        ],
        'guideMode': 'visual',
        'context': 'home',
        'advisory': true,
      });

  testWidgets('отсчёт шага: 8 с → 3 с → 0 с, полоска заполняется, заголовок крупный', (tester) async {
    const cue = {
      'title': 'Активация',
      'cue': 'Слегка напрягите живот, не задерживая дыхание.',
      'startMs': 10000,
      'endMs': 18000,
    };
    Future<(String, double)> at(int ms) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: StepNow(cue: cue, elapsedMs: ms, unit: 'с')),
      ));
      final left = (tester.widget(find.byKey(const Key('step-now-left'))) as Text).data!;
      final bar = tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      return (left, bar.value!);
    }
    expect((await at(10000)).$1, '8 с');
    final (l5, v5) = await at(15000);
    expect(l5, '3 с');
    expect(v5, closeTo(.625, .001));
    expect((await at(18000)).$1, '0 с');
    final title = tester.widget<Text>(find.byKey(const Key('step-now-title')));
    expect(title.data, 'Активация');
    expect(title.style!.fontSize, greaterThanOrEqualTo(20));
    expect(tester.widget<Text>(find.byKey(const Key('step-now-cue'))).data, contains('напрягите живот'));
  });

  test('у каждого шага «Живота» есть заголовок и подсказка — показывать есть что', () {
    for (final s in objects(abdomen()['timeline'])) {
      expect('${s['title'] ?? ''}'.trim(), isNotEmpty, reason: '${s['stepId']}');
      expect('${s['cue'] ?? ''}'.trim(), isNotEmpty, reason: '${s['stepId']}');
    }
  });

  test('«Живот» в режиме удержания: гудит всё напряжение, на расслаблении тишина', () {
    final calls = <MethodCall>[];
    final m = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    m.setMockMethodCallHandler(PracticeHaptics.channel, (c) async {
      calls.add(c);
      return null;
    });
    final plan = abdomen();
    final steps = objects(plan['timeline']);
    final engage = steps.firstWhere((s) => s['stepId'] == 'engage');
    final release = steps.firstWhere((s) => s['stepId'] == 'release');
    final h = PracticeHaptics();
    h.update(plan, engage['startMs'] as int, const {});
    final play = calls.lastWhere((c) => c.method == 'play');
    expect(play.arguments['continuous'], isTrue);
    expect(play.arguments['durationMs'], (engage['endMs'] as int) - (engage['startMs'] as int));
    calls.clear();
    h.update(plan, release['startMs'] as int, const {});
    expect(calls.where((c) => c.method == 'play'), isEmpty, reason: 'отпускаем — тишина');
    h.dispose();
    m.setMockMethodCallHandler(PracticeHaptics.channel, null);
  });
}
