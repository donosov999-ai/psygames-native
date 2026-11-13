import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_hub/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/hub_screen.dart' as hub;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/shared_state.dart';

import '../support/real_fonts.dart';

import 'package:shared_preferences/shared_preferences.dart';

const routes = [
  '/games/span',
  '/games/mnemonics-hub',
  '/games/chess-hub',
  '/games/attention-conflict',
  '/games/search-hub',
  '/games/sudoku-hub',
  '/games/spatial-hub',
  '/games/sorting-hub',
  '/games/relaxation-hub',
  '/games/counting-hub',
  '/games/words-hub',
  '/games/hearing-hub',
  '/games/languages-hub',
];

void main() {
  const capture = bool.fromEnvironment('CAPTURE_HUBS');
  setUpAll(() async {
    await loadRoboto();
    final root = Platform.environment['FLUTTER_ROOT'];
    await (FontLoader('MaterialIcons')..addFont(
          Future.value(
            File(
              '$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
            ).readAsBytesSync().buffer.asByteData(),
          ),
        ))
        .load();
    NativeTabs.use(
      (jsonDecode(File('assets/tabs.json').readAsStringSync()) as Map)
          .cast<String, dynamic>(),
    );
  });

  Future<void> boot(
    WidgetTester t,
    String route, {
    double width = 390,
    double scale = 1,
    String locale = 'en',
    Brightness brightness = Brightness.light,
    Map<String, Object> prefs = const {},
    ValueChanged<String>? onCard,
    bool spatial = false,
  }) async {
    t.view.physicalSize = Size(width * 2, 844 * 2);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_goods_sort_level_nzt48': '23',
      'psygames_mental_rotation_level_nzt48': '7',
      'psygames_spatial_lab_net_level_nzt48': '11',
      ...prefs,
    });
    final state = await SharedState.open();
    await L.load(locale);
    await t.runAsync(() async {
      await t.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: applyUiTemplate(
            classicShellTheme(brightness),
            UiTemplate.aurora,
          ),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
              disableAnimations: true,
            ),
            child: Directionality(
              textDirection: locale == 'ar'
                  ? TextDirection.rtl
                  : TextDirection.ltr,
              child: child!,
            ),
          ),
          home: spatial
              ? SpatialHubScreen(state: state, onOpen: onCard)
              : hub.HubScreen(
                  state: state,
                  hubRoute: route,
                  icon: Icons.apps,
                  gradient: const [Colors.blue, Colors.purple],
                  onCardTap: onCard,
                ),
        ),
      );
      for (var i = 0; i < 40; i++) {
        await t.pump(const Duration(milliseconds: 25));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find
            .byKey(const ValueKey('hub-grid-scroll'))
            .evaluate()
            .isNotEmpty) {
          break;
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await t.pump();
    });
    await t.pumpAndSettle();
  }

  for (final b in Brightness.values) {
    for (final route in routes) {
      testWidgets('real hub $route ${b.name} 390pt', (t) async {
        await boot(
          t,
          route,
          brightness: b,
          spatial: route == '/games/spatial-hub',
        );
        expect(find.byKey(const ValueKey('hub-grid-3')), findsOneWidget);
        expect(find.byKey(const ValueKey('native-tab-bar')), findsOneWidget);
        expect(find.byKey(const ValueKey('aurora-tab-header')), findsOneWidget);
        expect(t.takeException(), isNull);
        if (capture) {
          await t.runAsync(() async {
            for (final image in t.widgetList<Image>(find.byType(Image))) {
              await precacheImage(
                image.image,
                t.element(find.byType(Scaffold).first),
              );
            }
          });
          await t.pumpAndSettle();
          await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile(
              'preview/hubs-${route.split('/').last}-${b.name}.png',
            ),
          );
        }
      });
    }
  }

  for (final config in [
    (width: 320.0, scale: 1.0, locale: 'ru', columns: 2),
    (width: 390.0, scale: 2.0, locale: 'de', columns: 1),
    (width: 320.0, scale: 2.0, locale: 'ar', columns: 1),
  ]) {
    testWidgets('adaptive grid $config', (t) async {
      await boot(
        t,
        '/games/sorting-hub',
        width: config.width,
        scale: config.scale,
        locale: config.locale,
      );
      expect(
        find.byKey(ValueKey('hub-grid-${config.columns}')),
        findsOneWidget,
      );
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('real levels and spatial mode-specific level stay visible', (
    t,
  ) async {
    await boot(t, '/games/spatial-hub', spatial: true);
    expect(
      t
          .widget<Text>(
            find.byKey(const ValueKey('hub-level-/games/mental-rotation')),
          )
          .data,
      '${L.t('unitLevelShort')} 7',
    );
    expect(
      t
          .widget<Text>(
            find.byKey(const ValueKey('hub-level-/games/spatial-lab?mode=net')),
          )
          .data,
      '${L.t('unitLevelShort')} 11',
    );
  });

  testWidgets('footer returns a tab result instead of opening a second game', (
    t,
  ) async {
    await boot(t, '/games/span');
    final memory = t.widget<hub.HubScreen>(find.byType(hub.HubScreen)).state;
    final nav = t.state<NavigatorState>(find.byType(Navigator).first);
    final result = nav.push<hub.HubCardTap>(
      MaterialPageRoute(
        builder: (_) => hub.HubScreen(
          state: memory,
          hubRoute: '/games/sorting-hub',
          icon: Icons.apps,
          gradient: const [Colors.blue, Colors.purple],
        ),
      ),
    );
    await t.runAsync(() async {
      for (var i = 0; i < 20; i++) {
        await t.pump(const Duration(milliseconds: 40));
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('native-tab-/pet')));
    await t.pumpAndSettle();
    final value = await result;
    expect(value?.tab, isTrue);
    expect(value?.route, '/pet');
  });

  testWidgets('search stays in hub and selected card uses existing callback', (
    t,
  ) async {
    String? selected;
    await boot(t, '/games/sorting-hub', onCard: (r) => selected = r);
    await t.enterText(find.byKey(const ValueKey('hub-search')), 'goods');
    await t.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('hub-card-/games/goods-sort')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('hub-card-/games/hanoi')), findsNothing);
    expect(
      t
          .widget<Text>(
            find.byKey(const ValueKey('hub-level-/games/goods-sort')),
          )
          .data,
      '${L.t('unitLevelShort')} 23',
    );
    await t.tap(find.byKey(const ValueKey('hub-card-/games/goods-sort')));
    expect(selected, '/games/goods-sort');
    expect(find.byKey(const ValueKey('hub-grid-scroll')), findsOneWidget);
  });

  testWidgets(
    'profile visibility still controls grid, details do not start game',
    (t) async {
      String? selected;
      await boot(
        t,
        '/games/sorting-hub',
        onCard: (r) => selected = r,
        prefs: {
          hub.HubScreen.visibleKey: jsonEncode({
            'profile': 'nzt48',
            'hubs': {
              '/games/sorting-hub': ['/games/goods-sort'],
            },
          }),
        },
      );
      expect(find.byKey(const ValueKey('hub-card-/games/hanoi')), findsNothing);
      await t.tap(find.byKey(const ValueKey('hub-info-/games/goods-sort')));
      await t.pumpAndSettle();
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.text(L.t('goodsSortDesc')), findsWidgets);
      expect(selected, isNull);
    },
  );
}
