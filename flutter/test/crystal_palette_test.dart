import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/chrome_art.dart';
import 'package:psygames_flutter/shell/crystal_palette.dart';
import 'package:psygames_flutter/shell/crystal_settings_screen.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/gem_palette_material.dart';
import 'package:psygames_flutter/shell/gem_palette_presets.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/tab_chrome.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await GemPaletteEngine.initialize();
    expect(GemPaletteEngine.available, isTrue);
    await NativeTabs.load();
    if (Platform.isMacOS) {
      await (FontLoader('MaterialIcons')..addFont(
            rootBundle.load('fonts/MaterialIcons-Regular.otf'),
          ))
          .load();
      await (FontLoader('PaletteArial')..addFont(
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
  Future<SharedState> state([Map<String, Object> values = const {}]) async {
    SharedPreferences.setMockInitialValues({
      uiTemplateKey: 'aurora_v1',
      'language': 'en',
      ...values,
    });
    await L.load('en');
    return SharedState.open();
  }

  Future<void> assets(WidgetTester t) async {
    for (var i = 0; i < 45; i++) {
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 30)),
      );
      await t.pump();
    }
    expect(t.takeException(), isNull);
  }

  test('off by default and every actual profile has its own unchanged fallback recipe', () async {
    final s = await state();
    expect(CrystalPalette.read(s).enabled, isFalse);
    await s.set(crystalEnabledKey, '1');
    for (final p in profileGemPresets) {
      await s.set('psygames_active_profile', p.profileId!);
      expect(CrystalPalette.read(s).recipe.id, p.id);
      expect(CrystalPalette.read(s).enabled, isTrue);
    }
    await s.set(uiTemplateKey, 'classic_v1');
    expect(appShellTheme(s).extension<CrystalPalette>(), isNull);
  });
  test(
    'finite bounds corrupt JSON and notifications cannot change game progress',
    () async {
      final s = await state({
        'psygames_active_profile': 'women',
        'psygames_sudoku_level_women': '80',
      });
      var notifications = 0;
      s.addListener(() => notifications++);
      await s.set(
        '$crystalKeyPrefix${s.activeProfile}',
        jsonEncode({'hue': 999, 'saturation': -1, 'lightness': 99, 'glow': 42}),
      );
      await s.set(crystalEnabledKey, '1');
      final p = CrystalPalette.read(s);
      expect(p.recipe.hue, 360);
      expect(p.recipe.saturation, 0);
      expect(p.recipe.lightness, 1);
      expect(p.recipe.glow, 1);
      expect(notifications, 2);
      expect(s.get('psygames_sudoku_level_women'), '80');
      expect(s.snapshot().containsKey(crystalEnabledKey), isTrue);
      await s.set('$crystalKeyPrefix${s.activeProfile}', 'broken');
      expect(CrystalPalette.read(s).enabled, isFalse);
      expect(CrystalPalette.read(s).recipe.profileId, 'women');
    },
  );
  test('light diamond and pink use black ink, black diamond uses white', () {
    for (final id in ['diamond', 'pink-diamond']) {
      final p = extraGemPresets.firstWhere((p) => p.id == id);
      expect(
        gemForeground(
          hue: p.hue,
          saturation: p.saturation,
          lightness: p.lightness,
        ),
        Colors.black,
      );
    }
    final p = extraGemPresets.firstWhere((p) => p.id == 'black-diamond');
    expect(
      gemForeground(
        hue: p.hue,
        saturation: p.saturation,
        lightness: p.lightness,
      ),
      Colors.white,
    );
  });
  testWidgets(
    'real settings save selected palette only, restart and profile switching preserve it',
    (t) async {
      final s = await state({
        'psygames_active_profile': 'women',
        'psygames_sudoku_level_women': '80',
      });
      await t.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => CrystalSettingsScreen(state: s),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      await assets(t);
      await t.ensureVisible(find.byKey(const ValueKey('crystal-enabled')));
      await t.tap(find.byKey(const ValueKey('crystal-enabled')));
      await t.pump();
      await t.ensureVisible(find.byKey(const ValueKey('gemPaletteLightness')));
      await t.drag(
        find.byKey(const ValueKey('gemPaletteLightness')),
        const Offset(-80, 0),
      );
      await t.pump();
      await t.ensureVisible(find.byKey(const ValueKey('crystal-save')));
      await t.tap(find.byKey(const ValueKey('crystal-save')));
      await t.pumpAndSettle();
      expect(find.text('open'), findsOneWidget);
      final stored = s.get('${crystalKeyPrefix}women');
      expect(stored, isNotNull);
      expect(s.get(crystalEnabledKey), '1');
      expect(s.get('psygames_sudoku_level_women'), '80');
      final reopened = await SharedState.open();
      expect(
        CrystalPalette.read(reopened).encode(),
        CrystalPalette.read(s).encode(),
      );
      await reopened.set('psygames_active_profile', 'chess');
      expect(CrystalPalette.read(reopened).recipe.id, 'profile-chess');
      await reopened.set('psygames_active_profile', 'women');
      expect(reopened.get('${crystalKeyPrefix}women'), stored);
    },
  );
  for (final width in [320.0, 390.0]) {
    testWidgets(
      'settings $width font x2 RTL and light theme have no lost controls',
      (t) async {
        t.view.physicalSize = Size(width, 900);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        final s = await state();
        await L.load('ar');
        await t.pumpWidget(
          MaterialApp(
            theme: ThemeData.light(),
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(width, 900),
                textScaler: TextScaler.linear(2),
              ),
              child: Directionality(
                textDirection: TextDirection.rtl,
                child: CrystalSettingsScreen(state: s),
              ),
            ),
          ),
        );
        await assets(t);
        await t.ensureVisible(find.byKey(const ValueKey('crystal-save')));
        await t.pump();
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'native header/footer use cached actual art and black labels on white stone',
    (t) async {
      t.view.physicalSize = const Size(780, 700);
      t.view.devicePixelRatio = 2;
      addTearDown(t.view.reset);
      final p = extraGemPresets.firstWhere((p) => p.id == 'diamond');
      final s = await state({
        crystalEnabledKey: '1',
        '${crystalKeyPrefix}nzt48': CrystalPalette(
          enabled: true,
          recipe: p,
        ).encode(),
      });
      final theme = appShellTheme(s, brightness: Brightness.dark);
      await t.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: theme.copyWith(
            textTheme: theme.textTheme.apply(fontFamily: 'PaletteArial'),
          ),
          home: Scaffold(
            body: Column(
              children: [
                const AuroraTabHeader(route: '/games', title: 'Games'),
                Expanded(child: Container()),
                NativeTabBar(
                  active: '/games',
                  onTap: (_) {},
                  accent: Colors.blue,
                ),
              ],
            ),
          ),
        ),
      );
      await assets(t);
      expect(
        t.widget<Text>(find.text('Games').first).style!.color,
        Colors.black,
      );
      expect(
        t.widget<Text>(find.text('Games').last).style!.color,
        Colors.black,
      );
      if (Platform.isMacOS && const bool.fromEnvironment('CAPTURE_CRYSTAL')) {
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('design/preview/crystal-native-header-footer.png'),
        );
      }
      final context = t.element(find.byType(AuroraTabHeader));
      expect(
        ChromeArt.header(true, context: context).image,
        isA<GemPaletteImage>(),
      );
      final key1 = await ChromeArt.header(
        true,
        context: context,
      ).image.obtainKey(const ImageConfiguration());
      final key2 = await ChromeArt.header(
        true,
        context: context,
      ).image.obtainKey(const ImageConfiguration());
      expect(key1, key2);
      await t.pumpWidget(const SizedBox());
    },
  );
}
