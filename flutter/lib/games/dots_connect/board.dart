import 'package:flutter/material.dart';

import 'model.dart';

/// Доска «Соедини точки»: сетка, точки пар и пути, которые человек ведёт пальцем.
///
/// 🔴 РАЗМЕР КЛЕТКИ СЧИТАЕТСЯ ОТ МЕСТА, КОТОРОЕ ДАЛ КАРКАС, а не от окна.
/// Каркас отдаёт высоту поля числом (`GameShell.field`), ширину даёт родитель.
/// Берём меньшее из двух — так доска не вылезает ни вверх под шапку, ни вниз
/// под ряд значков. В React-версии этот расчёт дважды был неверным, и это стоило
/// двух выпусков.
class DotsBoard extends StatefulWidget {
  const DotsBoard({
    super.key,
    required this.level,
    required this.game,
    required this.fieldHeight,
    required this.onChanged,
  });

  final DotsLevel level;
  final DotsGame game;
  final double fieldHeight;
  final VoidCallback onChanged;

  @override
  State<DotsBoard> createState() => _DotsBoardState();
}

class _DotsBoardState extends State<DotsBoard> {
  /// Путь, который ведут прямо сейчас: пара и её клетки.
  String? _pairId;
  List<Cell> _draft = [];

  double _cellSize(BoxConstraints c) {
    final side = widget.fieldHeight < c.maxWidth ? widget.fieldHeight : c.maxWidth;
    return (side - 16) / widget.level.size;
  }

  Cell? _cellAt(Offset p, double cell, Offset origin) {
    final col = ((p.dx - origin.dx) / cell).floor();
    final row = ((p.dy - origin.dy) / cell).floor();
    final c = Cell(row, col);
    return widget.level.inside(c) ? c : null;
  }

  void _start(Cell c) {
    final g = widget.game;
    // Палец опущен на точку пары или на её путь — ведём эту пару.
    for (final p in widget.level.pairs) {
      if (p.isEnd(c)) {
        g.clearPath(p.id);
        setState(() {
          _pairId = p.id;
          _draft = [c];
        });
        return;
      }
    }
    final owner = g.owner[c];
    if (owner != null) {
      final path = List<Cell>.from(g.paths[owner] ?? const []);
      final i = path.indexOf(c);
      if (i >= 0) {
        g.clearPath(owner);
        setState(() {
          _pairId = owner;
          _draft = path.sublist(0, i + 1);
        });
      }
    }
  }

  void _extend(Cell c) {
    final id = _pairId;
    if (id == null || _draft.isEmpty) return;
    if (_draft.last == c) return;
    // Шаг назад по своему же пути — стираем хвост, как карандашом.
    if (_draft.length >= 2 && _draft[_draft.length - 2] == c) {
      setState(() => _draft = _draft.sublist(0, _draft.length - 1));
      return;
    }
    if (_draft.contains(c)) return;
    if (!widget.game.canExtend(id, _draft.last, c)) return;
    setState(() => _draft = [..._draft, c]);
  }

  void _finish() {
    final id = _pairId;
    if (id != null && _draft.length > 1) {
      widget.game.drawPath(id, _draft);
    }
    setState(() {
      _pairId = null;
      _draft = [];
    });
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final cell = _cellSize(c);
        final board = cell * widget.level.size;
        final origin = Offset((c.maxWidth - board) / 2, (widget.fieldHeight - board) / 2);
        return GestureDetector(
          onPanStart: (d) {
            final cc = _cellAt(d.localPosition, cell, origin);
            if (cc != null) _start(cc);
          },
          onPanUpdate: (d) {
            final cc = _cellAt(d.localPosition, cell, origin);
            if (cc != null) _extend(cc);
          },
          onPanEnd: (_) => _finish(),
          child: CustomPaint(
            size: Size(c.maxWidth, widget.fieldHeight),
            painter: _DotsPainter(
              level: widget.level,
              game: widget.game,
              draftPair: _pairId,
              draft: _draft,
              cell: cell,
              origin: origin,
              scheme: Theme.of(context).colorScheme,
            ),
          ),
        );
      },
    );
  }
}

class _DotsPainter extends CustomPainter {
  _DotsPainter({
    required this.level,
    required this.game,
    required this.draftPair,
    required this.draft,
    required this.cell,
    required this.origin,
    required this.scheme,
  });

  final DotsLevel level;
  final DotsGame game;
  final String? draftPair;
  final List<Cell> draft;
  final double cell;
  final Offset origin;
  final ColorScheme scheme;

  Offset _center(Cell c) =>
      origin + Offset(c.col * cell + cell / 2, c.row * cell + cell / 2);

  Color _color(String hex) => Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = scheme.outlineVariant;
    for (var r = 0; r < level.size; r++) {
      for (var col = 0; col < level.size; col++) {
        final c = Cell(r, col);
        final rect = Rect.fromLTWH(origin.dx + col * cell, origin.dy + r * cell, cell, cell);
        if (level.walls.contains(c)) {
          canvas.drawRect(rect, Paint()..color = scheme.surfaceContainerHighest);
          continue;
        }
        canvas.drawRect(rect, grid);
        final gate = level.gates[c];
        if (gate != null) {
          final p = level.pairs.firstWhere((x) => x.id == gate);
          canvas.drawRect(rect.deflate(3),
              Paint()..color = _color(p.color).withValues(alpha: 0.18));
        }
      }
    }

    void drawPath(List<Cell> cells, Color color, {double alpha = 1}) {
      if (cells.length < 2) return;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = cell * 0.42
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = color.withValues(alpha: alpha);
      final path = Path()..moveTo(_center(cells.first).dx, _center(cells.first).dy);
      for (final c in cells.skip(1)) {
        path.lineTo(_center(c).dx, _center(c).dy);
      }
      canvas.drawPath(path, paint);
    }

    for (final e in game.paths.entries) {
      final p = level.pairs.firstWhere((x) => x.id == e.key);
      drawPath(e.value, _color(p.color));
    }
    if (draftPair != null) {
      final p = level.pairs.firstWhere((x) => x.id == draftPair);
      drawPath(draft, _color(p.color), alpha: 0.75);
    }

    for (final p in level.pairs) {
      for (final end in p.ends) {
        final o = _center(end);
        canvas.drawCircle(o, cell * 0.3, Paint()..color = _color(p.color));
        final tp = TextPainter(
          text: TextSpan(
            text: p.symbol,
            style: TextStyle(fontSize: cell * 0.34, color: Colors.white, height: 1),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, o - Offset(tp.width / 2, tp.height / 2));
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DotsPainter old) => true;
}
