import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_settings_screen.dart';
import 'package:psygames_flutter/shell/crystal_palette.dart';
import 'package:psygames_flutter/shell/gem_palette_material.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/settings_screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cloud_pilot_test.dart' show PilotFake;

void main() {
  const capture = bool.fromEnvironment('CAPTURE_SETTINGS');
  late SharedState state;
  final boundary = GlobalKey();
  var feedback = 0;
  HubCardTap? selectedRoute;

  setUpAll(() async {
    await GemPaletteEngine.initialize();
    NativeTabs.use(
      (jsonDecode(File('assets/tabs.json').readAsStringSync()) as Map)
          .cast<String, dynamic>(),
    );
    final icons = await rootBundle.load('fonts/MaterialIcons-Regular.otf');
    await (FontLoader('MaterialIcons')..addFont(Future.value(icons))).load();
    if (Platform.isMacOS) {
      await (FontLoader('SettingsPreview')..addFont(
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

  Future<void> open(
    WidgetTester t, {
    double width = 390,
    double scale = 1,
    String locale = 'en',
    String mode = 'dark',
    String profile = 'free',
    Map<String, Object> extra = const {},
    CloudPilot? pilot,
    bool nested = false,
  }) async {
    await t.pumpWidget(const SizedBox());
    t.view.physicalSize = Size(width * 2, 1688);
    t.view.devicePixelRatio = 2;
    SharedPreferences.setMockInitialValues({
      uiTemplateKey: 'aurora_v1',
      AppLook.overrideKey: mode,
      'psygames_active_profile': profile,
      'language': locale,
      'psygames_sudoku_level_free': '80',
      'psygames_pet_name': 'My Synapse',
      'psygames_custom_unrelated': '{"points":340,"owned":["hat"]}',
      ...extra,
    });
    state = await SharedState.open();
    PackageInfo.setMockInitialValues(
      appName: 'PsyGames',
      packageName: 'com.psygames.app',
      version: '2.56.56',
      buildNumber: '96',
      buildSignature: '',
    );
    await t.runAsync(() async {
      await L.load(locale);
      await AppLook.load(state);
      await Profiles.load();
    });
    var theme = appShellTheme(
      state,
      brightness: mode == 'dark' ? Brightness.dark : Brightness.light,
    );
    if (Platform.isMacOS) {
      theme = theme.copyWith(
        textTheme: theme.textTheme.apply(fontFamily: 'SettingsPreview'),
      );
    }
    final settings = RepaintBoundary(
      key: boundary,
      child: SettingsScreen(
        state: state,
        originTab: '/games',
        cloudPilot: pilot,
        onFeedback: () => feedback++,
      ),
    );
    selectedRoute = null;
    await t.pumpWidget(
      MaterialApp(
        theme: theme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: nested
            ? Builder(
                builder: (context) => Scaffold(
                  body: TextButton(
                    key: const Key('settings-test-open'),
                    onPressed: () async {
                      selectedRoute = await Navigator.of(context)
                          .push<HubCardTap>(
                            MaterialPageRoute(builder: (_) => settings),
                          );
                    },
                    child: const Text('Open'),
                  ),
                ),
              )
            : settings,
      ),
    );
    await t.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 60)),
    );
    await t.pumpAndSettle();
    if (nested) {
      await t.tap(find.byKey(const Key('settings-test-open')));
      await t.pumpAndSettle();
    }
  }

  Future<void> tap(WidgetTester t, String key) async {
    await t.ensureVisible(find.byKey(Key(key)));
    await t.pumpAndSettle();
    await t.tap(find.byKey(Key(key)));
    await t.pumpAndSettle();
  }

  Future<void> back(WidgetTester t) => tap(t, 'settings-back');

  testWidgets(
    'all five footer targets and nested actions return to the actual host, including active origin',
    (t) async {
      for (final tab in NativeTabs.tabs) {
        await open(t, nested: true);
        await tap(t, 'settings-open-sound');
        await tap(t, 'native-tab-${tab.route}');
        expect(selectedRoute?.route, tab.route);
        expect(find.byKey(const Key('settings-redesigned')), findsNothing);
      }
      await open(t, nested: true);
      await tap(t, 'settings-open-help');
      await tap(t, 'settings-link-/achievements');
      expect(selectedRoute?.route, '/achievements');
      t.view.reset();
    },
  );

  Future<void> snap(WidgetTester t, String name) async {
    if (!capture) return;
    // Asset decoding and shader images complete in real async time, not the
    // widget test clock. Never capture a half-loaded material as evidence.
    for (var i = 0; i < 8; i++) {
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 35)),
      );
      await t.pump();
    }
    await t.pumpAndSettle();
    await t.runAsync(() async {
      final render =
          boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await render.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final file = File('test/design/preview/settings-$name.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }

  tearDown(() {
    TestWidgetsFlutterBinding.instance.platformDispatcher.clearAllTestValues();
  });

  testWidgets(
    'hub is compact; all seven sections are explicit and inactive controls are not dumped on root',
    (t) async {
      await open(t);
      for (final pane in [
        'profiles',
        'appearance',
        'sound',
        'synapse',
        'language',
        'data',
        'help',
      ]) {
        expect(find.byKey(Key('settings-open-$pane')), findsOneWidget);
      }
      expect(find.byKey(const Key('settings-sound')), findsNothing);
      expect(find.byKey(const Key('profile-kids')), findsNothing);
      expect(find.byKey(const Key('native-tab-bar')), findsOneWidget);
      expect(find.byKey(const Key('feedback-fab')), findsOneWidget);
      final before = state.snapshot();
      await snap(t, 'hub-dark');
      for (final pane in [
        'sound',
        'synapse',
        'language',
        'data',
        'help',
        'appearance',
        'profiles',
      ]) {
        await tap(t, 'settings-open-$pane');
        expect(find.byKey(const Key('native-tab-bar')), findsOneWidget);
        expect(t.takeException(), isNull, reason: pane);
        await back(t);
      }
      expect(
        state.snapshot(),
        before,
        reason: 'Navigation must not modify history or preferences',
      );
      t.view.reset();
    },
  );

  testWidgets(
    'sound, music and haptics preserve wire formats and conditional volume',
    (t) async {
      await open(t);
      await tap(t, 'settings-open-sound');
      expect(
        t.widget<Switch>(find.byKey(const Key('settings-sound'))).value,
        isTrue,
      );
      await tap(t, 'settings-volume-up');
      expect(state.get(SettingsScreen.volume), '90');
      await tap(t, 'settings-sound');
      expect(state.get(SettingsScreen.sound), 'false');
      expect(find.byKey(const Key('settings-volume')), findsNothing);
      await tap(t, 'settings-music');
      await tap(t, 'settings-haptic');
      expect(state.get(SettingsScreen.music), 'true');
      expect(state.get(SettingsScreen.haptic), 'false');
      await snap(t, 'sound-dark');
      t.view.reset();
    },
  );

  testWidgets(
    'Synapse visibility, movement and size remain conditional; no progress mutations',
    (t) async {
      await open(t);
      await tap(t, 'settings-open-synapse');
      await tap(t, 'settings-petwalk');
      expect(state.get(SettingsScreen.petWalk), '1');
      final slider = t.widget<Slider>(
        find.byKey(const Key('settings-pet-scale')),
      );
      slider.onChanged!(1.25);
      await t.pumpAndSettle();
      expect(state.get(SettingsScreen.petScale), '1.25');
      await tap(t, 'settings-pet');
      expect(state.get(SettingsScreen.pet), '0');
      expect(find.byKey(const Key('settings-petwalk')), findsNothing);
      expect(find.byKey(const Key('settings-pet-scale')), findsNothing);
      expect(state.get('psygames_sudoku_level_free'), '80');
      expect(state.get('psygames_pet_name'), 'My Synapse');
      t.view.reset();
    },
  );

  testWidgets(
    'appearance supports all modes; Classic remains reachable and unknown preferences stay intact',
    (t) async {
      await open(t);
      await tap(t, 'settings-open-appearance');
      await snap(t, 'appearance-dark');
      for (final mode in ['light', 'dark', 'system', 'profile']) {
        await tap(t, 'settings-theme-$mode');
        expect(state.get(AppLook.overrideKey), mode == 'profile' ? null : mode);
      }
      await tap(t, 'settings-template-classic');
      expect(find.byKey(const Key('settings-redesigned')), findsNothing);
      expect(state.get('psygames_sudoku_level_free'), '80');
      await tap(t, 'settings-template-aurora');
      expect(find.byKey(const Key('settings-redesigned')), findsOneWidget);
      expect(
        find.byKey(const Key('settings-template-classic')),
        findsOneWidget,
      );
      t.view.reset();
    },
  );

  testWidgets(
    'data pane retains export/import, backup and truthful unavailable cloud',
    (t) async {
      await open(t);
      await tap(t, 'settings-open-data');
      expect(find.byKey(const Key('settings-cloud')), findsNothing);
      expect(find.byKey(const Key('settings-backup-save')), findsOneWidget);
      expect(find.byKey(const Key('settings-backup-restore')), findsOneWidget);
      expect(
        find.byKey(const Key('settings-export')).hitTestable(),
        findsNothing,
      );
      await tap(t, 'settings-transfer-options');
      await tap(t, 'settings-export');
      final code = t
          .widget<SelectableText>(find.byKey(const Key('settings-export-code')))
          .data!;
      expect(
        jsonDecode(
          utf8.decode(base64Decode(code)),
        )['data']['psygames_sudoku_level_free'],
        '80',
      );
      await t.tap(find.text(L.t('close')));
      await t.pumpAndSettle();
      await tap(t, 'settings-import');
      await t.enterText(
        find.byKey(const Key('settings-import-field')),
        base64Encode(utf8.encode('{"x":1}')),
      );
      await tap(t, 'settings-import-apply');
      expect(find.textContaining('(bad-format)'), findsOneWidget);
      expect(state.get('psygames_sudoku_level_free'), '80');
      t.view.reset();
    },
  );

  testWidgets(
    'overview presets persist independently and use black text on light gems',
    (t) async {
      await open(t);
      final untouched = state.snapshot();
      await tap(t, 'settings-open-appearance');
      await tap(t, 'settings-crystal-overview-enabled');
      expect(state.get(crystalEnabledKey), '1');
      for (final id in [
        'diamond',
        'pink-diamond',
        'black-diamond',
        'sapphire',
      ]) {
        await tap(t, 'settings-preset-$id');
        final palette = CrystalPalette.read(state);
        expect(palette.recipe.id, id);
        final header = t.widget<Text>(
          find.byKey(const Key('settings-pane-title')),
        );
        expect(
          header.style?.color,
          id == 'diamond' || id == 'pink-diamond' ? Colors.black : Colors.white,
        );
      }
      final reopened = await SharedState.open();
      expect(CrystalPalette.read(reopened).recipe.id, 'sapphire');
      final after = state.snapshot()
        ..removeWhere((k, _) => k.startsWith(crystalKeyPrefix));
      expect(after, untouched);
      t.view.reset();
    },
  );

  testWidgets(
    'configured cloud destination preserves the existing consent boundary; entry does not send data',
    (t) async {
      SharedPreferences.setMockInitialValues({});
      final cloudState = await SharedState.open();
      final gateway = PilotFake();
      final pilot = CloudPilot(cloudState, gateway);
      await open(t, pilot: pilot);
      await tap(t, 'settings-open-data');
      await tap(t, 'settings-cloud');
      expect(find.byType(CloudSettingsScreen), findsOneWidget);
      expect(gateway.calls, isEmpty);
      expect(cloudState.get(CloudPilot.consentKey), isNull);
      await t.pumpWidget(const SizedBox());
      pilot.dispose();
      cloudState.dispose();
      t.view.reset();
    },
  );

  testWidgets(
    'owner tools stay restricted; device Back leaves the subsection before Settings',
    (t) async {
      await open(t);
      await tap(t, 'settings-open-data');
      expect(find.byKey(const Key('settings-owner-tools')), findsNothing);
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(find.byKey(const Key('settings-open-data')), findsOneWidget);
      await open(t, profile: 'odv999');
      await tap(t, 'settings-open-data');
      await tap(t, 'settings-owner-tools');
      expect(find.byKey(const Key('settings-playlists-load')), findsOneWidget);
      expect(find.byKey(const Key('settings-playlists-reset')), findsNothing);
      t.view.reset();
    },
  );

  for (final mode in ['dark', 'light']) {
    for (final config in [
      (390.0, 1.0, 'en'),
      (320.0, 2.0, 'ru'),
      (320.0, 2.0, 'de'),
      (390.0, 2.0, 'ar'),
      (900.0, 1.0, 'en'),
    ]) {
      testWidgets(
        'all sections fit $mode $config with local text and stable chrome',
        (t) async {
          await open(
            t,
            width: config.$1,
            scale: config.$2,
            locale: config.$3,
            mode: mode,
          );
          if (config.$1 == 390 && config.$2 == 1) await snap(t, 'hub-$mode');
          for (final pane in [
            'appearance',
            'sound',
            'synapse',
            'language',
            'help',
            'data',
            'profiles',
          ]) {
            await tap(t, 'settings-open-$pane');
            expect(t.takeException(), isNull, reason: '$pane $mode $config');
            if (config.$1 == 390 && config.$2 == 1) {
              await snap(t, '$pane-$mode');
            }
            await back(t);
          }
          t.view.reset();
        },
      );
    }
  }
}
