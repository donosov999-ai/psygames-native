import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

/// Rasterize the actual widget painter without clipping, with a transparent
/// guard band. Out-of-bounds paint cannot hide behind a ClipRect or screenshot.
Future<void> paintWithinBounds(
  WidgetTester tester,
  CustomPainter painter,
  Size size,
) async {
  await tester.runAsync(() async {
    const guard = 16;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)
      ..translate(guard.toDouble(), guard.toDouble());
    painter.paint(canvas, size);
    final picture = recorder.endRecording();
    final image = await picture.toImage(
      size.width.ceil() + guard * 2,
      size.height.ceil() + guard * 2,
    );
    final rgba = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    var painted = 0;
    var escaped = 0;
    for (var y = 0; y < image.height; y++) {
      for (var x = 0; x < image.width; x++) {
        if (rgba.getUint8((y * image.width + x) * 4 + 3) == 0) continue;
        painted++;
        if (x < guard ||
            y < guard ||
            x >= guard + size.width ||
            y >= guard + size.height) {
          escaped++;
        }
      }
    }
    image.dispose();
    picture.dispose();
    expect(painted, greaterThan(0));
    expect(
      escaped,
      0,
      reason: 'objects/strokes must fit actual LayoutBuilder canvas $size',
    );
  });
}

void main() {
  for (final size in [
    const Size(320, 640),
    const Size(640, 320),
    const Size(180, 120),
  ]) {
    for (final mode in ['two-dots', 'catch-overlap']) {
      testWidgets('$mode fits actual widget canvas $size across trajectories', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(
          Size(size.width + 40, size.height + 40),
        );
        addTearDown(() => tester.binding.setSurfaceSize(null));
        for (final ms in [
          0,
          2000,
          5000,
          10000,
          18000,
          26000,
          35000,
          39000,
          67000,
        ]) {
          await tester.pumpWidget(
            MaterialApp(
              home: Material(
                child: Center(
                  child: SizedBox(
                    width: size.width,
                    height: size.height,
                    child: EyeModes(
                      mode: mode,
                      elapsed: ms,
                      running: true,
                      locale: 'en',
                    ),
                  ),
                ),
              ),
            ),
          );
          final finder = find.byKey(const ValueKey('eye-mode-canvas'));
          final paint = tester.widget<CustomPaint>(finder);
          final canvasSize = tester.getSize(finder);
          expect(canvasSize.width, size.width);
          expect(canvasSize.height, lessThanOrEqualTo(size.height));
          await paintWithinBounds(tester, paint.painter!, canvasSize);
          expect(tester.takeException(), isNull);
        }
      });
    }
  }

  testWidgets(
    'pause freezes positions, wall-time and taps cannot advance scoring',
    (tester) async {
      var hits = 0;
      Future<void> show(int elapsed, bool running) => tester.pumpWidget(
        MaterialApp(
          home: Material(
            child: Center(
              child: SizedBox(
                width: 320,
                height: 400,
                child: EyeModes(
                  mode: 'catch-overlap',
                  elapsed: elapsed,
                  running: running,
                  locale: 'en',
                  onHit: () => hits++,
                ),
              ),
            ),
          ),
        ),
      );
      await show(2000, true);
      await tester.tap(find.byKey(const Key('eye-overlap-tap-area')));
      await tester.pump();
      expect(hits, 1);
      expect(find.text('Hits: 1 · Misses: 0'), findsOneWidget);
      await show(2000, false);
      final finder = find.byKey(const Key('eye-mode-canvas'));
      final before = tester.widget<CustomPaint>(finder).painter;
      await tester.pump(const Duration(seconds: 30));
      expect(tester.widget<CustomPaint>(finder).painter, same(before));
      await tester.tap(find.byKey(const Key('eye-overlap-tap-area')));
      await tester.pump();
      expect(hits, 1);
      await show(2000, true);
      await tester.tap(find.byKey(const Key('eye-overlap-tap-area')));
      await tester.pump();
      expect(hits, 1, reason: 'same original window cannot score twice');
      await show(4000, true);
      await tester.tap(find.byKey(const Key('eye-overlap-tap-area')));
      await tester.pump();
      expect(find.text('Hits: 1 · Misses: 1'), findsOneWidget);
      await show(4100, true);
      await tester.tap(find.byKey(const Key('eye-overlap-tap-area')));
      await tester.pump();
      expect(
        find.text('Hits: 1 · Misses: 1'),
        findsOneWidget,
        reason: '250ms elapsed cooldown unchanged',
      );
      await show(6000, true);
      await tester.tap(find.byKey(const Key('eye-overlap-tap-area')));
      await tester.pump();
      expect(hits, 2);
      await show(2000, true);
      expect(
        find.text('Hits: 0 · Misses: 0'),
        findsOneWidget,
        reason: 'elapsed reset still starts a fresh session',
      );
    },
  );

  testWidgets('two-dot motion has no wall clock or scoring when paused', (
    tester,
  ) async {
    var hits = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: SizedBox(
          width: 320,
          height: 400,
          child: EyeModes(
            mode: 'two-dots',
            elapsed: 35000,
            running: false,
            locale: 'en',
            onHit: () => hits++,
          ),
        ),
      ),
    );
    final finder = find.byKey(const Key('eye-mode-canvas'));
    final painter = tester.widget<CustomPaint>(finder).painter;
    await tester.pump(const Duration(minutes: 1));
    expect(tester.widget<CustomPaint>(finder).painter, same(painter));
    await tester.tap(finder);
    expect(hits, 0);
  });

  for (final shape in [
    'circle',
    'heart',
    'figure-eight',
    'diamond',
    'cross',
    'triangle',
    'square',
  ]) {
    testWidgets('$shape guide and 44px target share size-aware bounds', (
      tester,
    ) async {
      const size = Size(320, 500);
      for (final progress in [0.0, .125, .25, .5, .75, .999]) {
        final p = eyeGeometryPosition(shape, progress, size: size);
        await tester.pumpWidget(
          MaterialApp(
            home: Center(
              child: SizedBox(
                width: size.width,
                height: size.height,
                child: Stack(
                  children: [
                    const Positioned.fill(child: SizedBox()),
                    Positioned.fill(
                      child: CustomPaint(
                        painter: EyeGeometryGuide(
                          shape,
                          Colors.blue,
                          targetRadius: 22,
                        ),
                      ),
                    ),
                    Positioned(
                      left: p.dx * size.width - 22,
                      top: p.dy * size.height - 22,
                      child: const SizedBox(
                        key: Key('geometry-target'),
                        width: 44,
                        height: 44,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        final field = tester.getRect(find.byType(Stack).last);
        final target = tester.getRect(find.byKey(const Key('geometry-target')));
        expect(field.contains(target.topLeft), true);
        expect(field.contains(target.bottomRight), true);
        final painter = tester
            .widget<CustomPaint>(find.byType(CustomPaint).last)
            .painter!;
        await paintWithinBounds(tester, painter, size);
        expect(tester.takeException(), isNull);
      }
    });
  }
}
