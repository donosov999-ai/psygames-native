import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/home_model.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RealHttp extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const capture = bool.fromEnvironment('CAPTURE_PREVIEW');
  final clients = <HttpClient>[];
  HttpServer? server;
  Map<String, Object?> json(String p) => (jsonDecode(File(p).readAsStringSync()) as Map).cast<String, Object?>();
  setUpAll(() async {
    NativeTabs.use(json('assets/tabs.json').cast<String, dynamic>());
    if (capture && Platform.isMacOS) {
      final font = FontLoader('PreviewArial')..addFont(Future.value(File('/System/Library/Fonts/Supplemental/Arial.ttf').readAsBytesSync().buffer.asByteData()));
      await font.load();
      final material = FontLoader('MaterialIcons')..addFont(Future.value(File('/opt/homebrew/share/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytesSync().buffer.asByteData()));
      await material.load();
    }
  });
  tearDown(() async {
    debugNetworkImageHttpClientProvider = null;
    for (final c in clients) { c.close(force: true); }
    clients.clear();
    await server?.close(force: true);
    server = null;
    ScreenUi.reset();
  });
  for (final b in Brightness.values) {
    for (final config in [(width: 390.0, locale: 'en', scale: 1.0), (width: 320.0, locale: 'de', scale: 2.0), (width: 320.0, locale: 'ar', scale: 1.0)]) {
      testWidgets('real home ${b.name} ${config.width} ${config.locale} x${config.scale}', (t) async {
        SharedPreferences.setMockInitialValues({});
        final state = await SharedState.open();
        t.view.physicalSize = Size(config.width, 844) * 2;
        t.view.devicePixelRatio = 2;
        addTearDown(t.view.reset);
        L.useForTest(config.locale, json('assets/l10n/${config.locale}.json').cast<String, String>());
        final model = buildHomeModel(json('test/fixtures/home_builder_input_rich.json'), HomeData.fromJson(json('assets/catalog.json'), json('assets/home.json')));
        model['goalSheet'] = null;
        model['toasts'] = <String, Object?>{};
        // Serve only the real cat sprite locally. All values are marked fixture data.
        await t.runAsync(() async {
          server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          server!.listen((r) async {
            r.response.headers.contentType = ContentType('image', 'webp');
            r.response.add(await File('../frontend/assets/images/pet/cat/idle0.webp').readAsBytes());
            await r.response.close();
          });
        });
        debugNetworkImageHttpClientProvider = () {
          final c = HttpOverrides.runWithHttpOverrides(() => HttpClient(), _RealHttp());
          clients.add(c);
          return c;
        };
        late CatalogKit kit;
        await t.runAsync(() async => kit = await CatalogKit.load());
        ScreenUi.reset();
        ScreenUi.run = (_) async {};
        ScreenUi.model(HomeScreen.route).value = model;
        final base = applyUiTemplate(classicShellTheme(b), UiTemplate.aurora);
        await t.pumpWidget(MaterialApp(debugShowCheckedModeBanner: false,
          theme: capture ? base.copyWith(textTheme: base.textTheme.apply(fontFamily: 'PreviewArial')) : base,
          builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(config.scale), disableAnimations: true),
            child: Directionality(textDirection: config.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr, child: child!)),
          home: Scaffold(
            bottomNavigationBar: NativeTabBar(active: '/', onTap: (_) {}, accent: Colors.amber),
            body: HomeScreen(state: state, origin: 'http://127.0.0.1:${server!.port}', kit: kit, ownModel: false,
              onOpen: (_) {}, onTab: (_) {}, onSwitcher: () {}),
          ),
        ));
        await t.runAsync(() async { await Future<void>.delayed(const Duration(milliseconds: 250)); });
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
        expect(t.getSize(find.byKey(const ValueKey('aurora-home-top'))).height, greaterThanOrEqualTo(104));
        final cta = find.byKey(const ValueKey('aurora-home-hero-start'));
        expect(t.getSize(cta).width, lessThan(config.width - 36));
        if (capture && config.locale == 'en') {
          await expectLater(find.byType(MaterialApp), matchesGoldenFile('preview/home-${b.name}-top.png'));
        }
        final list = find.descendant(of: find.byKey(const ValueKey('home-list')), matching: find.byType(Scrollable)).first;
        await t.scrollUntilVisible(find.byKey(const ValueKey('home-practices')), 180, scrollable: list);
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
        if (capture && config.locale == 'en') {
          await expectLater(find.byType(MaterialApp), matchesGoldenFile('preview/home-${b.name}-practices.png'));
        }
        await t.pumpWidget(const SizedBox.shrink());
        debugNetworkImageHttpClientProvider = null;
        for (final c in clients) { c.close(force: true); }
        clients.clear();
        await t.pump(const Duration(seconds: 16));
      });
    }
  }
}
