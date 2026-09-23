import 'package:flutter/material.dart';

import 'model.dart';

/// ПОЛЕ «ХАНОЙСКОЙ БАШНИ»: стержни, диски, два способа хода.
///
/// 🔴 ПЕРЕТАСКИВАНИЕ — ГЛАВНОЕ ЗДЕСЬ. Отчёт тестировщицы 14.09.2026 дословно:
/// «две проблемы перетаскивания DragandDrop хуёвенько работают, ну тут вроде
/// работает, но лагает». Поэтому диск тащится своим слоем, а не перерисовкой
/// всей доски, и тап остаётся вторым путём — он же путь для скринридера.
///
/// 🔴 ШИРИНА ДИСКА СЧИТАЕТСЯ ОТ СТЕРЖНЯ, А СТЕРЖЕНЬ — ОТ ПОЛЯ, КОТОРОЕ ДАЛ
/// КАРКАС. В вебе высота доски бралась от окна (`height - 210`), и на коротком
/// экране нижний диск подрезало.
class HanoiBoard extends StatelessWidget {
  const HanoiBoard({
    super.key,
    required this.state,
    required this.fieldHeight,
    required this.selected,
    required this.onTapPeg,
    required this.onDrop,
  });

  final HanoiState state;
  final double fieldHeight;

  /// Выбранный стержень (тапом) — с него поедет верхний диск.
  final int? selected;
  final void Function(int peg) onTapPeg;
  final void Function(int from, int to) onDrop;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        final n = state.pegs.length;
        // Ширина стержня — как в вебе: делим поле на число стержней с запасом
        // полустержня, потолок 110.
        final pegW = ((c.maxWidth - 36) / (n + 0.5)).clamp(40.0, 110.0);
        final baseW = pegW * 0.40;
        final maxW = pegW * 0.90;
        final step = (maxW - baseW) / (state.discs - 1 > 0 ? state.discs - 1 : 1);
        // Высота диска: столько, чтобы САМАЯ высокая башня влезла в поле целиком.
        final discH = ((fieldHeight - 44) / (state.discs + 1)).clamp(10.0, 28.0);

        // Башня занимает столько, сколько ей нужно, и стоит ПОСЕРЕДИНЕ поля.
        // Растянутые на всю высоту стержни оставляли сверху пустой экран, а
        // диски жались к нижнему краю — видно только на снимке.
        final towerH = (state.discs + 1) * discH + 12;
        return SizedBox(
          width: c.maxWidth,
          height: fieldHeight,
          child: Center(
            child: SizedBox(
              height: towerH < fieldHeight ? towerH : fieldHeight,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < n; i += 1)
                    DragTarget<int>(
                      onWillAcceptWithDetails: (d) => state.canMove(d.data, i),
                      onAcceptWithDetails: (d) => onDrop(d.data, i),
                      builder: (context, candidate, rejected) {
                        final active = candidate.isNotEmpty;
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onTapPeg(i),
                          child: Semantics(
                            button: true,
                            selected: selected == i,
                            label: state.pegs[i].isEmpty
                                ? 'Стержень ${i + 1}: пусто'
                                : 'Стержень ${i + 1}: дисков ${state.pegs[i].length}, верхний ${state.pegs[i].last}',
                            child: Container(
                              key: ValueKey('peg-$i'),
                              width: pegW,
                              height: towerH < fieldHeight ? towerH : fieldHeight,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: active
                                      ? const Color(0xFF22C55E)
                                      : selected == i
                                      ? const Color(0xFFF59E0B)
                                      : Colors.transparent,
                                  width: active || selected == i ? 2 : 0,
                                ),
                              ),
                              child: Stack(
                                alignment: Alignment.bottomCenter,
                                children: [
                                  // Штырь и основание: без них стержень не читается
                                  // как стержень, а диски висят в воздухе.
                                  Positioned(
                                    bottom: 6,
                                    child: Container(
                                      width: 8,
                                      height: (state.discs + 1) * discH,
                                      decoration: BoxDecoration(
                                        color: scheme.onSurface.withValues(alpha: 0.45),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    bottom: 0,
                                    child: Container(
                                      width: pegW - 12,
                                      height: 6,
                                      decoration: BoxDecoration(
                                        color: scheme.onSurface.withValues(alpha: 0.6),
                                        borderRadius: BorderRadius.circular(3),
                                      ),
                                    ),
                                  ),
                                  for (var k = 0; k < state.pegs[i].length; k += 1)
                                    Positioned(
                                      bottom: 6 + k * discH,
                                      child: _Disc(
                                        size: state.pegs[i][k],
                                        width: baseW + (state.pegs[i][k] - 1) * step,
                                        height: discH - 2,
                                        peg: i,
                                        top: k == state.pegs[i].length - 1,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Диск. Верхний — берётся пальцем; нижние нарисованы, но не тащатся: иначе
/// перетаскивание обещало бы ход, которого в игре нет.
class _Disc extends StatelessWidget {
  const _Disc({
    required this.size,
    required this.width,
    required this.height,
    required this.peg,
    required this.top,
  });

  final int size;
  final double width;
  final double height;
  final int peg;
  final bool top;

  static const List<Color> colors = [
    Color(0xFFEF4444),
    Color(0xFFF59E0B),
    Color(0xFFFDE047),
    Color(0xFF84CC16),
    Color(0xFF10B981),
    Color(0xFF22D3EE),
    Color(0xFF3B82F6),
    Color(0xFFA78BFA),
    Color(0xFFEC4899),
    Color(0xFFF97316),
    Color(0xFF14B8A6),
    Color(0xFF8B5CF6),
  ];

  @override
  Widget build(BuildContext context) {
    final body = Container(
      key: ValueKey('disc-$peg-$size'),
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: colors[(size - 1) % colors.length],
        borderRadius: BorderRadius.circular(height / 2),
        border: Border.all(color: Colors.black.withValues(alpha: 0.18)),
      ),
      alignment: Alignment.center,
      // Номер диска — вторая опора рядом с цветом и шириной: у двенадцати
      // дисков соседние оттенки различаются хуже, чем кажется.
      child: FittedBox(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            '$size',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
          ),
        ),
      ),
    );
    if (!top) return body;
    return Draggable<int>(
      data: peg,
      dragAnchorStrategy: pointerDragAnchorStrategy,
      feedback: Transform.translate(
        offset: Offset(-width / 2, -height / 2),
        child: Opacity(opacity: 0.9, child: body),
      ),
      childWhenDragging: Opacity(opacity: 0.3, child: body),
      child: body,
    );
  }
}
