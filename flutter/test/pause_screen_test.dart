// «Пауза»: практика НАЖАТИЯМИ, с подставными часами.
//
// Меряется то, на чём стоят статистика и зарядка: что и когда уходит в
// `saveSession` (через `SessionReport`), что пауза — и своя, и кнопкой шапки
// каркаса — останавливает время, что выход посреди практики НЕ пишет партию, что
// шаг зарядки с `?set=` открывается сразу в нужном наборе.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/practices.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final engine = Practices(jsonDecode(File('assets/pause/practices.json').readAsStringSync()) as Json);
  late SharedState state;
  late List<Map<String, dynamic>> reports;
  var now = 0;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    reports = [];
    now = 0;
    GamePreset.clear();
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: PauseScreen(state: state, engine: engine, clock: () => now)));
    await tester.pump();
  }

  String hudTime(WidgetTester tester) {
    final texts = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '').toList();
    return texts.firstWhere((t) => RegExp(r'^\d+:\d\d / \d+:\d\d$').hasMatch(t), orElse: () => '');
  }

  testWidgets('🔴 дыхание на минуту: пауза стоит, конец пишет партию так же, как веб', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('pause-config')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pause-set-breathing')));
    await tester.ensureVisible(find.byKey(const Key('pause-minutes-1')));
    await tester.tap(find.byKey(const Key('pause-minutes-1')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);

    now = 30000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), '0:30 / 1:00');

    await tester.tap(find.byKey(const Key('pause-pause')));
    await tester.pump();
    now = 50000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), '0:30 / 1:00', reason: 'на паузе время практики стоит');

    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pump();
    expect(reports, isEmpty, reason: 'до конца практики партия не пишется');
    now = 90000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();

    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    expect(reports, hasLength(1));
    final r = reports.single;
    expect(r['game_type'], 'pause');
    expect(r['score'], 1, reason: 'score — минуты, как в вебе');
    expect(r['time_seconds'], 60);
    expect(r['mode'], 'solo');
    expect(r['difficulty'], 'desk-visible', reason: 'обстановка — в difficulty, как в вебе');
    expect(r['details']['sets'], ['breathing']);
    expect(jsonDecode(state.get('psygames_pause_solo_nzt48')!), {'breathing': 1});
  });

  testWidgets('🔴 кнопка паузы в шапке каркаса останавливает практику', (tester) async {
    await open(tester);
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    now = 10000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), startsWith('0:10 /'));

    await tester.tap(find.byIcon(Icons.pause).first);
    await tester.pumpAndSettle();
    now = 70000;
    await tester.pump(const Duration(milliseconds: 16));
    // «Продолжить» на экране паузы каркаса; в пробе словаря нет — подпись равна ключу.
    await tester.tap(find.text('exitConfirmStay'));
    // Практика снова идёт — кадры не прекращаются, pumpAndSettle здесь не дождётся тишины.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), startsWith('0:10 /'),
        reason: 'минута за экраном паузы не должна засчитаться практикой');
  });

  testWidgets('🔴 выход посреди практики партию НЕ пишет', (tester) async {
    await open(tester);
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    now = 20000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Выйти'));
    await tester.pumpAndSettle();
    now = 999999;
    await tester.pump(const Duration(milliseconds: 16));
    expect(reports, isEmpty);
  });

  testWidgets('🔴 шаг зарядки ?set=eye-gym&wu=1 стартует сразу, в глазах, на полторы минуты', (tester) async {
    GamePreset.set({'set': 'eye-gym', 'wu': '1'});
    await open(tester);
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);
    expect(hudTime(tester), '0:00 / 1:30');
    now = 91000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
    expect(reports.single['details']['sets'], ['eye-gym']);
  });

  testWidgets('обстановка отсекает наборы, которые в ней не сделать', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('pause-set-postures')), findsNothing, reason: 'за столом позы не предлагаем');
    await tester.tap(find.byKey(const Key('pause-context-home')));
    await tester.pump();
    expect(find.byKey(const Key('pause-set-postures')), findsOneWidget);
  });

  testWidgets('параллельно: два набора, советы ядра старт не держат', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-mode-parallel')));
    await tester.pump();
    for (final id in ['breathing', 'eye-gym']) {
      final chip = find.byKey(Key('pause-set-$id'));
      if (!tester.widget<FilterChip>(chip).selected) await tester.tap(chip);
      await tester.pump();
    }
    await tester.ensureVisible(find.byKey(const Key('pause-minutes-1')));
    await tester.tap(find.byKey(const Key('pause-minutes-1')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget,
        reason: 'без трёх одиночных прохождений ядро СОВЕТУЕТ, а не запрещает');
    now = 61000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
    expect(reports.single['mode'], 'parallel');
    expect((reports.single['details']['sets'] as List).toSet(), {'breathing', 'eye-gym'});
  });
}
