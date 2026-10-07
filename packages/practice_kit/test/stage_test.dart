import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

/// СЦЕНА ПРАКТИКИ — пробы, переехавшие из «Умного будильника» вместе со сценой
/// (07.10.2026): сцена теперь одна на PsyGames и будильник, и её пробы идут в CI
/// обоих приложений.
///
/// · рамка фаз стоит на месте во всех фазах дыхания (phase_clock_test будильника);
/// · в вырезку фигуры ни для одного набора не попадает рука (practice_artwork_test,
///   задача 42f41a49; отчёты Дениса 01fbe4b2, fc840740) — теперь по WebP пакета;
/// · все схемы шагов собираются во Flutter (ui_test будильника);
/// · комбо «дыхание + Кегель»: шар и рисунок на месте во всех фазах и не
///   перекрываются (combo_visual_test, Кодекс 03.10).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  _phaseClockTests();

  test('🔴 в вырезку каждого набора не попадает ни одна рука', () async {
    // Исходник читается по пикселям: руки на нём — отдельные непрозрачные
    // отрезки строки, центр которых далеко от оси тела. Туловище, голова и ноги
    // держатся у оси (центр отрезка в 0,33–0,67 ширины).
    final bytes = File('assets/cosmic-body/body-master-v1.webp').readAsBytesSync();
    final codec = await ui.instantiateImageCodec(bytes);
    final image = (await codec.getNextFrame()).image;
    final rgba = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    final w = image.width, h = image.height;
    bool opaque(int x, int y) => rgba.getUint8((y * w + x) * 4 + 3) > 40;

    expect(cosmicFocus.keys, containsAll(['pelvic-floor', 'abdomen', 'face-speech']));
    for (final e in cosmicFocus.entries) {
      final (cx, cy, part) = e.value;
      final x0 = ((cx - part / 2) * w).round(), x1 = ((cx + part / 2) * w).round();
      final half = part * w / h / 2;
      final y0 = ((cy - half) * h).round(), y1 = ((cy + half) * h).round();
      expect(y0 >= 0 && y1 <= h && x0 >= 0 && x1 <= w, isTrue, reason: '${e.key}: вырезка за краем исходника');
      final arms = <String>[];
      for (var y = y0; y < y1; y++) {
        var x = 0;
        while (x < w) {
          if (!opaque(x, y)) {
            x++;
            continue;
          }
          final start = x;
          while (x < w && opaque(x, y)) {
            x++;
          }
          final end = x - 1, centre = (start + end) / 2 / w;
          final inCrop = end >= x0 && start < x1;
          if (inCrop && end - start > 6 && (centre < .33 || centre > .67)) {
            arms.add('y=${(y / h).toStringAsFixed(3)} x=${(start / w).toStringAsFixed(3)}…${(end / w).toStringAsFixed(3)}');
          }
        }
      }
      expect(arms, isEmpty, reason: '${e.key}: в вырезку попала рука — ${arms.take(3).join('; ')}');
    }
  });

  test('все схемы шагов собираются во Flutter (600×390)', () async {
    final files = Directory('assets/guides').listSync().whereType<File>().toList();
    expect(files.length, greaterThanOrEqualTo(98));
    for (final file in files) {
      final picture = await vg.loadPicture(SvgStringLoader(file.readAsStringSync()), null);
      expect(picture.size, const Size(600, 390), reason: file.path);
      picture.picture.dispose();
    }
  });

  final engine = Practices(jsonDecode(File('assets/practices.json').readAsStringSync()));
  for (final size in [const Size(320, 300), const Size(390, 400)]) {
    testWidgets('real stage holds orb and artwork at $size', (tester) async {
      final font = Platform.environment['PRACTICE_FONT'];
      if (font != null) {
        final loader = FontLoader('PracticeEvidence')..addFont(
          Future.value(ByteData.sublistView(File(font).readAsBytesSync())));
        await loader.load();
      }
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final program = objects(engine.set('breathing')['programs']).firstWhere(
        (p) => objects(p['steps']).any((s) => s['id'] == 'hold-out'));
      final plan = engine.plan({'mode': 'parallel', 'durationMs': 60000,
        'locale': 'ru', 'guideMode': 'visual', 'context': 'home', 'advisory': true,
        'selections': [{'setId': 'breathing', 'programId': program['id']},
          {'setId': 'pelvic-floor', 'programId': 'balanced'}]});
      Rect? artRect, orbRect;
      for (final step in objects(plan['timeline']).where((s) => s['setId'] == 'breathing').take(4)) {
        final elapsed = (step['startMs'] as int) + 1000;
        await tester.pumpWidget(MaterialApp(theme: ThemeData(fontFamily: font == null ? null : 'PracticeEvidence'),
          home: Scaffold(body: RepaintBoundary(
          key: const Key('capture-stage'), child: ColoredBox(color: const Color(0xfffaf8ff),
            child: PracticeStage(engine: engine,
            cues: objects(engine.frame(plan, elapsed)['cues']), elapsed: elapsed))))));
        await tester.pump(const Duration(milliseconds: 50));
        final artwork = tester.getRect(find.byType(PracticeArtwork));
        final orb = tester.getRect(find.byType(BreathVisual));
        artRect ??= artwork;
        orbRect ??= orb;
        expect(artwork, artRect);
        expect(orb, orbRect);
        expect((Offset.zero & size).contains(orb.bottomRight - const Offset(.1, .1)), isTrue);
        expect(artwork.overlaps(orb), isFalse, reason: 'orb must not obscure anatomy');
        expect(tester.takeException(), isNull);
        final output = Platform.environment['PRACTICE_SHOTS'];
        if (output != null) {
          final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('capture-stage')));
          await tester.runAsync(() async {
            final image = await boundary.toImage();
            final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!;
            await Directory(output).create(recursive: true);
            await File('$output/combo-${size.width.toInt()}-${step['stepId']}.png').writeAsBytes(bytes.buffer.asUint8List());
            image.dispose();
          });
        }
      }
    });
  }
}

const _size = Size(360, 320);

Map<String, dynamic> _program() => {
  'leaderShape': 'square',
  'steps': [
    {'id': 'inhale', 'durationMs': 4000},
    {'id': 'hold-in', 'durationMs': 4000},
    {'id': 'exhale', 'durationMs': 4000},
    {'id': 'hold-out', 'durationMs': 4000},
  ],
};

/// По какой грани идёт точка на этом шаге: 0 — левая, 1 — верхняя,
/// 2 — правая, 3 — нижняя. Порядок задан вершинами в PhaseClock.
const _runningEdge = {'inhale': 0, 'hold-in': 1, 'exhale': 2, 'hold-out': 3};

Future<List<int>> _frame(String step, double progress) async {
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec, Offset.zero & _size);
  PhaseClock(
    cue: {'stepId': step, 'progress': progress, 'setId': 'breathing'},
    program: _program(),
    breathing: true,
    track: const Color(0xff333333),
    run: const Color(0xff0066ff),
    dotColor: const Color(0xff5bd8d0),
    crowded: true, // шарик не рисуем: меряем габарит самой рамки
  ).paint(canvas, _size);
  final image = await rec.endRecording().toImage(
    _size.width.toInt(),
    _size.height.toInt(),
  );
  final bytes = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  final w = _size.width.toInt();
  int alpha(int x, int y) => bytes.getUint8((y * w + x) * 4 + 3);

  int top = -1, bottom = -1, left = -1, right = -1;
  final col = (_size.width * .50).round(), row = (_size.height * .40).round();
  for (int y = 0; y < _size.height; y++) {
    if (alpha(col, y) > 40) { top = y; break; }
  }
  for (int y = _size.height.toInt() - 1; y >= 0; y--) {
    if (alpha(col, y) > 40) { bottom = y; break; }
  }
  for (int x = 0; x < w; x++) {
    if (alpha(x, row) > 40) { left = x; break; }
  }
  for (int x = w - 1; x >= 0; x--) {
    if (alpha(x, row) > 40) { right = x; break; }
  }
  return [top, bottom, left, right];
}

void _phaseClockTests() {
  test('грани рамки стоят на месте во всех фазах дыхания', () async {
    // edge → фазы, на которых эту грань меряем (точка идёт по другой грани)
    final measured = <int, List<int>>{0: [], 1: [], 2: [], 3: []};
    for (final step in _runningEdge.keys) {
      for (final progress in [0.3, 0.5, 0.7]) {
        final box = await _frame(step, progress);
        for (int edge = 0; edge < 4; edge++) {
          if (edge == _runningEdge[step]) continue; // тут бежит точка
          measured[edge]!.add(box[_boxIndex(edge)]);
        }
      }
    }
    for (final entry in measured.entries) {
      final values = entry.value.toSet();
      expect(
        values.length,
        1,
        reason:
            'грань ${_edgeName(entry.key)} уехала между фазами: ${entry.value}',
      );
    }
  });
}

/// Рамка в кадре лежит как [верх, низ, лево, право]; грани пронумерованы
/// по обходу вершин, поэтому порядок не совпадает — сопоставляем явно.
int _boxIndex(int edge) => const {0: 2, 1: 0, 2: 3, 3: 1}[edge]!;

String _edgeName(int edge) =>
    const {0: 'левая', 1: 'верхняя', 2: 'правая', 3: 'нижняя'}[edge]!;
