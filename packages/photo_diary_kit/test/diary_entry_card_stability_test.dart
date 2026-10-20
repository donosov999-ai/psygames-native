import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

DiaryEntry entry({
  String id = 'session',
  String? file = 'before.jpg',
  int at = 1,
}) => DiaryEntry(
  id: id,
  kind: 'practice',
  title: 'Practice',
  startedAtMs: 0,
  before: file == null ? DiaryShotState.absent : DiaryShotState.saved,
  beforeFile: file,
  beforeAtMs: at,
);

Future<Uint8List> pixels(int width, int height) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawColor(Colors.blue, BlendMode.src);
  canvas.drawRect(
    Rect.fromLTWH(0, 0, width / 2, height / 2),
    Paint()..color = Colors.red,
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final bytes = (await image.toByteData(
    format: ui.ImageByteFormat.png,
  ))!.buffer.asUint8List();
  image.dispose();
  picture.dispose();
  return bytes;
}

Widget card(DiaryEntry value, Future<Uint8List?> Function(String) read) =>
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: DiaryEntryCard(
            entry: value,
            readPhoto: read,
            onRate: (_) {},
            onDelete: () {},
          ),
        ),
      ),
    );

Future<void> loadImage(WidgetTester t) async {
  await t.pump();
  final finder = find.byType(Image);
  final image = t.widget<Image>(finder);
  // Real codec work is outside the fake widget-test clock.
  await t.runAsync(() => precacheImage(image.image, t.element(finder)));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('JPEG EXIF orientation is applied once by the codec', (t) async {
    // Synthetic 12x24 JPEG with EXIF orientation 6 (90 degrees clockwise).
    // It contains no user photo; expected decoded dimensions are 24x12.
    final bytes = base64Decode(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAYAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3EKKKKAP/2Q==',
    );
    await t.pumpWidget(card(entry(), (_) async => bytes));
    await loadImage(t);
    final raw = t.widget<RawImage>(find.byType(RawImage));
    expect(raw.image!.width, 24);
    expect(raw.image!.height, 12);
    expect(raw.fit, BoxFit.contain);
    expect(t.takeException(), isNull);
  });
  testWidgets(
    'parent ticks and fresh reader closures do not reread or flash loaded photos',
    (t) async {
      final bytes = (await t.runAsync(() => pixels(12, 24)))!;
      var reads = 0;
      final value = entry();
      Future<void> rebuild() => t.pumpWidget(
        card(value, (_) async {
          reads++;
          return bytes;
        }),
      );
      await rebuild();
      await loadImage(t);
      final provider = t.widget<Image>(find.byType(Image)).image;
      final frame = t.widget<RawImage>(find.byType(RawImage)).image;
      expect(frame, isNotNull);
      for (var tick = 0; tick < 5; tick++) {
        value.brightness = tick + 1;
        await rebuild();
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(t.widget<Image>(find.byType(Image)).image, same(provider));
        expect(t.widget<RawImage>(find.byType(RawImage)).image, same(frame));
        await t.pump();
      }
      expect(reads, 1);
      expect(t.takeException(), isNull);
    },
  );

  for (final size in [const Size(12, 24), const Size(24, 12)]) {
    testWidgets(
      'full photo preserves portrait/landscape geometry $size at 320px',
      (t) async {
        t.view.physicalSize = const Size(320, 640);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);
        final bytes = (await t.runAsync(
          () => pixels(size.width.toInt(), size.height.toInt()),
        ))!;
        await t.pumpWidget(card(entry(), (_) async => bytes));
        await loadImage(t);
        final image = t.widget<Image>(find.byType(Image));
        expect(image.fit, BoxFit.contain);
        final raw = t.widget<RawImage>(find.byType(RawImage));
        expect(raw.image!.width, size.width.toInt());
        expect(raw.image!.height, size.height.toInt());
        expect(find.byType(RotatedBox), findsNothing);
        expect(t.takeException(), isNull);
      },
    );
  }

  testWidgets('mutated shot replacement ignores a late previous read', (
    t,
  ) async {
    final bytes = (await t.runAsync(() => pixels(24, 12)))!;
    final pending = Completer<Uint8List?>();
    final value = entry();
    await t.pumpWidget(card(value, (_) => pending.future));
    value.beforeFile = 'new.jpg';
    value.beforeAtMs = 2;
    await t.pumpWidget(card(value, (_) async => bytes));
    await loadImage(t);
    final provider = t.widget<Image>(find.byType(Image)).image;
    pending.complete((await t.runAsync(() => pixels(12, 24)))!);
    await t.pumpAndSettle();
    expect(t.widget<Image>(find.byType(Image)).image, same(provider));
    expect(t.widget<RawImage>(find.byType(RawImage)).image!.width, 24);
  });

  testWidgets('removing a loaded or pending photo never retains stale bytes', (
    t,
  ) async {
    final bytes = (await t.runAsync(() => pixels(12, 24)))!;
    final value = entry();
    await t.pumpWidget(card(value, (_) async => bytes));
    await loadImage(t);
    value.before = DiaryShotState.absent;
    value.beforeFile = null;
    await t.pumpWidget(card(value, (_) async => bytes));
    expect(find.byType(Image), findsNothing);
    final pending = Completer<Uint8List?>();
    value.before = DiaryShotState.saved;
    value.beforeFile = 'pending.jpg';
    await t.pumpWidget(card(value, (_) => pending.future));
    await t.pumpWidget(
      card(entry(id: 'different', file: null), (_) async => bytes),
    );
    pending.complete(bytes);
    await t.pumpAndSettle();
    expect(find.byType(Image), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets(
    'a different entry cannot inherit pixels even with the same basename',
    (t) async {
      final first = (await t.runAsync(() => pixels(12, 24)))!;
      final second = (await t.runAsync(() => pixels(24, 12)))!;
      final pending = Completer<Uint8List?>();
      await t.pumpWidget(card(entry(id: 'first'), (_) async => first));
      await loadImage(t);
      await t.pumpWidget(card(entry(id: 'second'), (_) => pending.future));
      expect(find.byType(Image), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      pending.complete(second);
      await loadImage(t);
      expect(t.widget<RawImage>(find.byType(RawImage)).image!.width, 24);
    },
  );

  testWidgets('removed card does not resurrect on late read completion', (
    t,
  ) async {
    final bytes = (await t.runAsync(() => pixels(12, 24)))!;
    final pending = Completer<Uint8List?>();
    await t.pumpWidget(card(entry(), (_) => pending.future));
    await t.pumpWidget(const MaterialApp(home: SizedBox()));
    pending.complete(bytes);
    await t.pumpAndSettle();
    expect(find.byType(Image), findsNothing);
    expect(t.takeException(), isNull);
  });
}
