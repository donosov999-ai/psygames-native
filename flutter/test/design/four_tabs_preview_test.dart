import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/catalog_screen.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_pet.dart';
import 'package:psygames_flutter/shell/feedback_fab.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/pet_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/stats_screen.dart';
import 'package:psygames_flutter/shell/tab_chrome.dart';
import 'package:psygames_flutter/shell/warmup_screens.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RealHttp extends HttpOverrides {}

Map<String, dynamic> data(String p) =>
    (jsonDecode(File(p).readAsStringSync()) as Map).cast<String, dynamic>();

void main() {
  const capture = bool.fromEnvironment('CAPTURE_TABS');
  HttpServer? server;
  final clients = <HttpClient>[];
  final host = Object();
  setUpAll(() async {
    NativeTabs.use(data('assets/tabs.json'));
    if (capture && Platform.isMacOS) {
      for (final pair in [
        ('PreviewArial', '/System/Library/Fonts/Supplemental/Arial.ttf'),
        (
          'MaterialIcons',
          '/opt/homebrew/share/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
        ),
        ('Ionicons', 'assets/fonts/Ionicons.ttf'),
        ('Apple Color Emoji', '/System/Library/Fonts/Apple Color Emoji.ttc'),
      ]) {
        await (FontLoader(pair.$1)..addFont(
              Future.value(File(pair.$2).readAsBytesSync().buffer.asByteData()),
            ))
            .load();
      }
    }
  });
  tearDown(() async {
    debugNetworkImageHttpClientProvider = null;
    for (final client in clients) {
      client.close(force: true);
    }
    clients.clear();
    await server?.close(force: true);
    server = null;
    ScreenUi.reset();
    WarmupUi.run = null;
    TabChromeHost.unbind(host);
    PetHost.unbind(host);
  });

  for (final brightness in Brightness.values) {
    for (final route in ['/games', '/warmup-picker', '/statistics', '/pet']) {
      for (final config in [
        (width: 390.0, locale: 'en', scale: 1.0),
        (width: 320.0, locale: 'en', scale: 2.0),
        (width: 320.0, locale: 'ar', scale: 1.0),
      ]) {
        testWidgets(
          'real $route ${brightness.name}: ${config.width} ${config.locale} x${config.scale}',
          (t) async {
            t.view.physicalSize = Size(config.width * 2, 1688);
            t.view.devicePixelRatio = 2;
            addTearDown(t.view.reset);
            SharedPreferences.setMockInitialValues({'language': 'en'});
            final state = await SharedState.open();
            L.useForTest(
              config.locale,
              data('assets/l10n/${config.locale}.json').cast<String, String>(),
            );
            ScreenUi.reset();
            ScreenUi.run = (_) async {};
            WarmupUi.run = (_) async {};
            final stats = data('test/fixtures/stats_model_en.json');
            ScreenUi.model('/statistics').value = stats;
            final pet =
                (data('test/fixtures/pet_dart_fresh.json')['model'] as Map)
                    .cast<String, Object?>();
            final portrait = (pet['portrait'] as Map).cast<String, Object?>();
            pet['portrait'] = {...portrait, 'state': 'idle', 'treat': null};
            ScreenUi.model('/pet').value = pet;
            WarmupUi.picker.value = data(
              'test/fixtures/warmup_model_from_screen_en.json',
            );
            await t.runAsync(() async {
              server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
              server!.listen((request) async {
                final path = request.uri.path;
                final marker = path.indexOf('/images/pet/');
                final image = marker < 0
                    ? null
                    : File('../frontend/assets${path.substring(marker)}');
                if (image != null && await image.exists()) {
                  request.response.headers.contentType = ContentType(
                    'image',
                    'webp',
                  );
                  request.response.add(await image.readAsBytes());
                } else {
                  request.response.statusCode = 404;
                }
                await request.response.close();
              });
            });
            debugNetworkImageHttpClientProvider = () {
              final c = HttpOverrides.runWithHttpOverrides(
                () => HttpClient(),
                _RealHttp(),
              );
              clients.add(c);
              return c;
            };
            TabChromeHost.bind(host, (_) {});
            TabChromeHost.update(host, route);
            final origin = 'http://127.0.0.1:${server!.port}';
            PetHost.bind(
              host,
              state,
              origin,
              const AlwaysStoppedAnimation<int>(0),
            );
            final page = switch (route) {
              '/games' => CatalogScreen(
                state: state,
                embedded: true,
                onOpen: (_) {},
              ),
              '/statistics' => StatsScreen(onTab: (_) {}),
              '/pet' => PetScreen(origin: origin, ownModel: false),
              _ => const WarmupPickerScreen(),
            };
            var theme = applyUiTemplate(
              classicShellTheme(brightness),
              UiTemplate.aurora,
            );
            if (capture) {
              theme = theme.copyWith(
                textTheme: theme.textTheme.apply(
                  fontFamily: 'PreviewArial',
                  fontFamilyFallback: const ['Apple Color Emoji'],
                ),
              );
            }
            await t.pumpWidget(
              MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: theme,
                builder: (c, child) => MediaQuery(
                  data: MediaQuery.of(c).copyWith(
                    disableAnimations: true,
                    textScaler: TextScaler.linear(config.scale),
                  ),
                  child: Directionality(
                    textDirection: config.locale == 'ar'
                        ? TextDirection.rtl
                        : TextDirection.ltr,
                    child: child!,
                  ),
                ),
                home: Scaffold(
                  bottomNavigationBar: NativeTabBar(
                    active: route,
                    onTap: (_) {},
                    accent: Colors.amber,
                  ),
                  body: Stack(
                    children: [
                      Positioned.fill(child: page),
                      FeedbackFab(state: state, onOpen: () {}),
                    ],
                  ),
                ),
              ),
            );
            // Real assets and loopback sprites load asynchronously; no fake screenshot overlay.
            for (var i = 0; i < 12; i++) {
              await t.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 40)),
              );
              await t.pump(const Duration(milliseconds: 50));
            }
            expect(find.byType(AuroraTabHeader), findsOneWidget);
            expect(t.takeException(), isNull);
            final name = route.substring(1).replaceAll('-', '_');
            final save = capture && config.width == 390;
            if (save) {
              await expectLater(
                find.byType(MaterialApp),
                matchesGoldenFile('preview/$name-${brightness.name}-top.png'),
              );
            }
            final scrollKey = switch (route) {
              '/games' => 'catalog-list',
              '/statistics' => 'stats-summary',
              '/pet' => 'pet-list',
              _ => '',
            };
            final scroll = scrollKey.isEmpty
                ? find.byType(Scrollable).first
                : find
                      .descendant(
                        of: find.byKey(ValueKey(scrollKey)),
                        matching: find.byType(Scrollable),
                      )
                      .first;
            await t.drag(scroll, const Offset(0, -430));
            await t.pump(const Duration(milliseconds: 500));
            expect(
              find.byKey(const ValueKey('native-tab-bar')),
              findsOneWidget,
            );
            if (save) {
              await expectLater(
                find.byType(MaterialApp),
                matchesGoldenFile(
                  'preview/$name-${brightness.name}-scrolled.png',
                ),
              );
            }
            if (route == '/statistics') {
              await t.tap(find.byKey(const ValueKey('stats-tab-history')));
              await t.pump();
              if (save) {
                await expectLater(
                  find.byType(MaterialApp),
                  matchesGoldenFile(
                    'preview/$name-${brightness.name}-history.png',
                  ),
                );
              }
            }
            expect(t.takeException(), isNull);
            await t.pumpWidget(const SizedBox());
            debugNetworkImageHttpClientProvider = null;
            for (final client in clients) {
              client.close(force: true);
            }
            clients.clear();
            await t.pump(const Duration(seconds: 16));
          },
        );
      }
    }
  }
}
