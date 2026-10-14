import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_pet.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/pet_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/walking_pet.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart'
    as wv;

import 'hybrid_overlay_route_repro_test.dart'
    show FakeWebViewPlatform, resetHarnessSingletons;

class _RealHttp extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final realHttp = _RealHttp();
  final clients = <HttpClient>[];
  const subjectKey = Key('recovery-subject');
  final subject = find.byKey(subjectKey);
  late AssetServer server;
  late SharedState state;
  var run = 0;

  setUp(() async {
    run++;
    resetHarnessSingletons();
    PetHost.assetRevision = null;
    ScreenUi.reset();
    SharedPreferences.setMockInitialValues({'psygames_pet_skin': 'cat'});
    state = await SharedState.open();
    // Production tries all four fixed ports before port 0. Reserve only free
    // candidates briefly so this suite cannot revive on an old socket suite's
    // just-released origin. Never close another suite's listener.
    const fixedPorts = [47355, 47356, 47357, 47358];
    final reserved = <HttpServer>[];
    try {
      for (final port in fixedPorts) {
        try {
          reserved.add(
            await HttpServer.bind(InternetAddress.loopbackIPv4, port),
          );
        } on SocketException {
          // Already owned by another suite: leave it alone.
        }
      }
      server = await HttpOverrides.runWithHttpOverrides(
        AssetServer.start,
        realHttp,
      );
      expect(
        server.port,
        isNot(isIn(fixedPorts)),
        reason: 'recovery fixture must use the real ephemeral fallback',
      );
    } finally {
      for (final reservation in reserved) {
        await reservation.close(force: true);
      }
    }
    wv.WebViewPlatform.instance = FakeWebViewPlatform();
    // Only the WebView is fake. Every image request uses the real loopback server.
    debugNetworkImageHttpClientProvider = () {
      final client = HttpOverrides.runWithHttpOverrides(
        () => HttpClient(),
        realHttp,
      );
      clients.add(client);
      return client;
    };
  });
  tearDown(() async {
    debugNetworkImageHttpClientProvider = null;
    for (final client in clients) {
      client.close(force: true);
    }
    clients.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', null);
    await server.stop();
    PetHost.assetRevision = null;
    resetHarnessSingletons();
    ScreenUi.reset();
  });

  Future<T?> real<T>(WidgetTester t, Future<T> Function() action) =>
      t.runAsync(() => HttpOverrides.runWithHttpOverrides(action, realHttp));

  Future<Uint8List> png(WidgetTester t) async => (await real(t, () async {
    final recorder = ui.PictureRecorder();
    Canvas(
      recorder,
    ).drawRect(const Rect.fromLTWH(0, 0, 2, 2), Paint()..color = Colors.purple);
    final picture = recorder.endRecording();
    final image = await picture.toImage(2, 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();
    return data!.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  }))!;

  Future<void> mount(WidgetTester t, Widget child, {Key? hostKey}) async {
    t.view.physicalSize = const Size(390, 3000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: Stack(
          children: [
            // Exercise the actual HybridApp -> PetHost wiring, including disposal.
            HybridApp(key: hostKey, state: state, server: server),
            Positioned.fill(
              child: ColoredBox(
                key: subjectKey,
                color: Colors.white,
                child: child,
              ),
            ),
          ],
        ),
      ),
    );
    await t.pump();
    expect(PetHost.state, same(state));
    expect(PetHost.origin, server.origin);
    expect(
      PetHost.assetRevision,
      same(server.assetRevision),
      reason: 'actual HybridApp must install its server revision',
    );
  }

  Future<void> unmount(WidgetTester t) async {
    await t.pumpWidget(const SizedBox.shrink());
    // ignore: invalid_use_of_protected_member -- narrow listener-disposal regression, not production access
    expect((server.assetRevision as ValueNotifier<int>).hasListeners, isFalse);
    expect(PetHost.assetRevision, isNull);
    expect(PetHost.state, isNull);
    expect(PetHost.origin, isNull);
    // Flutter checks painting globals before tearDown runs.
    debugNetworkImageHttpClientProvider = null;
    for (final client in clients) {
      client.close(force: true);
    }
    clients.clear();
    await t.pump();
  }

  Future<String> shot(WidgetTester t) async =>
      '${server.putShot(await png(t))}?case=$run';

  List<RawImage> decoded(WidgetTester t) => [
    for (final e
        in find
            .descendant(of: subject, matching: find.byType(RawImage))
            .evaluate())
      if ((e.widget as RawImage).image != null) e.widget as RawImage,
  ];

  List<String> urls(WidgetTester t) => [
    for (final e
        in find
            .descendant(of: subject, matching: find.byType(Image))
            .evaluate())
      ((e.widget as Image).image as NetworkImage).url,
  ];

  Future<void> failed(WidgetTester t) async {
    final image = find
        .descendant(of: subject, matching: find.byType(Image))
        .first;
    final provider = t.widget<Image>(image).image;
    final stream = provider.resolve(
      createLocalImageConfiguration(t.element(image)),
    );
    bool? failedRequest;
    final listener = ImageStreamListener(
      (image, _) {
        failedRequest = false;
        image.dispose();
      },
      onError: (_, _) {
        failedRequest = true;
      },
    );
    stream.addListener(listener);
    try {
      for (var i = 0; i < 80 && failedRequest == null; i++) {
        await real(
          t,
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
        await t.pump();
      }
      expect(
        failedRequest,
        isTrue,
        reason: 'A real image request must first fail against the dead socket',
      );
    } finally {
      stream.removeListener(listener);
    }
    await t.pump();
    expect(
      decoded(t),
      isEmpty,
      reason: 'Failure is decoded-image absence, not just HTTP status',
    );
  }

  Future<void> recovered(WidgetTester t, int count) async {
    // A cached success may already meet count; still deliver the revision rebuild first.
    await t.pump();
    for (var i = 0; i < 80 && decoded(t).length != count; i++) {
      await real(
        t,
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await t.pump();
    }
    expect(
      decoded(t).length,
      count,
      reason: 'Same mounted images must decode after actual server recovery',
    );
    for (final image in decoded(t)) {
      expect((image.image!.width, image.image!.height), (2, 2));
    }
  }

  testWidgets(
    'walking PetFrames retries the same URL after actual server recovery',
    (t) async {
      final path = await shot(t);
      await real(t, () => server.debugDropSocket());
      await mount(
        t,
        Center(
          child: PetFrames(
            spec: PetSpec(strip: false, uris: [path], frames: 1, tickMs: 240),
            size: 52,
            origin: server.origin,
          ),
        ),
      );
      await failed(t);
      final before = urls(t);
      expect(await real(t, server.ensureAlive), isTrue);
      await recovered(t, 1);
      expect(urls(t), before);
      await unmount(t);
    },
  );

  testWidgets('GamePet retries its unchanged frame URL after actual recovery', (
    t,
  ) async {
    final bytes = await png(t);
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    // Supply a valid PNG in memory at the existing GamePet asset path; no disk/web bundle needed.
    messenger.setMockMessageHandler('flutter/assets', (message) async {
      final key = utf8.decode(
        message!.buffer.asUint8List(
          message.offsetInBytes,
          message.lengthInBytes,
        ),
      );
      if (key == 'assets/web/assets/images/pet/cat/idle0.webp') {
        return ByteData.sublistView(bytes);
      }
      return messenger.delegate.send('flutter/assets', message);
    });
    await real(t, () => server.debugDropSocket());
    await mount(
      t,
      Center(
        child: GamePet(state: state, origin: server.origin),
      ),
    );
    await failed(t);
    final before = urls(t);
    expect(await real(t, server.ensureAlive), isTrue);
    await recovered(t, 1);
    expect(urls(t), before);
    await unmount(t);
  });

  testWidgets(
    'PetScreen portrait and three still skins decode after resume recovery',
    (t) async {
      final path = await shot(t);
      final model = (jsonDecode(
        File('test/fixtures/pet_model.json').readAsStringSync(),
      ) as Map).cast<String, Object?>();
      final spec = {
        'kind': 'frames',
        'uris': [path],
        'frames': 1,
        'tickMs': 240,
      };
      ScreenUi.model(PetScreen.route).value = {
        ...model,
        'portrait': {
          'state': 'idle',
          'specs': {'idle': spec},
        },
        'skins': [
          for (final skin in model['skins'] as List)
            {...skin as Map, 'still': spec},
        ],
      };
      await real(t, () async {
        server.reviveOnResume();
        for (final s in [
          AppLifecycleState.inactive,
          AppLifecycleState.hidden,
          AppLifecycleState.paused,
        ]) {
          t.binding.handleAppLifecycleStateChanged(s);
        }
        await server.debugDropSocket(silent: true);
      });
      await mount(t, PetScreen(origin: server.origin, state: state));
      await failed(t);
      final before = urls(t);
      await real(t, () async {
        for (final s in [
          AppLifecycleState.hidden,
          AppLifecycleState.inactive,
          AppLifecycleState.resumed,
        ]) {
          t.binding.handleAppLifecycleStateChanged(s);
        }
        expect(await server.ensureAlive(), isTrue);
      });
      await recovered(t, 4);
      expect(urls(t), before);
      await unmount(t);
    },
  );

  testWidgets(
    'replacing HybridApp on the same server cannot let old disposal erase the new PetHost',
    (t) async {
      final path = await shot(t);
      Widget frames() => Center(
        child: PetFrames(
          spec: PetSpec(strip: false, uris: [path], frames: 1, tickMs: 240),
          size: 52,
          origin: server.origin,
        ),
      );
      await mount(t, frames(), hostKey: const ValueKey('old-host'));
      await recovered(t, 1);
      try {
        await mount(t, frames(), hostKey: const ValueKey('new-host'));
        await real(t, () => server.debugDropSocket());
        expect(await real(t, server.ensureAlive), isTrue);
        await recovered(t, 1);
        expect(PetHost.assetRevision, same(server.assetRevision));
      } finally {
        await unmount(t);
      }
    },
  );

  testWidgets(
    'healthy checks preserve revision, animation, decoded images and cat prefs',
    (t) async {
      final path = await shot(t);
      await mount(
        t,
        Center(
          child: PetFrames(
            spec: PetSpec(
              strip: true,
              uris: [path],
              frames: 3,
              tickMs: 240,
              accessory: path,
              boxes: List.filled(3, const Rect.fromLTWH(0.1, 0.1, 0.2, 0.2)),
            ),
            size: 52,
            origin: server.origin,
          ),
        ),
      );
      await recovered(t, 2);
      await t.pump(const Duration(milliseconds: 240));
      final petState = t.state(find.byType(PetFrames));
      double? frameLeft() => t
          .widget<Positioned>(
            find.descendant(
              of: subject,
              matching: find.byWidgetPredicate(
                (w) =>
                    w is Positioned && w.key != const ValueKey('pet-accessory'),
              ),
            ),
          )
          .left;
      expect(frameLeft(), -52);
      final beforeKey = t
          .widget<Image>(
            find.descendant(of: subject, matching: find.byType(Image)).first,
          )
          .key;
      final beforeImage = decoded(t).first.image;
      final prefs = state.snapshot();
      // ignore: invalid_use_of_protected_member -- verifies the mounted images are actually subscribed
      expect((server.assetRevision as ValueNotifier<int>).hasListeners, isTrue);
      expect(
        await real(
          t,
          () => Future.wait(List.generate(6, (_) => server.ensureAlive())),
        ),
        everyElement(isTrue),
      );
      await t.pump();
      expect(server.assetRevision.value, 0);
      expect(t.state(find.byType(PetFrames)), same(petState));
      expect(frameLeft(), -52);
      expect(
        t
            .widget<Image>(
              find.descendant(of: subject, matching: find.byType(Image)).first,
            )
            .key,
        beforeKey,
      );
      expect(decoded(t).first.image, same(beforeImage));
      expect(state.snapshot(), prefs);

      // Actual recovery changes only Image keys, including accessories, not the animation State/frame.
      await real(t, () => server.debugDropSocket());
      expect(await real(t, server.ensureAlive), isTrue);
      await recovered(t, 2);
      expect(server.assetRevision.value, 1);
      expect(t.state(find.byType(PetFrames)), same(petState));
      expect(frameLeft(), -52);
      expect(
        t
            .widget<Image>(
              find.descendant(of: subject, matching: find.byType(Image)).first,
            )
            .key,
        isNot(beforeKey),
      );
      expect(state.snapshot(), prefs);
      await unmount(t);
    },
  );

  testWidgets(
    'parallel ensureAlive coalesces to one successful revision on the same origin',
    (t) async {
      final origin = server.origin;
      for (var round = 1; round <= 2; round++) {
        await real(t, () => server.debugDropSocket(silent: true));
        final results = await real(t, () async {
          final pending = List.generate(8, (_) => server.ensureAlive());
          for (final f in pending) {
            expect(f, same(pending.first), reason: 'one in-flight recovery');
          }
          return Future.wait(pending);
        });
        expect(results, everyElement(isTrue));
        expect(server.assetRevision.value, round);
        expect(server.origin, origin);
        expect(
          await real(
            t,
            () => Future.wait(List.generate(4, (_) => server.ensureAlive())),
          ),
          everyElement(isTrue),
        );
        expect(
          server.assetRevision.value,
          round,
          reason: 'healthy follow-up does not signal another recovery',
        );
      }
      await unmount(t);
    },
  );

  testWidgets(
    'failed rebind does not publish recovery; a later real recovery publishes once',
    (t) async {
      await real(t, () => server.debugDropSocket());
      final blocker = (await real(
        t,
        () => HttpServer.bind(InternetAddress.loopbackIPv4, server.port),
      ))!;
      try {
        expect(await real(t, server.ensureAlive), isFalse);
        expect(server.assetRevision.value, 0);
      } finally {
        await real(t, () => blocker.close(force: true));
      }
      expect(await real(t, server.ensureAlive), isTrue);
      expect(server.assetRevision.value, 1);
      await unmount(t);
    },
  );

  testWidgets(
    'stop during in-flight recovery cannot notify after disposal or reopen the socket',
    (t) async {
      var notifications = 0;
      server.assetRevision.addListener(() => notifications++);
      await real(t, () => server.debugDropSocket());
      await real(t, () async {
        final pending = server.ensureAlive();
        final stopping = server.stop();
        expect(await pending, isFalse);
        await stopping;
        expect(await server.ensureAlive(), isFalse);
        // Binding that exact port proves stop did not leave/create a listening socket.
        final check = await HttpServer.bind(
          InternetAddress.loopbackIPv4,
          server.port,
        );
        await check.close(force: true);
      });
      expect(notifications, 0);
      expect(server.assetRevision.value, 0);
      expect(t.takeException(), isNull);
      await unmount(t);
    },
  );

  testWidgets(
    'actual recovery does not enable a disabled pet or overwrite skin preferences',
    (t) async {
      await state.set('psygames_pet_on', 'false');
      await state.set('psygames_pet_skin', 'robot');
      // On a packaged build HybridApp records its embedded build fingerprint
      // during startup. Seed that real fingerprint before the unchanged-prefs
      // snapshot so startup metadata cannot race this recovery assertion.
      final fingerprint = await real(t, server.fingerprint);
      if (fingerprint != null && fingerprint.isNotEmpty) {
        await state.set('psygames_embedded_build', fingerprint);
      }
      await mount(
        t,
        Center(
          child: GamePet(state: state, origin: server.origin),
        ),
      );
      final prefs = state.snapshot();
      expect(
        find.descendant(of: subject, matching: find.byType(Image)),
        findsNothing,
      );
      await real(t, () => server.debugDropSocket());
      expect(await real(t, server.ensureAlive), isTrue);
      await t.pump();
      expect(
        find.descendant(of: subject, matching: find.byType(Image)),
        findsNothing,
      );
      expect(state.snapshot(), prefs);
      await unmount(t);
    },
  );
}
