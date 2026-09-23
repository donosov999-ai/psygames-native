import 'package:flutter/material.dart';

import 'layout.dart';
import 'model.dart';

/// Шкурка движка сосудов: одно правило хода, разный вид.
///
/// 🔴 ТРИ ИГРЫ НА ОДНОМ ДВИЖКЕ — решение Дениса 06.09.2026, дословно: «шарики и
/// гайки отдельными играми рядом… значит лепим, в хаб сортировка». Я предлагал
/// сделать их скином одной игры и был переубеждён — записано, чтобы не
/// переигрывать заново.
enum TubeSkin { water, balls, nuts }

/// Цвет игры: заливка, знак и имя ближайшего нарисованного шара/гайки.
///
/// ⚠️ ЗНАК — ВТОРАЯ ОПОРА ДЛЯ ДАЛЬТОНИКА. Двенадцать заливок на экране это
/// предел, за которым оттенки перестают различаться; поэтому у каждого цвета
/// есть ещё и фигура. В вебе за этим следит отдельный гейт.
class PieceColor {
  const PieceColor(this.fill, this.mark, this.piece);

  factory PieceColor.fromJson(Map<String, dynamic> j) => PieceColor(
        Color(int.parse((j['fill'] as String).replaceFirst('#', 'ff'), radix: 16)),
        j['mark'] as String,
        j['piece'] as String,
      );

  final Color fill;
  final String mark;

  /// Имя картинки: `assets/balls/<стиль>-<piece>.webp`, `assets/nuts/nut-<piece>.webp`.
  final String piece;
}

/// ПОЛЕ ДВИЖКА СОСУДОВ.
///
/// 🔴 ХОД ДЕЛАЕТСЯ ДВУМЯ ДОРОГАМИ, И ОБЕ ЗОВУТ ОДИН ПРЕДИКАТ. Тап по сосуду и
/// тап по цели (работает со скринридером) — как в вебе; и ПЕРЕТАСКИВАНИЕ, которого
/// в вебе нет: отчёт тестировщицы 17.09.2026 дословно — «не даёт перетащить нижнюю
/// левую гайку на верхний ряд… гайка не двигается». Человек пробует тащить, потому
/// что так устроены все игры этого жанра.
///
/// 🔴 РАЗМЕР СОСУДА СЧИТАЕТ `GsLayout`-перенос, А НЕ ЭТОТ ФАЙЛ. Замер 11.09.2026:
/// выбор числа колонок по ВЫСОТЕ поля растит сосуд с 62 до 109 точек на том же
/// экране.
class TubesField extends StatelessWidget {
  const TubesField({
    super.key,
    required this.field,
    required this.fieldHeight,
    required this.skin,
    required this.palette,
    required this.hidden,
    required this.selected,
    required this.onTapTube,
    required this.onPourTo,
    this.ballStyle = 'glossy',
  });

  final TubeField field;
  final double fieldHeight;
  final TubeSkin skin;
  final List<PieceColor> palette;

  /// Ключи скрытых слоёв (`сосуд * 100 + глубина`).
  final Set<int> hidden;
  final int? selected;
  final void Function(int tube) onTapTube;

  /// Перелив перетаскиванием: из сосуда в сосуд.
  final void Function(int from, int to) onPourTo;

  final String ballStyle;

  static const double insideTop = 0.10;      // низ ободка
  static const double insideBottom = 0.955;  // внутренняя точка дна
  static const double nutAspect = 1.115;     // ширина ÷ высота нарисованной гайки
  static const double nutOverlap = 0.42;     // у стопки видно только боковину нижних
  static const double nutHole = 0.43;
  static const double boltInFrame = 0.523;

  /// Поля стекла по шкурке. ⚠️ У гаек записи НЕТ намеренно: стекла у них нет
  /// вовсе, и копия чисел пробирки молча ужимала столб гаек до просвета
  /// несуществующего стекла (замер 09.09.2026: гайка 0,636 ширины против
  /// доступных 0,96 — вдвое меньше по площади).
  static const Map<TubeSkin, ({double left, double right})> glassPads = {
    TubeSkin.water: (left: 0.182, right: 0.818),
    TubeSkin.balls: (left: 0.157, right: 0.839),
  };

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final n = field.length;
        final w = tubeWidth(n, c.maxWidth, fieldHeight);
        final h = tubeHeight(w);
        final cols = columnsFor(n, c.maxWidth, fieldHeight);
        final rows = (n / cols).ceil();

        return SizedBox(
          width: c.maxWidth,
          height: fieldHeight,
          child: Center(
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var r = 0; r < rows; r += 1) ...[
                    if (r > 0) const SizedBox(height: tubeGap),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (var k = 0; k < cols; k += 1)
                          if (r * cols + k < n) ...[
                            if (k > 0) const SizedBox(width: tubeGap),
                            _Tube(
                              index: r * cols + k,
                              field: field,
                              width: w,
                              height: h,
                              skin: skin,
                              palette: palette,
                              hidden: hidden,
                              selected: selected == r * cols + k,
                              ballStyle: ballStyle,
                              onTap: onTapTube,
                              onPourTo: onPourTo,
                            ),
                          ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Tube extends StatelessWidget {
  const _Tube({
    required this.index,
    required this.field,
    required this.width,
    required this.height,
    required this.skin,
    required this.palette,
    required this.hidden,
    required this.selected,
    required this.ballStyle,
    required this.onTap,
    required this.onPourTo,
  });

  final int index;
  final TubeField field;
  final double width;
  final double height;
  final TubeSkin skin;
  final List<PieceColor> palette;
  final Set<int> hidden;
  final bool selected;
  final String ballStyle;
  final void Function(int tube) onTap;
  final void Function(int from, int to) onPourTo;

  @override
  Widget build(BuildContext context) {
    final tube = field.tubes[index];
    final locked = !field.isOpen(index);
    final insideTopPx = height * TubesField.insideTop;
    final columnH = height * (TubesField.insideBottom - TubesField.insideTop);
    final portionH = columnH / field.cap;
    final nuts = skin == TubeSkin.nuts;
    final round = skin == TubeSkin.balls;

    /*
     * 🔴 ГАЙКА ШИРИНОЙ ВО ВЕСЬ СТОЛБЕЦ, А НЕ ВО ВНУТРЕННИЙ ПРОСВЕТ СТЕКЛА.
     * ⚠️ Ширину ограничивает ВЫСОТА СТОЛБА: гайка садится на предыдущую с
     * нахлёстом, шаг столба пропорционален ширине — возьми «сколько влезет
     * вбок», и на сосуде вместимостью шесть верхняя гайка вылезет за край.
     * ⚠️ 0,90, а не «сколько влезет»: при 0,96 соседние столбы смыкаются гранями
     * и перестают читаться как отдельные.
     */
    final pads = TubesField.glassPads[skin] ?? TubesField.glassPads[TubeSkin.water]!;
    final byColumn = (columnH * TubesField.nutAspect) / (field.cap * (1 - TubesField.nutOverlap));
    final pieceW = nuts
        ? (width * nutInColumn < byColumn ? width * nutInColumn : byColumn)
        : width * (pads.right - pads.left);
    final left = nuts ? (width - pieceW) / 2 : width * pads.left;

    // Высота ПОРЦИИ одна на все сосуды (по самому высокому), поэтому короткий
    // сосуд выходит визуально коротким — ровно то сообщение, что нужно: приёмы
    // обязаны быть видны, иначе «не льётся» читается как поломка игры.
    // Шаг столба: у воды и шаров порции встык, у гаек — внахлёст 0,42 (видна
    // только боковина нижней, верхняя грань уходит под соседнюю).
    final pieceH = nuts ? pieceW / TubesField.nutAspect : portionH;
    final step = nuts ? pieceH * (1 - TubesField.nutOverlap) : portionH;

    final own = field.capOf(index);
    final stones = field.stonesIn(index);
    final ownH = portionH * own;
    final topOwn = insideTopPx + (columnH - ownH);

    final body = SizedBox(
      width: width,
      height: height,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          /*
           * Болт ПОД гайками: рисуется до столба, значит гайки его закрывают — как
           * и положено накрученным гайкам (отчёт 75ed86f3: «гайки должны быть
           * плотнее и на болте с резьбой»).
           *
           * 🔴 ВЫСОТА БОЛТА — ПО ВМЕСТИМОСТИ, А НЕ ВО ВСЁ ГНЕЗДО (задача 67f58742).
           *
           * 📍 Отчёт 17.09.2026: «не даёт перетащить гайку… и в другую сторону не
           * двигается». Игра была ПРАВА — оба стержня полные, — а выглядели они
           * свободными: замер по кадру 430×932 показал над полным стержнем 81 px
           * пустой резьбы, это 1,9 высоты гайки. Причина ровно здесь: болт брал
           * `height * 0.94`, то есть всю высоту гнезда, и обещал место, которого
           * нет. Теперь он кончается сразу над последней возможной гайкой, и
           * полный стержень ВИДНО полным.
           */
          if (nuts)
            Positioned(
              bottom: height - topOwn - ownH,
              left: (width - pieceW * (TubesField.nutHole / TubesField.boltInFrame)) / 2,
              width: pieceW * (TubesField.nutHole / TubesField.boltInFrame),
              height: pieceH + (own - 1) * step + pieceH * 0.35,
              child: Image.asset('assets/nuts/bolt.webp', fit: BoxFit.fill),
            ),
          Positioned(
            left: left,
            top: topOwn,
            width: pieceW,
            height: ownH,
            child: Stack(
              alignment: Alignment.bottomCenter,
              clipBehavior: Clip.none,
              children: [
                // Камни на дне: сосуд-буфер, домом цвета он не станет никогда.
                if (stones > 0)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: portionH * stones,
                    child: Container(
                      decoration: const BoxDecoration(
                        color: Color(0xFF6B6F76),
                        border: Border(top: BorderSide(color: Color(0xFF4A4E54), width: 2)),
                        borderRadius: BorderRadius.vertical(bottom: Radius.circular(8)),
                      ),
                    ),
                  ),
                /*
                 * 🔴 СТОПКА С ЯВНЫМИ МЕСТАМИ, А НЕ КОЛОНКА С ОТСТУПАМИ. Во вебе
                 * нахлёст гаек делался отрицательным `marginBottom`; Flutter
                 * отрицательный отступ запрещает (Container ловит его проверкой).
                 * Место каждой порции считается шагом столба, а нахлёст живёт в
                 * шаге — ровно та же картинка, что в вебе.
                 *
                 * ⚠️ ПОРЯДОК НАЛОЖЕНИЯ ТОТ ЖЕ: нижние рисуются ПОЗЖЕ, значит
                 * поверх верхних. Переверни — и стопка читается как растущая из
                 * экрана на зрителя, то есть как сбой отрисовки.
                 */
                for (var k = tube.length - 1; k >= 0; k -= 1)
                  Positioned(
                    left: 0,
                    bottom: k * step,
                    child: _Portion(
                      color: palette[tube[k] % palette.length],
                      visible: layerVisible(field, hidden, index, k),
                      width: pieceW,
                      height: pieceH,
                      round: round,
                      nut: nuts,
                      bottom: k == 0,
                      ballStyle: ballStyle,
                    ),
                  ),
              ],
            ),
          ),
          // Стекло ПОВЕРХ содержимого: блики и ободок ложатся на жидкость, как в
          // настоящей пробирке. У гаек стекла нет — блик поверх металла читался
          // бы как грязь.
          if (!nuts)
            Positioned.fill(
              child: IgnorePointer(
                child: Image.asset(
                  round ? 'assets/tubes/tube-glass-balls.png' : 'assets/tubes/tube-glass.png',
                  fit: BoxFit.fill,
                ),
              ),
            ),
          // Запечатанный сосуд гасится и показывает замок: он на поле есть, но в
          // ход не идёт, пока не закрыто нужное число других.
          if (locked)
            Positioned(
              top: height * 0.34,
              left: 0,
              right: 0,
              child: Icon(Icons.lock, size: width * 0.34 < 14 ? 14 : width * 0.34, color: const Color(0xFF3F444B)),
            ),
        ],
      ),
    );

    final shown = Opacity(opacity: locked ? 0.42 : 1, child: body);

    return DragTarget<int>(
      onWillAcceptWithDetails: (d) => d.data != index && canPour(field, d.data, index),
      onAcceptWithDetails: (d) => onPourTo(d.data, index),
      builder: (context, candidate, rejected) {
        final active = candidate.isNotEmpty;
        return Semantics(
          button: true,
          selected: selected,
          label: _label(tube),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => onTap(index),
            child: Container(
              key: ValueKey('tube-$index'),
              // Выбранный сосуд приподнят — как в вебе: видно, чем ходишь.
              transform: Matrix4.translationValues(0, selected ? -14 : 0, 0),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: active
                      ? const Color(0xFF22C55E)
                      : selected
                          ? const Color(0xFFFBBF24)
                          : Colors.transparent,
                  width: active || selected ? 2 : 0,
                ),
              ),
              child: tube.isEmpty || locked
                  ? shown
                  : Draggable<int>(
                      data: index,
                      dragAnchorStrategy: pointerDragAnchorStrategy,
                      feedback: Transform.translate(
                        offset: Offset(-width / 2, -height / 2),
                        child: Opacity(opacity: 0.85, child: shown),
                      ),
                      childWhenDragging: Opacity(opacity: 0.35, child: shown),
                      child: shown,
                    ),
            ),
          ),
        );
      },
    );
  }

  String _label(List<int> tube) {
    if (tube.isEmpty) return 'Сосуд ${index + 1}: пусто';
    final marks = <String>[];
    for (var d = 0; d < tube.length; d += 1) {
      marks.add(layerVisible(field, hidden, index, d) ? palette[tube[d] % palette.length].mark : '?');
    }
    return 'Сосуд ${index + 1}: ${marks.join(' ')}';
  }
}

/// Одна порция: вода — сплошной слой, шарик — круг, гайка — гранёная плитка.
///
/// 🔴 ФОРМА СЛОЯ — ЕДИНСТВЕННОЕ, ЧЕМ ТРИ ИГРЫ РАЗЛИЧАЮТСЯ НА ПОЛЕ. Правило хода у
/// всех трёх одно, и это честно: шкурка меняет вид, а не задачу.
/// ⚠️ СКРЫТЫЙ СЛОЙ — СЕРЫЙ СО ЗНАКОМ ВОПРОСА, А НЕ ЧЁРНЫЙ: чёрная порция читается
/// как пустое место или поломка, а «?» говорит «цвет здесь есть, и он неизвестен».
class _Portion extends StatelessWidget {
  const _Portion({
    required this.color,
    required this.visible,
    required this.width,
    required this.height,
    required this.round,
    required this.nut,
    required this.bottom,
    required this.ballStyle,
  });

  final PieceColor color;
  final bool visible;
  final double width;
  final double height;
  final bool round;
  final bool nut;
  final bool bottom;
  final String ballStyle;

  @override
  Widget build(BuildContext context) {
    final picture = !visible
        ? null
        : round
            ? 'assets/balls/$ballStyle-${color.piece}.webp'
            : nut
                ? 'assets/nuts/nut-${color.piece}.webp'
                : null;
    final radius = round ? height / 2 : (nut ? 6.0 : 0.0);

    return Container(
      // Зазоров нет ни у шаров, ни у гаек — решение Дениса 09.09.2026:
      // «расстояние зачем-то между ними оставил». Нахлёст гаек задан ШАГОМ
      // столба в `_Tube`, а не отступом здесь.
      width: width,
      height: height,
      decoration: BoxDecoration(
        // У нарисованного шара фона нет: картинка сама несёт цвет и блик.
        color: picture != null ? Colors.transparent : (visible ? color.fill : const Color(0xFF6B7280)),
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(radius),
          bottom: Radius.circular(bottom && !round && !nut ? width / 2 : radius),
        ),
      ),
      alignment: Alignment.center,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (picture != null)
            // ⚠️ Размер картинки задан ЯВНО: в вебе на этом трижды наступали —
            // натуральная ширина перебивала растяжку, и шар вылезал за трубку.
            Image.asset(picture, width: width, height: height, fit: BoxFit.contain),
          Text(
            visible ? color.mark : '?',
            style: TextStyle(
              fontSize: (height * 0.42).clamp(9, 18),
              color: Colors.white,
              fontWeight: FontWeight.w700,
              shadows: const [Shadow(color: Color(0x99000000), blurRadius: 2)],
            ),
          ),
        ],
      ),
    );
  }
}
