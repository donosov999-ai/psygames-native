import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/prl/screen.dart';
import 'package:psygames_flutter/games/stroop/model.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
import 'package:psygames_flutter/games/stroop_emotional/screen.dart';
import 'package:psygames_flutter/games/targets/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «КОНФЛИКТ ВНИМАНИЯ»: ПАРАМЕТРЫ АДРЕСА, КОТОРЫЕ ВЕБ ИСПОЛНЯЕТ, А НАТИВ ТЕРЯЛ (задача 9137fda8).
///
/// Сторож #273 (строгий замер) назвал девять экранов; замер 08.10.2026 по main c50a0f15d
/// (`GamePreset.(num|str|flag)('x'` в папке экрана) оставил четыре настоящих:
///   · Струп — `mode` (слово/цвет) и `trials` шага: 79 шагов наборов шлют `trials: 20, mode: 'ink'`;
///   · эмоциональный Струп — `trials` шага (веб `isPreset ? num('trials', p.trials)`);
///   · PRL — `diff`: веб играет шаг КЛАССИКОЙ на стандартных параметрах (`DIFF_CFG`), так снят
///     и замерный «ядро-снимок» `60t-80%`; натив классику брал только из конструктора;
///   · «Мишени» — `mode` (поле/джокер) и `level` шага с потолком «освоенное + 1».
/// Экраны открываются как в `HybridApp.native` — без параметров конструктора.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('en');
    sent.clear();
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Finder hud(String label, String value) =>
      find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '') == '$label: $value');

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  test('Струп: правило из адреса — как веб («word» → слово, иное → цвет, без параметра — экран)', () {
    GamePreset.set({'mode': 'word'});
    expect(stroopModeFor('ink'), 'word');
    GamePreset.set({'mode': 'classic'}); // так шлёт warmup.ts:457
    expect(stroopModeFor('word'), 'ink');
    GamePreset.set({});
    expect(stroopModeFor('word'), 'word');
  });

  testWidgets('🔴 Струп: шаг зарядки — проб из шага, а не уровня', (tester) async {
    GamePreset.set({'wu': '1', 'trials': '7', 'mode': 'ink'});
    await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state)));
    await settle(tester);
    expect(StroopLevel.of(1).trials, isNot(7), reason: 'проба должна различать шаг и уровень');
    expect(hud(L.t('round'), '0/7').evaluate().isNotEmpty || hud(L.t('round'), '1/7').evaluate().isNotEmpty, isTrue,
        reason: 'в шапке не 7 проб шага');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 эмоциональный Струп: шаг зарядки — проб из шага', (tester) async {
    GamePreset.set({'wu': '1', 'trials': '5'});
    await tester.pumpWidget(MaterialApp(home: EmoStroopScreen(state: state)));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await settle(tester);
    expect(hud(L.t('round'), '0/5').evaluate().isNotEmpty || hud(L.t('round'), '1/5').evaluate().isNotEmpty, isTrue,
        reason: 'в шапке не 5 проб шага');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 PRL: шаг зарядки — классика «easy» (40 проб, без уровня), и партия шага ПИШЕТСЯ', (tester) async {
    GamePreset.set({'wu': '1', 'diff': 'easy'});
    await tester.pumpWidget(MaterialApp(home: PrlScreen(state: state, rnd: Random(7))));
    await settle(tester);
    expect(hud(L.t('round'), '0/40'), findsOneWidget, reason: 'шаг не классика easy (DIFF_CFG веба: 40 проб)');
    expect(find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('${L.t('level')}: ')),
        findsNothing,
        reason: 'у классики уровня нет');
    for (var i = 0; i < 40; i++) {
      await tester.tap(find.byKey(const Key('prl-choice-a')));
      await tester.pump(const Duration(milliseconds: prlFeedbackMs + 50));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('prl-verdict')), findsOneWidget, reason: 'партия не кончилась');
    expect(sent, hasLength(1), reason: 'партия шага зарядки не записана');
    expect(sent.single['difficulty'], 'easy', reason: 'метка шага не доехала в партию');
    await tester.pumpWidget(const SizedBox());
  });

  group('«Мишени»', () {
    Future<void> openAtLevel(WidgetTester tester, int personal) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}targets_level_nzt48': '$personal'});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(1))));
      await settle(tester);
    }

    testWidgets('🔴 шаг зарядки: уровень из шага с потолком «освоенное + 1»', (tester) async {
      GamePreset.set({'wu': '1', 'level': '2'});
      await openAtLevel(tester, 5);
      expect(hud(L.t('level'), '2'), findsOneWidget, reason: 'шаг просил 2 — натив взял личный');
      await tester.pumpWidget(const SizedBox());
      GamePreset.set({'wu': '1', 'level': '9'});
      await openAtLevel(tester, 5);
      expect(hud(L.t('level'), '6'), findsOneWidget, reason: 'потолок — освоенное + 1');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('режим из адреса: joker; без шага — личный уровень', (tester) async {
      GamePreset.set({'mode': 'joker'});
      await openAtLevel(tester, 4);
      expect(tester.widget<Text>(find.byKey(const Key('targets-mode'))).data, L.t('joker'));
      expect(hud(L.t('level'), '4'), findsOneWidget, reason: 'вне зарядки уровень — личный');
      await tester.pumpWidget(const SizedBox());
    });
  });

  test('сторож: четыре экрана теперь ЧИТАЮТ параметры (строгий признак — GamePreset.x(\'p\'))', () {
    const want = {
      'stroop': ['mode', 'trials'],
      'stroop_emotional': ['trials'],
      'prl': ['diff'],
      'targets': ['level', 'mode'],
    };
    for (final e in want.entries) {
      final text = [
        for (final f in Directory('lib/games/${e.key}').listSync().whereType<File>())
          if (f.path.endsWith('.dart')) f.readAsStringSync(),
      ].join();
      for (final p in e.value) {
        expect(RegExp("GamePreset\\.(num|str|flag)\\('$p'").hasMatch(text), isTrue, reason: '${e.key}: $p не читается');
      }
    }
  });
}
