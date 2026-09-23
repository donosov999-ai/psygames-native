/// КАДР ДВИЖКА ТЭТХЭМА: разбор потока примитивов и рисование на Flutter.
///
/// Формат задан в `psy_play.c` (мост) и повторён здесь строка в строку с веб-разбором
/// (`tatham-bridge/play.ts`). Менять только парой — иначе один рисует то, чего другой
/// не понимает.
///
///   R x y ш в цвет                  — заливка прямоугольника
///   L x1 y1 x2 y2 цвет              — линия (толщину задаёт последняя N)
///   W тлщ×100 x1 y1 x2 y2 цвет      — толстая линия
///   C cx cy r заливка контур        — круг
///   P заливка контур n x1 y1 …      — многоугольник
///   T x y размер выравнивание цвет … — текст
///   N ширина×100                     — толщина линий дальше
///   K x y ш в / U                    — обрезка и снятие обрезки
///   D 0|1                            — пунктир (на нашем рисовании не сказывается)
///
/// 🔴 НЕЗНАКОМЫЙ ПРИМИТИВ НЕ ГЛОТАЕТСЯ МОЛЧА. Веб-разбор на `default` делает `break`:
/// если автор добавит примитив, он просто исчезнет с экрана, и заметит это игрок, а не
/// проба. Здесь незнакомое складывается в `unknown`, и гейт требует, чтобы там был ноль
/// на всех сорока двух играх.
library;

import 'dart:ui' as ui;

import 'package:flutter/material.dart';

sealed class PuzzleOp {
  const PuzzleOp();
}

class OpRect extends PuzzleOp {
  const OpRect(this.x, this.y, this.w, this.h, this.colour);
  final int x, y, w, h, colour;
}

class OpLine extends PuzzleOp {
  const OpLine(this.x1, this.y1, this.x2, this.y2, this.colour, this.width);
  final int x1, y1, x2, y2, colour;
  final double? width;
}

class OpCircle extends PuzzleOp {
  const OpCircle(this.cx, this.cy, this.r, this.fill, this.outline);
  final int cx, cy, r, fill, outline;
}

class OpPoly extends PuzzleOp {
  const OpPoly(this.fill, this.outline, this.points);
  final int fill, outline;
  final List<int> points;
}

class OpText extends PuzzleOp {
  const OpText(this.x, this.y, this.size, this.align, this.colour, this.text);
  final int x, y, size, align, colour;
  final String text;
}

class OpClip extends PuzzleOp {
  const OpClip(this.x, this.y, this.w, this.h);
  final int x, y, w, h;
}

class OpUnclip extends PuzzleOp {
  const OpUnclip();
}

/// Разобранный кадр: примитивы и список непонятого (в норме пуст).
class PuzzleFrame {
  const PuzzleFrame(this.ops, this.unknown);

  final List<PuzzleOp> ops;

  /// Строки, которых разбор не знает. Гейт требует пустоты: незнакомый примитив —
  /// это дыра в рисунке, которую иначе заметит только игрок.
  final List<String> unknown;

  static PuzzleFrame parse(List<String> lines) {
    final ops = <PuzzleOp>[];
    final unknown = <String>[];
    double? width;

    for (final line in lines) {
      if (line.isEmpty) continue;
      final p = line.split(' ');
      int n(int k) => int.tryParse(p[k]) ?? 0;
      switch (p[0]) {
        case 'R':
          ops.add(OpRect(n(1), n(2), n(3), n(4), n(5)));
        case 'L':
          ops.add(OpLine(n(1), n(2), n(3), n(4), n(5), width));
        case 'W':
          ops.add(OpLine(n(2), n(3), n(4), n(5), n(6), n(1) / 100));
        case 'C':
          ops.add(OpCircle(n(1), n(2), n(3), n(4), n(5)));
        case 'P':
          ops.add(OpPoly(n(1), n(2), [for (var i = 4; i < p.length; i++) n(i)]));
        case 'T':
          ops.add(OpText(n(1), n(2), n(3), n(4), n(5), p.skip(6).join(' ')));
        case 'N':
          width = n(1) / 100;
        case 'K':
          ops.add(OpClip(n(1), n(2), n(3), n(4)));
        case 'U':
          ops.add(const OpUnclip());
        case 'D':
          break;   // пунктир: на нашем рисовании не сказывается
        default:
          unknown.add(line);
      }
    }
    return PuzzleFrame(ops, unknown);
  }
}

/// Рисование кадра. Поле движка в ЕГО координатах, поэтому холст масштабируется целиком:
/// так рисунок не зависит от размера телефона, а клик пересчитывается обратно тем же
/// множителем (`PuzzleView.toEngine`).
class PuzzlePainter extends CustomPainter {
  PuzzlePainter({
    required this.frame,
    required this.palette,
    required this.engineSize,
    required this.background,
  });

  final PuzzleFrame frame;
  final List<List<int>> palette;
  final ({int w, int h}) engineSize;
  final Color background;

  Color _colour(int i) {
    if (i < 0 || i >= palette.length) return background;
    final c = palette[i];
    return Color.fromARGB(255, c[0], c[1], c[2]);
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (engineSize.w <= 0 || engineSize.h <= 0) return;
    final k = (size.width / engineSize.w) < (size.height / engineSize.h)
        ? size.width / engineSize.w
        : size.height / engineSize.h;

    canvas.save();
    canvas.translate((size.width - engineSize.w * k) / 2, (size.height - engineSize.h * k) / 2);
    canvas.scale(k);

    var clips = 0;
    for (final op in frame.ops) {
      switch (op) {
        case OpRect(:final x, :final y, :final w, :final h, :final colour):
          canvas.drawRect(
            Rect.fromLTWH(x.toDouble(), y.toDouble(), w.toDouble(), h.toDouble()),
            Paint()..color = _colour(colour),
          );
        case OpLine(:final x1, :final y1, :final x2, :final y2, :final colour, :final width):
          canvas.drawLine(
            Offset(x1.toDouble(), y1.toDouble()),
            Offset(x2.toDouble(), y2.toDouble()),
            Paint()
              ..color = _colour(colour)
              ..strokeWidth = width ?? 1
              ..strokeCap = StrokeCap.round,
          );
        case OpCircle(:final cx, :final cy, :final r, :final fill, :final outline):
          final centre = Offset(cx.toDouble(), cy.toDouble());
          if (fill >= 0) {
            canvas.drawCircle(centre, r.toDouble(), Paint()..color = _colour(fill));
          }
          canvas.drawCircle(
            centre,
            r.toDouble(),
            Paint()
              ..color = _colour(outline)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1,
          );
        case OpPoly(:final fill, :final outline, :final points):
          if (points.length < 4) break;
          final path = Path()..moveTo(points[0].toDouble(), points[1].toDouble());
          for (var i = 2; i + 1 < points.length; i += 2) {
            path.lineTo(points[i].toDouble(), points[i + 1].toDouble());
          }
          path.close();
          if (fill >= 0) canvas.drawPath(path, Paint()..color = _colour(fill));
          canvas.drawPath(
            path,
            Paint()
              ..color = _colour(outline)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1,
          );
        case OpText(:final x, :final y, :final size, :final align, :final colour, :final text):
          _text(canvas, x, y, size, align, colour, text);
        case OpClip(:final x, :final y, :final w, :final h):
          canvas.save();
          clips++;
          canvas.clipRect(Rect.fromLTWH(x.toDouble(), y.toDouble(), w.toDouble(), h.toDouble()));
        case OpUnclip():
          if (clips > 0) {
            canvas.restore();
            clips--;
          }
      }
    }
    while (clips-- > 0) {
      canvas.restore();
    }
    canvas.restore();
  }

  /// Выравнивание автора: 0x001 — по центру, 0x002 — вправо, 0x100 — по вертикали в центр.
  void _text(Canvas canvas, int x, int y, int size, int align, int colour, String text) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(color: _colour(colour), fontSize: size.toDouble(), height: 1),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    var dx = x.toDouble();
    if (align & 0x001 != 0) dx -= tp.width / 2;
    if (align & 0x002 != 0) dx -= tp.width;
    // По вертикали автор задаёт БАЗОВУЮ линию, а с 0x100 — середину буквы.
    final dy = align & 0x100 != 0 ? y - tp.height / 2 : y - tp.height * 0.8;
    tp.paint(canvas, Offset(dx, dy));
  }

  @override
  bool shouldRepaint(covariant PuzzlePainter old) =>
      old.frame != frame || old.palette != palette || old.engineSize != engineSize;
}

/// Перевод точки экрана в координаты движка — тем же множителем, каким рисовали.
({int x, int y}) toEngine(Offset at, Size widget, ({int w, int h}) engine) {
  if (engine.w <= 0 || engine.h <= 0) return (x: 0, y: 0);
  final k = (widget.width / engine.w) < (widget.height / engine.h)
      ? widget.width / engine.w
      : widget.height / engine.h;
  final ox = (widget.width - engine.w * k) / 2;
  final oy = (widget.height - engine.h * k) / 2;
  return (x: ((at.dx - ox) / k).round(), y: ((at.dy - oy) / k).round());
}

/// Кадр как картинка — для проб: нарисовать и посмотреть, что вышло не пусто.
Future<ui.Image> renderFrame(PuzzlePainter painter, Size size) {
  final recorder = ui.PictureRecorder();
  painter.paint(Canvas(recorder), size);
  return recorder.endRecording().toImage(size.width.round(), size.height.round());
}
