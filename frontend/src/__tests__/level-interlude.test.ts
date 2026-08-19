/**
 * ЗАСТАВКА МЕЖДУ УРОВНЯМИ НЕ ПОВТОРЯЕТСЯ ПОДРЯД И НЕ ВЕСИТ ЛИШНЕГО.
 *
 * 🔴 ЗАЧЕМ. Заставка — это пауза, которую человек видит после КАЖДОГО уровня.
 * Всё, что здесь надоест, надоест быстрее всего остального в приложении:
 * шестьдесят уровней — это шестьдесят просмотров. Поэтому проверяется ровно
 * две вещи, и обе про то, чтобы она не стала раздражителем.
 *
 * Отдельно про вес: панели вертикальные и полноэкранные, то есть тяжёлые по
 * природе. Если их не держать в узде, четыре картинки съедят больше, чем весь
 * набор спрайтов игры.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const SRC = readFileSync(join(__dirname, '../components/LevelInterlude.tsx'), 'utf8') as string;
const DIR = join(__dirname, '../../assets/images/interlude');

/** Список панелей читаем ИЗ ЭКРАНА, а не из своей копии. */
const PANELS: string[] = [...SRC.matchAll(/interlude\/([\w-]+\.webp)/g)].map((m) => m[1]);


/**
 * Стороны WebP из заголовка файла. Библиотеку ради двух чисел не тянем: у
 * простого (lossy) WebP ширина и высота лежат в кадре VP8 на фиксированных
 * смещениях, у расширенного (VP8X) — в его же заголовке.
 */
function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(file) as any;
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8X') {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { w, h };
  }
  if (tag === 'VP8 ') {
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (tag === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`не понял формат ${file}: ${tag}`);
}

describe('заставка между уровнями', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(PANELS.length).toBeGreaterThanOrEqual(4);
  });

  it('каждая объявленная панель лежит на диске', () => {
    const files: string[] = readdirSync(DIR);
    const missing = PANELS.filter((p) => !files.includes(p));
    expect(missing).toEqual([]);
  });

  /** Лишний файл — это либо забытая уборка, либо панель, которую забыли подключить. */
  it('на диске нет панелей мимо списка', () => {
    const extra = (readdirSync(DIR) as string[]).filter((f: string) => f.endsWith('.webp') && !PANELS.includes(f));
    expect(extra).toEqual([]);
  });

  /**
   * Круг из четырёх замыкался каждые четыре уровня: к десятому каждая панель
   * показывалась уже трижды. Восемь дают восемь уровней без повтора.
   */
  it('панелей хватает, чтобы не повторяться первые восемь уровней', () => {
    expect(PANELS.length).toBeGreaterThanOrEqual(8);
    const seen = new Set<string>();
    for (let level = 1; level <= 8; level++) seen.add(PANELS[Math.max(0, level) % PANELS.length]);
    expect(seen.size).toBe(8);
  });

  /** 512 КБ на восемь панелей — уже граница; вдвое больше делает установку заметно тяжелее. */
  it('панели не раздуваются: каждая до 150 КБ, все вместе до 1 МБ', () => {
    let total = 0;
    const heavy: string[] = [];
    for (const p of PANELS) {
      const size = statSync(join(DIR, p)).size;
      total += size;
      if (size > 150 * 1024) heavy.push(`${p}: ${Math.round(size / 1024)} КБ`);
    }
    expect(heavy).toEqual([]);
    expect(total).toBeLessThan(1024 * 1024);
  });

  /**
   * 🔴 ВЕРТИКАЛЬНОСТЬ ПРОВЕРЯЕМ У ФАЙЛА, А НЕ У КОММЕНТАРИЯ.
   *
   * Первая редакция этой проверки искала слово «ВЕРТИКАЛЬНАЯ» в исходнике — то
   * есть сторожила букву, а не дело: горизонтальную панель с правильным
   * комментарием она бы пропустила. В этом же проекте на такой проверке уже
   * обжигались (гейт требовал дословный вызов функции и покраснел на верной
   * правке). Читаем настоящие стороны картинки.
   *
   * Требование не про вкус: горизонтальный кадр на телефоне занимает узкую
   * полосу посередине, а сверху и снизу остаются два пустых поля.
   */
  it('каждая панель действительно вертикальная', () => {
    const notTall: string[] = [];
    for (const p of PANELS) {
      const { w, h } = webpSize(join(DIR, p));
      if (!(h > w * 1.3)) notTall.push(`${p}: ${w}×${h} — не вертикальная`);
    }
    expect(notTall).toEqual([]);
  });
});
