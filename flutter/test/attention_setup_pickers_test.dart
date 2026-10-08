import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/prl/screen.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
import 'package:psygames_flutter/games/targets/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ВЫБОР РЕЖИМА НА НАСТРОЙКЕ, КАК У ВЕБА (задача 257bcf1b).
///
/// У веба на настройке есть выбор правила Струпа (цвет / слово), режима PRL (уровни /
/// свободно со сложностью) и режима «Мишеней» (поле / джокер); у натива режим жил только в
/// конструкторе — в личной игре его было не сменить. Экраны открыты как в `HybridApp.native`.
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

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<void> tapChip(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.tap(find.byKey(Key(key)));
    await settle(tester);
  }

  bool selected(WidgetTester tester, String key) => tester.widget<ChoiceChip>(find.byKey(Key(key))).selected;

  testWidgets('🔴 Струп: «По смыслу слова» — правило партии сменилось, уровень тот же', (tester) async {
    await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state)));
    await settle(tester);
    expect(selected(tester, 'stroop-mode-ink'), isTrue, reason: 'по умолчанию — цвет чернил, как у веба');
    expect(find.text(L.t('stroopHintInk')), findsOneWidget);
    await tapChip(tester, 'stroop-mode-word');
    expect(selected(tester, 'stroop-mode-word'), isTrue);
    expect(find.text(L.t('stroopHintWord')), findsOneWidget, reason: 'подсказка правила не сменилась');
    expect(find.text('${L.t('level')} 1'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('«Мишени»: «Джокер» выбран и держится после «Ещё раз»', (tester) async {
    await tester.pumpWidget(MaterialApp(home: TargetsScreen(state: state, rnd: Random(1))));
    await settle(tester);
    expect(selected(tester, 'targets-mode-field'), isTrue);
    await tapChip(tester, 'targets-mode-joker');
    expect(selected(tester, 'targets-mode-joker'), isTrue, reason: 'выбор не сменил режим');
    expect(selected(tester, 'targets-mode-field'), isFalse);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 PRL: «Свободно» + «Easy» — классика 40 проб без уровня; партия пишется с метками веба', (tester) async {
    await tester.pumpWidget(MaterialApp(home: PrlScreen(state: state, rnd: Random(9))));
    await settle(tester);
    expect(find.byKey(const Key('prl-diff-easy')), findsNothing, reason: 'сложность видна только у свободной');
    await tapChip(tester, 'prl-mode-free');
    await tapChip(tester, 'prl-diff-easy');
    expect(tester.widget<Text>(find.byKey(const Key('prl-params'))).data, contains('40'),
        reason: 'параметры настройки — не классики easy');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    for (var i = 0; i < 40; i++) {
      await tester.tap(find.byKey(const Key('prl-choice-a')));
      await tester.pump(const Duration(milliseconds: prlFeedbackMs + 50));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(sent, hasLength(1), reason: 'партия свободной классики не записана');
    expect(sent.single['difficulty'], 'easy');
    expect(sent.single['mode'], '40t-90%', reason: 'метка классики не та, по которой «Оценка» узнаёт шаг');
    expect(state.get('${SharedState.prefix}prl_level_nzt48'), isNull, reason: 'классика двинула лестницу');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('PRL: в шаге зарядки выбора нет — режим задаёт адрес', (tester) async {
    GamePreset.set({'wu': '1', 'diff': 'hard', 'auto': '0'});
    await tester.pumpWidget(MaterialApp(home: PrlScreen(state: state, rnd: Random(2))));
    await settle(tester);
    expect(find.byKey(const Key('prl-mode-free')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  group('настройка с выбором на малых экранах', () {
    final screens = <String, Widget Function(SharedState)>{
      'stroop': (s) => StroopScreen(state: s),
      'prl': (s) => PrlScreen(state: s),
      'targets': (s) => TargetsScreen(state: s),
    };
    for (final e in screens.entries) {
      for (final lang in ['en', 'de', 'hi']) {
        for (final size in const [Size(320, 568), Size(390, 844)]) {
          testWidgets('${e.key} $lang ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
            await L.load(lang);
            tester.view.physicalSize = size * 3;
            tester.view.devicePixelRatio = 3;
            addTearDown(tester.view.reset);
            await tester.pumpWidget(MaterialApp(home: e.value(state)));
            await settle(tester);
            final start = tester.getRect(find.text(L.t('start')));
            expect(start.bottom, lessThanOrEqualTo(size.height), reason: '«Начать» ушла за край');
            for (final chip in find.byType(ChoiceChip).evaluate()) {
              final r = tester.getRect(find.byWidget(chip.widget));
              expect(r.right <= size.width && r.left >= 0, isTrue, reason: 'плашка за краем: $r');
            }
          });
        }
      }
    }
  });
}
