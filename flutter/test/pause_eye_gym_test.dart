// «Гимнастика для глаз», слитая в «Паузу»: тот же экран в режиме глаз, НАЖАТИЯМИ.
//
// Меряется то, ради чего слияние делалось осторожно: партия пишется под ПРЕЖНИМ
// `eye_gym` с полями веба, уровень — по ключам веба и растёт и в шаге зарядки (так
// в вебе: провалить гимнастику нельзя), свободная игра уровень не пишет и не трогает,
// переигровка пройденного уровня прогресс не сбивает, пауза шапки стоит.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/eye_gym.dart';
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

  Future<void> boot(Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    state = await SharedState.open();
  }

  setUp(() async {
    await boot({});
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
      home: PauseScreen(state: state, flavor: PauseFlavor.eyeGym, engine: engine, copy: copy, clock: () => now),
    ));
    await tester.pump();
    await tester.pump();
  }

  Future<void> at(WidgetTester tester, int ms) async {
    now = ms;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
  }

  int total(List<EyeStep> steps) => steps.fold(0, (a, s) => a + s.dur);

  testWidgets('🔴 уровень 1: полный круг, партия под eye_gym как в вебе, уровень → 2', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-eye')), findsOneWidget);
    final steps = eyeSteps('full', eyeGymLevel(1).scale);
    final sec = total(steps);
    await at(tester, (sec - 1) * 1000);
    expect(reports, isEmpty);
    await at(tester, sec * 1000);
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    final r = reports.single;
    expect(r['game_type'], 'eye_gym', reason: 'история глаз живых игроков не должна оборваться');
    expect(r['score'], sec);
    expect(r['time_seconds'], sec);
    expect(r['difficulty'], '3min');
    expect(r['mode'], '11steps');
    expect(r['details'], {'duration_sec': sec, 'steps': 11, 'level': 1});
    expect(state.get('psygames_eye_gym_level_nzt48'), '2');
    expect(state.get('psygames_eye_gym_best_nzt48'), '2');
  });

  testWidgets('🔴 шаг зарядки wu=1 на пятом уровне: стартует сам и поднимает уровень, как в вебе', (tester) async {
    await boot({'flutter.psygames_eye_gym_level_nzt48': '5', 'flutter.psygames_eye_gym_best_nzt48': '5'});
    GamePreset.set({'wu': '1'});
    await open(tester);
    expect(find.byKey(const Key('pause-eye')), findsOneWidget, reason: 'пресет стартует без настройки');
    await at(tester, total(eyeSteps('full', eyeGymLevel(5).scale)) * 1000);
    expect(reports.single['details']['level'], 5);
    expect(state.get('psygames_eye_gym_level_nzt48'), '6');
  });

  testWidgets('🔴 свободно: слежение, 5 мин, быстро — уровень в историю не пишется и не двигается', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-eye-road-false')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-eye-mode-pursuit')));
    await tester.tap(find.byKey(const Key('pause-eye-scale-1.7')));
    await tester.tap(find.byKey(const Key('pause-eye-speed-1.4')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    final steps = eyeSteps('pursuit', 1.7);
    await at(tester, total(steps) * 1000);
    final r = reports.single;
    expect(r['mode'], '${steps.length}steps');
    expect(r['difficulty'], '5min');
    expect((r['details'] as Map).containsKey('level'), isFalse,
        reason: 'свободная партия на медленных настройках занижала бы уровень при восстановлении');
    expect(state.get('psygames_eye_gym_level_nzt48'), isNull);
  });

  testWidgets('🔴 переиграть третий при лучшем десятом — прогресс не сбит', (tester) async {
    await boot({'flutter.psygames_eye_gym_level_nzt48': '10', 'flutter.psygames_eye_gym_best_nzt48': '10'});
    await open(tester);
    await tester.ensureVisible(find.byKey(const Key('pause-eye-level-3')));
    await tester.tap(find.byKey(const Key('pause-eye-level-3')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, total(eyeSteps('full', eyeGymLevel(3).scale)) * 1000);
    expect(reports.single['details']['level'], 3);
    expect(state.get('psygames_eye_gym_level_nzt48'), '10');
  });

  testWidgets('отдых: пальминг — тёмное поле с ладонями, а не точка', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-eye-road-false')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-eye-mode-relax')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 1000);
    expect(find.byKey(const Key('pause-eye-palming')), findsOneWidget);
    expect(find.byKey(const Key('pause-eye-dot')), findsNothing);
  });

  testWidgets('🔴 пауза шапки каркаса останавливает подход', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 5000);
    await tester.tap(find.byIcon(Icons.pause).first);
    await tester.pumpAndSettle();
    await at(tester, 65000);
    await tester.tap(find.text('exitConfirmStay'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    now = 66000;
    await tester.pump(const Duration(milliseconds: 16));
    // Счётчик «осталось» с 01.10.2026 живёт в меню паузы, а не над полем (поле во весь
    // экран, задача a72e77a1) — поэтому мерим само время подхода.
    final dynamic st = tester.state(find.byType(PauseScreen));
    expect(st.debugEyeElapsed as double, closeTo(6, .1), reason: '5 с до паузы + 1 с после; минута за экраном паузы не в счёт');
  });
}
