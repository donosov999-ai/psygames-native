import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:psygames_flutter/shell/app_update.dart';
import 'package:psygames_flutter/shell/ion_icon.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:psygames_flutter/shell/whats_new_model.dart';
import 'package:psygames_flutter/shell/whats_new_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, Object?> json(String file) =>
    (jsonDecode(File(file).readAsStringSync()) as Map).cast<String, Object?>();
void language(String locale) => L.useForTest(
  locale,
  (json('assets/l10n/$locale.json')).cast<String, String>(),
);
Finder key(String id) => find.byKey(ValueKey(id));

class ByteOnlyBundle extends AssetBundle {
  ByteOnlyBundle(this.bytes);
  final Uint8List bytes;
  final paths = <String>[];
  @override
  Future<ByteData> load(String key) async {
    paths.add(key);
    return ByteData.sublistView(bytes);
  }

  @override
  Future<String> loadString(String key, {bool cache = true}) =>
      throw StateError('loadString/compute must not be used');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final data = json('assets/whats_new.json');
  final realVersion = WhatsNewScreen.appVersion;
  final realLoader = WhatsNewScreen.loadArchive;
  final realFetch = AppUpdate.fetchLatest;
  final js = <String>[];
  late SharedState state;

  setUp(() async {
    language('ru');
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
    });
    state = await SharedState.open();
    // Exercise the real appVersion -> PackageInfo path, not a release-note version.
    PackageInfo.setMockInitialValues(
      appName: 'PsyGames',
      packageName: 'test.psygames',
      version: '9.8.7',
      buildNumber: '123',
      buildSignature: 'test',
    );
    WhatsNewScreen.appVersion = realVersion;
    WhatsNewScreen.loadArchive = realLoader;
  });
  tearDown(() {
    WhatsNewScreen.appVersion = realVersion;
    WhatsNewScreen.loadArchive = realLoader;
    AppUpdate.fetchLatest = realFetch;
    ScreenUi.reset();
  });

  for (final locale in ['ru', 'en', 'ar']) {
    test(
      '$locale: whole Dart model equals the actual WEB canonical fixture',
      () {
        language(locale);
        final web = json('test/fixtures/whats_new_native_$locale.json');
        final version = (web['check'] as String).split(' · v').last;
        expect(
          whatsNewModel(
            data,
            version: version,
            primary: web['primary'] as String,
          ),
          web,
        );
      },
    );
  }

  test('all twelve headers localized; every entry/item uses RU only for ru, EN otherwise', () {
    for (final locale in L.locales) {
      language(locale);
      final m = whatsNewModel(
        data,
        version: 'package-version',
        primary: '#123456',
      );
      expect(m['title'], L.t('versionHistory'));
      expect(m['title'], isNot('versionHistory'));
      expect(m['back'], L.t('a11yBack'));
      expect(m['back'], isNot('a11yBack'));
      expect(m['check'], '${L.t('updCheckBtn')} · vpackage-version');
      expect(L.t('updCheckBtn'), isNot('updCheckBtn'));
      expect(m['backIcon'], locale == 'ar' ? 'arrow-forward' : 'arrow-back');
      expect(m['entries'], [
        for (final e in (data['entries'] as List).cast<Map>())
          {
            'version': 'v${e['version']}',
            'date': e['date'],
            'items': e[locale == 'ru' ? 'ru' : 'en'],
          },
      ]);
    }
  });

  testWidgets(
    'large archive loader uses bytes, never loadString/isolate/cached fake-time futures',
    (t) async {
      final bytes = File('assets/whats_new.json').readAsBytesSync();
      expect(bytes.length, greaterThan(50 * 1024));
      final bundle = ByteOnlyBundle(bytes);
      expect(await WhatsNewData.load(bundle: bundle), data);
      expect(await WhatsNewData.load(bundle: bundle), data);
      expect(bundle.paths, ['assets/whats_new.json', 'assets/whats_new.json']);
    },
  );

  test('malformed bundled data fails rather than pretending an empty archive loaded', () async {
    for (final bad in [
      {},
      {'entries': []},
      {
        'entries': [
          {
            'version': 'x',
            'date': 'y',
            'ru': [],
            'en': [null],
          },
        ],
      },
    ]) {
      await expectLater(
        WhatsNewData.load(
          bundle: ByteOnlyBundle(
            Uint8List.fromList(utf8.encode(jsonEncode(bad))),
          ),
        ),
        throwsFormatException,
      );
    }
  });

  Future<void> settle(WidgetTester t) async {
    for (
      var i = 0;
      i < 40 &&
          key('whats-new-list').evaluate().isEmpty &&
          key('whats-new-load-error').evaluate().isEmpty;
      i++
    ) {
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await t.pump();
    }
    await t.pump();
  }

  Future<void> mount(
    WidgetTester t, {
    bool dark = false,
    double scale = 1,
  }) async {
    t.view.physicalSize = const Size(320, 568);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.runAsync(WebTheme.load);
    await t.pumpWidget(
      MaterialApp(
        theme: dark ? ThemeData.dark() : ThemeData.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: WhatsNewScreen(state: state),
      ),
    );
    await settle(t);
  }

  Color checkColor(WidgetTester t) =>
      (t
                  .widget<Container>(
                    find
                        .descendant(
                          of: key('whats-new-check'),
                          matching: find.byWidgetPredicate(
                            (w) =>
                                w is Container && w.decoration is BoxDecoration,
                          ),
                        )
                        .first,
                  )
                  .decoration
              as BoxDecoration)
          .color!;

  testWidgets(
    'native own page: every constructed card/item, package label and shared back; no ScreenUi model',
    (t) async {
      await mount(t);
      expect(ScreenUi.model(WhatsNewScreen.route).value, isNull);
      expect(find.text('${L.t('updCheckBtn')} · v9.8.7'), findsOneWidget);
      final list = t.widget<ListView>(key('whats-new-list'));
      final children =
          (list.childrenDelegate as SliverChildListDelegate).children;
      final entries = (data['entries'] as List).cast<Map>();
      expect(children.length, entries.length + 1);
      // Inspect ALL actual card widgets built by this page, not just first five or a TS regex.
      for (var i = 0; i < entries.length; i++) {
        final card = (children[i + 1] as Padding).child! as Container;
        expect(card.key, ValueKey('whats-new-v${entries[i]['version']}'));
        final content = (card.child! as Column).children;
        final header = ((content.first as Padding).child! as Row).children;
        expect(
          ((header.first as Flexible).child as Text).data,
          'v${entries[i]['version']}',
        );
        expect(
          ((header.last as Flexible).child as Text).data,
          entries[i]['date'],
        );
        expect([
          for (final row in content.skip(1).cast<Row>())
            ((row.children.last as Expanded).child as Text).data,
        ], entries[i]['ru']);
      }
      expect(checkColor(t), WebTheme.accent(state));
      await t.tap(key('whats-new-back'));
      expect(js.single, contains('["/whats-new"].back()'));
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'native check uses PackageInfo: newer/current/unavailable and busy duplicate guard',
    (t) async {
      await mount(t);
      for (final (latest, title) in [
        ('9.9.0', '${L.t('updAvailable')} v9.9.0'),
        ('9.8.7', '✓ ${L.t('updLatest')}'),
        (null, L.t('updCheckFailed')),
      ]) {
        AppUpdate.fetchLatest = () async => latest;
        await t.tap(key('whats-new-check'));
        await t.pumpAndSettle();
        expect(find.text(title), findsOneWidget);
        if (latest == '9.8.7') expect(find.text('v9.8.7'), findsOneWidget);
        if (latest == '9.9.0') {
          expect(find.byKey(const Key('whats-new-download')), findsOneWidget);
        }
        await t.tapAt(const Offset(1, 1));
        await t.pumpAndSettle();
      }
      var calls = 0;
      final gate = Completer<String?>();
      AppUpdate.fetchLatest = () {
        calls++;
        return gate.future;
      };
      await t.tap(key('whats-new-check'));
      await t.pump();
      expect(find.text('…'), findsOneWidget);
      await t.tap(key('whats-new-check'));
      await t.pump();
      expect(calls, 1);
      gate.complete(null);
      await t.pumpAndSettle();
      await t.tapAt(const Offset(1, 1));
      await t.pumpAndSettle();
      expect(find.text('${L.t('updCheckBtn')} · v9.8.7'), findsOneWidget);
    },
  );

  testWidgets(
    'same mounted page follows locale, dark theme, profile/equipped accent without reloading archive',
    (t) async {
      var loads = 0;
      WhatsNewScreen.loadArchive = () async {
        loads++;
        return data;
      };
      await mount(t);
      final before = t.state(find.byType(WhatsNewScreen));
      language('ar');
      await t.runAsync(() => state.set('language', 'ar'));
      await t.runAsync(() => state.set('psygames_active_profile', 'free'));
      await t.pump();
      expect(find.text(L.t('versionHistory')), findsOneWidget);
      expect(
        find.descendant(
          of: key('whats-new-back'),
          matching: find.byWidgetPredicate(
            (w) => w is IonIcon && w.name == 'arrow-forward',
          ),
        ),
        findsOneWidget,
      );
      expect(
        Directionality.of(t.element(key('whats-new-list'))),
        TextDirection.rtl,
      );
      expect(checkColor(t), WebTheme.accent(state));
      final accent = WebTheme.cosmeticAccents.keys.first;
      await t.runAsync(
        () => state.set(
          WebTheme.equippedKey.replaceAll('{profile}', 'free'),
          jsonEncode({'accent': accent}),
        ),
      );
      await t.pump();
      expect(checkColor(t), WebColors.hex(WebTheme.cosmeticAccents[accent]!));
      await mount(t, dark: true, scale: 2);
      await t.pump(
        const Duration(milliseconds: 300),
      ); // MaterialApp's existing theme animation
      await t.pump();
      expect(t.state(find.byType(WhatsNewScreen)), same(before));
      expect(loads, 1);
      expect(
        t.widget<Material>(key('whats-new-screen')).color,
        WebTheme.dark.background,
      );
      expect(t.takeException(), isNull, reason: '320×568, text scale 2, RTL');
    },
  );

  testWidgets(
    'locale/profile changing during async load cannot install a stale localized model',
    (t) async {
      final pending = Completer<Map<String, Object?>>();
      WhatsNewScreen.loadArchive = () => pending.future;
      await mount(t);
      language('en');
      await t.runAsync(() => state.set('psygames_active_profile', 'free'));
      pending.complete(data);
      await t.pump();
      await settle(t);
      expect(find.text(L.t('versionHistory')), findsOneWidget);
      expect(checkColor(t), WebTheme.accent(state));
      final first = (data['entries'] as List).first as Map;
      expect(find.text((first['en'] as List).first as String), findsOneWidget);
    },
  );

  testWidgets(
    'failed or timed-out archive stays native, exposes retry/back, and late old load cannot replace retry',
    (t) async {
      final old = Completer<Map<String, Object?>>();
      var calls = 0;
      WhatsNewScreen.loadArchive = () {
        calls++;
        return calls == 1 ? old.future : Future.value(data);
      };
      await mount(t);
      await t.pump(const Duration(seconds: 9));
      await t.pump();
      expect(key('whats-new-load-error'), findsOneWidget);
      expect(key('whats-new-screen-loading'), findsNothing);
      expect(ScreenUi.model(WhatsNewScreen.route).value, isNull);
      await t.tap(key('whats-new-load-retry'));
      await t.pump();
      await settle(t);
      expect(key('whats-new-list'), findsOneWidget);
      old.complete({'entries': []});
      await t.pump();
      expect(key('whats-new-list'), findsOneWidget);
      expect(key('whats-new-load-error'), findsNothing);
    },
  );

  testWidgets(
    'package failure is an explicit native error, not archive-version fallback or forever spinner',
    (t) async {
      WhatsNewScreen.appVersion = () async =>
          throw StateError('package unavailable');
      await mount(t);
      expect(key('whats-new-load-error'), findsOneWidget);
      expect(key('whats-new-screen-loading'), findsNothing);
      expect(key('whats-new-check'), findsNothing);
      await t.tap(find.text(L.t('a11yBack')));
      expect(js.single, contains('["/whats-new"].back()'));
      WhatsNewScreen.appVersion = realVersion;
      await t.tap(key('whats-new-load-retry'));
      await t.pump();
      await settle(t);
      expect(find.text('${L.t('updCheckBtn')} · v9.8.7'), findsOneWidget);
    },
  );

  testWidgets(
    'archive IO failure does not display a cached WEB model; retry uses the complete native archive',
    (t) async {
      ScreenUi.model(WhatsNewScreen.route).value = {
        'v': 1,
        'title': 'old WEB page',
        'entries': [],
      };
      WhatsNewScreen.loadArchive = () async =>
          throw const FileSystemException('asset read failed');
      await mount(t);
      expect(key('whats-new-load-error'), findsOneWidget);
      expect(find.text('old WEB page'), findsNothing);
      WhatsNewScreen.loadArchive = realLoader;
      await t.tap(key('whats-new-load-retry'));
      await t.pump();
      await settle(t);
      expect(key('whats-new-list'), findsOneWidget);
      expect(find.text('old WEB page'), findsNothing);
    },
  );

  testWidgets(
    'empty package version fails visibly rather than borrowing the latest archive version',
    (t) async {
      WhatsNewScreen.appVersion = () async => '';
      await mount(t);
      expect(key('whats-new-load-error'), findsOneWidget);
      expect(key('whats-new-check'), findsNothing);
    },
  );

  testWidgets(
    'dispose with never-completing asset IO leaves no watchdog/test timer',
    (t) async {
      WhatsNewScreen.loadArchive = () =>
          Completer<Map<String, Object?>>().future;
      await mount(t);
      await t.pumpWidget(const SizedBox.shrink());
      await t.pump();
      // Do not complete IO or advance 8 seconds: the binding checks pending timers at teardown.
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('unmount revokes pending load and removes SharedState listener', (
    t,
  ) async {
    final pending = Completer<Map<String, Object?>>();
    WhatsNewScreen.loadArchive = () => pending.future;
    await mount(t);
    // ignore: invalid_use_of_protected_member -- narrow disposal regression, not production access
    expect(state.writes.hasListeners, isTrue);
    await t.pumpWidget(const SizedBox.shrink());
    // ignore: invalid_use_of_protected_member -- the screen must detach its own listener
    expect(state.writes.hasListeners, isFalse);
    pending.complete(data);
    await t.pump();
    expect(t.takeException(), isNull);
  });
}
