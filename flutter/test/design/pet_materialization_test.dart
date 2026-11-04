import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/pet_materialization.dart';

void main() {
  const effect = ValueKey('pet-materialization-light');
  Widget subject({
    bool active = true,
    bool enabled = true,
    bool reduced = false,
    bool ticker = true,
    VoidCallback? onTap,
  }) => MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(disableAnimations: reduced),
      child: TickerMode(
        enabled: ticker,
        child: Center(
          child: SizedBox.square(
            dimension: 220,
            child: PetMaterialization(
              active: active,
              enabled: enabled,
              child: GestureDetector(
                onTap: onTap,
                child: const ColoredBox(color: Colors.purple),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  testWidgets('plays on actual entry, finite and replayed only after exit', (
    t,
  ) async {
    await t.pumpWidget(subject(active: false));
    expect(find.byKey(effect), findsNothing);
    await t.pumpWidget(subject());
    expect(find.byKey(effect), findsOneWidget);
    await t.pump(const Duration(milliseconds: 400));
    final original = t.getRect(find.byType(PetMaterialization));
    await t.pumpWidget(subject()); // e.g. a model write; not a new entry.
    await t.pump(const Duration(milliseconds: 650));
    expect(find.byKey(effect), findsNothing);
    expect(t.getRect(find.byType(PetMaterialization)), original);
    expect(t.binding.hasScheduledFrame, isFalse);
    await t.pumpWidget(subject(active: false));
    await t.pumpWidget(subject());
    expect(find.byKey(effect), findsOneWidget);
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  });

  testWidgets(
    'does not consume portrait taps, exit cancels without pending frames',
    (t) async {
      var taps = 0;
      await t.pumpWidget(subject(onTap: () => taps++));
      await t.pump(const Duration(milliseconds: 200));
      await t.tap(find.byType(PetMaterialization));
      expect(taps, 1);
      await t.pumpWidget(subject(active: false));
      await t.pump();
      expect(find.byKey(effect), findsNothing);
      expect(t.binding.hasScheduledFrame, isFalse);
      await t.pumpWidget(const SizedBox());
      expect(t.takeException(), isNull);
    },
  );

  for (final mode in ['reduced', 'disabled', 'hidden-ticker']) {
    testWidgets('$mode shows immediately without entrance animation', (
      t,
    ) async {
      await t.pumpWidget(
        subject(
          reduced: mode == 'reduced',
          enabled: mode != 'disabled',
          ticker: mode != 'hidden-ticker',
        ),
      );
      await t.pump();
      expect(find.byKey(effect), findsNothing);
      expect(t.binding.hasScheduledFrame, isFalse);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('background interruption completes; resume does not replay', (
    t,
  ) async {
    await t.pumpWidget(subject());
    await t.pump(const Duration(milliseconds: 150));
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await t.pump();
    expect(find.byKey(effect), findsNothing);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await t.pumpWidget(subject());
    expect(find.byKey(effect), findsNothing);
    expect(t.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('real cat sprite Flutter frames (optional capture)', (t) async {
    t.view.physicalSize = const Size(640, 640);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final shot = GlobalKey();
    final bytes = File('../frontend/assets/images/pet/cat/idle0.webp')
        .readAsBytesSync();
    final image = (await t.runAsync(() async {
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      codec.dispose();
      return frame.image;
    }))!;
    addTearDown(image.dispose);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          backgroundColor: const Color(0xFF07152B),
          body: Center(
            child: RepaintBoundary(
              key: shot,
              child: SizedBox.square(
                dimension: 300,
                child: PetMaterialization(
                  active: false,
                  enabled: true,
                  child: RawImage(image: image),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await t.pump();
    // Change only visibility; same child, same real production image.
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          backgroundColor: const Color(0xFF07152B),
          body: Center(
            child: RepaintBoundary(
              key: shot,
              child: SizedBox.square(
                dimension: 300,
                child: PetMaterialization(
                  active: true,
                  enabled: true,
                  child: RawImage(image: image),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    for (var i = 0; i <= 25; i++) {
      if (i > 0) await t.pump(const Duration(milliseconds: 40));
      if (const bool.fromEnvironment('CAPTURE_PET_MOTION')) {
        await t.runAsync(() async {
          final frame =
              await (shot.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage(pixelRatio: 2);
          final bytes = await frame.toByteData(format: ui.ImageByteFormat.png);
          frame.dispose();
          final dir = Directory(
            'test/design/preview/pet-materialization-frames',
          )..createSync(recursive: true);
          File('${dir.path}/${i.toString().padLeft(3, '0')}.png')
              .writeAsBytesSync(bytes!.buffer.asUint8List());
        });
      }
    }
    expect(find.byKey(effect), findsNothing);
    expect(t.takeException(), isNull);
  });
}
