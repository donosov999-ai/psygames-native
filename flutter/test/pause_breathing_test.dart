// «Дыхание», слитое в «Паузу»: тот же экран в режиме дыхания, НАЖАТИЯМИ.
//
// Меряется то, ради чего слияние делалось осторожно: партия пишется под ПРЕЖНИМ
// `breathing` с полями веба (история живых игроков не рвётся), счётчик подходов и
// серия дней идут по тем же ключам, шаг зарядки `?tech=` открывает свою технику,
// Вим Хоф остаётся раундами с задержкой, которую держит человек, а не таймер.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/breathing.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
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
    await tester.pumpWidget(MaterialApp(
      home: PauseScreen(
        state: state,
        flavor: PauseFlavor.breathing,
        engine: engine,
        copy: copy,
        clock: () => now,
        today: () => DateTime(2026, 9, 30),
      ),
    ));
    await tester.pump();
    await tester.pump();
  }

  Future<void> at(WidgetTester tester, int ms) async {
    now = ms;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
  }

  testWidgets('🔴 квадрат, 6 циклов: отсчёт 3 с, 96 с дыхания, партия под breathing как в вебе', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-lead')), findsOneWidget, reason: 'первый вдох — после отсчёта');
    await at(tester, 3000);
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);
    await at(tester, 3000 + 95000);
    expect(reports, isEmpty, reason: 'за секунду до конца партии ещё нет');
    await at(tester, 3000 + 96000);
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    final r = reports.single;
    expect(r['game_type'], 'breathing', reason: 'история дыхания живых игроков не должна оборваться');
    expect(r['score'], 96);
    expect(r['time_seconds'], 96);
    expect(r['difficulty'], 'box');
    expect(r['mode'], '6cyc');
    expect(r['details'], {'technique': 'box', 'format': 'cycles', 'dur': 96, 'level': 1});
    expect(state.get('psygames_breathing_level_nzt48'), '2', reason: 'счётчик подходов — тот же ключ, что у веба');
    expect(jsonDecode(state.get('psygames_breathing_streak_nzt48')!), {'streak': 1, 'total': 1, 'last': '2026-09-30'});
  });

  testWidgets('🔴 шаг зарядки ?tech=sigh&wu=1: сразу вздох, 6 циклов по 9 с', (tester) async {
    GamePreset.set({'tech': 'sigh', 'wu': '1'});
    await open(tester);
    expect(find.byKey(const Key('pause-lead')), findsOneWidget);
    await at(tester, 3000);
    await at(tester, 3000 + 54000);
    expect(reports.single['difficulty'], 'sigh');
    expect(reports.single['time_seconds'], 54);
  });

  testWidgets('по времени: минута — и в отчёте 1min', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-breath-time')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-breath-m1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 3000);
    await at(tester, 63000);
    expect(reports.single['mode'], '1min');
    expect(reports.single['time_seconds'], 60);
  });

  testWidgets('🔴 Вим Хоф: предупреждение, три раунда, задержку заканчивает человек, пауза её не считает', (tester) async {
    GamePreset.set({'tech': 'wimhof'});
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-wim-warning')), findsOneWidget, reason: 'сначала безопасность, как в вебе');
    expect(reports, isEmpty);
    await tester.tap(find.byKey(const Key('pause-wim-agree')));
    await tester.pump();
    expect(find.byKey(const Key('pause-wim')), findsOneWidget);

    var t = 0;
    for (var round = 1; round <= WimHofRun.rounds; round++) {
      t += WimHofRun.breaths * WimHofRun.breathMs;
      await at(tester, t);
      expect(tester.widget<Text>(find.byKey(const Key('pause-wim-count'))).data, startsWith('0'),
          reason: 'раунд $round: вдохи кончились — пошла задержка');
      if (round == 1) {
        // Пауза посреди задержки: минута на паузе задержкой не считается.
        await at(tester, t + 10000);
        await tester.tap(find.byKey(const Key('pause-pause')));
        await tester.pump();
        await at(tester, t + 70000);
        await tester.tap(find.byKey(const Key('pause-resume')));
        await tester.pump();
        await at(tester, t + 75000);
        expect(tester.widget<Text>(find.byKey(const Key('pause-wim-count'))).data, startsWith('15'),
            reason: '10 с до паузы + 5 с после; 60 с паузы не в счёт');
        t += 75000;
      } else {
        t += 20000;
        await at(tester, t);
      }
      await tester.tap(find.byKey(const Key('pause-wim-box')));
      await tester.pump();
      t += WimHofRun.recoverMs;
      await at(tester, t);
    }
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    final r = reports.single;
    expect(r['game_type'], 'breathing');
    expect(r['difficulty'], 'wimhof');
    expect(r['mode'], '3rounds');
    // Время — настоящее: 3×54 с вдохов + задержки 15/20/20 с + 3×15 с, без минуты паузы.
    expect(r['time_seconds'], 3 * 54 + 15 + 20 + 20 + 3 * 15);
  });

  testWidgets('ночной шаг dim=1 — тёмный вид', (tester) async {
    GamePreset.set({'dim': '1'});
    await open(tester);
    final ctx = tester.element(find.byKey(const Key('pause-config')));
    expect(Theme.of(ctx).brightness, Brightness.dark);
  });

  test('длительность подхода: циклы × цикл программы, минуты — минуты', () {
    final box = objects(engine.program('breathing', 'box')['steps']);
    expect(breathDurationMs(steps: box, format: 'cycles', cycles: 4, minutes: 3), 64000);
    expect(breathDurationMs(steps: box, format: 'time', cycles: 4, minutes: 3), 180000);
    for (final t in breathTechs.where((t) => t.web != 'wimhof')) {
      final steps = objects(engine.program('breathing', t.program)['steps']);
      expect(breathDurationMs(steps: steps, format: 'cycles', cycles: 4, minutes: 1), greaterThanOrEqualTo(30000),
          reason: '${t.web}: 4 цикла обязаны пройти нижний предел ядра в 30 с');
    }
  });
}
