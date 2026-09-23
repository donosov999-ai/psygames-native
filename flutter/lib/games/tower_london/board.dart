import 'package:flutter/material.dart';

import 'model.dart';

/// Цвета шаров. ⚠️ Вторая опора рядом с цветом — БУКВА на шаре: четыре шара
/// различаются оттенком, и при дальтонизме красный с зелёным сходятся.
const Map<String, List<Color>> ballColors = {
  'R': [Color(0xFFFCA5A5), Color(0xFFDC2626)],
  'G': [Color(0xFF86EFAC), Color(0xFF16A34A)],
  'B': [Color(0xFF93C5FD), Color(0xFF2563EB)],
  'Y': [Color(0xFFFDE68A), Color(0xFFD97706)],
};

/// ПОЛЕ «ЛОНДОНСКОЙ БАШНИ»: слева цель, справа рабочие стержни.
///
/// 🔴 ЦЕЛЬ ВИДНА ВСЁ ВРЕМЯ, А НЕ «в справке». Игра на планирование: держать
/// положение-цель в голове — это другая задача (на память), и она мерила бы не
/// то. Поэтому цель нарисована рядом, маленькой копией.
class TolBoard extends StatelessWidget {
  const TolBoard({
    super.key,
    required this.state,
    required this.goal,
    required this.fieldHeight,
    required this.selected,
    required this.onTapPeg,
    required this.onDrop,
  });

  final TolState state;
  final TolState goal;
  final double fieldHeight;
  final int? selected;
  final void Function(int peg) onTapPeg;
  final void Function(int from, int to) onDrop;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        // Цель занимает треть ширины, поле — остальное: цель только смотрят.
        final goalW = (c.maxWidth * 0.32).clamp(90.0, 160.0);
        final boardW = c.maxWidth - goalW - 12;
        return SizedBox(
          width: c.maxWidth,
          height: fieldHeight,
          child: Row(
            // По ОСНОВАНИЮ, а не по центру: цель и рабочая доска стоят на одной
            // линии, и их легко сравнивать взглядом — ради этого цель и рисуется.
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              SizedBox(
                width: goalW,
                child: _Pegs(
                  state: goal,
                  height: fieldHeight * 0.62,
                  width: goalW,
                  title: 'Цель',
                  interactive: false,
                  selected: null,
                  onTapPeg: (_) {},
                  onDrop: (_, _) {},
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: boardW,
                child: _Pegs(
                  state: state,
                  height: fieldHeight * 0.86,
                  width: boardW,
                  title: null,
                  interactive: true,
                  selected: selected,
                  onTapPeg: onTapPeg,
                  onDrop: onDrop,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Pegs extends StatelessWidget {
  const _Pegs({
    required this.state,
    required this.height,
    required this.width,
    required this.title,
    required this.interactive,
    required this.selected,
    required this.onTapPeg,
    required this.onDrop,
  });

  final TolState state;
  final double height;
  final double width;
  final String? title;
  final bool interactive;
  final int? selected;
  final void Function(int peg) onTapPeg;
  final void Function(int from, int to) onDrop;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final n = state.pegs.length;
    final pegW = (width - 8 * (n + 1)) / n;
    final tallest = state.caps.reduce((a, b) => a > b ? a : b);
    // Шар считается от МЕСТА: и по ширине стержня, и по высоте самого высокого.
    final ball = (pegW * 0.78 < (height - 26) / tallest ? pegW * 0.78 : (height - 26) / tallest)
        .clamp(12.0, 46.0);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(title!, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          ),
        SizedBox(
          height: ball * tallest + 14,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < n; i += 1)
                _Peg(
                  index: i,
                  state: state,
                  pegW: pegW,
                  ball: ball.toDouble(),
                  interactive: interactive,
                  selected: selected == i,
                  prefix: interactive ? 'peg' : 'goal',
                  onTapPeg: onTapPeg,
                  onDrop: onDrop,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Peg extends StatelessWidget {
  const _Peg({
    required this.index,
    required this.state,
    required this.pegW,
    required this.ball,
    required this.interactive,
    required this.selected,
    required this.prefix,
    required this.onTapPeg,
    required this.onDrop,
  });

  final int index;
  final TolState state;
  final double pegW;
  final double ball;
  final bool interactive;
  final bool selected;
  final String prefix;
  final void Function(int peg) onTapPeg;
  final void Function(int from, int to) onDrop;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final peg = state.pegs[index];
    final cap = state.caps[index];

    Widget column(bool active) => Container(
          key: ValueKey('$prefix-$index'),
          width: pegW,
          height: ball * state.caps.reduce((a, b) => a > b ? a : b) + 14,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: active
                  ? const Color(0xFF22C55E)
                  : selected
                      ? const Color(0xFFF59E0B)
                      : Colors.transparent,
              width: active || selected ? 2 : 0,
            ),
          ),
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              // Стержень ровно на свою вместимость: ВИДНО, сколько шаров влезет,
              // ещё до хода — иначе «не кладётся» читается как поломка.
              Positioned(
                bottom: 6,
                child: Container(
                  width: 5,
                  height: ball * cap,
                  decoration: BoxDecoration(
                    color: scheme.onSurface.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              Positioned(
                bottom: 0,
                child: Container(
                  width: pegW - 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: scheme.onSurface.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              for (var k = 0; k < peg.length; k += 1)
                Positioned(
                  bottom: 6 + k * ball,
                  child: _Ball(
                    color: peg[k],
                    size: ball - 2,
                    peg: index,
                    prefix: prefix,
                    draggable: interactive && k == peg.length - 1,
                  ),
                ),
            ],
          ),
        );

    if (!interactive) return column(false);

    return DragTarget<int>(
      onWillAcceptWithDetails: (d) => state.canMove(d.data, index),
      onAcceptWithDetails: (d) => onDrop(d.data, index),
      builder: (context, candidate, rejected) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => onTapPeg(index),
        child: Semantics(
          button: true,
          selected: selected,
          label: peg.isEmpty
              ? 'Стержень ${index + 1}: пусто, мест $cap'
              : 'Стержень ${index + 1}: ${peg.join(' ')}, мест $cap',
          child: column(candidate.isNotEmpty),
        ),
      ),
    );
  }
}

class _Ball extends StatelessWidget {
  const _Ball({
    required this.color,
    required this.size,
    required this.peg,
    required this.prefix,
    required this.draggable,
  });

  final String color;
  final double size;
  final int peg;
  final String prefix;
  final bool draggable;

  @override
  Widget build(BuildContext context) {
    final grad = ballColors[color] ?? ballColors['R']!;
    final body = Container(
      key: ValueKey('$prefix-ball-$peg-$color'),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(colors: grad, begin: Alignment.topLeft, end: Alignment.bottomRight),
        border: Border.all(color: Colors.black.withValues(alpha: 0.15)),
      ),
      alignment: Alignment.center,
      child: FittedBox(
        child: Padding(
          padding: const EdgeInsets.all(2),
          child: Text(color,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
        ),
      ),
    );
    if (!draggable) return body;
    return Draggable<int>(
      data: peg,
      dragAnchorStrategy: pointerDragAnchorStrategy,
      feedback: Transform.translate(
        offset: Offset(-size / 2, -size / 2),
        child: Opacity(opacity: 0.9, child: body),
      ),
      childWhenDragging: Opacity(opacity: 0.3, child: body),
      child: body,
    );
  }
}
