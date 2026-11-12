// Ночной шаг зарядки (`dim=1`) в «Авроре» остаётся «Авророй» (задача 6eee32e2):
// тема темнеет, но шаблон и роли не подменяются бирюзовой палитрой Classic.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/chrome_art.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_shell.dart';

void main() {
  final engine = Practices(
    jsonDecode(
      File('../packages/practice_kit/assets/practices.json').readAsStringSync(),
    ) as Json,
  );
  final copy =
      jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    GamePreset.clear();
    SessionReport.sink = (_) async {};
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<BuildContext> open(WidgetTester tester, {required bool aurora}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    GamePreset.set({'dim': '1'});
    final base = classicShellTheme(Brightness.light);
    await tester.pumpWidget(
      MaterialApp(
        theme: aurora ? applyUiTemplate(base, UiTemplate.aurora) : base,
        // Как в приложении: рамку игры отдаёт AuroraGameScope (без него рамка берётся из Theme и совпадает).
        home: AuroraGameScope(
          route: '/games/breathing',
          child: PauseScreen(
            state: state,
            flavor: PauseFlavor.breathing,
            engine: engine,
            copy: copy,
            clock: () => 0,
            today: () => DateTime(2026, 11, 12),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    return tester.element(find.byKey(const Key('pause-config')));
  }

  testWidgets(
    '«Аврора» + dim=1: тёмное поле и тёмная РАМКА «Авроры» (шапка, нижний ряд), шаблон не подменён',
    (tester) async {
      final ctx = await open(tester, aurora: true);
      expect(Theme.of(ctx).brightness, Brightness.dark);
      // Поле «Паузы» в приложении пока классическое (маршрут не в auroraReadyRoutes), «Аврора» — рамка.
      expect(
        GameShell.auroraFrameOf(ctx),
        isNotNull,
        reason: 'рамка «Авроры» не потеряна: шаблон не подменён',
      );
      // 🔴 Шапку и нижний ряд рисует рамка из `AuroraFrame`, а не из `Theme`: без своей рамки у ночного
      // шага в светлой теме они остаются светлыми золотыми на чёрном поле (кадр с эмулятора 12.11.2026).
      expect(
        GameShell.auroraFrameOf(ctx)!.brightness,
        Brightness.dark,
        reason: 'рамка ночного шага тоже тёмная',
      );
    },
  );

  testWidgets('Classic + dim=1: прежний бирюзовый ночной вид', (tester) async {
    final ctx = await open(tester, aurora: false);
    expect(Theme.of(ctx).brightness, Brightness.dark);
    expect(ChromeArt.aurora(ctx), isFalse);
  });
}
