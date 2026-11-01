import 'dart:io';
import 'dart:math' as math;

import 'package:image/image.dart' as im;

// Mechanical glyph extraction from existing accepted art. Not a new drawing.
// Only this known undo texture is supported; never guess glyphs in arbitrary art.
void main() {
  const input = 'assets/aurora_game_chrome/sudoku_buttons/dark_undo.webp';
  final source = im.decodeImage(File(input).readAsBytesSync())!;
  final w = source.width, h = source.height;
  final visited = <int>{};
  var largest = <int>[];
  bool candidate(int x, int y) {
    if (x < w * .20 || x > w * .81 || y < h * .25 || y > h * .81) {
      return false;
    }
    final p = source.getPixel(x, y);
    return p.a > 240 &&
        p.r > 175 &&
        p.g > 210 &&
        p.b > 215 &&
        math.max(p.r, math.max(p.g, p.b)) - math.min(p.r, math.min(p.g, p.b)) <
            95;
  }

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final k = y * w + x;
      if (visited.contains(k) || !candidate(x, y)) {
        continue;
      }
      final component = <int>[k];
      visited.add(k);
      for (var i = 0; i < component.length; i++) {
        final cx = component[i] % w, cy = component[i] ~/ w;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            final nx = cx + dx, ny = cy + dy, n = ny * w + nx;
            if (nx < 0 ||
                ny < 0 ||
                nx >= w ||
                ny >= h ||
                visited.contains(n) ||
                !candidate(nx, ny)) {
              continue;
            }
            visited.add(n);
            component.add(n);
          }
        }
      }
      if (component.length > largest.length) largest = component;
    }
  }
  final out = im.Image(width: w, height: h, numChannels: 4);
  for (final k in largest) {
    out.setPixelRgba(k % w, k ~/ w, 255, 255, 255, 255);
  }
  final glyph = largest.toSet(), outside = <int>{0}, queue = <int>[0];
  for (var i = 0; i < queue.length; i++) {
    final x = queue[i] % w, y = queue[i] ~/ w;
    for (final d in [(-1, 0), (1, 0), (0, -1), (0, 1)]) {
      final nx = x + d.$1, ny = y + d.$2, k = ny * w + nx;
      if (nx < 0 ||
          ny < 0 ||
          nx >= w ||
          ny >= h ||
          glyph.contains(k) ||
          outside.contains(k)) {
        continue;
      }
      outside.add(k);
      queue.add(k);
    }
  }
  // Keep the original silhouette but fill the pale-blue enclosed glyph centre.
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (!outside.contains(y * w + x)) {
        out.setPixelRgba(x, y, 255, 255, 255, 255);
      }
    }
  }
  Directory('assets/palette_pilot').createSync(recursive: true);
  File('assets/palette_pilot/undo-glyph-mask.png')
      .writeAsBytesSync(im.encodePng(im.gaussianBlur(out, radius: 1)));
  stdout.writeln(
    'Extracted ${largest.length} glyph pixels from $w x $h source',
  );
}
