import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/phonemic_fluency/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПОДХОД «БЕГЛОСТИ РЕЧИ» НАБОРОМ. Буква задания берётся из данных (первая буква
/// пула при случайности 0), верность слов — по правилам веба.
///
/// ⚠️ Экран поднимается БЕЗ `runAsync`: минута подхода должна идти `pump`-ом.
void main() {
  late SharedState state;

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
    await tester.pumpWidget(MaterialApp(home: PhonemicFluencyScreen(state: state, clock: clock, random: () => 0.0)));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  Future<void> say(WidgetTester tester, String word) async {
    await tester.enterText(find.byKey(const Key('pf-input')), word);
    await tester.tap(find.byKey(const Key('pf-add')));
    await tester.pump();
  }

  testWidgets('🔴 подход целиком: повтор и чужая буква не засчитаны, отчёт один', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await boot(tester, () => now);
    await tester.tap(find.byKey(const Key('pf-start')));
    await tester.pump();
    final letter = tester.widget<Text>(find.byKey(const Key('pf-letter'))).data!;
    expect(letter, 'К', reason: 'русский интерфейс → кириллический пул, первая буква');
    now += 2000;
    await say(tester, 'Кот');
    await say(tester, 'кот');
    await say(tester, 'лампа');
    now += 40000;
    await say(tester, 'кит');
    expect(find.text('кот ↻'), findsOneWidget, reason: 'повтор помечен');
    expect(find.text('лампа ✗'), findsOneWidget, reason: 'чужая буква помечена');
    now += 20000;
    await tester.pump(const Duration(seconds: 60));
    expect(find.byKey(const Key('pf-count')), findsOneWidget);
    expect(sent, hasLength(1));
    final s = sent.single;
    expect(s['game_type'], 'phonemic_fluency');
    expect(s['score'], 20);
    expect(s['errors'], 2);
    expect(s['mode'], '60s');
    expect(s['difficulty'], 'letter-К');
    final d = s['details'] as Map;
    expect(d['words_list'], ['кот', 'кит']);
    expect(d['first_half_count'], 1);
    expect(d['second_half_count'], 1);
    expect(state.get(SharedState.levelKey('phonemic_fluency', 'nzt48')), '2', reason: 'подход засчитан завершением');
  });

  testWidgets('🔴 выбор языка слов ложится в тот же ключ, что у веба, и меняет букву', (tester) async {
    await boot(tester, () => 1000);
    // Язык выбирается выпадающей строкой (общий LangDropdown): открыть, выбрать пункт.
    await tester.tap(find.byKey(const Key('pf-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const Key('pf-lang-en')).last);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(state.get('psygames_phonemic_fluency_wordlang_nzt48'), 'en');
    await tester.tap(find.byKey(const Key('pf-start')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('pf-letter'))).data, 'F');
  });

  testWidgets('шаг зарядки: сам стартует, язык и длительность из адреса', (tester) async {
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'duration': '90'});
    await boot(tester, () => 1000);
    expect(find.byKey(const Key('pf-start')), findsNothing);
    expect(tester.widget<Text>(find.byKey(const Key('pf-letter'))).data, 'F');
    expect(find.text('90${L.t('secShort')}'), findsOneWidget);
  });

  testWidgets('разбор до партии — буква задания', (tester) async {
    await boot(tester, () => 1000);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.text('К'), findsWidgets);
  });
}
