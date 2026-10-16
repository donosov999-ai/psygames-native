import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_backup.dart' show CloudVersion;
import 'package:psygames_flutter/shell/cloud_restore.dart';
import 'package:psygames_flutter/shell/cloud_runtime.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cloud_pilot_test.dart' show PilotFake;

class _ColdFake extends PilotFake implements CloudColdCallbackGateway {
  bool valid = true;
  Completer<bool>? pending;
  List<Future<bool>>? checks;
  bool failMetadata = false;
  @override
  Future<List<CloudVersion>> versions() async {
    if (failMetadata) {
      calls.add('versions-failed');
      throw StateError('fixture');
    }
    return super.versions();
  }

  @override
  Future<bool> hasPendingLogin(Uri uri) async {
    if (checks != null) return checks!.removeAt(0);
    return pending?.future ?? (valid && uri.scheme == 'com.psygames.app');
  }
}

class _ResumeColdFake extends _ColdFake implements CloudResumeGateway {
  final recovery = Completer<bool>();
  @override
  Future<bool> resumeBackup() => recovery.future;
}

void main() {
  late SharedState state;
  late Directory dir;
  test('host vault keeps iOS device-only policy without macOS sharing provisioning', () {
    expect(
      PsyGamesAccountVault.storage.iOptions.accessibility,
      KeychainAccessibility.first_unlock_this_device,
    );
    expect(
      (PsyGamesAccountVault.storage.mOptions as MacOsOptions)
          .usesDataProtectionKeychain,
      false,
    );
  });
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_tokens_v1': '75',
      'language': 'en',
    });
    state = await SharedState.open();
    dir = await Directory.systemTemp.createTemp('psygames-cloud-startup-test-');
    await L.load('en');
  });
  tearDown(() async {
    state.dispose();
    await dir.delete(recursive: true);
  });
  test(
    'released default does not construct a cloud adapter or enable auth',
    () {
      expect(PsyGamesCloudRuntime.enabled, false);
      expect(PsyGamesCloudRuntime.fromEnvironment(state, null), isNull);
    },
  );
  test(
    'startup completes journal replacement before the next consumer',
    () async {
      await CloudRestore.prepare(
        dir,
        state,
        CloudSnapshot.capture({
          'psygames_tokens_v1': '90',
          'psygames_pet_name': 'Synapse',
        }),
      );
      expect(
        await PsyGamesCloudRuntime.applyPending(state, directory: dir),
        true,
      );
      expect(state.get('psygames_tokens_v1'), '90');
      expect(state.get('psygames_pet_name'), 'Synapse');
      expect(
        await PsyGamesCloudRuntime.applyPending(state, directory: dir),
        false,
      );
    },
  );
  test(
    'corrupt pending fails closed and retains original data/journal',
    () async {
      final file = File('${dir.path}/${CloudRestore.pendingFileName}');
      await file.writeAsString('{broken');
      await expectLater(
        PsyGamesCloudRuntime.applyPending(state, directory: dir),
        throwsFormatException,
      );
      expect(state.get('psygames_tokens_v1'), '75');
      expect(await file.exists(), true);
    },
  );
  test(
    'OFF while validating cold intent cannot exchange the callback',
    () async {
      final fake = _ColdFake()..pending = Completer<bool>();
      final pilot = CloudPilot(state, fake);
      final result = pilot.completeLink(
        Uri.parse('com.psygames.app://auth/callback?code=x'),
      );
      await Future<void>.delayed(Duration.zero);
      await pilot.disable();
      fake.pending!.complete(true);
      await result;
      expect(fake.calls, ['suspend']);
      expect(pilot.stage, CloudPilotStage.local);
      pilot.dispose();
    },
  );
  testWidgets(
    'two startup URIs retain the second when the first has no pending intent',
    (tester) async {
      await state.set(CloudPilot.consentKey, '1');
      final fake = _ResumeColdFake()
        ..checks = [Future.value(false), Future.value(true)];
      final pilot = CloudPilot(state, fake);
      final stream = StreamController<Uri>.broadcast();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        CloudLinkHost(
          runtime: PsyGamesCloudRuntime(pilot, stream.stream),
          navigatorKey: navigator,
          child: MaterialApp(
            navigatorKey: navigator,
            home: const Scaffold(body: Text('home')),
          ),
        ),
      );
      stream.add(Uri.parse('com.psygames.app://auth/callback?code=old'));
      await tester.pump();
      stream.add(Uri.parse('com.psygames.app://auth/callback?code=current'));
      await tester.pump();
      fake.recovery.complete(false);
      await tester.pumpAndSettle();
      expect(pilot.stage, CloudPilotStage.history);
      expect(fake.calls, ['callback', 'versions']);
      expect(fake.checks, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await stream.close();
    },
  );
  testWidgets(
    'cold link opens native preview in the same app, without upload',
    (tester) async {
      final fake = _ColdFake();
      final pilot = CloudPilot(state, fake);
      final stream = StreamController<Uri>.broadcast();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        CloudLinkHost(
          runtime: PsyGamesCloudRuntime(pilot, stream.stream),
          navigatorKey: navigator,
          child: MaterialApp(
            navigatorKey: navigator,
            home: const Scaffold(body: Text('home')),
          ),
        ),
      );
      stream.add(Uri.parse('com.psygames.app://auth/callback?code=x'));
      await tester.pumpAndSettle();
      expect(pilot.stage, CloudPilotStage.history);
      expect(find.text(L.t('cloudPilotHistory')), findsOneWidget);
      expect(fake.calls, ['callback', 'versions']);
      await tester.pumpWidget(const SizedBox());
      await stream.close();
    },
  );

  testWidgets(
    'initial URI waits for saved-consent recovery instead of being discarded as busy',
    (tester) async {
      await state.set(CloudPilot.consentKey, '1');
      final fake = _ResumeColdFake();
      final pilot = CloudPilot(state, fake);
      final stream = StreamController<Uri>.broadcast();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        CloudLinkHost(
          runtime: PsyGamesCloudRuntime(pilot, stream.stream),
          navigatorKey: navigator,
          child: MaterialApp(
            navigatorKey: navigator,
            home: const Scaffold(body: Text('home')),
          ),
        ),
      );
      expect(pilot.busy, true);
      stream.add(Uri.parse('com.psygames.app://auth/callback?code=x'));
      await tester.pump();
      expect(fake.calls, isEmpty);
      fake.recovery.complete(false);
      await tester.pumpAndSettle();
      expect(pilot.stage, CloudPilotStage.history);
      expect(fake.calls, ['callback', 'versions']);
      await tester.pumpWidget(const SizedBox());
      await stream.close();
    },
  );
  testWidgets('unknown native link does not navigate or exchange credentials', (
    tester,
  ) async {
    final fake = _ColdFake();
    final pilot = CloudPilot(state, fake);
    final stream = StreamController<Uri>.broadcast();
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      CloudLinkHost(
        runtime: PsyGamesCloudRuntime(pilot, stream.stream),
        navigatorKey: navigator,
        child: MaterialApp(
          navigatorKey: navigator,
          home: const Scaffold(body: Text('home')),
        ),
      ),
    );
    stream.add(Uri.parse('other.app://auth/callback?code=x'));
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
    expect(fake.calls, isEmpty);
    await tester.pumpWidget(const SizedBox());
    await stream.close();
  });
  test(
    'native callback registration and startup order match exact SDK scope',
    () {
      final main = File('lib/main.dart').readAsStringSync();
      expect(
        main.indexOf('await PsyGamesCloudRuntime.applyPending(state)'),
        lessThan(main.indexOf('await LegacyImport.seedIfEmpty(state)')),
      );
      expect(
        main.indexOf('await PsyGamesCloudRuntime.applyPending(state)'),
        lessThan(
          main.indexOf(
            'await L.load(state.language);',
            main.indexOf('// Язык'),
          ),
        ),
      );
      expect(
        main.indexOf('await PsyGamesCloudRuntime.applyPending(state)'),
        lessThan(main.indexOf('AssetServer.start()')),
      );
      final android = File('android/app/src/main/AndroidManifest.xml')
          .readAsStringSync();
      expect(
        android,
        contains(
          'android:scheme="com.psygames.app" android:host="auth" android:path="/callback"',
        ),
      );
      expect(
        android,
        contains('flutter_deeplinking_enabled" android:value="false"'),
      );
      final ios = File('ios/Runner/Info.plist').readAsStringSync();
      expect(ios, contains('<array><string>com.psygames.app</string></array>'));
      expect(ios, contains('<key>FlutterDeepLinkingEnabled</key>'));
    },
  );

  test(
    'failed metadata retries without another code exchange or upload',
    () async {
      final fake = _ColdFake()..failMetadata = true;
      final pilot = CloudPilot(state, fake);
      await pilot.completeLink(
        Uri.parse('com.psygames.app://auth/callback?code=x'),
      );
      expect(pilot.stage, CloudPilotStage.history);
      expect(pilot.historyLoaded, false);
      await pilot.confirmHistory();
      expect(fake.calls, ['callback', 'versions-failed']);
      fake.failMetadata = false;
      await pilot.refreshHistory();
      expect(pilot.historyLoaded, true);
      expect(fake.calls, ['callback', 'versions-failed', 'versions']);
      pilot.dispose();
    },
  );
  testWidgets('unrelated URI cannot consume busy slot before valid cold link', (
    tester,
  ) async {
    final fake = _ColdFake()..pending = Completer<bool>();
    final pilot = CloudPilot(state, fake);
    final stream = StreamController<Uri>.broadcast();
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      CloudLinkHost(
        runtime: PsyGamesCloudRuntime(pilot, stream.stream),
        navigatorKey: navigator,
        child: MaterialApp(
          navigatorKey: navigator,
          home: const Scaffold(body: Text('home')),
        ),
      ),
    );
    stream.add(Uri.parse('other.app://auth/callback?code=other'));
    stream.add(Uri.parse('com.psygames.app://auth/callback?code=x'));
    await tester.pump();
    fake.pending!.complete(true);
    await tester.pumpAndSettle();
    expect(pilot.stage, CloudPilotStage.history);
    expect(fake.calls, ['callback', 'versions']);
    await tester.pumpWidget(const SizedBox());
    await stream.close();
  });

  testWidgets(
    'valid callback arriving while another candidate is busy is retained',
    (tester) async {
      final first = Completer<bool>();
      final fake = _ColdFake()..checks = [first.future, Future.value(true)];
      final pilot = CloudPilot(state, fake);
      final stream = StreamController<Uri>.broadcast();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        CloudLinkHost(
          runtime: PsyGamesCloudRuntime(pilot, stream.stream),
          navigatorKey: navigator,
          child: MaterialApp(
            navigatorKey: navigator,
            home: const Scaffold(body: Text('home')),
          ),
        ),
      );
      stream.add(Uri.parse('com.psygames.app://auth/callback?code=old'));
      await tester.pump();
      stream.add(Uri.parse('com.psygames.app://auth/callback?code=current'));
      await tester.pump();
      first.complete(false);
      await tester.pumpAndSettle();
      expect(pilot.stage, CloudPilotStage.history);
      expect(fake.calls, ['callback', 'versions']);
      expect(fake.checks, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await stream.close();
    },
  );
}
