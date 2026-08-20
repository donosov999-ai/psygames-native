/* psygames-fab-position · VER 1 · 21.08.2026 */
/**
 * ГДЕ ВИСИТ КНОПКА ОТЗЫВА, ЕСЛИ ЧЕЛОВЕК ЕЁ ПЕРЕТАЩИЛ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ, А НЕ ПАРОЙ СТРОК В ЭКРАНЕ. Кнопка отзыва — канал,
 * по которому мы вообще узнаём о проблемах. Запомненная позиция, уехавшая за
 * край экрана, означает не «неудобно», а «пожаловаться больше нельзя»: достать
 * кнопку будет нечем, и человек молча уйдёт. Поэтому пересчёт и подрезка живут
 * здесь и проверяются, а не пишутся внутри JSX на глаз.
 *
 * ⚠️ ХРАНИМ ДОЛЮ ЭКРАНА, А НЕ ПИКСЕЛИ. Пиксели переживают ровно до поворота
 * телефона: позиция «x = 700» на альбомной ширине 800 после поворота на
 * портретную 400 уводит кнопку за край целиком. Доля переживает и поворот, и
 * планшет, и смену масштаба шрифта.
 *
 * ⚠️ ПОДРЕЗКА ВСЁ РАВНО ОБЯЗАТЕЛЬНА. Доля защищает от поворота, но не от
 * системных панелей: под шторкой и полосой навигации кнопка видна, а нажатие
 * забирает система. Поэтому итог всегда загоняется внутрь безопасной зоны.
 */

/** Сторона кнопки. Совпадает со `styles.fab` — минимум попадания пальцем. */
export const FAB_SIZE = 48;

/** Отступ от края безопасной зоны, чтобы кнопка не липла к границе. */
const EDGE = 6;

export interface FabSpot {
  /** Доля свободной ширины, 0..1. */
  fx: number;
  /** Доля свободной высоты, 0..1. */
  fy: number;
}

export interface WinSize { w: number; h: number }
export interface Insets { top: number; bottom: number; left: number; right: number }

const clamp = (v: number, lo: number, hi: number): number =>
  (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/**
 * Прочитать сохранённое. Мусор в хранилище (старый формат, обрезанная запись,
 * NaN) обязан читаться как «ничего не сохранено», а не как позиция 0×0 в углу
 * под шторкой.
 */
export function readSpot(raw: string | null | undefined): FabSpot | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    /**
     * ⚠️ ОДНА ПРОВЕРКА, А НЕ ДВЕ. Здесь стояла ещё и `typeof === 'number'`, но
     * поломкой выяснилось, что она не несёт ничего: `Number.isFinite` — строгая,
     * она отвергает и строку '5', и undefined, и NaN. Второй страж выглядел
     * заботой, а на деле только создавал впечатление проверенности.
     */
    if (!p || !Number.isFinite(p.fx) || !Number.isFinite(p.fy)) return null;
    return { fx: clamp(p.fx, 0, 1), fy: clamp(p.fy, 0, 1) };
  } catch {
    return null;
  }
}

/** Пиксели, куда человек отпустил палец → доля экрана. */
export function toSpot(left: number, top: number, win: WinSize): FabSpot {
  const maxX = Math.max(1, win.w - FAB_SIZE);
  const maxY = Math.max(1, win.h - FAB_SIZE);
  return { fx: clamp(left / maxX, 0, 1), fy: clamp(top / maxY, 0, 1) };
}

/**
 * Доля экрана → пиксели, уже подрезанные под безопасную зону.
 *
 * ⚠️ Подрезка идёт ПОСЛЕ пересчёта, а не вместо него: сохранённая доля может
 * быть честной (человек и правда отпустил кнопку у нижнего края), а панель
 * появиться позже — например, когда система показала полосу навигации.
 */
export function spotToPixels(spot: FabSpot, win: WinSize, insets: Insets): { left: number; top: number } {
  const maxX = Math.max(0, win.w - FAB_SIZE);
  const maxY = Math.max(0, win.h - FAB_SIZE);
  const minLeft = insets.left + EDGE;
  const maxLeft = win.w - insets.right - EDGE - FAB_SIZE;
  const minTop = insets.top + EDGE;
  const maxTop = win.h - insets.bottom - EDGE - FAB_SIZE;
  return {
    left: clamp(spot.fx * maxX, minLeft, maxLeft),
    top: clamp(spot.fy * maxY, minTop, maxTop),
  };
}

/**
 * Считать ли жест перетаскиванием.
 *
 * 🔴 ПОРОГ ЕСТЬ И ОН НУЖЕН. Без него любое дрожание пальца на кнопке уводило бы
 * её с места вместо того, чтобы открыть окно отзыва, — то есть обычный тап стал
 * бы лотереей. Восемь точек — заметно больше дрожания и заметно меньше
 * осознанного движения.
 */
export const DRAG_THRESHOLD = 8;

export function isDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
}
