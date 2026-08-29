/* psygames-sudoku-overlay · VER 1 · 29.08.2026 */
/**
 * ОБЩИЙ РИСУНОК ВАРИАНТОВ — термометры и клетки-суммы одинаковы на всех досках.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Правило проекта, записанное кровью в PROJECT_REF §7е
 * п.71: «во фрактале светлая лаванда с белой цифрой, контраст 2.9:1 — дефект,
 * который в обычном судоку чинили в v1.152 по репорту Вали. Мы наступили на него
 * второй раз ровно потому, что код не общий». Термометр — та же история: как только
 * его рисуют в двух экранах двумя кусками кода, они расходятся молча, и правится
 * каждый по отдельному репорту.
 *
 * Здесь живёт ГЕОМЕТРИЯ И КРАСКА, а не разметка: экраны рисуют своими View, но
 * длины, толщины и оттенки берут отсюда. Разметку объединит задача о единой клетке
 * (§7е пп.70–73), она крупнее и трогает раскладку обоих экранов.
 */

/** Оттенки групп-сумм. Шесть — чтобы соседние (несоприкасающиеся) группы не сливались. */
export const CAGE_ACCENTS = ['#7f7fd5', '#86a8e7', '#d58a7f', '#7fd5a8', '#d5c97f', '#b07fd5'] as const;

/**
 * Непрозрачная подсветка: смешать base (фон темы) с over (акцент).
 * Полупрозрачный цвет поверх тёмной сетки давал «чёрные» клетки — старый баг судоку.
 */
export function blendHex(base: string, over: string, t: number): string {
  const b = base.replace('#', ''), o = over.replace('#', '');
  if (b.length !== 6 || o.length !== 6) return over;
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round(ch(b, i) * (1 - t) + ch(o, i) * t).toString(16).padStart(2, '0');
  return '#' + mix(0) + mix(2) + mix(4);
}

/** Заливка клетки группы-суммы поверх фона темы. −1 = клетка вне групп, фон не трогаем. */
export function cageTint(surface: string, cageId: number): string | null {
  if (cageId < 0) return null;
  return blendHex(surface, CAGE_ACCENTS[cageId % CAGE_ACCENTS.length]!, 0.16);
}

/** Толщина трубки термометра — доля клетки, но не тоньше 3 точек на мелких досках. */
export function thermoThick(cellSize: number): number {
  return Math.max(3, Math.round(cellSize * 0.16));
}

/** Краска трубки: акцент, смешанный с поверхностью, — читается в обеих темах. */
export function thermoColor(surface: string, accent: string): string {
  return blendHex(surface, accent, 0.5);
}

export interface OverlayRect { left?: number; top?: number; width: number; height: number }

/**
 * Отрезок трубки от центра клетки (r,c) к соседу. Половина клетки — чтобы два
 * соседних отрезка встык давали непрерывную трубку без шва.
 */
export function thermoSegment(
  r: number, c: number, neighbour: readonly [number, number], cellSize: number, thick: number,
): OverlayRect {
  const dr = neighbour[0] - r, dc = neighbour[1] - c;
  if (dc === 1) return { left: cellSize / 2, top: cellSize / 2 - thick / 2, width: cellSize / 2, height: thick };
  if (dc === -1) return { left: 0, top: cellSize / 2 - thick / 2, width: cellSize / 2, height: thick };
  if (dr === 1) return { top: cellSize / 2, left: cellSize / 2 - thick / 2, width: thick, height: cellSize / 2 };
  return { top: 0, left: cellSize / 2 - thick / 2, width: thick, height: cellSize / 2 };
}

/** Колба — начало термометра: круг в центре клетки, у которой нет предыдущей. */
export function thermoBulb(cellSize: number): OverlayRect & { borderRadius: number } {
  const d = cellSize * 0.42;
  return { width: d, height: d, borderRadius: d / 2, left: cellSize / 2 - d / 2, top: cellSize / 2 - d / 2 };
}

/** Размер цифры суммы в углу якорной клетки. */
export function cageSumFontSize(cellSize: number): number {
  return Math.max(8, Math.round(cellSize * 0.27));
}
