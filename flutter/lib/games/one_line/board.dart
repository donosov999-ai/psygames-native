import 'package:flutter/material.dart';

import 'model.dart';

/// Доска «Одной линии»: граф, по рёбрам которого ведут пальцем.
///
/// Размер берётся от высоты поля, которую дал каркас, — то же правило, что у
/// «Соедини точки». Координаты вершин в данных лежат в долях от 0 до 1.
class OneLineBoard extends StatefulWidget {
  const OneLineBoard({
    super.key,
    required this.level,
    required this.game,
    required this.fieldHeight,
    required this.onChanged,
  });

  final OneLineLevel level;
  final OneLineGame game;
  final double fieldHeight;
  final VoidCallback onChanged;

  @override
  State<OneLineBoard> createState() => _OneLineBoardState();
}

class _OneLineBoardState extends State<OneLineBoard> {
  Offset _origin = Offset.zero;
  double _side = 0;

  Offset _pos(Vertex v) => _origin + Offset(v.x * _side, v.y * _side);

  Vertex? _vertexAt(Offset p) {
    for (final v in widget.level.vertices) {
      if ((_pos(v) - p).distance <= _side * 0.08 + 12) return v;
    }
    return null;
  }

  /// Палец пришёл в вершину: если из текущей в неё есть свободное ребро — идём.
  void _touch(Vertex v) {
    final g = widget.game;
    if (g.current == null) {
      setState(() => g.startAt(v.id));
      widget.onChanged();
      return;
    }
    if (g.current == v.id) return;
    for (final e in widget.level.edges) {
      final joins = (e.a == g.current && e.b == v.id) || (e.b == g.current && e.a == v.id);
      if (!joins) continue;
      if (g.walk(e.id)) {
        setState(() {});
        widget.onChanged();
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, c) {
          _side = (widget.fieldHeight < c.maxWidth ? widget.fieldHeight : c.maxWidth) - 40;
          _origin = Offset((c.maxWidth - _side) / 2, (widget.fieldHeight - _side) / 2);
          return GestureDetector(
            onTapDown: (d) {
              final v = _vertexAt(d.localPosition);
              if (v != null) _touch(v);
            },
            onPanStart: (d) {
              final v = _vertexAt(d.localPosition);
              if (v != null) _touch(v);
            },
            onPanUpdate: (d) {
              final v = _vertexAt(d.localPosition);
              if (v != null) _touch(v);
            },
            child: CustomPaint(
              size: Size(c.maxWidth, widget.fieldHeight),
              painter: _OneLinePainter(
                level: widget.level,
                game: widget.game,
                pos: _pos,
                scheme: Theme.of(context).colorScheme,
                dot: _side * 0.045 + 6,
              ),
            ),
          );
        },
      );
}

class _OneLinePainter extends CustomPainter {
  _OneLinePainter({
    required this.level,
    required this.game,
    required this.pos,
    required this.scheme,
    required this.dot,
  });

  final OneLineLevel level;
  final OneLineGame game;
  final Offset Function(Vertex) pos;
  final ColorScheme scheme;
  final double dot;

  @override
  void paint(Canvas canvas, Size size) {
    for (final e in level.edges) {
      final a = pos(level.vertexById(e.a));
      final b = pos(level.vertexById(e.b));
      final done = game.used[e.id] ?? 0;
      final left = e.passes - done;
      final paint = Paint()
        ..strokeWidth = dot * 0.55
        ..strokeCap = StrokeCap.round
        ..color = left <= 0
            ? scheme.primary
            : scheme.outline.withValues(alpha: e.passes == 2 ? 0.75 : 0.45);
      canvas.drawLine(a, b, paint);
      if (e.passes == 2 && left > 0) {
        // Двойное ребро: вторую нитку рисуем рядом, чтобы «пройти дважды» было видно.
        final n = (b - a);
        final off = Offset(-n.dy, n.dx) / n.distance * (dot * 0.35);
        canvas.drawLine(a + off, b + off, paint);
      }
      if (e.oneWay) {
        final mid = (a + b) / 2;
        final dir = (b - a) / (b - a).distance;
        final wing = Offset(-dir.dy, dir.dx) * dot * 0.35;
        final tip = mid + dir * dot * 0.4;
        final arrow = Path()
          ..moveTo(tip.dx, tip.dy)
          ..lineTo((mid - dir * dot * 0.1 + wing).dx, (mid - dir * dot * 0.1 + wing).dy)
          ..lineTo((mid - dir * dot * 0.1 - wing).dx, (mid - dir * dot * 0.1 - wing).dy)
          ..close();
        canvas.drawPath(arrow, Paint()..color = scheme.onSurfaceVariant);
      }
    }

    for (final v in level.vertices) {
      final o = pos(v);
      final here = game.current == v.id;
      canvas.drawCircle(
          o, dot, Paint()..color = here ? scheme.primary : scheme.surfaceContainerHighest);
      canvas.drawCircle(
          o,
          dot,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = here ? scheme.primary : scheme.outline);
      if (game.current == null && level.startHint == v.id) {
        canvas.drawCircle(
            o,
            dot + 6,
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = 2
              ..color = scheme.tertiary);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _OneLinePainter old) => true;
}
