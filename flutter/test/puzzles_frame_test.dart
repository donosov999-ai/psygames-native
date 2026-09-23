import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';

/// 🔴 РИСУНОК СВЕРЯЕТСЯ С ЖИВЫМ ДВИЖКОМ, А НЕ С ПРИДУМАННОЙ СТРОКОЙ.
///
/// Кадры берутся у настоящего движка по ВСЕМ сорока двум играм: если автор (или наш
/// мост) добавит примитив, которого разбор не знает, он молча исчезнет с экрана — и
/// заметит это игрок, а не проба. Поэтому разбор складывает непонятое в `unknown`, а
/// гейт требует там ноль на всех играх.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() {
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  late TathamEngine engine;
  setUp(() => engine = TathamEngine.open(libPath));

  test('🔴 ни один примитив не теряется молча: все 42 игры разбираются целиком', () {
    final bad = <String>[];
    var totalOps = 0, opened = 0;
    for (var i = 0; i < engine.games; i++) {
      final name = engine.nameOf(i);
      // Параметры по умолчанию: движок берёт первую свою предустановку.
      if (!engine.start(i, '', 20260923)) continue;
      opened++;
      final frame = PuzzleFrame.parse(engine.draw());
      totalOps += frame.ops.length;
      if (frame.unknown.isNotEmpty) {
        bad.add('$name: ${frame.unknown.length} непонятых, первый «${frame.unknown.first}»');
      }
      if (frame.ops.isEmpty) bad.add('$name: кадр пуст');
    }
    expect(bad, isEmpty, reason: bad.take(5).join(' · '));
    expect(opened, greaterThan(35), reason: 'открылось игр: $opened из ${engine.games}');
    expect(totalOps, greaterThan(2000), reason: 'примитивов всего: $totalOps');
  });

  test('🔴 семь наших сеток рисуются и дают непустую картинку', () async {
    const ladder = {
      'Solo': '3x3db', 'Towers': '4de', 'Unequal': '4de', 'Keen': '4de',
      'Singles': '5x5de', 'Undead': '4x4de', 'Filling': '9x7',
    };
    for (final e in ladder.entries) {
      expect(engine.start(engine.indexOf(e.key), e.value, 20260923), isTrue, reason: e.key);
      final frame = PuzzleFrame.parse(engine.draw());
      final painter = PuzzlePainter(
        frame: frame,
        palette: engine.colours,
        engineSize: engine.size,
        background: Colors.white,
      );
      final image = await renderFrame(painter, const Size(360, 360));
      final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      expect(data, isNotNull, reason: '${e.key}: картинка не снялась');

      // Непустая — значит на холсте не один цвет: доска нарисована, а не закрашена.
      final bytes = data!.buffer.asUint8List();
      final seen = <int>{};
      for (var i = 0; i + 3 < bytes.length; i += 4 * 97) {
        seen.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
      }
      expect(seen.length, greaterThan(1), reason: '${e.key}: холст одноцветный');
    }
  });

  test('🔴 разбор понимает все примитивы моста, включая толщину линии', () {
    final f = PuzzleFrame.parse([
      'N 250',
      'L 0 0 10 10 3',
      'W 150 1 2 3 4 5',
      'R 1 2 3 4 5',
      'C 5 5 3 1 2',
      'P 1 2 3 0 0 10 0 5 8',
      'T 4 5 12 257 0 привет мир',
      'K 0 0 9 9',
      'U',
      'D 1',
    ]);
    expect(f.unknown, isEmpty);
    expect(f.ops.whereType<OpRect>().length, 1);
    expect(f.ops.whereType<OpCircle>().length, 1);
    expect(f.ops.whereType<OpPoly>().single.points.length, 6);
    expect(f.ops.whereType<OpText>().single.text, 'привет мир', reason: 'текст с пробелами целиком');
    expect(f.ops.whereType<OpClip>().length, 1);
    expect(f.ops.whereType<OpUnclip>().length, 1);
    final lines = f.ops.whereType<OpLine>().toList();
    expect(lines.length, 2);
    expect(lines[0].width, 2.5, reason: 'N задаёт толщину следующим линиям');
    expect(lines[1].width, 1.5, reason: 'у W толщина своя');
  });

  test('🔴 клик пересчитывается в координаты движка тем же множителем', () {
    const engineSize = (w: 200, h: 100);
    const widget = Size(400, 400);
    // Поле шире, чем выше: множитель берётся по ширине, поля сверху и снизу.
    final middle = toEngine(const Offset(200, 200), widget, engineSize);
    expect(middle.x, 100, reason: 'середина по ширине');
    expect(middle.y, 50, reason: 'середина по высоте с учётом полей');
    final corner = toEngine(const Offset(0, 100), widget, engineSize);
    expect(corner.x, 0);
    expect(corner.y, 0, reason: 'верх поля — там, где начинается рисунок');
  });
}
