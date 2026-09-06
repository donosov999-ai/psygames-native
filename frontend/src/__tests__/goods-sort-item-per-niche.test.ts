// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { gsLayout } from '@/src/games/goods-sort/core/level';

/**
 * 🔴 ТОВАР МЕРЯЕТСЯ СВОЕЙ НИШЕЙ, А НЕ САМОЙ ЖАДНОЙ НА ДОСКЕ.
 *
 * Жалоба Вали 02.09 и 03.09: «ужасно товары мелкие». Первую половину закрыл
 * нахлёст (было «три встык» — арифметика, а не картинка). Вторая жила дальше:
 * с 18-го уровня появляется одна ниша на ЧЕТЫРЕ товара, а размер считался по
 * самой вместительной нише доски — и все семнадцать остальных платили за неё.
 *
 * Замер (телефон 390, сетка 3×6): 44 → 33 по стороне, то есть почти вдвое по
 * площади. Ровно то, что видно на её скриншоте.
 */
describe('размер товара по вместимости ниши', () => {
  const L = () => gsLayout(390, 620, 3, 6, 4);

  it('🔴 ниша на три держит крупный товар, даже если на доске есть ниша на четыре', () => {
    const lay = L();
    expect(lay.itemBox(3).w).toBeGreaterThan(lay.itemBox(4).w);
    // и это не косметика: разница заметная, а не пара точек
    expect(lay.itemBox(3).w / lay.itemBox(4).w).toBeGreaterThan(1.2);
  });

  it('🔴 прежнее поведение было бы регрессом: одна ниша ужимала весь шкаф', () => {
    const lay = L();
    // Раньше весь шкаф получал размер по capWide = 4 (`lay.itemSize`).
    expect(lay.itemSize).toBe(lay.itemBox(4).w);
    expect(lay.itemBox(3).w).toBeGreaterThan(lay.itemSize);
  });

  it('чем вместительнее ниша, тем мельче в ней товар — и никогда наоборот', () => {
    const lay = L();
    const ряд = [2, 3, 4].map((c) => lay.itemBox(c).w);
    expect(ряд[0]).toBeGreaterThanOrEqual(ряд[1]);
    expect(ряд[1]).toBeGreaterThan(ряд[2]);
  });

  it('товар не выше ниши: иначе он вылезет за полку', () => {
    for (const [w, h, cols, rows] of [[360, 560, 3, 6], [390, 620, 3, 6], [430, 700, 3, 6], [768, 900, 4, 4]] as [number, number, number, number][]) {
      const lay = gsLayout(w, h, cols, rows, 4);
      for (const cap of [2, 3, 4]) {
        expect(lay.itemBox(cap).h).toBeLessThanOrEqual(lay.nicheH);
      }
    }
  });

  it('🔴 ряд товаров не шире своей ниши ни при какой вместимости', () => {
    for (const [w, h, cols, rows] of [[360, 560, 3, 6], [390, 620, 3, 6], [430, 700, 3, 6]] as [number, number, number, number][]) {
      const lay = gsLayout(w, h, cols, rows, 4);
      for (const cap of [2, 3, 4]) {
        const { w: iw } = lay.itemBox(cap);
        const шаг = iw * (1 - lay.overlap) + 2;
        const ширинаРяда = iw + (cap - 1) * шаг;
        expect(ширинаРяда).toBeLessThanOrEqual(lay.cellW + 1);
      }
    }
  });

  it('мусор на входе не роняет расчёт', () => {
    const lay = L();
    expect(lay.itemBox(0).w).toBeGreaterThan(0);
    expect(lay.itemBox(-3).w).toBeGreaterThan(0);
    expect(Number.isFinite(lay.itemBox(1).w)).toBe(true);
  });
});
