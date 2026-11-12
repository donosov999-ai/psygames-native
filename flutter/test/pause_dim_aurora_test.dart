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
import 'package:psygames_flutter/shell/design_template.dart';

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
        home: PauseScreen(
          state: state,
          flavor: PauseFlavor.breathing,
          engine: engine,
          copy: copy,
          clock: () => 0,
          today: () => DateTime(2026, 11, 12),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    return tester.element(find.byKey(const Key('pause-config')));
  }

  testWidgets(
    '«Аврора» + dim=1: тёмная тема, шаблон «Авроры» сохранён, цвет не бирюзовый seed Classic',
    (tester) async {
      final ctx = await open(tester, aurora: true);
      expect(Theme.of(ctx).brightness, Brightness.dark);
      expect(
        ChromeArt.aurora(ctx),
        isTrue,
        reason: 'ночной вид — тёмная «Аврора», а не другой шаблон',
      );
      expect(
        Theme.of(ctx).colorScheme.primary,
        isNot(
          ColorScheme.fromSeed(
            seedColor: const Color(0xff4ca1af),
            brightness: Brightness.dark,
          ).primary,
        ),
      );
    },
  );

  testWidgets('Classic + dim=1: прежний бирюзовый ночной вид', (tester) async {
    final ctx = await open(tester, aurora: false);
    expect(Theme.of(ctx).brightness, Brightness.dark);
    expect(ChromeArt.aurora(ctx), isFalse);
  });
}
