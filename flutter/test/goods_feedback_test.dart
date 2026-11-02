import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/feedback.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/games/goods_sort/solver.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_effect_audio.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/reward_effects.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RecordingSound implements GameSoundBackend {
  final sounds = <GameSound>[];
  final volumes = <double>[];
  Completer<void>? gate;
  int stops = 0, disposals = 0;
  @override
  Future<void> play(
    GameSound sound,
    double volume,
    bool Function() current,
  ) async {
    await gate?.future;
    if (current()) {
      sounds.add(sound);
      volumes.add(volume);
    }
  }

  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Future<void> dispose() async {
    disposals++;
  }
}

void main() {
  const capture = bool.fromEnvironment('CAPTURE_GOODS');
  late SharedState state;
  late RecordingSound sound;
  late GoodsFeedbackOptions options;
  final vibration = <String>[];
  final boundary = GlobalKey();

  setUpAll(() async {
    await L.load('en');
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    if (capture && Platform.isMacOS) {
      await (FontLoader('GoodsReview')..addFont(
            Future.value(
              File('/System/Library/Fonts/Supplemental/Arial.ttf')
                  .readAsBytesSync()
                  .buffer
                  .asByteData(),
            ),
          ))
          .load();
    }
  });
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      uiTemplateKey: 'aurora_v1',
      'language': 'en',
    });
    state = await SharedState.open();
    await AppLook.load(state);
    resetGameClock();
    GamePreset.clear();
    vibration.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == 'HapticFeedback.vibrate')
            vibration.add('${call.arguments}');
          return null;
        });
    sound = RecordingSound();
    options = GoodsFeedbackOptions(
      motion: true,
      rewards: true,
      haptics: true,
      engine: GoodsAudioEngine.flame,
      backendFactory: (e) => e == GoodsAudioEngine.off ? null : sound,
    );
    SessionReport.sink = (_) async {};
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
    resetGameClock();
    options.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  GoodsField field(WidgetTester t) =>
      t.widget<GoodsField>(find.byType(GoodsField));

  Future<void> boot(
    WidgetTester t, {
    double width = 390,
    double scale = 1,
    bool reduce = false,
    bool accessible = false,
    bool light = false,
    bool rtl = false,
  }) async {
    t.view.physicalSize = Size(width * 2, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    var theme = appShellTheme(
      state,
      brightness: light ? Brightness.light : Brightness.dark,
    );
    if (capture && Platform.isMacOS)
      theme = theme.copyWith(
        textTheme: theme.textTheme.apply(fontFamily: 'GoodsReview'),
      );
    await t.runAsync(() async {
      await t.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            theme: theme,
            debugShowCheckedModeBanner: false,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                disableAnimations: reduce,
                accessibleNavigation: accessible,
                textScaler: TextScaler.linear(scale),
              ),
              child: Directionality(
                textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
                child: child!,
              ),
            ),
            home: GoodsSortScreen(state: state, feedback: options),
          ),
        ),
      );
      for (var i = 0; i < 40; i++) {
        await t.pump(const Duration(milliseconds: 40));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        if (find.byType(GoodsField).evaluate().isNotEmpty) break;
      }
    });
    await t.pumpAndSettle();
    if (find.text(L.t('ctaGotIt')).evaluate().isNotEmpty) {
      await t.tap(find.text(L.t('ctaGotIt')));
      await t.pumpAndSettle();
    }
    expect(find.byType(GoodsField), findsOneWidget);
  }

  Future<void> move(WidgetTester t, int from, int index, int to) async {
    await t.tap(find.byKey(ValueKey('item-$from-$index')));
    await t.pump();
    await t.tap(find.byKey(ValueKey('niche-$to')));
    await t.pump();
    await t.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 1)),
    );
  }

  Future<void> land(WidgetTester t) async {
    // Tick animation start, flight and settling, not one skipped initial frame.
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
    await t.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 1)),
    );
    await t.pump();
  }

  Future<void> snapshot(WidgetTester t, String name) async {
    if (!capture) return;
    await t.runAsync(() async {
      final render =
          boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await render.toImage(pixelRatio: 2);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final file = File('test/design/preview/goods-feedback/$name.png');
      file.parent.createSync(recursive: true);
      file.writeAsBytesSync(png!.buffer.asUint8List());
      image.dispose();
    });
  }

  testWidgets(
    'real move lands at the measured arriving item, not niche centre',
    (t) async {
      await boot(t);
      await move(t, 5, 1, 1);
      final motion = field(t).motion!;
      expect(motion.busy, isTrue);
      final root = t.getTopLeft(find.byKey(motion.root));
      final target = t
          .getRect(find.byKey(const ValueKey('item-1-0')))
          .shift(-root);
      expect(
        (motion.flight!.to.topLeft - target.topLeft).distance,
        lessThan(.001),
      );
      expect(motion.flight!.to.width, closeTo(target.width, .001));
      expect(motion.flight!.to.height, closeTo(target.height, .001));
      expect(vibration, isEmpty);
      await move(t, 0, 1, 4);
      expect(field(t).board.cells[4], isEmpty);
      await land(t);
      expect(motion.busy, isFalse);
      expect(sound.sounds, [
        GameSound.selection,
        GameSound.transfer,
        GameSound.landing,
      ]);
      expect(vibration, ['HapticFeedbackType.selectionClick']);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'triple sounds once after landing; master sound and haptic switches win',
    (t) async {
      await state.set('psygames_sound_enabled', 'false');
      await state.set('psygames_haptic_enabled', 'false');
      await boot(t);
      await move(t, 5, 1, 3);
      await land(t);
      expect(field(t).board.cells[3], isEmpty);
      expect(sound.sounds, isEmpty);
      expect(vibration, isEmpty);
      await t.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
      await t.pump();
      await state.set('psygames_sound_enabled', 'true');
      await state.set('psygames_haptic_enabled', 'true');
      await state.set('psygames_volume', '20');
      await move(t, 5, 1, 3);
      await land(t);
      expect(sound.sounds, [
        GameSound.selection,
        GameSound.transfer,
        GameSound.landing,
        GameSound.group,
      ]);
      expect(sound.volumes.every((v) => (v - .06).abs() < .001), isTrue);
      expect(vibration, ['HapticFeedbackType.selectionClick']);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets('Undo, hold, background and exit discard late landing effects', (
    t,
  ) async {
    await boot(t);
    await move(t, 5, 1, 1);
    await t.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
    await t.pump();
    await land(t);
    expect(sound.sounds.where((s) => s == GameSound.landing), isEmpty);
    expect(vibration, isEmpty);
    await move(t, 5, 1, 1);
    final release = holdGame();
    await t.pump();
    await land(t);
    expect(field(t).motion!.busy, isFalse);
    release();
    await move(t, 0, 1, 4);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await t.pump();
    await land(t);
    expect(vibration, isEmpty);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await t.pump();
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 2));
    expect(t.takeException(), isNull);
  });

  testWidgets(
    'engine change cancels pending sound/flight, never rolls back accepted board',
    (t) async {
      sound.gate = Completer<void>();
      await boot(t);
      await move(t, 5, 1, 1);
      options.update(engine: GoodsAudioEngine.off);
      await t.pump();
      sound.gate!.complete();
      await land(t);
      expect(field(t).board.cells[1], [37]);
      expect(field(t).motion!.busy, isFalse);
      expect(sound.sounds, isEmpty);
      expect(sound.disposals, 1);
      expect(vibration, isEmpty);
      await t.pumpWidget(const SizedBox());
    },
  );

  for (final a11y in ['motion off', 'reduce motion', 'accessible navigation']) {
    testWidgets(
      '$a11y: same accepted result, immediate landing, no animation input gate',
      (t) async {
        options.motion = a11y != 'motion off';
        await boot(
          t,
          reduce: a11y == 'reduce motion',
          accessible: a11y == 'accessible navigation',
        );
        await move(t, 5, 1, 1);
        expect(field(t).motion!.busy, isFalse);
        expect(field(t).board.cells[1], [37]);
        await t.pump();
        expect(sound.sounds, [
          GameSound.selection,
          GameSound.transfer,
          GameSound.landing,
        ]);
        expect(vibration, ['HapticFeedbackType.selectionClick']);
        await t.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'real solved level: victory only after landing, one result, Next preserves model rules',
    (t) async {
      var reports = 0;
      SessionReport.sink = (_) async {
        reports++;
      };
      await boot(t);
      final initial = field(t);
      final solution = solveStrict(GoodsPlay.start(initial.level));
      expect(solution.solvable, isTrue);
      for (final m in solution.path) {
        await move(t, m.from, field(t).board.cells[m.from].length - 1, m.to);
        expect(find.byType(VictorySparks), findsNothing);
        await land(t);
      }
      expect(find.byType(VictorySparks), findsOneWidget);
      expect(sound.sounds.where((s) => s == GameSound.victory), hasLength(1));
      expect(
        vibration.where((s) => s == 'HapticFeedbackType.mediumImpact'),
        hasLength(1),
      );
      await t.pump(const Duration(milliseconds: 1400));
      await t.pumpAndSettle();
      expect(reports, 1);
      expect(field(t).level.level, 2);
      expect(find.byType(VictorySparks), findsNothing);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets('calm practice has no SFX and no duplicate owner haptics', (
    t,
  ) async {
    GamePreset.set({'wu': '1', 'calm': '1'});
    await boot(t);
    await move(t, 5, 1, 1);
    await land(t);
    expect(sound.sounds, isEmpty);
    expect(vibration, isEmpty);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets(
    'real loss with animated moves reports once and retry resets presentation',
    (t) async {
      await state.set('psygames_goods_sort_level_nzt48', '16');
      await state.set('psygames_goods_sort_best_nzt48', '16');
      await state.set('psygames_goods_sort_set_nzt48', 'mix');
      var reports = 0;
      SessionReport.sink = (_) async {
        reports++;
      };
      await boot(t);
      expect(field(t).level.moveLimit, 26);
      for (var i = 0; i < 13; i++) {
        await move(t, 0, 2, 1);
        await land(t);
        await move(t, 1, 0, 0);
        await land(t);
      }
      expect(find.text(L.t('outOfMovesRetry')), findsOneWidget);
      expect(reports, 1);
      expect(sound.sounds.where((s) => s == GameSound.victory), isEmpty);
      expect(find.byType(VictorySparks), findsNothing);
      await t.tap(find.text(L.t('outOfMovesRetry')));
      await t.pump();
      expect(field(t).motion!.busy, isFalse);
      expect(field(t).level.level, 16);
      expect(find.text(L.t('outOfMovesRetry')), findsNothing);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets('large text and RTL keep real field and controls reachable', (
    t,
  ) async {
    await boot(t, width: 320, scale: 2, rtl: true);
    expect(t.takeException(), isNull);
    await move(t, 5, 1, 1);
    await land(t);
    expect(field(t).board.cells[1], [37]);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox());
  });

  for (final light in [false, true]) {
    for (final width in [320.0, 390.0]) {
      testWidgets('layout/capture width=$width light=$light', (t) async {
        await boot(t, width: width, light: light);
        final name = '${light ? 'light' : 'dark'}-${width.toInt()}';
        await snapshot(t, '$name-before');
        await t.tap(find.byKey(const ValueKey('item-5-1')));
        await t.pump();
        await snapshot(t, '$name-selected');
        await t.tap(find.byKey(const ValueKey('niche-1')));
        await t.pump();
        for (var i = 0; i < 24; i++) {
          await t.pump(const Duration(milliseconds: 16));
          if (width == 390 && !light)
            await snapshot(t, 'motion-${i.toString().padLeft(2, '0')}');
        }
        await land(t);
        await snapshot(t, '$name-landed');
        expect(t.takeException(), isNull);
        await t.pumpWidget(const SizedBox());
      });
    }
  }
}
