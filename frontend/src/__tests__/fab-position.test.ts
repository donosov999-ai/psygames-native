/* psygames-fab-position · VER 1 · 21.08.2026 */
/**
 * ПЕРЕТАЩЕННАЯ КНОПКА ОТЗЫВА ОБЯЗАНА ОСТАВАТЬСЯ ДОСТУПНОЙ.
 *
 * 🔴 ЦЕНА ОШИБКИ ЗДЕСЬ ВЫШЕ, ЧЕМ КАЖЕТСЯ. Это единственный канал, по которому мы
 * узнаём о проблемах. Позиция, уехавшая за край или под системную панель, значит
 * не «неудобно», а «пожаловаться больше нельзя»: человек молча уйдёт, и мы даже
 * не узнаем, что он уходил.
 *
 * Просьба тестировщика 17.07.2026 (сборка 1.121.0), дословно: «Кнопку чата для
 * отправки репорта можно сделать перемещаемой: нажимаем держим таким. Позиция
 * запомнилась».
 */
import {
  FAB_SIZE, DRAG_THRESHOLD, readSpot, toSpot, spotToPixels, isDrag,
} from '@/src/services/fabPosition';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

/** ⚠️ Со срезанными комментариями: в шапке виджета обе ловушки описаны словами. */
const widget = (): string => (readFileSync(join(__dirname, '../components/FeedbackWidget.tsx'), 'utf8') as string)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const phone = { w: 390, h: 844 };
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const none = { top: 0, bottom: 0, left: 0, right: 0 };

describe('чтение сохранённого', () => {
  it('пусто — значит позиция по умолчанию, а не угол 0×0', () => {
    expect(readSpot(null)).toBeNull();
    expect(readSpot('')).toBeNull();
  });

  it('🔴 мусор в хранилище читается как «ничего», а не как левый верхний угол', () => {
    for (const raw of ['не json', '{}', '{"fx":"a","fy":0}', '{"fx":null}', '[1,2]',
                       '{"fx":null,"fy":null}', '{"x":10,"y":20}']) {
      expect(`${raw} → ${JSON.stringify(readSpot(raw))}`).toBe(`${raw} → null`);
    }
  });

  it('🔴 NaN и бесконечность не проходят — иначе кнопка исчезнет насовсем', () => {
    expect(readSpot('{"fx":null,"fy":1}')).toBeNull();
    // JSON не знает NaN, но знает огромные числа — они превращаются в Infinity
    expect(readSpot('{"fx":1e400,"fy":0.5}')).toBeNull();
  });

  it('доля за пределами 0..1 подрезается, а не отбрасывается', () => {
    expect(readSpot('{"fx":1.7,"fy":-3}')).toEqual({ fx: 1, fy: 0 });
  });

  it('нормальная запись читается как есть', () => {
    expect(readSpot('{"fx":0.25,"fy":0.75}')).toEqual({ fx: 0.25, fy: 0.75 });
  });
});

describe('пиксели ↔ доля', () => {
  it('куда отпустили — туда и вернётся на том же экране', () => {
    const spot = toSpot(100, 400, phone);
    const px = spotToPixels(spot, phone, none);
    expect(Math.round(px.left)).toBe(100);
    expect(Math.round(px.top)).toBe(400);
  });

  /**
   * 🔴 РАДИ ЭТОГО ХРАНИТСЯ ДОЛЯ, А НЕ ПИКСЕЛИ. Кнопка у правого края альбомной
   * ориентации в пикселях после поворота оказалась бы далеко за краем портретной.
   */
  it('🔴 поворот экрана не выбрасывает кнопку за край', () => {
    const land = { w: 844, h: 390 };
    const spot = toSpot(land.w - FAB_SIZE, 10, land);   // прижата к правому краю
    const px = spotToPixels(spot, phone, none);
    expect(px.left).toBeLessThanOrEqual(phone.w - FAB_SIZE);
    expect(px.left).toBeGreaterThanOrEqual(0);
  });

  it('🔴 кнопка не прячется под шторкой и полосой навигации', () => {
    const top = spotToPixels({ fx: 0.5, fy: 0 }, phone, insets);
    const bottom = spotToPixels({ fx: 0.5, fy: 1 }, phone, insets);
    expect(top.top).toBeGreaterThanOrEqual(insets.top);
    expect(bottom.top + FAB_SIZE).toBeLessThanOrEqual(phone.h - insets.bottom);
  });

  it('🔴 боковые вырезы тоже учитываются — в альбомной чёлка уходит вбок', () => {
    const land = { w: 844, h: 390 };
    const cut = { top: 0, bottom: 21, left: 47, right: 47 };
    const l = spotToPixels({ fx: 0, fy: 0.5 }, land, cut);
    const r = spotToPixels({ fx: 1, fy: 0.5 }, land, cut);
    expect(l.left).toBeGreaterThanOrEqual(cut.left);
    expect(r.left + FAB_SIZE).toBeLessThanOrEqual(land.w - cut.right);
  });

  /** Крошечный экран: безопасной зоны почти нет, но кнопка обязана остаться на нём. */
  it('🔴 на экране меньше кнопки она всё равно не уходит в минус', () => {
    const tiny = { w: 40, h: 40 };
    const px = spotToPixels({ fx: 1, fy: 1 }, tiny, { top: 20, bottom: 20, left: 20, right: 20 });
    expect(px.left).toBeGreaterThanOrEqual(0);
    expect(px.top).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(px.left) && Number.isFinite(px.top)).toBe(true);
  });

  it('доля всегда в пределах 0..1, куда бы ни отпустили палец', () => {
    for (const [x, y] of [[-500, -500], [9999, 9999], [0, 0]]) {
      const s = toSpot(x, y, phone);
      expect(`${x},${y} → ${s.fx >= 0 && s.fx <= 1 && s.fy >= 0 && s.fy <= 1}`).toBe(`${x},${y} → true`);
    }
  });
});

describe('тап против перетаскивания', () => {
  it('🔴 дрожание пальца — это тап, а не перенос кнопки', () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(3, -4)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD, DRAG_THRESHOLD)).toBe(false);
  });

  it('осознанное движение — перенос', () => {
    expect(isDrag(DRAG_THRESHOLD + 1, 0)).toBe(true);
    expect(isDrag(0, -(DRAG_THRESHOLD + 1))).toBe(true);
  });
});

/**
 * ДВЕ ЛОВУШКИ, НАЙДЕННЫЕ ЖИВЬЁМ 21.08.2026, И ОБЕ МОЛЧАЛИВЫЕ.
 */
describe('как кнопка подключена', () => {
  /**
   * 🔴 РАЗМЕР ЭКРАНА ТОЛЬКО ЧЕРЕЗ ОБЩИЙ ХУК. Своя подписка на `Dimensions` здесь
   * стояла и сломалась ровно так, как описано в шапке `useScreenWidth`: на первом
   * кадре размер нулевой. Проверено в браузере — перетащенная на 344×360 кнопка
   * после перезагрузки оказывалась в левом верхнем углу, 6×6. Доля умножалась на
   * ноль, а подрезка честно возвращала минимум.
   */
  it('🔴 размер экрана берётся общим хуком, а не голым Dimensions', () => {
    const src = widget();
    expect(src).toContain('useScreenSize');
    expect(/import[^;]*\buseWindowDimensions\b/.test(src)).toBe(false);
    expect(/Dimensions\.(get|addEventListener)\s*\(/.test(src)).toBe(false);
  });

  /**
   * 🔴 ЖЕСТ ЗАБИРАЕТСЯ ПЕРЕХВАТОМ. Жест начинается на самой кнопке, и ответчиком
   * становится она — обычный `onMoveShouldSetPanResponder` у родителя тогда не
   * спрашивают вовсе. Проверено живьём: с ним кнопка не двигалась ни на пиксель,
   * а перетаскивание засчитывалось как тап и открывало окно отзыва.
   */
  it('🔴 перенос забирает жест перехватом, иначе кнопка не сдвинется', () => {
    const src = widget();
    expect(src).toContain('onMoveShouldSetPanResponderCapture');
    expect(src).toContain('panHandlers');
  });

  /** Порог живёт в одном месте: экран не имеет права завести свой. */
  it('решение «тап или перенос» принимает общая функция', () => {
    expect(widget()).toContain('isDrag(');
  });
});
