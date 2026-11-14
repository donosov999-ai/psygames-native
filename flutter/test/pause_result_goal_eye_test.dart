// Итог практики возвращает то, что веб показывал в `LevelCleared` (задача b9517e77, остаток):
// «День n из m» цели-серии и «передышку для глаз» на каждой десятой практике подряд.
//
// Цель и журнал дней лежат в тех же ключах, что у веба (`psygames_streak_goal_<профиль>`,
// `psygames_earn_v1[<профиль>].days`); строка — только пока цель не достигнута (`0 < n < m`).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/breath_cues.dart';
import 'package:psygames_flutter/games/pause/pause_extras.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SilentBreath implements BreathSound {
  @override
  Future<void> play(BreathCue cue) async {}

  @override
  Future<void> dispose() async {}
}

void main() {
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  Map<String, String> dict(String l) =>
      (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>();
  var now = 0;

  setUp(() {
    now = 0;
    GamePreset.clear();
    EyeRestTracker.reset();
    L.useForTest('ru', dict('ru'));
    SessionReport.sink = (_) async {};
  });

  tearDown(() {
    GamePreset.clear();
    EyeRestTracker.reset();
    SessionReport.sink = null;
  });

  /// Квадрат на 6 циклов от начала до итога, со своим журналом и целью.
  Future<void> finishBreath(WidgetTester tester, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    final state = await SharedState.open();
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
        breathSound: _SilentBreath(),
        today: () => DateTime(2026, 11, 12),
      ),
    ));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    for (final ms in [3000, 3000 + 96000]) {
      now = ms;
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pump();
    }
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
  }

  Map<String, Object> goalPrefs({required int days, required List<String> marks}) => {
        'flutter.psygames_streak_goal_nzt48': jsonEncode({'days': days, 'startedAt': '2026-11-01'}),
        'flutter.psygames_earn_v1': jsonEncode({
          'nzt48': {'days': marks},
        }),
      };

  testWidgets('цель 7 дней, серия 2 до вчера: «День 2 из 7»', (tester) async {
    await finishBreath(tester, goalPrefs(days: 7, marks: ['2026-11-10', '2026-11-11']));
    expect(find.text('День 2 из 7'), findsOneWidget);
  });

  testWidgets('цели нет — строки нет', (tester) async {
    await finishBreath(tester, {});
    expect(find.textContaining('День '), findsNothing);
  });

  testWidgets('цель достигнута (серия ≥ дней) — итог практики её не объявляет', (tester) async {
    await finishBreath(tester, goalPrefs(days: 3, marks: ['2026-11-9', '2026-11-10', '2026-11-11']));
    expect(find.textContaining('День '), findsNothing);
  });

  testWidgets('битая запись цели не ломает итог', (tester) async {
    await finishBreath(tester, {'flutter.psygames_streak_goal_nzt48': '{не json'});
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    expect(find.textContaining('День '), findsNothing);
  });

  testWidgets('первая практика — без передышки; десятая подряд — с передышкой для глаз', (tester) async {
    await finishBreath(tester, {});
    expect(find.text(L.t('eyeBreakTitle')), findsNothing, reason: 'первая практика');
  });

  testWidgets('десятая подряд практика: передышка для глаз (заголовок и совет)', (tester) async {
    for (var i = 0; i < 9; i++) {
      EyeRestTracker.tick();
    }
    await finishBreath(tester, {});
    expect(find.text(L.t('eyeBreakTitle')), findsOneWidget);
    expect(find.text(L.t('eyeBreakHint')), findsOneWidget);
  });

  test('счётчик передышки: каждая десятая, затем снова', () {
    final hits = [for (var i = 1; i <= 21; i++) EyeRestTracker.tick()];
    expect([for (var i = 0; i < hits.length; i++) if (hits[i]) i + 1], [10, 20]);
  });
}
