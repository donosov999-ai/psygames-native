import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_settings_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/settings_screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cloud_pilot_test.dart' show PilotFake;

void main() {
  late SharedState state;
  late CloudPilot pilot;
  late PilotFake gateway;
  Future<void> open(
    WidgetTester tester, {
    String language = 'en',
    bool largeText = false,
    bool settings = false,
    bool configured = true,
  }) async {
    SharedPreferences.setMockInitialValues({
      'psygames_sudoku_level_women': '78',
    });
    state = await SharedState.open();
    gateway = PilotFake();
    pilot = CloudPilot(state, gateway);
    PackageInfo.setMockInitialValues(
      appName: 'PsyGames',
      packageName: 'com.psygames.app',
      version: '2.56.28',
      buildNumber: '1',
      buildSignature: '',
    );
    await tester.runAsync(() async {
      await L.load(language);
      await AppLook.load(state);
    });
    await tester.binding.setSurfaceSize(const Size(360, 740));
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(largeText ? 1.8 : 1)),
          child: child!,
        ),
        home: settings
            ? SettingsScreen(
                state: state,
                cloudPilot: configured ? pilot : null,
              )
            : CloudSettingsScreen(pilot: pilot),
      ),
    );
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester t, String key) async {
    final target = find.byKey(Key(key));
    await t.ensureVisible(target);
    await t.pumpAndSettle();
    await t.tap(target);
    await t.pumpAndSettle();
  }

  Future<void> signedIn(WidgetTester tester) async {
    await tap(tester, 'cloud-begin');
    await tap(tester, 'cloud-accept');
    await tester.enterText(
      find.byKey(const Key('cloud-email')),
      'fixture@example.test',
    );
    await tap(tester, 'cloud-send-link');
    await pilot.completeLink(
      Uri.parse('com.psygames.app://auth/callback?code=fixture'),
    );
    await tester.pumpAndSettle();
  }

  tearDown(() {
    pilot.dispose();
    state.dispose();
  });

  testWidgets(
    'unconfigured released settings do not expose a pretend cloud service',
    (t) async {
      await open(t, settings: true, configured: false);
      expect(find.byKey(const Key('settings-cloud')), findsNothing);
      expect(gateway.calls, isEmpty);
    },
  );

  testWidgets(
    'configured pilot opens inside native settings without network on entry',
    (t) async {
      await open(t, settings: true);
      await tap(t, 'settings-cloud');
      expect(find.byType(CloudSettingsScreen), findsOneWidget);
      expect(gateway.calls, isEmpty);
      expect(state.get(CloudPilot.consentKey), isNull);
    },
  );

  testWidgets(
    'default LOCAL has no network or writes; explanation can be declined',
    (t) async {
      await open(t);
      expect(gateway.calls, isEmpty);
      expect(state.get(CloudPilot.consentKey), isNull);
      expect(find.text('Data stays on this device'), findsOneWidget);
      await tap(t, 'cloud-begin');
      expect(find.byKey(const Key('cloud-data-explanation')), findsOneWidget);
      expect(gateway.calls, isEmpty);
      await tap(t, 'cloud-off');
      expect(pilot.stage, CloudPilotStage.local);
      expect(state.get('psygames_sudoku_level_women'), '78');
    },
  );

  testWidgets('login does not switch ON before explicit history choice', (
    t,
  ) async {
    await open(t);
    await signedIn(t);
    expect(pilot.stage, CloudPilotStage.history);
    expect(state.get(CloudPilot.consentKey), isNull);
    expect(gateway.calls.contains('enable'), false);
    await tap(t, 'cloud-confirm-history');
    expect(pilot.enabled, true);
    expect(state.get(CloudPilot.consentKey), '1');
  });

  testWidgets('pending link leaves OFF tappable and ignores late success', (
    t,
  ) async {
    await open(t);
    await tap(t, 'cloud-begin');
    await tap(t, 'cloud-accept');
    gateway.pendingLink = Completer<void>();
    await t.enterText(
      find.byKey(const Key('cloud-email')),
      'fixture@example.test',
    );
    await t.tap(find.byKey(const Key('cloud-send-link')));
    await t.pump();
    expect(pilot.busy, true);
    final off = find.byKey(const Key('cloud-off'));
    await t.ensureVisible(off);
    await t.pump();
    await t.tap(off);
    await t.pump();
    gateway.pendingLink!.complete();
    await t.pumpAndSettle();
    expect(pilot.stage, CloudPilotStage.local);
    expect(gateway.calls.contains('enable'), false);
  });

  testWidgets(
    'restore preview needs confirmation and never applies data in active screen',
    (t) async {
      await open(t);
      await signedIn(t);
      await tap(t, 'cloud-version-one');
      expect(find.byKey(const Key('cloud-restore-preview')), findsOneWidget);
      expect(gateway.prepared, isNull);
      expect(state.get('psygames_sudoku_level_women'), '78');
      await tap(t, 'cloud-restore-confirm');
      expect(find.byKey(const Key('cloud-restore-pending')), findsOneWidget);
      expect(gateway.prepared, isNotNull);
      expect(state.get('psygames_sudoku_level_women'), '78');
    },
  );

  testWidgets(
    'delete is distinct from OFF and requires a separate confirmation',
    (t) async {
      await open(t);
      await signedIn(t);
      await tap(t, 'cloud-confirm-history');
      await tap(t, 'cloud-delete');
      expect(gateway.calls.contains('delete'), false);
      await t.tap(find.text(L.t('btn_cancel')));
      await t.pumpAndSettle();
      expect(gateway.calls.contains('delete'), false);
      await tap(t, 'cloud-delete');
      await tap(t, 'cloud-delete-confirm');
      expect(gateway.calls.contains('delete'), true);
      expect(pilot.stage, CloudPilotStage.local);
      expect(state.get('psygames_sudoku_level_women'), '78');
    },
  );

  testWidgets(
    'Russian text is bundled and readable at large scale on a small screen',
    (t) async {
      await open(t, language: 'ru', largeText: true);
      expect(find.text('Облачное сохранение'), findsOneWidget);
      await tap(t, 'cloud-begin');
      await tap(t, 'cloud-off');
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('Arabic uses RTL and does not overflow with large text', (
    t,
  ) async {
    await open(t, language: 'ar', largeText: true);
    final context = t.element(find.byKey(const Key('cloud-status')));
    expect(Directionality.of(context), TextDirection.rtl);
    await tap(t, 'cloud-begin');
    await tap(t, 'cloud-off');
    expect(t.takeException(), isNull);
  });
}
