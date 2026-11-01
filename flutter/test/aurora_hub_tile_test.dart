import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_home_hero.dart';
import 'package:psygames_flutter/shell/aurora_hub_tile.dart';
import 'package:psygames_flutter/shell/catalog.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_tile.dart';
import 'package:psygames_flutter/shell/shared_state.dart';

/// Плитки развилок «Авроры»: у каждой развилки каталога есть обе картинки, и новая
/// плитка показывается только под «Авророй».
void main() {
  test('у каждой развилки каталога есть тёмная и светлая картинка', () {
    final catalog = jsonDecode(File('assets/catalog.json').readAsStringSync()) as Map<String, dynamic>;
    final hubs = [
      for (final g in (catalog['games'] as List).cast<Map<String, dynamic>>())
        if (g['hub'] == true) g['route'] as String,
    ];
    expect(hubs, isNotEmpty);
    final missing = <String>[];
    for (final route in hubs) {
      for (final dark in [true, false]) {
        final asset = AuroraHubTile.assetFor(route, dark: dark);
        if (asset == null || !File(asset).existsSync()) missing.add('$route ${dark ? 'dark' : 'light'}');
      }
    }
    expect(missing, isEmpty);
    expect(hubs.length, AuroraHubTile.slugs.length);
  });

  Future<Widget> tileUnder(WidgetTester tester, UiTemplate template, CatalogEntry entry) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final kit = CatalogKit(catalog: Catalog.fromJson(const {'games': [], 'categories': []}, const {}));
    late Widget built;
    await tester.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      home: Scaffold(
        body: SizedBox(
          width: 170,
          height: 180,
          child: Builder(builder: (context) {
            built = kit.tile(state, entry, hubCount: const {'/games/span': 7}, onTap: () {});
            return built;
          }),
        ),
      ),
    ));
    return built;
  }

  const hub = CatalogEntry(route: '/games/span', nameKey: 'span', descKey: 'span', icon: 'grid', hub: true);
  const game = CatalogEntry(route: '/games/schulte', nameKey: 'schulte', descKey: 'schulte', icon: 'grid');

  testWidgets('«Аврора»: развилка — новая плитка с картинкой и числом игр', (tester) async {
    await tileUnder(tester, UiTemplate.aurora, hub);
    expect(find.byType(AuroraHubTile), findsOneWidget);
    expect(find.byType(GameTile), findsNothing);
    final image = tester.widget<Image>(find.byType(Image));
    expect((image.image as AssetImage).assetName, 'assets/aurora_hubs/span_dark.webp');
    expect(find.byKey(const ValueKey('aurora-hubcount')), findsOneWidget);
  });

  testWidgets('«Аврора»: обычная игра — прежняя плитка', (tester) async {
    await tileUnder(tester, UiTemplate.aurora, game);
    expect(find.byType(AuroraHubTile), findsNothing);
    expect(find.byType(GameTile), findsOneWidget);
  });

  testWidgets('Classic: развилка — прежняя плитка', (tester) async {
    await tileUnder(tester, UiTemplate.classic, hub);
    expect(find.byType(AuroraHubTile), findsNothing);
    expect(find.byType(GameTile), findsOneWidget);
  });

  for (final dark in [true, false]) {
    testWidgets('главная «Авроры»: карточка зарядки — картинка темы, текст модели, кнопка ведёт по href (${dark ? 'тёмная' : 'светлая'})', (tester) async {
      var taps = 0;
      await tester.pumpWidget(MaterialApp(
        theme: applyUiTemplate(classicShellTheme(dark ? Brightness.dark : Brightness.light), UiTemplate.aurora),
        home: Scaffold(body: SizedBox(width: 390, child: AuroraHomeHero(title: 'Зарядка', sub: 'Утро · 5 мин', cta: 'СТАРТ', onTap: () => taps++))),
      ));
      final image = tester.widget<Image>(find.byType(Image));
      final art = 'assets/aurora_game_chrome/${dark ? 'home_training_hero_pilot' : 'home_training_hero_light_v2'}.png';
      expect((image.image as AssetImage).assetName, art);
      expect(File(art).existsSync(), isTrue);
      expect(find.text('Зарядка'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('aurora-home-hero-start')));
      expect(taps, 1);
    });
  }
}
