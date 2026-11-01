import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/pet_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/stats_screen.dart';
import 'package:psygames_flutter/shell/tab_chrome.dart';
import 'package:psygames_flutter/shell/warmup_screens.dart';
import 'package:psygames_flutter/synapse/synapse_feed.dart';

Map<String, Object?> fixture(String name) =>
    (jsonDecode(File('test/fixtures/$name').readAsStringSync()) as Map)
        .cast<String, Object?>();
Finder key(String k) => find.byKey(ValueKey(k));
void main() {
  final js = <String>[];
  final paths = <String>[];
  final owner = Object();
  setUp(() {
    js.clear();
    paths.clear();
    ScreenUi.reset();
    L.useForTest(
      'en',
      (jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map)
          .cast<String, String>(),
    );
    ScreenUi.run = (s) async => js.add(s);
    WarmupUi.run = (s) async => js.add(s);
    TabChromeHost.bind(owner, paths.add);
  });
  tearDown(() {
    ScreenUi.reset();
    WarmupUi.run = null;
    WarmupUi.picker.value = null;
    TabChromeHost.unbind(owner);
    SynapseFeed.resetForTest();
  });
  Future<void> mount(
    WidgetTester t,
    Widget page, {
    double width = 390,
    double scale = 1,
    Brightness brightness = Brightness.dark,
    bool rtl = false,
  }) async {
    t.view.physicalSize = Size(width, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        theme: applyUiTemplate(
          classicShellTheme(brightness),
          UiTemplate.aurora,
        ),
        home: MediaQuery(
          data: MediaQueryData(
            size: Size(width, 1200),
            textScaler: TextScaler.linear(scale),
            disableAnimations: true,
          ),
          child: Directionality(
            textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
            child: Scaffold(body: page),
          ),
        ),
      ),
    );
    await t.pump();
  }

  Map<String, Object?> pet() =>
      (fixture('pet_dart_fresh.json')['model'] as Map).cast<String, Object?>();
  for (final b in Brightness.values) {
    for (final width in [320.0, 390.0, 800.0]) {
      testWidgets(
        'Workout content-sized tiles ${b.name} $width; no root back',
        (t) async {
          WarmupUi.picker.value = fixture('warmup_model_from_screen_en.json');
          await mount(
            t,
            const WarmupPickerScreen(),
            width: width,
            brightness: b,
          );
          for (final id in ['morning', 'day', 'evening', 'night']) {
            final size = t.getSize(key('warmup-card-$id'));
            expect(
              size.height,
              72,
              reason: 'height must not derive from width',
            );
            expect(size.width, lessThanOrEqualTo(130));
          }
          expect(
            t.getSize(key('workout-connected-outline')).width,
            lessThanOrEqualTo(492),
          );
          expect(find.byIcon(Icons.arrow_back), findsNothing);
          final daySemantics = t.widget<Semantics>(
            find
                .descendant(
                  of: key('warmup-card-day'),
                  matching: find.byType(Semantics),
                )
                .first,
          );
          expect(
            daySemantics.properties.onTap,
            isNotNull,
            reason: 'VoiceOver must retain the same explicit selection action',
          );
          js.clear();
          await t.tap(key('warmup-card-day'));
          expect(js.single, contains('picker.pick("day")'));
          expect(
            key('warmup-details-morning'),
            findsOneWidget,
            reason: 'no optimistic choice',
          );
          expect(t.takeException(), isNull);
        },
      );
      testWidgets(
        'Pet square console contains name speech Feed-first care shop ${b.name} $width',
        (t) async {
          ScreenUi.model('/pet').value = pet();
          await mount(
            t,
            const PetScreen(origin: 'http://127.0.0.1:1', ownModel: false),
            width: width,
            brightness: b,
          );
          final stage = key('pet-gem-stage'), rect = t.getRect(stage);
          expect(rect.width, lessThanOrEqualTo(390));
          expect(rect.height, rect.width);
          final buttons = [
            'pet-feed',
            'pet-care-wash',
            'pet-care-stroke',
            'pet-care-play',
          ];
          for (final id in ['pet-name', 'pet-bubble', 'pet-shop', ...buttons]) {
            expect(
              find.descendant(of: stage, matching: key(id)),
              findsOneWidget,
            );
            final r = t.getRect(key(id));
            expect(rect.contains(r.center), isTrue, reason: id);
          }
          for (var i = 1; i < buttons.length; i++) {
            expect(
              t.getRect(key(buttons[i])).left,
              greaterThan(t.getRect(key(buttons[i - 1])).left),
            );
          }
          expect(key('pet-back'), findsNothing);
          await t.tap(key('pet-shop'));
          expect(paths, ['/shop']);
          for (final pair in [
            ('pet-feed', 'feed'),
            ('pet-care-wash', 'wash'),
            ('pet-care-stroke', 'stroke'),
          ]) {
            js.clear();
            await t.tap(key(pair.$1));
            expect(js.single, contains('.${pair.$2}('));
          }
          expect(t.takeException(), isNull);
          js.clear();
          await t.tap(key('pet-care-play'));
          await t.pump();
          expect(
            js,
            isEmpty,
            reason: 'Play is local, never routes to catalogue',
          );
          expect(
            find.descendant(of: stage, matching: key('pet-play-toy')),
            findsOneWidget,
          );
          final toyBefore = t.getRect(key('pet-play-toy'));
          await t.tap(key('pet-play-toy'));
          await t.pump();
          expect(t.getRect(key('pet-play-toy')), isNot(toyBefore));
          expect(js, isEmpty, reason: 'No session, token or training write');
          await t.tap(key('pet-play-close'));
          await t.pump();
          expect(key('pet-play-toy'), findsNothing);
        },
      );
    }
  }
  testWidgets(
    'Night restrictions and confirmed programme selection retain model authority',
    (t) async {
      final m = fixture('warmup_model_from_screen_en.json');
      final slots = m['slots'] as List;
      (slots[3] as Map)['off'] = true;
      WarmupUi.picker.value = m;
      await mount(t, const WarmupPickerScreen());
      js.clear();
      await t.tap(key('warmup-card-night'));
      expect(js, isEmpty);
      (slots[3] as Map)['off'] = false;
      (slots[0] as Map)['on'] = false;
      (slots[3] as Map)['on'] = true;
      WarmupUi.picker.value = Map<String, Object?>.from(m);
      await t.pump();
      expect(key('warmup-details-night'), findsOneWidget);
      expect(key('warmup-details-morning'), findsNothing);
      js.clear();
      await t.tap(key('warmup-card-night'));
      expect(js.single, contains('picker.pick("night")'));
      expect(t.takeException(), isNull);
    },
  );
  for (final rtl in [false, true]) {
    testWidgets(
      'Pet long speech stays inside; rename and expand at x2 rtl=$rtl',
      (t) async {
        final m = pet()
          ..['bubble'] = List.filled(
            18,
            'Long localized factual speech',
          ).join(' ');
        ScreenUi.model('/pet').value = m;
        await mount(
          t,
          const PetScreen(origin: 'http://127.0.0.1:1', ownModel: false),
          width: 320,
          scale: 2,
          rtl: rtl,
        );
        expect(
          find.descendant(
            of: key('pet-gem-stage'),
            matching: key('pet-bubble'),
          ),
          findsOneWidget,
        );
        final before = t.getSize(key('pet-gem-stage')).height;
        await t.tap(key('pet-speech-expand'));
        await t.pump();
        expect(t.getSize(key('pet-gem-stage')).height, greaterThan(before));
        await t.tap(key('pet-name'));
        await t.pump();
        await t.enterText(key('pet-name-field'), 'My companion');
        await t.tap(key('pet-name-save'));
        await t.pump();
        expect(js.last, contains('saveName("My companion")'));
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'Local pet play stops on background and tab exit without model writes',
    (t) async {
      ScreenUi.model('/pet').value = pet();
      await mount(
        t,
        const PetScreen(origin: 'http://127.0.0.1:1', ownModel: false),
      );
      js.clear();
      await t.tap(key('pet-care-play'));
      await t.pump();
      expect(key('pet-play-toy'), findsOneWidget);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await t.pump();
      expect(key('pet-play-toy'), findsNothing);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.tap(key('pet-care-play'));
      await t.pump();
      await mount(
        t,
        const PetScreen(
          origin: 'http://127.0.0.1:1',
          ownModel: false,
          active: false,
        ),
      );
      expect(key('pet-play-toy'), findsNothing);
      expect(js, isEmpty);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('AI Next and Close remain inside console, not outside picture', (
    t,
  ) async {
    SharedPreferences.setMockInitialValues({
      'language': 'en',
      'psygames_active_profile': 'nzt48',
    });
    final s = await SharedState.open();
    await s.set(
      SynapseFeed.linesKey('nzt48'),
      jsonEncode({
        'at': DateTime.now().toIso8601String(),
        'lines': [
          {'text': 'First factual line'},
          {'text': 'Second factual line'},
        ],
      }),
    );
    ScreenUi.model('/pet').value = pet();
    await mount(
      t,
      PetScreen(origin: 'http://127.0.0.1:1', ownModel: false, state: s),
    );
    expect(
      find.descendant(
        of: key('pet-gem-stage'),
        matching: key('pet-synapse-next'),
      ),
      findsOneWidget,
    );
    await t.tap(key('pet-speech-expand'));
    await t.pump();
    await t.ensureVisible(key('pet-synapse-next'));
    await t.tap(key('pet-synapse-next'));
    await t.pump();
    expect(find.text('Second factual line'), findsOneWidget);
    await t.ensureVisible(key('pet-synapse-close'));
    await t.tap(key('pet-synapse-close'));
    await t.pump();
    expect(SynapseFeed.linesFor(s), isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets(
    'Progress pull refresh and semantic action replace root Back/Refresh',
    (t) async {
      ScreenUi.model('/statistics').value = fixture('stats_model_en.json');
      await mount(t, StatsScreen(onTab: (_) {}));
      expect(key('stats-back'), findsNothing);
      expect(key('stats-refresh'), findsNothing);
      final refresh = t.widget<RefreshIndicator>(key('stats-pull-refresh'));
      js.clear();
      await refresh.onRefresh();
      expect(js.single, contains('.refresh('));
      final semantics = t
          .widgetList<Semantics>(find.byType(Semantics))
          .firstWhere(
            (s) => s.properties.customSemanticsActions?.isNotEmpty == true,
          );
      final action = semantics.properties.customSemanticsActions!.values.single;
      js.clear();
      action();
      await t.pump();
      expect(js.single, contains('.refresh('));
      expect(t.takeException(), isNull);
    },
  );
}
