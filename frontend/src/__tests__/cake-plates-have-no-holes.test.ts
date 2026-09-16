/**
 * @jest-environment node
 */
/* psygames-gate-cake-plates-have-no-holes · VER 1 · 16.09.2026 */
/**
 * 🔴 У ТАРЕЛКИ НЕТ ДЫР — ЗАМЕР ПРОЗРАЧНОСТИ, А НЕ ВЗГЛЯД НА ЛИСТ.
 *
 * ПОВОД. Кадр приёмки 16.09.2026 (собранный веб 390×844, торты, тема `bio`): у пятой
 * тарелки чёрные выкусы по нижнему краю, у второй — вырез справа. Тарелки вырезаны
 * из листа на пурпурном фоне; сиреневую `bio/p4` цветовой ключ выел как фон (8,6 %
 * прозрачного внутри круга тарелки), бирюзовую `bio/p1` выела модель (1,8 %).
 * На листе 72 тарелок размером 120 точек это не видно — видно на телефоне.
 *
 * КАК МЕРИТСЯ. Круг — САМОЙ тарелки, а не кадра: он вписан в рамку непрозрачных
 * пикселей, радиус 0,94 от половины рамки. Первая редакция замера брала круг от
 * кадра и на вырезке с полями насчитала «26 % дыр» у целой тарелки — поля кадра
 * попали в круг. Дыра — пиксель с альфой < 128.
 *
 * ПОРОГ. 0,5 % — по замеру этой же функцией 16.09.2026: у всех 72 тарелок после
 * починки 0,00…0,38 % (sweet/p3 0,38 — впадины волнистого края, bio/p0 0,13, у
 * остальных 70 — ноль), у двух испорченных было 1,83 % (bio/p1) и 8,61 % (bio/p4).
 * Порог лежит между худшей целой и лучшей испорченной.
 *
 * ЧЕМ ПОЧИНЕНО. bio/p4 — перерезка из cut3 (модель birefnet); bio/p1 — альфа модели,
 * а внутри круга тарелки дыру закрывает цветовой ключ (сам ключ оставлял пурпурную тень
 * за ободом, модель — выкус), плюс деспилл пурпура на краевых пикселях.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs: { readdirSync(p: string): string[] } = require('fs');
const path: { join(...p: string[]): string } = require('path');
const sharp = require('sharp');

const КОРЕНЬ = path.join(__dirname, '..', '..', 'assets', 'images', 'cake_plates');
const ПОРОГ = 0.5;

async function дыр(файл: string): Promise<number> {
  const { data, info } = await sharp(файл).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const альфа = (x: number, y: number) => data[(y * w + x) * ch + (ch - 1)];
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (альфа(x, y) >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return 100;
  const cx = (x0 + x1 + 1) / 2; const cy = (y0 + y1 + 1) / 2;
  const r = (Math.min(x1 - x0 + 1, y1 - y0 + 1) / 2) * 0.94;
  let всего = 0; let пусто = 0;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      всего += 1;
      if (альфа(x, y) < 128) пусто += 1;
    }
  }
  return (100 * пусто) / всего;
}

const тарелки = fs.readdirSync(КОРЕНЬ)
  .flatMap((тема: string) => fs.readdirSync(path.join(КОРЕНЬ, тема)).filter((f: string) => f.endsWith('.webp')).map((f: string) => path.join(тема, f)));

describe('у тарелок тортов нет дыр', () => {
  it('премиса: тарелок 72 — девять тем по восемь', () => {
    expect(тарелки.length).toBe(72);
  });

  it(`🔴 внутри круга тарелки прозрачного не больше ${ПОРОГ} %`, async () => {
    const дырявые: string[] = [];
    for (const т of тарелки) {
      const д = await дыр(path.join(КОРЕНЬ, т));
      if (д > ПОРОГ) дырявые.push(`${т}: ${д.toFixed(2)} %`);
    }
    expect(дырявые).toEqual([]);
  }, 120_000);
});
