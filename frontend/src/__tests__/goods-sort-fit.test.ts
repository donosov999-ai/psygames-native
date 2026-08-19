/**
 * ТОВАРЫ НЕ ВЫЛЕЗАЮТ ИЗ ЯЧЕЙКИ НИ НА ОДНОМ ЭКРАНЕ.
 *
 * ЗАЧЕМ. Репорт тестировщицы 18.08.2026 со скриншотом: «Половина банок обрезана».
 * Причина считалась ровно: уровень 8 → сетка 4×3, экран 386px → полка 362px →
 * ячейка 79px. В ячейку честно влезал товар 23px, но стоял пол `Math.max(40, …)`,
 * и бралось 40px. Три товара = 3×40 + два зазора = 128px в ячейке 79px, ряд
 * центрирован → по 24px под обрез с каждой стороны.
 *
 * ⚠️ ПОЛ РАЗМЕРА СТАВИЛСЯ РАДИ ПОПАДАНИЯ ПАЛЬЦЕМ — намерение верное, но он не
 * спрашивал, влезут ли три. По обрезанному товару попасть всё равно нельзя,
 * так что такой минимум не помогал, а мешал.
 *
 * Здесь повторяется ТА ЖЕ арифметика, что в экране, на сетке реальных ширин.
 * Если формула в игре разойдётся с этой — тест покраснеет.
 */
declare const __dirname: string;
declare function require(m: string): any;

const CAP = 3;
const CELL_GAP = 2;

/** Ширины: iPhone SE, типовой Android, её экран, iPhone Pro Max, планшет. */
const WIDTHS = [320, 360, 386, 414, 430, 768, 1024];
/** Сетки из gridFor: до L7 3×3, до L11 4×3, дальше 4×4. */
const GRIDS = [{ cols: 3, rows: 3 }, { cols: 3, rows: 4 }, { cols: 3, rows: 5 },
               { cols: 4, rows: 3 }, { cols: 4, rows: 4 }];

function layout(width: number, cols: number, rows: number, height = 800) {
  const boardW = Math.min(width - 24, 900);
  const cellW = Math.floor((boardW - 7 * 2 - 6 * (cols - 1)) / cols);
  const availH = Math.max(180, height - 360);
  const fitsInCell = Math.floor((cellW - CELL_GAP * (CAP - 1)) / CAP);
  const fitsInRow = Math.floor(availH / rows) - 26;
  const itemSize = Math.max(18, Math.min(112, fitsInCell, fitsInRow));
  return { cellW, itemSize, rowWidth: itemSize * CAP + CELL_GAP * (CAP - 1) };
}

describe('сортировка товаров: раскладка', () => {
  it('три товара помещаются в ячейку на любой ширине и любой сетке', () => {
    const bad: string[] = [];
    for (const w of WIDTHS) {
      for (const g of GRIDS) {
        const l = layout(w, g.cols, g.rows);
        if (l.rowWidth > l.cellW) {
          bad.push(`${w}px, ${g.cols}×${g.rows}: ряд ${l.rowWidth} > ячейки ${l.cellW}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /** Её случай, поимённо — чтобы регрессия была узнаваемой. */
  /**
   * Её случай, поимённо. После разрежения сетки (19.08) на телефоне колонок
   * три, а не четыре: товар вырос с 23px до 36px. 23px — это размер, при
   * котором нарисованная в 384px жестянка видна цветным пятном, и никакая
   * перерисовка этого не лечит.
   */
  it('экран 386px: товар крупнее 30px и ряд влезает', () => {
    const l = layout(386, 3, 4);
    expect(l.itemSize).toBeGreaterThanOrEqual(30);
    expect(l.rowWidth).toBeLessThanOrEqual(l.cellW);
  });

  it('на телефоне колонок не больше трёх', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
    expect(src).toMatch(/function gridFor\(L: number, narrow = false\)/);
    expect(src).toMatch(/narrowRef\.current = width < 560/);
  });

  /** Формула в экране должна совпадать с той, что проверяем здесь. */
  it('экран считает размер от ячейки, а не от пола в 40px', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
    expect(src).toMatch(/const fitsInCell = Math\.floor\(\(cellW - CELL_GAP \* \(CAP - 1\)\) \/ CAP\)/);
    expect(src).not.toMatch(/Math\.max\(40, Math\.min\(112/);
  });
});
