/// РАСКЛАДКА ШКАФА «СОРТИРОВКИ ТОВАРОВ» — перенос `gsLayout` из живого TS
/// (`src/games/goods-sort/core/level.ts`), формула в формулу.
///
/// 🔴 ПОЧЕМУ ПЕРЕНОС, А НЕ СВОЯ АРИФМЕТИКА. Первая редакция этого экрана считала
/// размер ниши и товара «на глаз»: товар квадратный, без нахлёста, ниша во всю
/// ячейку. Снимок 390×844 показал результат — товар 33 px в нише 200 px. А в
/// `gsLayout` лежат ТРИ починки по отчётам со скриншотами, и все три вернулись бы
/// молча:
///   · 18.08.2026 «половина банок обрезана» — размер товара подчиняется ячейке;
///   · 02.09.2026 «ужасно товары мелкие» — нахлёст 0,3 даёт товар крупнее на
///     четверть линейно, и размер считается по СВОЕЙ нише, а не по самой жадной;
///   · 05.09.2026 «кошмар просто кошмар» — высота ниши выводится из поля, поэтому
///     шкаф не может перерасти поле по построению.
///
/// ⚠️ ПРОВЕРЯЕТСЯ СВЕРКОЙ С ЖИВЫМ TS, а не пересказом. В
/// `test/fixtures/goods-sort-reference.json` лежат 1851 эталон раскладки: экраны
/// 320…1280, поля 280…800, сетки 3×3…4×6, обе ёмкости, оба пола читаемости.
/// Dart обязан совпасть до пикселя (`goods_sort_layout_test.dart`).
library;

import 'dart:math' as math;

/// Размер товара: ширина и высота. Спрайты узкие и высокие (пропорция 0,6 снята
/// с самих картинок), поэтому квадратная ячейка теряла половину размера.
class GsItemBox {
  const GsItemBox(this.w, this.h);
  final int w;
  final int h;
}

class GsLayout {
  GsLayout({
    required double width,
    required double availH,
    required this.cols,
    required this.rows,
    this.capWide = 3,
    double? hintH,
    this.floorItem = 0,
  })  : _hintH = math.max(0, (hintH ?? 44).round()),
        boardW = math.min<num>(width - 20, 1200).floor() {
    _cellW = ((boardW - shelfPad * 2 - shelfGap * (cols - 1)) / cols).floor();
    // Свободная высота: поле минус строка цели, зазоры рядов, рама и торец шкафа.
    final free = availH - _hintH - shelfGap * (rows - 1) - shelfPad * 2 - 9;
    _perRow = (free / rows).floor();
    final rowDivider = 1 + (capWide - 1) * (1 - overlap);
    _fitsInCell = ((_cellW - cellGap * (capWide - 1)) / rowDivider).floor();
    _fitsInRow = ((_perRow - 8) * itemAspect).floor();
    itemSize = math.max(18, math.min(148, math.min(_fitsInCell, math.max(floorItem, _fitsInRow))));
    itemH = (itemSize / itemAspect).round();
    // Избыток высоты уходит ВНУТРЬ ниши, но не выше `perRow`: иначе короб снова
    // перерастёт поле. Снизу ниша не ниже своего содержимого — тогда шкаф честно
    // объявляет себя едущим, а не поджимает товар.
    nicheH = math.max(itemH + 8, math.min((itemH * 2.2).round(), _perRow));
    shelfH = nicheH * rows + shelfGap * (rows - 1) + shelfPad * 2 + 9;
    final step = itemSize * (1 - overlap) + cellGap;
    rowW = (itemSize + (capWide - 1) * step).round();
    // Потолок товара — размер в КАНОНИЧЕСКОЙ нише на три (cap = 3), а не «сколько
    // влезет»: иначе полка на один товар раздувала бы его вчетверо по площади
    // (замер 09.09.2026, планшет 750: 115–148 против 69).
    _ceiling = math.max(
      18,
      math.min(
        148,
        math.min(
          ((_cellW - cellGap * (cap - 1)) / (1 + (cap - 1) * (1 - overlap))).floor(),
          math.max(floorItem, _fitsInRow),
        ),
      ),
    );
    scrolls = shelfH > availH - _hintH;
  }

  /// Вместимость канонической ниши: три товара ВИДИМЫ — суть оригинала.
  static const int cap = 3;
  static const int cellGap = 2;      // зазор между товарами внутри ниши
  static const double itemAspect = 0.6;  // ширина/высота, снято со спрайтов
  static const int shelfGap = 9;
  static const int shelfPad = 9;
  /// Доля перекрытия соседних товаров: 0 — встык, 0,3 — как на настоящей полке.
  /// Треть скрывает бок и оставляет верх с этикеткой: накрыв больше, мы вернули бы
  /// дефект «шесть одинаковых силуэтов».
  static const double overlap = 0.3;

  final int cols;
  final int rows;
  final int capWide;
  final int floorItem;
  final int _hintH;

  final int boardW;
  late final int _cellW;
  late final int _perRow;
  late final int _fitsInCell;
  late final int _fitsInRow;
  late final int _ceiling;

  late final int itemSize;
  late final int itemH;
  late final int nicheH;
  late final int shelfH;
  late final int rowW;
  late final bool scrolls;

  int get cellW => _cellW;
  int get boardH => shelfH;

  /// Размер товара для ниши такой вместимости: одна ниша на четыре не имеет права
  /// ужимать товар во ВСЁМ шкафу (замер 03.09.2026: 44 → 33 по стороне).
  GsItemBox itemBox(int capOf) {
    final c = math.max(1, capOf.round());
    final divider = 1 + (c - 1) * (1 - overlap);
    final byWidth = ((_cellW - cellGap * (c - 1)) / divider).floor();
    final w = math.max(
      18,
      math.min(148, math.min(byWidth, math.min(math.max(floorItem, _fitsInRow), _ceiling))),
    );
    return GsItemBox(w, (w / itemAspect).round());
  }

  /// Ширина САМОЙ НИШИ такой вместимости. Полка на один товар обязана быть узкой
  /// (Денис 09.09.2026: «полка узкая должна быть под один товар, а не широкая»),
  /// иначе вместимость узнаётся единственным способом — не сумев положить.
  /// ⚠️ Ячейка остаётся шириной `cellW`, узкой становится только ниша: сожми
  /// ячейку — и колонки перестанут совпадать между рядами, а палец начнёт брать
  /// соседний товар.
  int nicheW(int capOf) {
    final c = math.max(1, capOf.round());
    if (c >= capWide) return _cellW;
    final b = itemBox(c);
    final rowC = b.w + (c - 1) * (b.w * (1 - overlap) + cellGap);
    return math.max(b.w + 6, math.min(_cellW, (rowC + (_cellW - rowW)).round()));
  }

}
