import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_result.dart';
import 'package:psygames_flutter/shell/reward_effects.dart';

/// 🔴 АВТОПЕРЕХОД ИТОГА УРОВНЯ (задача e90a53d5). Денис 13.11: «должна же во всех играх автопереход быть».
/// Пройдено — следующая партия сама через 1,5 с, провал — «Ещё раз» сам через 2,5 с, тап — сразу;
/// «Настройки» останавливают отсчёт; в зарядке автоперехода нет (шаг ведёт мост зарядки).
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  setUp(() {
    LevelResult.autoAdvance = true;
    LevelResult.effects = true;
    GamePreset.clear();
  });
  tearDown(() {
    LevelResult.autoAdvance = false;
    LevelResult.effects = false;
    GamePreset.clear();
  });

  Future<List<String>> pump(
    WidgetTester t, {
    required bool passed,
    bool settings = true,
    bool still = false,
  }) async {
    final log = <String>[];
    await t.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: still),
          child: child!,
        ),
        home: Scaffold(
          body: LevelResult(
            passed: passed,
            level: 3,
            score: '9 / 10',
            onNext: () => log.add('next'),
            onSettings: settings ? () => log.add('settings') : null,
          ),
        ),
      ),
    );
    return log;
  }

  testWidgets(
    '🔴 пройдено: заголовок с уровнем, через 1,5 с — следующая партия, один раз',
    (t) async {
      final log = await pump(t, passed: true);
      expect(
        find.text(L.t('levelDone').replaceAll('{n}', '3')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('level-result-countdown')), findsOneWidget);
      await t.pump(const Duration(milliseconds: 1400));
      expect(log, isEmpty);
      await t.pump(const Duration(milliseconds: 200));
      expect(log, ['next']);
      await t.pump(const Duration(seconds: 3));
      await t.tap(find.byKey(const Key('level-result-next')));
      expect(log, ['next'], reason: 'уход с итога — один');
    },
  );

  testWidgets('🔴 провал: «Ещё раз» сам через 2,5 с, не раньше', (t) async {
    final log = await pump(t, passed: false);
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    await t.pump(const Duration(milliseconds: 2400));
    expect(log, isEmpty);
    await t.pump(const Duration(milliseconds: 200));
    expect(log, ['next']);
  });

  testWidgets('тап по итогу — сразу, не дожидаясь отсчёта', (t) async {
    final log = await pump(t, passed: true);
    await t.tap(find.byKey(const Key('level-result-score')));
    expect(log, ['next']);
    await t.pump(const Duration(seconds: 3));
    expect(log, ['next']);
  });

  testWidgets('«Настройки» уводят к настройке и останавливают автопереход', (
    t,
  ) async {
    final log = await pump(t, passed: true);
    await t.tap(find.byKey(const Key('level-result-settings')));
    await t.pump(const Duration(seconds: 3));
    expect(log, ['settings']);
  });

  testWidgets('в зарядке автоперехода нет — шаг ведёт мост зарядки', (t) async {
    GamePreset.set({'wu': '1'});
    final log = await pump(t, passed: true);
    expect(find.byKey(const Key('level-result-countdown')), findsNothing);
    await t.pump(const Duration(seconds: 4));
    expect(log, isEmpty);
  });

  testWidgets(
    'a counted win shows the shared trail, opening the map stops auto-next',
    (t) async {
      LevelResult.effects = false;
      LevelLadder.newScreen();
      final ladder = LevelLadder(
        gameId: 'probe_trail',
        store: MemoryLevelStore(),
      );
      await t.runAsync(ladder.load);
      await t.runAsync(() => ladder.win(report: false, errors: 0));
      expect(ladder.level, 2);
      var next = 0;
      await t.pumpWidget(
        MaterialApp(
          home: GameShell(
            title: 'Game',
            playLevel: (_) async {},
            field: (_, h) => SizedBox(
              height: h,
              child: LevelResult.adapt(
                LevelOutcomeAdapter(
                  passed: true,
                  playedLevel: 1,
                  playNext: () => next++,
                ),
              ),
            ),
          ),
        ),
      );
      final open = find.byKey(const Key('level-result-open-map'));
      expect(open, findsOneWidget);
      expect(
        t.widget<Text>(find.byKey(const Key('level-result-map-current'))).data,
        '2',
      );
      await t.tap(open);
      await t.pumpAndSettle();
      expect(find.byKey(const Key('level-map')), findsOneWidget);
      await t.pump(const Duration(seconds: 3));
      expect(next, 0);
      await t.tap(find.byKey(const Key('level-map-play')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('level-result-countdown')), findsNothing);
      expect(next, 0);
      await t.tap(find.byKey(const Key('level-result-next')));
      expect(next, 1);
    },
  );

  testWidgets(
    'a report leaves metrics visible and has no victory map or timer',
    (t) async {
      var repeated = 0;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LevelResult.adapt(
              ReportOutcomeAdapter(
                title: 'Series recap',
                details: const Text('Block difference: 17'),
                action: GameResultAction(
                  label: 'Repeat series',
                  icon: Icons.replay,
                  onTap: () => repeated++,
                ),
              ),
            ),
          ),
        ),
      );
      expect(find.text('Block difference: 17'), findsOneWidget);
      expect(find.byKey(const Key('level-result-open-map')), findsNothing);
      expect(find.byKey(const Key('level-result-countdown')), findsNothing);
      await t.tap(find.text('Block difference: 17'));
      await t.pump(const Duration(seconds: 4));
      expect(repeated, 0);
      await t.tap(find.text('Repeat series'));
      await t.tap(find.text('Repeat series'));
      expect(repeated, 1);
    },
  );

  testWidgets('a provisional win waits for the ladder write before advancing', (
    t,
  ) async {
    LevelResult.effects = false;
    LevelLadder.newScreen();
    final ladder = LevelLadder(
      gameId: 'probe_pending_win',
      store: MemoryLevelStore(),
    );
    await t.runAsync(ladder.load);
    var next = 0;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LevelResult.adapt(
            LevelOutcomeAdapter(
              passed: true,
              playedLevel: 1,
              waitForWin: true,
              playNext: () => next++,
            ),
          ),
        ),
      ),
    );
    expect(
      t
          .widget<FilledButton>(find.byKey(const Key('level-result-next')))
          .onPressed,
      isNull,
    );
    await t.pump(const Duration(seconds: 4));
    expect(next, 0);
    await t.runAsync(() => ladder.win(report: false));
    await t.pump();
    expect(find.byKey(const Key('level-result-countdown')), findsOneWidget);
    await t.pump(const Duration(milliseconds: 1550));
    expect(next, 1);
  });

  testWidgets('a shell pause holds the victory countdown, then resumes once', (
    t,
  ) async {
    final log = await pump(t, passed: true);
    await t.pump(const Duration(milliseconds: 500));
    final release = holdGame();
    addTearDown(release);
    await t.pump(const Duration(seconds: 3));
    expect(log, isEmpty);
    release();
    await t.pump();
    await t.pump(const Duration(milliseconds: 1100));
    expect(log, ['next']);
  });

  testWidgets(
    'unavailable next level keeps the victory and leaves settings usable',
    (t) async {
      final calls = <String>[];
      Future<void> show({required bool available}) => t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LevelResult(
              passed: true,
              level: 3,
              score: '10 / 10',
              onNext: available ? () => calls.add('next') : null,
              nextUnavailable: available
                  ? null
                  : (message: 'No material', detail: '21.11'),
              onSettings: () => calls.add('settings'),
            ),
          ),
        ),
      );
      await show(available: true);
      await t.tap(find.byKey(const Key('level-result-next')));
      expect(calls, ['next']);
      // The game rechecked its queue on tap and found it empty.
      await show(available: false);
      expect(
        find.text(L.t('levelDone').replaceAll('{n}', '3')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('level-result-next')), findsNothing);
      expect(find.byKey(const Key('level-result-countdown')), findsNothing);
      expect(find.text('No material'), findsOneWidget);
      expect(find.text('21.11'), findsOneWidget);
      await t.tap(find.byKey(const Key('level-result-score')));
      await t.pump(const Duration(seconds: 3));
      expect(calls, ['next']);
      await t.tap(find.byKey(const Key('level-result-settings')));
      expect(calls, ['next', 'settings']);
    },
  );

  testWidgets(
    'Aurora: unavailable next level fits a narrow screen with large text',
    (t) async {
      LevelResult.effects = false;
      await t.binding.setSurfaceSize(const Size(320, 568));
      addTearDown(() => t.binding.setSurfaceSize(null));
      var settings = 0;
      await t.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(1.5)),
            child: AuroraFrame(theme: Theme.of(context), child: child!),
          ),
          home: Scaffold(
            body: LevelResult(
              passed: true,
              level: 3,
              score: '10 / 10',
              nextUnavailable: (message: L.t('srsAllDone'), detail: '21.11'),
              onSettings: () => settings++,
            ),
          ),
        ),
      );
      expect(find.byKey(const Key('game-result')), findsOneWidget);
      expect(find.byKey(const Key('level-result-next')), findsNothing);
      expect(find.byKey(const Key('level-result-countdown')), findsNothing);
      final button = find.byKey(const Key('level-result-settings'));
      await t.ensureVisible(button);
      await t.pumpAndSettle();
      await t.tap(button);
      expect(settings, 1);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    '🔴 анимация победы: звезда и искры у общего итога, у провала — нет',
    (t) async {
      await pump(t, passed: true);
      expect(find.byKey(const Key('level-result-star')), findsOneWidget);
      expect(find.byType(VictorySparks), findsOneWidget);
      await t.pump(const Duration(milliseconds: 1200));
      await pump(t, passed: false);
      await t.pump();
      expect(find.byType(VictorySparks), findsNothing);
    },
  );

  testWidgets(
    '«Уменьшить движение» — без анимации: звезда стоит, искр нет, автопереход тот же',
    (t) async {
      final log = await pump(t, passed: true, still: true);
      expect(find.byKey(const ValueKey('reward-lottie')), findsNothing);
      expect(
        find.byWidgetPredicate((w) => w is GameWidget),
        findsNothing,
        reason: 'искр нет',
      );
      await t.pump(const Duration(milliseconds: 1600));
      expect(log, ['next']);
    },
  );

  testWidgets(
    '🔴 звёзды дорисовываются, когда игра засчитала победу ПОСЛЕ открытия итога, и берутся у выигравшей лестницы, а не у последней загруженной («Шульте»)',
    (t) async {
      LevelLadder.newScreen();
      final ladder = LevelLadder(
        gameId: 'probe_stars',
        store: MemoryLevelStore(),
      );
      await t.runAsync(ladder.load);
      // Вторая лестница на том же экране загружена ПОСЛЕ (как «Серия» у «Шульте») — current теперь она.
      await t.runAsync(
        LevelLadder(gameId: 'probe_series', store: MemoryLevelStore()).load,
      );
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LevelResult(passed: true, level: 1, onNext: () {}),
          ),
        ),
      );
      await t.pump();
      expect(
        find.byKey(const Key('level-result-stars')),
        findsNothing,
        reason: 'победа ещё не засчитана',
      );
      await t.runAsync(() => ladder.win(errors: 0, report: false));
      await t.pump();
      expect(
        find.text('★★★'),
        findsOneWidget,
        reason: '0 ошибок — три звезды этой партии',
      );
      LevelResult.autoAdvance = false;
    },
  );
}
