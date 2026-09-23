import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'layout.dart';
import 'model.dart';

/// Шкурка круглой игры: торты или пицца. Правило хода одно, различается еда.
///
/// 🔴 ТРИ ИГРЫ НА ДВУХ ДВИЖКАХ В РАЗДЕЛЕ — решение Дениса 07.09.2026: «ещё
/// сделать режим пиццы, смысл тот же, картинки разные», отдельной игрой рядом.
/// Копии экрана нет: различаются список начинок, посуда и ключ лестницы.
enum CakeSkin { cake, pizza }

/// Виды начинки по номеру. Порядок ТОТ ЖЕ, что в вебе: номер вида — номер
/// картинки, и перестановка молча поменяла бы вид у всех уровней сразу.
const List<String> cakeTops = [
  'strawberry', 'apricot', 'lemon', 'pistachio', 'mint', 'blueberry',
  'blackberry', 'lavender', 'raspberry', 'caramel', 'chocolate', 'vanilla',
];

const List<String> pizzaTops = [
  'pepperoni', 'margherita', 'fourcheese', 'pesto', 'spinach', 'seafood',
  'squidink', 'beetroot', 'ham', 'corn', 'mushroom', 'bianca',
];

const List<String> pizzaBoards = [
  'oak', 'walnut', 'alupan', 'castiron', 'terracotta', 'porcelain', 'wicker', 'copper',
];

/// Цвета сладкого набора — тема по умолчанию. ⚠️ Цвет лежит ПОД картинкой
/// начинки и виден по краям куска: он вторая опора, когда начинки похожи.
const List<Color> cakeColors = [
  Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFFFDE047), Color(0xFF84CC16),
  Color(0xFF10B981), Color(0xFF22D3EE), Color(0xFF3B82F6), Color(0xFFA78BFA),
  Color(0xFFEC4899), Color(0xFFF97316), Color(0xFF78350F),
];

String topAsset(CakeSkin skin, int type) {
  final list = skin == CakeSkin.pizza ? pizzaTops : cakeTops;
  final i = ((type % list.length) + list.length) % list.length;
  return skin == CakeSkin.pizza ? 'assets/pizza/tops/${list[i]}.webp' : 'assets/cake/tops/${list[i]}.webp';
}

String dishAsset(CakeSkin skin, int plateIndex) {
  if (skin == CakeSkin.pizza) {
    return 'assets/pizza/boards/${pizzaBoards[plateIndex % pizzaBoards.length]}.webp';
  }
  return 'assets/cake/plates/p${plateIndex % 8}.webp';
}

/// СТОЛ «ТОРТОВ»: тарелки рядами, на каждой круг из шести кусков.
///
/// 🔴 ХОДОВ ДВА, И ОБА ЖИВУТ ЗДЕСЬ. Тап по куску и тап по тарелке — как в вебе;
/// и ПЕРЕТАСКИВАНИЕ: отзыв 09.09.2026 о тортах дословно — «Не перетаскивается не
/// хуя». Хват берётся по КЛЕТКЕ сетки (`plateForGrab`), а не по кругу: правка
/// 3c085b4d подняла охват касания с 61,5 % до 100 %, и терять это нельзя.
class CakeTable extends StatelessWidget {
  const CakeTable({
    super.key,
    required this.board,
    required this.fieldHeight,
    required this.skin,
    required this.selected,
    required this.selectedType,
    required this.canDrop,
    required this.onTapPlate,
    required this.onDrop,
  });

  final CakeBoard board;
  final double fieldHeight;
  final CakeSkin skin;

  /// Выбранная тарелка и вид куска, который с неё поедет.
  final int? selected;
  final int? selectedType;

  /// Ляжет ли выбранный кусок на эту тарелку — ОДИН предикат на тап, на
  /// перетаскивание и на подсветку.
  final bool Function(int type, int toPlate) canDrop;

  final void Function(int plate) onTapPlate;
  final void Function(({int from, int type}) pick, int toPlate) onDrop;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final fit = tableFit(c.maxWidth, fieldHeight, board.length);
        final step = fit.plate + plateGap;
        return SizedBox(
          width: c.maxWidth,
          height: fieldHeight,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: plateGap / 2),
                for (var r = 0; r < fit.rows; r += 1)
                  SizedBox(
                    height: step,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (var k = 0; k < inRow(r, fit.cols, board.length); k += 1)
                          Padding(
                            padding: const EdgeInsets.all(plateGap / 2),
                            child: _Plate(
                              index: r * fit.cols + k,
                              board: board,
                              size: fit.plate,
                              skin: skin,
                              selected: selected == r * fit.cols + k,
                              highlighted: selectedType != null &&
                                  selected != r * fit.cols + k &&
                                  canDrop(selectedType!, r * fit.cols + k),
                              canDrop: canDrop,
                              onTapPlate: onTapPlate,
                              onDrop: onDrop,
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Plate extends StatelessWidget {
  const _Plate({
    required this.index,
    required this.board,
    required this.size,
    required this.skin,
    required this.selected,
    required this.highlighted,
    required this.canDrop,
    required this.onTapPlate,
    required this.onDrop,
  });

  final int index;
  final CakeBoard board;
  final double size;
  final CakeSkin skin;
  final bool selected;
  final bool highlighted;
  final bool Function(int type, int toPlate) canDrop;
  final void Function(int plate) onTapPlate;
  final void Function(({int from, int type}) pick, int toPlate) onDrop;

  @override
  Widget build(BuildContext context) {
    final plate = board.plates[index];
    final r = size / 2;
    final cake = cakeRadius(size);

    final body = SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Посуда: у пиццы доска, у тортов тарелка темы.
          Image.asset(dishAsset(skin, index), width: size, height: size, fit: BoxFit.contain),
          // Куски: цвет вида ПОД картинкой начинки — цвет виден по краям и
          // работает, когда начинки похожи.
          for (var k = 0; k < plate.length; k += 1)
            SizedBox(
              width: size,
              height: size,
              child: ClipPath(
                clipper: _WedgeClipper(k, cake),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ColoredBox(color: cakeColors[plate[k] % cakeColors.length]),
                    Center(
                      child: Image.asset(
                        topAsset(skin, plate[k]),
                        width: cake * 2,
                        height: cake * 2,
                        fit: BoxFit.cover,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (selected || highlighted)
            CustomPaint(
              size: Size(size, size),
              painter: _RingPainter(
                radius: r - 2,
                color: selected ? const Color(0xFFF59E0B) : const Color(0xFF38BDF8),
                width: selected ? 3 : 2,
                dashed: highlighted && !selected,
              ),
            ),
        ],
      ),
    );

    return DragTarget<({int from, int type})>(
      onWillAcceptWithDetails: (d) => d.data.from != index && canDrop(d.data.type, index),
      onAcceptWithDetails: (d) => onDrop(d.data, index),
      builder: (context, candidate, rejected) {
        final active = candidate.isNotEmpty;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          /*
           * 🔴 ТАП ПО ТАРЕЛКЕ РАСКРЫВАЕТ ЕЁ, А НЕ ВЫБИРАЕТ КУСОК ВСЛЕПУЮ.
           *
           * 📍 Так это работает в вебе, и не от вкуса: на телефоне тарелка
           * выходит около 96 точек, а сектор в ней — 15 (`sectorMin`). Ткнуть в
           * нужный кусок на таком круге нельзя, и первая редакция переноса это
           * показала: тап в центр попадал ВСЕГДА в нулевой сектор, потому что
           * центр принадлежит всем шести сразу.
           *
           * Кусок выбирается в РАСКРЫТОЙ тарелке, где у каждого своя цель
           * нажатия. А перетаскивание берёт верхний — там выбора и не нужно.
           */
          onTap: () => onTapPlate(index),
          child: Container(
            key: ValueKey('plate-$index'),
            width: size,
            height: size,
            decoration: active
                ? BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF22C55E), width: 3),
                  )
                : null,
            child: plate.isEmpty
                ? body
                : Draggable<({int from, int type})>(
                    data: (from: index, type: plate.last),
                    dragAnchorStrategy: pointerDragAnchorStrategy,
                    feedback: Transform.translate(
                      offset: Offset(-size / 2, -size / 2),
                      child: Opacity(opacity: 0.85, child: body),
                    ),
                    childWhenDragging: Opacity(opacity: 0.4, child: body),
                    child: body,
                  ),
          ),
        );
      },
    );
  }

}

/// Кусок круга: сектор от центра, шестая часть по умолчанию.
class _WedgeClipper extends CustomClipper<Path> {
  const _WedgeClipper(this.index, this.radius);
  final int index;
  final double radius;

  @override
  Path getClip(Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final sweep = 2 * math.pi / circle;
    final start = -math.pi / 2 + index * sweep;   // от верха по часовой
    return Path()
      ..moveTo(c.dx, c.dy)
      ..arcTo(Rect.fromCircle(center: c, radius: radius), start, sweep, false)
      ..close();
  }

  @override
  bool shouldReclip(_WedgeClipper old) => old.index != index || old.radius != radius;
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.radius, required this.color, required this.width, required this.dashed});
  final double radius;
  final Color color;
  final double width;
  final bool dashed;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..color = color;
    if (!dashed) {
      canvas.drawCircle(c, radius, paint);
      return;
    }
    // Пунктир: место, куда МОЖНО положить, отличается от выбранного не только
    // цветом — иначе два кольца читались бы как одно состояние.
    const step = 0.28;
    for (var a = 0.0; a < 2 * math.pi; a += step * 2) {
      canvas.drawArc(Rect.fromCircle(center: c, radius: radius), a, step, false, paint);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.radius != radius || old.color != color || old.width != width || old.dashed != dashed;
}


/// РАСКРЫТАЯ ТАРЕЛКА: большой круг, у каждого куска своя цель нажатия.
///
/// 🔴 ЗАЧЕМ ОНА. Сектор на столе — 15 точек по норме (`sectorMin`); попасть в
/// нужный кусок пальцем там нельзя, и в вебе тарелка поэтому раскрывается.
/// Цель нажатия у куска — 56 точек, как в вебе, и стоит она на середине
/// сектора, а не в его вершине.
class CakeZoom extends StatelessWidget {
  const CakeZoom({
    super.key,
    required this.plate,
    required this.skin,
    required this.dishIndex,
    required this.size,
    required this.onPick,
    required this.onClose,
  });

  final List<int> plate;
  final CakeSkin skin;
  final int dishIndex;
  final double size;

  /// Взять кусок ЭТОГО вида (правило хода — `moveType`, а не «верхний»).
  final void Function(int type) onPick;
  final VoidCallback onClose;

  static const double target = 56;

  @override
  Widget build(BuildContext context) {
    final r = size / 2;
    final cake = cakeRadius(size);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onClose,
      child: ColoredBox(
        color: const Color(0xAA000000),
        child: Center(
          child: SizedBox(
            width: size,
            height: size,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Image.asset(dishAsset(skin, dishIndex), width: size, height: size, fit: BoxFit.contain),
                for (var k = 0; k < plate.length; k += 1)
                  SizedBox(
                    width: size,
                    height: size,
                    child: ClipPath(
                      clipper: _WedgeClipper(k, cake),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          ColoredBox(color: cakeColors[plate[k] % cakeColors.length]),
                          Center(
                            child: Image.asset(
                              topAsset(skin, plate[k]),
                              width: cake * 2,
                              height: cake * 2,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                // Цели нажатия поверх рисунка: у куска своя кнопка с подписью
                // для незрячих — у самого сектора ни отклика, ни озвучки нет.
                for (var k = 0; k < plate.length; k += 1)
                  Builder(builder: (context) {
                    final angle = ((k + 0.5) * 2 * math.pi) / circle - math.pi / 2;
                    final radius = cake * 0.62;
                    return Positioned(
                      left: r + radius * math.cos(angle) - target / 2,
                      top: r + radius * math.sin(angle) - target / 2,
                      width: target,
                      height: target,
                      child: Semantics(
                        button: true,
                        label: 'Кусок ${plate[k] + 1}',
                        child: GestureDetector(
                          key: ValueKey('slice-$k'),
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onPick(plate[k]),
                          child: const SizedBox.expand(),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Размер раскрытой тарелки: не меньше 200 и не больше того, что даёт экран.
double zoomSize(double width, double height) {
  const pad = 24.0;
  final byWidth = width - pad * 2;
  final byHeight = height - pad * 2;
  final v = byWidth < byHeight ? byWidth : byHeight;
  return v < 200 ? 200 : v;
}
