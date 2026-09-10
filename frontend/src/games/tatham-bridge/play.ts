/* psygames-tatham-bridge-play-api · VER 2 · 10.09.2026 */
/**
 * ИГРАБЕЛЬНЫЙ ДОСТУП: открыть партию, получить доску ВЕКТОРОМ, отправить нажатие.
 *
 * Доска приходит не картинкой и не текстом, а списком примитивов — тем, что движок
 * нарисовал бы сам. Рисуем их своим SVG: цвета, шрифты и каркас остаются нашими.
 * Правила игры писать не нужно — их знает его код, нажатие уходит туда по координатам.
 */
import { загрузить } from './index';

export type Примитив =
  | { вид: 'прямоугольник'; x: number; y: number; ш: number; в: number; цвет: number }
  | { вид: 'линия'; x1: number; y1: number; x2: number; y2: number; цвет: number; толщина?: number }
  | { вид: 'круг'; x: number; y: number; r: number; заливка: number; контур: number }
  | { вид: 'многоугольник'; точки: number[]; заливка: number; контур: number }
  | { вид: 'текст'; x: number; y: number; размер: number; выравнивание: number; цвет: number; текст: string };

export interface Партия {
  ширина: number;
  высота: number;
  палитра: string[];
  примитивы: Примитив[];
  /** +1 решено, −1 проиграно, 0 идёт. */
  статус: number;
}

/** Строки записи → примитивы. Формат задан в `psy_play.c`, менять только парой. */
function разобрать(текст: string): Примитив[] {
  const out: Примитив[] = [];
  let толщина: number | undefined;
  for (const строка of текст.split('\n')) {
    if (!строка) continue;
    const ч = строка.split(' ');
    const n = (k: number) => Number(ч[k]);
    switch (ч[0]) {
      case 'R': out.push({ вид: 'прямоугольник', x: n(1), y: n(2), ш: n(3), в: n(4), цвет: n(5) }); break;
      case 'L': out.push({ вид: 'линия', x1: n(1), y1: n(2), x2: n(3), y2: n(4), цвет: n(5), толщина }); break;
      case 'W': out.push({ вид: 'линия', x1: n(2), y1: n(3), x2: n(4), y2: n(5), цвет: n(6), толщина: n(1) / 100 }); break;
      case 'C': out.push({ вид: 'круг', x: n(1), y: n(2), r: n(3), заливка: n(4), контур: n(5) }); break;
      case 'P': out.push({ вид: 'многоугольник', заливка: n(1), контур: n(2), точки: ч.slice(4).map(Number) }); break;
      case 'T': out.push({ вид: 'текст', x: n(1), y: n(2), размер: n(3), выравнивание: n(4), цвет: n(5), текст: ч.slice(6).join(' ') }); break;
      case 'N': толщина = n(1) / 100; break;
      // K/U — обрезка, D — пунктир: на нашем рисовании не сказываются, пропускаем
      default: break;
    }
  }
  return out;
}

function строка(M: any, p: number): string {
  if (!p) return '';
  const s = M.UTF8ToString(p);
  M.ccall('psy_free', null, ['number'], [p]);
  return s;
}

/** Снять текущее состояние партии целиком. */
export async function снимок(): Promise<Партия> {
  const M = await загрузить();
  return {
    ширина: M.ccall('psy_width', 'number', [], []),
    высота: M.ccall('psy_height', 'number', [], []),
    палитра: строка(M, M.ccall('psy_colours', 'number', [], [])).split(' ').filter(Boolean).map((c) => `rgb(${c})`),
    примитивы: разобрать(строка(M, M.ccall('psy_draw', 'number', [], []))),
    статус: M.ccall('psy_status', 'number', [], []),
  };
}

/** Открыть головоломку: движок, параметры ступени автора, зерно. */
export async function открыть(движок: number, параметры: string, зерно: number): Promise<Партия> {
  const M = await загрузить();
  M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
  return снимок();
}

/**
 * Фаза жеста. Одиночное касание — это `нажал` + `отпустил` в одной точке; протяжка
 * добавляет между ними `ведёт`. Пятерым головоломкам (Untangle, Pegs, Rectangles,
 * Loopy, Slant) без протяжки нечем играть вовсе — см. `psy_pointer` в `psy_play.c`.
 */
export type Жест = 'нажал' | 'ведёт' | 'отпустил';
const ВИД: Record<Жест, number> = { нажал: 0, ведёт: 1, отпустил: 2 };

/** Событие указателя в КООРДИНАТАХ ЕГО ПОЛЯ (не экранных — пересчёт на стороне экрана). */
export async function указатель(x: number, y: number, жест: Жест, правой = false): Promise<Партия> {
  const M = await загрузить();
  M.ccall('psy_pointer', 'number', ['number', 'number', 'number'],
    [Math.round(x), Math.round(y), ВИД[жест] + (правой ? 3 : 0)]);
  return снимок();
}

/** Короткое касание целиком: нажал и сразу отпустил в той же точке. */
export async function нажать(x: number, y: number, правой = false): Promise<Партия> {
  await указатель(x, y, 'нажал', правой);
  return указатель(x, y, 'отпустил', правой);
}

/**
 * Стрелка движку. Нужна двум режимам из сорока — Cube и Inertia ходят стрелками, поля
 * для нажатия у них нет: замер 10.09.2026, `interpret_move` у обоих читает только
 * CURSOR_*. Коды живут в C (`psy_cursor`), рядом с его enum, а не числами здесь.
 * Экран рисует таким режимам крестовину, а не притворяется, что доска нажимается.
 */
export type Сторона = 'вверх' | 'вниз' | 'влево' | 'вправо';
const СТОРОНА: Record<Сторона, number> = { вверх: 0, вниз: 1, влево: 2, вправо: 3 };

export async function стрелка(куда: Сторона): Promise<Партия> {
  const M = await загрузить();
  M.ccall('psy_cursor', 'number', ['number'], [СТОРОНА[куда]]);
  return снимок();
}

/** Клавиша движку кодом — цифры судоку и кенкена, пробел. */
export async function клавиша(код: number): Promise<Партия> {
  const M = await загрузить();
  M.ccall('psy_key', 'number', ['number'], [код]);
  return снимок();
}

export async function отменить(): Promise<Партия> {
  const M = await загрузить();
  M.ccall('psy_undo', 'number', [], []);
  return снимок();
}

/** Подсказка: его решатель докладывает партию до конца. */
export async function решить(): Promise<Партия> {
  const M = await загрузить();
  M.ccall('psy_solve', 'number', [], []);
  return снимок();
}
