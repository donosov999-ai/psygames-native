import 'package:flutter/material.dart';

import 'layout.dart';
import 'model.dart';

/// Что держит человек: ниша и место товара в ней.
///
/// ⚠️ МЕСТО, А НЕ ТОЛЬКО ТИП. Товары стоят на полке в ряд, и берут ЛЮБОЙ, а не
/// верхний: иначе половина ходов игры недоступна.
class GoodsPick {
  const GoodsPick(this.cell, this.index, this.type);
  final int cell;
  final int index;
  final int type;
}

/// ПОЛЕ «СОРТИРОВКИ ТОВАРОВ»: шкаф, полки-ниши, товары, два способа хода.
///
/// 🔴 ВСЯ АРИФМЕТИКА — ИЗ `GsLayout`, ПЕРЕНОСА ЖИВОГО `gsLayout`. Считать её
/// здесь заново нельзя: в вебе такая вторая копия формулы уже была, формулы
/// разъехались молча, и гейт шесть недель проверял ту, которой на экране нет
/// (отчёт Вали 05.09.2026 со скриншотом обрезанного нижнего ряда — при зелёных
/// пробах). Высоту поля каркас отдаёт числом, ширину даёт родитель.
///
/// 🔴 ХОДОВ ДВА, И ОБА ЖИВУТ ЗДЕСЬ: тап по товару и тап по нише (доступно со
/// скринридером) и перетаскивание. В вебе это два разных пути с разными
/// проверками, и они разъезжались; здесь оба зовут один предикат [canDrop].
class GoodsField extends StatelessWidget {
  const GoodsField({
    super.key,
    required this.level,
    required this.board,
    required this.fieldHeight,
    required this.obstacles,
    required this.covered,
    required this.frozenRow,
    required this.selection,
    required this.canDrop,
    required this.onPickItem,
    required this.onTapNiche,
    required this.onDrop,
  });

  final GoodsLevel level;
  final GoodsBoard board;
  final double fieldHeight;
  final List<Obstacle?> obstacles;
  final Set<String> covered;
  final int? frozenRow;
  final GoodsPick? selection;

  /// Ляжет ли взятое в нишу. ОДИН предикат на тап, на перетаскивание и на подсветку.
  final bool Function(GoodsPick pick, int toCell) canDrop;

  final void Function(GoodsPick pick) onPickItem;
  final void Function(int cell) onTapNiche;
  final void Function(GoodsPick pick, int toCell) onDrop;

  /// Номер ниши по месту сетки: маска задаёт дыры, генератор отдаёт плотный список.
  int? _nicheAtPlace(int place) {
    if (place >= level.mask.length || !level.mask[place]) return null;
    var seen = -1;
    for (var p = 0; p <= place; p += 1) {
      if (level.mask[p]) seen += 1;
    }
    return seen;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        // Самая вместительная ниша доски: по ней считается ряд, но НЕ размер
        // товара в каждой нише (см. `itemBox`).
        final capWide = board.caps.isEmpty ? 3 : board.caps.reduce((a, b) => a > b ? a : b);
        final lay = GsLayout(
          width: c.maxWidth,
          availH: fieldHeight,
          cols: level.cols,
          rows: level.rows,
          capWide: capWide,
          // Строка цели у каркаса живёт ВНЕ поля (свой ряд кнопок), поэтому
          // вычитать её высоту тут нечего — в отличие от веба.
          hintH: 0,
          floorItem: level.floorItem,
        );
        // Смешанная ёмкость на доске — тогда и только тогда рисуются насечки:
        // там, где все ниши одинаковы, это лишний шум.
        final mixedCaps = board.caps.toSet().length > 1;

        final cabinet = Container(
          width: lay.boardW.toDouble(),
          decoration: const BoxDecoration(
            color: Color(0xFFE6C49A),
            borderRadius: BorderRadius.all(Radius.circular(14)),
            border: Border(bottom: BorderSide(color: Color(0xFFB98A55), width: 9)),
            boxShadow: [
              BoxShadow(color: Color(0x4D5A3A18), blurRadius: 8, offset: Offset(0, 4)),
            ],
          ),
          padding: EdgeInsets.all(GsLayout.shelfPad.toDouble()),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var r = 0; r < level.rows; r += 1) ...[
                if (r > 0) SizedBox(height: GsLayout.shelfGap.toDouble()),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var col = 0; col < level.cols; col += 1) ...[
                      if (col > 0) SizedBox(width: GsLayout.shelfGap.toDouble()),
                      SizedBox(
                        width: lay.cellW.toDouble(),
                        height: lay.nicheH.toDouble(),
                        child: switch (_nicheAtPlace(r * level.cols + col)) {
                          final int i => Center(
                              child: _Niche(
                                index: i,
                                row: r,
                                board: board,
                                lay: lay,
                                mixedCaps: mixedCaps,
                                hiddenLevel: level.hidden,
                                goal: level.goal,
                                obstacle: i < obstacles.length ? obstacles[i] : null,
                                frozen: frozenRow != null && r == frozenRow,
                                covered: covered,
                                selection: selection,
                                canDrop: canDrop,
                                onPickItem: onPickItem,
                                onTapNiche: onTapNiche,
                                onDrop: onDrop,
                              ),
                            ),
                          _ => const SizedBox.shrink(),
                        },
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
        );

        // Витрина (с L46) НАМЕРЕННО не влезает в поле: ряды растут, колонки нет,
        // товар при этом не ужимается ниже пола читаемости. Об этом говорит сама
        // раскладка (`scrolls`) — здесь только оборачиваем в прокрутку.
        return SizedBox(
          width: c.maxWidth,
          height: fieldHeight,
          child: lay.scrolls
              ? SingleChildScrollView(child: Center(child: cabinet))
              : Center(child: cabinet),
        );
      },
    );
  }
}

class _Niche extends StatelessWidget {
  const _Niche({
    required this.index,
    required this.row,
    required this.board,
    required this.lay,
    required this.mixedCaps,
    required this.hiddenLevel,
    required this.goal,
    required this.obstacle,
    required this.frozen,
    required this.covered,
    required this.selection,
    required this.canDrop,
    required this.onPickItem,
    required this.onTapNiche,
    required this.onDrop,
  });

  final int index;
  final int row;
  final GoodsBoard board;
  final GsLayout lay;
  final bool mixedCaps;
  final bool hiddenLevel;
  final Goal goal;
  final Obstacle? obstacle;
  final bool frozen;
  final Set<String> covered;
  final GoodsPick? selection;
  final bool Function(GoodsPick pick, int toCell) canDrop;
  final void Function(GoodsPick pick) onPickItem;
  final void Function(int cell) onTapNiche;
  final void Function(GoodsPick pick, int toCell) onDrop;

  @override
  Widget build(BuildContext context) {
    final cell = board.cells[index];
    final cap = board.capOf(index);
    final hint = selection != null && canDrop(selection!, index);
    final box = lay.itemBox(cap);
    final width = lay.nicheW(cap).toDouble();
    final back = board.back;
    final behind = back != null && index < back.length ? back[index].length : 0;
    final flagged = goal.kind == 'free' && goal.niches.contains(index);

    return DragTarget<GoodsPick>(
      onWillAcceptWithDetails: (d) => canDrop(d.data, index),
      onAcceptWithDetails: (d) => onDrop(d.data, index),
      builder: (context, candidate, rejected) {
        final active = candidate.isNotEmpty;
        return Semantics(
          button: true,
          label: _label(cell, cap),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => onTapNiche(index),
            child: Container(
              key: ValueKey('niche-$index'),
              width: width,
              height: lay.nicheH.toDouble(),
              clipBehavior: Clip.hardEdge,   // тень товара не вылезает из ниши
              decoration: BoxDecoration(
                // Фон ниши растягивается (fill), а не обрезается: полурейки по
                // краям обязаны состыковаться в целые доски у соседних ниш.
                image: const DecorationImage(
                  image: AssetImage('assets/goods/niche-birch.webp'),
                  fit: BoxFit.fill,
                ),
                color: const Color(0xFF6B4A2B),   // пока картинка грузится — не дыра цветом экрана
                borderRadius: BorderRadius.circular(4),
                border: Border.all(
                  color: active
                      ? const Color(0xFF22C55E)
                      : hint
                          ? const Color(0xFFFBBF24)
                          : Colors.transparent,
                  width: active || hint ? 3 : 0,
                ),
              ),
              foregroundDecoration: frozen || obstacle != null
                  ? BoxDecoration(
                      color: (frozen ? const Color(0xFF38BDF8) : Colors.black).withValues(alpha: 0.28),
                      borderRadius: BorderRadius.circular(4),
                    )
                  : null,
              child: Stack(
                alignment: Alignment.bottomCenter,
                children: [
                  // За нишей второй ряд — видно ДО хода, а не после. Рисуем
                  // ПОЗАДИ товаров: значок поверх закрыл бы товар (та самая
                  // ошибка, что чинилась в сосудах шариков).
                  if (behind > 0)
                    Positioned(
                      top: 0,
                      child: Column(
                        children: [
                          Container(
                            width: width * 0.78,
                            height: 5,
                            decoration: const BoxDecoration(
                              color: Color(0x8CC8AA82),
                              borderRadius: BorderRadius.vertical(bottom: Radius.circular(4)),
                              border: Border(bottom: BorderSide(color: Color(0x731E1006))),
                            ),
                          ),
                          const SizedBox(height: 1),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (var k = 0; k < (behind > 4 ? 4 : behind); k += 1)
                                Container(
                                  width: 3,
                                  height: 3,
                                  margin: const EdgeInsets.symmetric(horizontal: 1),
                                  decoration: const BoxDecoration(
                                    color: Color(0xBFE8CDA8),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  _Stack(
                    niche: index,
                    cell: cell,
                    box: box,
                    covered: covered,
                    hiddenLevel: hiddenLevel,
                    selection: selection,
                    enabled: obstacle == null && !frozen,
                    onPick: onPickItem,
                  ),
                  // Сколько влезет — видно до хода. Со смешанной ёмкостью ниши
                  // выглядят одинаково, и вместимость узнавалась бы угадайкой.
                  if (mixedCaps)
                    Positioned(
                      bottom: 3,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (var k = 0; k < cap; k += 1)
                            Container(
                              width: 7,
                              height: 3,
                              margin: const EdgeInsets.symmetric(horizontal: 1.5),
                              decoration: BoxDecoration(
                                color: k < cell.length
                                    ? const Color(0xD9FFECBE)
                                    : const Color(0x4DFFFFFF),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                        ],
                      ),
                    ),
                  // Джокер виден ДО хода: он снимает правило укладки, и без метки
                  // об этом узнают единственным способом — попробовав.
                  if (board.isJoker(index))
                    const Positioned(
                      top: 2,
                      right: 4,
                      child: Text('★', style: TextStyle(fontSize: 11, height: 1.1, color: Color(0xE6FBBF24))),
                    ),
                  // Помеченная ниша цели «освободить»: без флажка цель превращается
                  // в загадку, какие именно ниши.
                  if (flagged)
                    const Positioned(
                      top: 3,
                      right: 3,
                      child: Icon(Icons.flag, size: 13, color: Color(0xFFF97316)),
                    ),
                  if (obstacle?.kind == 'blocked')
                    const Icon(Icons.lock, size: 22, color: Color(0xFFF8E3C4)),
                  if (obstacle?.kind == 'locked')
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.timer_outlined, size: 20, color: Color(0xFFF8E3C4)),
                        Text('${obstacle!.movesLeft}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, color: Color(0xFFF8E3C4))),
                      ],
                    ),
                  if (frozen && obstacle == null)
                    const Icon(Icons.ac_unit, size: 20, color: Color(0xFFE8F6FF)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _label(List<int> cell, int cap) {
    if (obstacle?.kind == 'blocked') return 'Ниша ${index + 1}: заперта';
    if (obstacle?.kind == 'locked') return 'Ниша ${index + 1}: откроется через ${obstacle!.movesLeft}';
    if (frozen) return 'Ниша ${index + 1}: примёрзший ряд';
    if (cell.isEmpty) return 'Ниша ${index + 1}: пусто, место $cap';
    return 'Ниша ${index + 1}: товаров ${cell.length} из $cap';
  }
}

/// СТОПКА ТОВАРОВ В НИШЕ: внахлёст, передний поверх заднего.
///
/// 🔴 НАХЛЁСТ — НЕ УКРАШЕНИЕ, А РАЗМЕР. Встык три товара делят ширину ячейки на
/// три, внахлёст 0,3 — на 2,4: товар крупнее на четверть линейно и в полтора раза
/// по площади при той же нише. Ровно этим чинился отчёт «ужасно товары мелкие».
/// ⚠️ ПОРЯДОК НАЛОЖЕНИЯ ОБЯЗАТЕЛЕН: передний рисуется ПОВЕРХ заднего, иначе полка
/// растёт «из экрана к зрителю» и читается как сбой отрисовки. Выбранный поднят
/// над всеми: его рамку нельзя прятать под соседом ровно тогда, когда она нужна.
class _Stack extends StatelessWidget {
  const _Stack({
    required this.niche,
    required this.cell,
    required this.box,
    required this.covered,
    required this.hiddenLevel,
    required this.selection,
    required this.enabled,
    required this.onPick,
  });

  final int niche;
  final List<int> cell;
  final GsItemBox box;
  final Set<String> covered;
  final bool hiddenLevel;
  final GoodsPick? selection;
  final bool enabled;
  final void Function(GoodsPick pick) onPick;

  @override
  Widget build(BuildContext context) {
    if (cell.isEmpty) return const SizedBox.shrink();
    final step = (box.w - (box.w * GsLayout.overlap).round() + GsLayout.cellGap).toDouble();
    final rowW = box.w + (cell.length - 1) * step;
    final items = <Widget>[];
    for (var k = 0; k < cell.length; k += 1) {
      final selected = selection?.cell == niche && selection?.index == k;
      items.add(Positioned(
        left: k * step,
        bottom: selected ? 4 : 0,   // выбранный приподнят — как в вебе
        child: _Item(
          pick: GoodsPick(niche, k, cell[k]),
          box: box,
          covered: covered.contains('$niche:$k'),
          hiddenLevel: hiddenLevel,
          selected: selected,
          enabled: enabled,
          onPick: onPick,
        ),
      ));
    }
    // Первый товар рисуется последним, то есть поверх; выбранный — над всеми.
    final ordered = items.reversed.toList();
    final selIdx = selection?.cell == niche ? (selection?.index ?? -1) : -1;
    if (selIdx >= 0 && selIdx < cell.length) {
      final top = ordered.removeAt(cell.length - 1 - selIdx);
      ordered.add(top);
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: SizedBox(
        width: rowW,
        height: box.h.toDouble() + 4,
        child: Stack(clipBehavior: Clip.none, children: ordered),
      ),
    );
  }
}

/// Товар на полке: его берут пальцем (перетаскивание) или тапом.
class _Item extends StatelessWidget {
  const _Item({
    required this.pick,
    required this.box,
    required this.covered,
    required this.hiddenLevel,
    required this.selected,
    required this.enabled,
    required this.onPick,
  });

  final GoodsPick pick;
  final GsItemBox box;
  final bool covered;
  final bool hiddenLevel;
  final bool selected;
  final bool enabled;
  final void Function(GoodsPick pick) onPick;

  @override
  Widget build(BuildContext context) {
    final picture = Image.asset(
      'assets/goods/good${pick.type}.webp',
      width: box.w.toDouble(),
      height: box.h.toDouble() - 2,
      fit: BoxFit.contain,
    );
    final Widget face;
    if (!covered) {
      face = picture;
    } else if (hiddenLevel) {
      /*
       * «?» РЕЖИМА СКРЫТОЙ ИНФОРМАЦИИ — НЕ СИЛУЭТ. Силуэт оставляет форму, то
       * есть половину ответа (бутылку от мишки отличит и тень). Нарисуй его тут —
       * и режим тихо ослабнет до «накрытого товара» с восьмого уровня.
       */
      face = Container(
        width: box.w.toDouble(),
        height: box.h.toDouble() - 2,
        decoration: BoxDecoration(
          color: const Color(0x33231408),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: const Color(0x66E8CDA8)),
        ),
        alignment: Alignment.center,
        child: Text('?',
            style: TextStyle(
                fontSize: box.w * 0.55, fontWeight: FontWeight.w800, color: const Color(0xCCE8CDA8))),
      );
    } else {
      // НАКРЫТЫЙ ТОВАР: силуэт есть, что именно — не видно. Та же картинка с
      // нулевой яркостью: форма сохраняется, вид товара — нет.
      face = ColorFiltered(
        colorFilter: const ColorFilter.mode(Color(0xD1231408), BlendMode.srcATop),
        child: picture,
      );
    }

    final body = Container(
      key: ValueKey('item-${pick.cell}-${pick.index}'),
      width: box.w.toDouble(),
      height: box.h.toDouble(),
      alignment: Alignment.bottomCenter,
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFFFF2C2) : null,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: selected ? const Color(0xFFF7971E) : Colors.transparent,
          width: 2,
        ),
      ),
      child: face,
    );

    if (!enabled) return body;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => onPick(pick),
      child: Draggable<GoodsPick>(
        data: pick,
        dragAnchorStrategy: pointerDragAnchorStrategy,
        feedback: Transform.translate(
          offset: Offset(-box.w / 2, -box.h / 2),
          child: Opacity(opacity: 0.9, child: body),
        ),
        // Товар в руке на полке гаснет: две копии одного товара читаются как сбой.
        childWhenDragging: Opacity(opacity: 0.2, child: body),
        child: body,
      ),
    );
  }
}
