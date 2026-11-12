// 🔴 «ДЫХАНИЕ» И «ГИМНАСТИКА ДЛЯ ГЛАЗ» — НА ОБЩЕЙ ЛЕСТНИЦЕ (задача c345a8f1, правило Дениса 12.11:
// «все функции — у всех 131 игр»).
//
// В вебе у обеих была карта уровней; на Flutter свои счётчики шли мимо LevelLadder — в паузе не было
// ни «Карты уровней», ни «Уровень проще / сложнее». Меряется: пункты есть, накопленный счётчик
// читается по прежнему ключу, «проще» не опускает личный уровень (c3f27cd6).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final engine = Practices(
    jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json,
  );
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  late SharedState state;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> open(WidgetTester t, PauseFlavor flavor, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    state = await SharedState.open();
    GamePreset.clear();
    SessionReport.sink = (_) async {};
    LevelLadder.newScreen(); // как оболочка при открытии игры
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: PauseScreen(
          state: state,
          flavor: flavor,
          engine: engine,
          copy: copy,
          clock: () => 0,
          today: () => DateTime(2026, 11, 12),
        ),
      ),
    );
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await t.pump();
    await t.pump();
  }

  Future<void> pause(WidgetTester t) async {
    await t.tap(find.byTooltip(L.t('teachPause')));
    await t.pump();
    await t.pump(const Duration(seconds: 1));
  }

  for (final (flavor, game, name) in const [
    (PauseFlavor.breathing, 'breathing', 'Дыхание'),
    (PauseFlavor.eyeGym, 'eye_gym', 'Гимнастика для глаз'),
  ]) {
    testWidgets('🔴 $name: в паузе — карта уровней и «проще / сложнее» каркаса, накопленный уровень на месте', (
      t,
    ) async {
      await open(t, flavor, {
        'psygames_active_profile': 'nzt48',
        SharedState.levelKey(game, 'nzt48'): '4',
        'psygames_${game}_best_nzt48': '4',
      });
      expect(LevelLadder.current?.level, 4, reason: 'прежний счётчик читается как достигнутый уровень');
      await pause(t);
      expect(find.text(L.t('levelMap')), findsOneWidget, reason: 'общая карта уровней');
      expect(find.text(L.t('pauseEasier')), findsOneWidget, reason: '«Уровень проще» каркаса');
      await t.tap(find.text(L.t('pauseEasier')));
      await t.pump();
      await t.pump(const Duration(seconds: 1));
      expect(LevelLadder.current?.level, 3, reason: 'подход — на уровне проще');
      expect(state.get(SharedState.levelKey(game, 'nzt48')), '4', reason: 'личный уровень не опущен (c3f27cd6)');
    });
  }

  testWidgets('🔴 «Глаза и дыхание»: уровень = пройденные сеансы (Денис 12.11), старт — из уже сыгранных', (t) async {
    await open(t, PauseFlavor.hub, {
      'psygames_active_profile': 'nzt48',
      'psygames_sessions': jsonEncode([
        for (var i = 0; i < 3; i++)
          {
            'id': 's$i',
            'game_type': 'pause',
            'score': 1,
            'time_seconds': 60,
            'timestamp': '2026-11-0${i + 1}T10:00:00.000Z',
          },
        {'id': 'x', 'game_type': 'breathing', 'score': 1, 'time_seconds': 60, 'timestamp': '2026-11-05T10:00:00.000Z'},
      ]),
    });
    expect(LevelLadder.current?.level, 4, reason: 'три сыгранных сеанса «Паузы» — идёт четвёртый');
    expect(state.get(SharedState.levelKey('pause', 'nzt48')), '4', reason: 'стартовый уровень записан, не обнулён');
    await pause(t);
    expect(find.text(L.t('levelMap')), findsOneWidget);
    expect(find.text(L.t('pauseEasier')), findsOneWidget);
  });
}
