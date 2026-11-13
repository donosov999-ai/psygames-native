/// ЧУДОВИЩА «НЕЖИТИ» НА КЛАВИШАХ — ТЕ ЖЕ, ЧТО ДВИЖОК РИСУЕТ НА ДОСКЕ.
///
/// 🔴 ПОВОД — отзыв 91967288 (18.09.2026, 2.54.22 iOS): «дизайн нормально сделай иконки». На доске
/// и в счётчиках над ней движок Тэтхэма рисует своих призрака, вампира и зомби, а на клавишах стояли
/// эмодзи 👻🧛🧟 — человек видит два разных набора и сверяет их глазами. В вебе это починили 23.09
/// (MonsterGlyph.tsx), во Flutter клавиши остались эмодзи из `modes.json`.
///
/// Здесь — перенос `draw_monster` (`undead.c:2473`) один в один: те же круги, многоугольники и
/// линии в долях тайла, цвета — из палитры ЭТОГО ЖЕ движка (`TathamEngine.colours`, индексы
/// перечисления `undead.c:46`), так что клавиша и доска совпадают в любой теме. Целочисленное
/// деление C заменено вещественным — на размере клавиши разница меньше точки.
library;

import 'package:flutter/material.dart';

import 'frame.dart' show engineColour;

/// Номер чудовища движка по клавише: 1 — призрак, 2 — вампир, 3 — зомби (`undead.c:1931`;
/// у движка зомби — 4, это битовая маска).
int undeadMonsterForKey(int key) => switch (key) { 1 => 1, 2 => 2, 3 => 4, _ => 0 };

/// Клавиша «Нежити»: чудовище движка размером [size].
class UndeadMonsterGlyph extends StatelessWidget {
  const UndeadMonsterGlyph({super.key, required this.monster, required this.palette, this.size = 34});

  /// Номер чудовища движка: 1 призрак, 2 вампир, 4 зомби.
  final int monster;

  /// Палитра движка «Нежити» (`TathamEngine.colours`): RGB 0–255 по индексам `COL_*`.
  final List<List<int>> palette;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _MonsterPainter(monster, palette, Theme.of(context).colorScheme.onSurface)),
      );
}

// Индексы перечисления цветов `undead.c:46`.
const _colBackground = 0, _colText = 2, _colGhost = 6, _colZombie = 7, _colVampire = 8;

class _MonsterPainter extends CustomPainter {
  _MonsterPainter(this.monster, this.palette, this.ink);
  final int monster;
  final List<List<int>> palette;
  final Color ink;

  /// Палитры ещё нет (движок не загрузился) — только контур цветом текста темы, без заливки:
  /// своих цветов клавиша не заводит (храповик зашитых цветов).
  Color _c(int i, Color ink) => engineColour(palette, i) ?? (i == _colText ? ink : Colors.transparent);

  @override
  void paint(Canvas canvas, Size size) {
    final t = size.shortestSide;   // tilesize движка
    final x = size.width / 2, y = size.height / 2;
    final black = _c(_colText, ink);
    final stroke = Paint()
      ..color = black
      ..style = PaintingStyle.stroke
      ..strokeWidth = (t / 24).clamp(1.0, 2.0);
    void circle(double cx, double cy, double r, Color fill) {
      canvas.drawCircle(Offset(cx, cy), r, Paint()..color = fill);
      canvas.drawCircle(Offset(cx, cy), r, stroke);
    }
    void polygon(List<double> pts, Color fill) {
      final path = Path()..moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) {
        path.lineTo(pts[i], pts[i + 1]);
      }
      path.close();
      canvas.drawPath(path, Paint()..color = fill);
      canvas.drawPath(path, stroke);
    }
    void clip(double l, double tp, double w, double h, void Function() draw) {
      canvas.save();
      canvas.clipRect(Rect.fromLTWH(l, tp, w, h));
      draw();
      canvas.restore();
    }
    void line(double x1, double y1, double x2, double y2) => canvas.drawLine(Offset(x1, y1), Offset(x2, y2), stroke);
    final dot = Paint()..color = black;

    if (monster == 1) {
      // Призрак.
      clip(x - t / 2 + 2, y - t / 2 + 2, t - 3, t / 2 + 1, () => circle(x, y, 2 * t / 5, _c(_colGhost, ink)));
      final pts = <double>[x - 2 * t / 5, y - 2, x - 2 * t / 5, y + 2 * t / 5];
      final total = (2 * t / 5) * 2;
      for (var j = 0; j < 3; j++) {
        final before = total * j / 3, after = total * (j + 1) / 3, mid = (before + after) / 2;
        pts.addAll([x - 2 * t / 5 + mid, y + 2 * t / 5 - total / 6, x - 2 * t / 5 + after, y + 2 * t / 5]);
      }
      pts.addAll([x + 2 * t / 5, y - 2]);
      clip(x - t / 2 + 2, y, t - 3, t - t / 2 - 1, () => polygon(pts, _c(_colGhost, ink)));
      circle(x - t / 6, y - t / 12, t / 10, _c(_colBackground, ink));
      circle(x + t / 6, y - t / 12, t / 10, _c(_colBackground, ink));
      canvas.drawCircle(Offset(x - t / 6 + 1 + t / 48, y - t / 12), t / 48 + 0.5, dot);
      canvas.drawCircle(Offset(x + t / 6 + 1 + t / 48, y - t / 12), t / 48 + 0.5, dot);
    } else if (monster == 2) {
      // Вампир.
      clip(x - t / 2 + 2, y - t / 2 + 2, t - 3, t / 2, () => circle(x, y, 2 * t / 5, black));
      clip(x - t / 2 + 2, y - t / 2 + 2, t / 2 + 1, t / 2, () => circle(x - t / 7, y, 2 * t / 5 - t / 7, _c(_colVampire, ink)));
      clip(x, y - t / 2 + 2, t / 2 + 1, t / 2, () => circle(x + t / 7, y, 2 * t / 5 - t / 7, _c(_colVampire, ink)));
      clip(x - t / 2 + 2, y, t - 3, t / 2, () => circle(x, y, 2 * t / 5, _c(_colVampire, ink)));
      circle(x - t / 7, y - t / 16, t / 16, _c(_colBackground, ink));
      circle(x + t / 7, y - t / 16, t / 16, _c(_colBackground, ink));
      canvas.drawCircle(Offset(x - t / 7, y - t / 16), t / 48 + 0.5, dot);
      canvas.drawCircle(Offset(x + t / 7, y - t / 16), t / 48 + 0.5, dot);
      clip(x - t / 2 + 2, y + t / 8, t - 3, t / 4, () {
        polygon([x - 3 * t / 16, y + t / 8, x - 2 * t / 16, y + 7 * t / 24, x - t / 16, y + t / 8], _c(_colBackground, ink));
        polygon([x + 3 * t / 16, y + t / 8, x + 2 * t / 16, y + 7 * t / 24, x + t / 16, y + t / 8], _c(_colBackground, ink));
        circle(x, y - t / 5, 2 * t / 5, _c(_colVampire, ink));
      });
    } else if (monster == 4) {
      // Зомби.
      circle(x, y, 2 * t / 5, _c(_colZombie, ink));
      for (final sx in [-1.0, 1.0]) {
        final cx = x + sx * t / 7, cy = y - t / 12;
        line(cx - t / 16, cy - t / 16, cx + t / 16, cy + t / 16);
        line(cx + t / 16, cy - t / 16, cx - t / 16, cy + t / 16);
      }
      clip(x - t / 5, y + t / 6, 2 * t / 5 + 1, t / 2, () => circle(x - t / 15, y + t / 6, t / 12, _c(_colBackground, ink)));
      line(x - t / 5, y + t / 6, x + t / 5, y + t / 6);
    }
  }

  @override
  bool shouldRepaint(_MonsterPainter old) => old.monster != monster || old.palette != palette || old.ink != ink;
}
