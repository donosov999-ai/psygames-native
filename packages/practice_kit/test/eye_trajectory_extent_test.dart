import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

const shapes = [
  'circle',
  'heart',
  'figure-eight',
  'diamond',
  'cross',
  'triangle',
  'square',
];
const sizes = [Size(320, 640), Size(640, 320), Size(800, 600), Size(90, 70)];

Rect extent(Iterable<Offset> points) {
  var left = double.infinity, top = double.infinity;
  var right = double.negativeInfinity, bottom = double.negativeInfinity;
  for (final p in points) {
    left = math.min(left, p.dx);
    right = math.max(right, p.dx);
    top = math.min(top, p.dy);
    bottom = math.max(bottom, p.dy);
  }
  return Rect.fromLTRB(left, top, right, bottom);
}

void inside(Offset p, double radius, Size size) {
  expect(p.dx - radius, greaterThanOrEqualTo(-1e-8));
  expect(p.dy - radius, greaterThanOrEqualTo(-1e-8));
  expect(p.dx + radius, lessThanOrEqualTo(size.width + 1e-8));
  expect(p.dy + radius, lessThanOrEqualTo(size.height + 1e-8));
}

void main() {
  for (final size in sizes) {
    test('two dots cover available width/height without clipping: $size', () {
      final positions = <Offset>[];
      for (var ms = 0; ms <= 40000; ms += 10) {
        final dots = EyeDots.at(ms, size);
        inside(dots.first, dots.radius, size);
        inside(dots.second, dots.radius, size);
        positions.addAll([dots.first, dots.second]);
      }
      final bounds = extent(positions);
      final radius = EyeDots.at(0, size).radius;
      expect(bounds.width, closeTo(size.width - 2 * (radius + 1), .02));
      expect(bounds.height, closeTo(size.height - 2 * (radius + 1), .02));
    });

    test(
      'catch reaches the field, real overlap in every unchanged window: $size',
      () {
        final positions = <Offset>[];
        final windows = <int>{};
        for (var ms = 0; ms < 120000; ms += 10) {
          final targets = EyeTargets.at(ms, size);
          inside(targets.disc, targets.discRadius, size);
          inside(
            targets.ring,
            targets.ringRadius + targets.ringStrokeWidth,
            size,
          );
          expect(targets.window, ms ~/ 4000);
          expect(
            targets.matches,
            (targets.disc - targets.ring).distance + targets.discRadius <=
                targets.ringRadius,
          );
          if (targets.matches) windows.add(targets.window);
          positions.addAll([targets.disc, targets.ring]);
        }
        expect(windows, containsAll(List.generate(30, (i) => i)));
        final bounds = extent(positions);
        final t = EyeTargets.at(0, size);
        final margin = t.ringRadius + t.ringStrokeWidth + 1;
        expect(bounds.width / (size.width - 2 * margin), greaterThan(.97));
        expect(bounds.height / (size.height - 2 * margin), greaterThan(.97));
        for (var ms = 2000; ms < 120000; ms += 4000) {
          expect(
            EyeTargets.at(ms, size).matches,
            true,
            reason: 'original four-second crossing clock must remain reachable',
          );
        }
      },
    );

    for (final shape in shapes) {
      test('$shape uses all size-aware available area: $size', () {
        final positions = <Offset>[];
        for (var i = 0; i <= 4000; i++) {
          final p = eyeGeometryPosition(shape, i / 4000, size: size);
          final pixels = Offset(p.dx * size.width, p.dy * size.height);
          inside(pixels, 22, size);
          positions.add(pixels);
        }
        final bounds = extent(positions);
        expect(bounds.left, closeTo(23, .01));
        expect(bounds.top, closeTo(23, .01));
        expect(bounds.right, closeTo(size.width - 23, .01));
        expect(bounds.bottom, closeTo(size.height - 23, .01));
      });
    }
  }

  test('two-dot directions vary, remain continuous and at rest at joins', () {
    const size = Size(400, 600);
    expect(EyeDots.at(2000, size).first.dy, 300);
    expect(EyeDots.at(10000, size).first.dx, 200);
    final down = EyeDots.at(18000, size).first - const Offset(200, 300);
    final up = EyeDots.at(26000, size).first - const Offset(200, 300);
    expect(down.dx * down.dy, greaterThan(0));
    expect(up.dx * up.dy, lessThan(0));
    final orbit = EyeDots.at(35000, size).first - const Offset(200, 300);
    expect(orbit.dx.abs(), greaterThan(1));
    expect(orbit.dy.abs(), greaterThan(1));
    for (var ms = 1; ms <= 80000; ms++) {
      final before = EyeDots.at(ms - 1, size), after = EyeDots.at(ms, size);
      expect((before.first - after.first).distance, lessThan(1.5));
    }
    for (var ms = 8000; ms <= 80000; ms += 8000) {
      expect(
        (EyeDots.at(ms - 1, size).first - EyeDots.at(ms, size).first).distance,
        lessThan(.001),
      );
      expect(
        (EyeDots.at(ms + 1, size).first - EyeDots.at(ms, size).first).distance,
        lessThan(.001),
      );
    }
  });

  test(
    'legacy geometry calls expanded, periodic and continuous across loops',
    () {
      for (final shape in shapes) {
        final bounds = extent(
          List.generate(4001, (i) => eyeGeometryPosition(shape, i / 4000)),
        );
        expect(bounds.left, closeTo(.1, .0001));
        expect(bounds.top, closeTo(.1, .0001));
        expect(bounds.right, closeTo(.9, .0001));
        expect(bounds.bottom, closeTo(.9, .0001));
        for (final p in [-.25, 0.0, .5, .99999, 1.0]) {
          expect(
            (eyeGeometryPosition(shape, p) - eyeGeometryPosition(shape, p + 1))
                .distance,
            lessThan(1e-8),
          );
        }
        expect(
          (eyeGeometryPosition(shape, 1 - 1e-6) - eyeGeometryPosition(shape, 0))
              .distance,
          lessThan(.0001),
        );
      }
    },
  );

  test('zero field does not create non-finite geometry', () {
    expect(EyeDots.at(0, Size.zero).first, Offset.zero);
    expect(EyeTargets.at(0, Size.zero).ring, Offset.zero);
    expect(
      eyeGeometryPosition('circle', 0, size: Size.zero),
      const Offset(.5, .5),
    );
  });
}
