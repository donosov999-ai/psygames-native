/* psygames-mental-rotation-split · VER 1 · 16.09.2026 */
/* psygames-spatial-claude-mac · задача 5a1b4d25 · not an app release */
/**
 * ДЕЛИТЕЛЬ ФИГУРЫ — ОДНА ФУНКЦИЯ НА ДВА РЕЖИМА: «НЕДОСТАЮЩАЯ ЧАСТЬ» И «СБОРКА».
 *
 * До 16.09.2026 в ядре было всё, чтобы фигуру вертеть, зеркалить и сравнивать, и не
 * было ничего, чтобы её РАЗРЕЗАТЬ. Оба режима стоят ровно на разрезе: «недостающая
 * часть» — это целое минус кусок, «сборка» — два куска, из которых складывается целое.
 *
 * 🔴 ТРИ ТРЕБОВАНИЯ К РАЗРЕЗУ, КАЖДОЕ ТИХО ЛОМАЕТ ЗАДАНИЕ.
 * 1. Обе части СВЯЗНЫ ПО ГРАНЯМ. Кубики, касающиеся ребром или углом, в руке
 *    рассыпаются — такой «кусок» нельзя ни показать, ни приставить.
 * 2. Части ровно покрывают фигуру и не пересекаются: ни один кубик не потерян и
 *    не посчитан дважды.
 * 3. Меньшая часть не мельче `minPart`: разрез «фигура и один кубик» — это не
 *    задание на пространство, а поиск одной клетки.
 *
 * 🔴 И ЧЕТВЁРТОЕ — НЕ ПРО РАЗРЕЗ, А ПРО ОТВЕТ: `composes`. Подделка, из которой
 * вместе со вторым куском тоже складывается целое, — это ВТОРОЙ ВЕРНЫЙ ОТВЕТ.
 * Человек выберет её и будет прав, а игра скажет «неверно». Проверяется перебором
 * всех 24 ориентаций куска и всех положений внутри целого, а не «на вид другая».
 */
import { allOrientations, isValidRotation } from './geometry';
import { pick, randomInt } from './rng';
import type { Cube, Rng, Shape } from './types';

const FACES: readonly Cube[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (c: Cube): string => c.join(',');
const step = (c: Cube, d: Cube): Cube => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];

/** Связность по граням. Повтор кубика — не фигура: такая «часть» не связна по определению. */
export function isFaceConnected(shape: Shape): boolean {
  if (shape.length === 0) return false;
  const cells = new Set(shape.map(key));
  if (cells.size !== shape.length) return false;
  const seen = new Set([key(shape[0])]);
  const queue: Cube[] = [shape[0]];
  for (let i = 0; i < queue.length; i++) {
    for (const d of FACES) {
      const next = step(queue[i], d);
      if (cells.has(key(next)) && !seen.has(key(next))) { seen.add(key(next)); queue.push(next); }
    }
  }
  return seen.size === cells.size;
}

/**
 * Разрезать фигуру на две связные части: первая — `size` кубиков (или случайный
 * размер из допустимых), вторая — остальное. Кусок растёт от случайного кубика по
 * граням; разрез берётся, только если и остаток связен.
 *
 * @returns `[кусок, остаток]` в координатах исходной фигуры; `null`, если честного
 *   разреза нужного размера за отведённые попытки не нашлось или он невозможен.
 */
export function splitShape(shape: Shape, rng: Rng, minPart: number, size?: number): [Shape, Shape] | null {
  const n = shape.length;
  if (minPart < 1 || n < 2 * minPart) return null;
  if (size !== undefined && (size < minPart || n - size < minPart)) return null;
  const all = new Map(shape.map((c) => [key(c), [c[0], c[1], c[2]] as Cube]));
  for (let attempt = 0; attempt < 60; attempt++) {
    const want = size ?? randomInt(rng, minPart, n - minPart);
    const start = pick(rng, [...all.values()]);
    const part = new Map([[key(start), start]]);
    while (part.size < want) {
      const frontier = new Map<string, Cube>();
      for (const c of part.values()) {
        for (const d of FACES) {
          const k = key(step(c, d));
          if (all.has(k) && !part.has(k)) frontier.set(k, all.get(k)!);
        }
      }
      if (frontier.size === 0) break;
      const next = pick(rng, [...frontier.values()]);
      part.set(key(next), next);
    }
    if (part.size !== want) continue;
    const piece = [...part.values()];
    const rest = [...all.values()].filter((c) => !part.has(key(c)));
    if (isFaceConnected(piece) && isFaceConnected(rest)) return [piece, rest];
  }
  return null;
}

/**
 * Складывается ли `whole` из `part` и `rest` — каждый кусок можно повернуть как
 * угодно, отражать нельзя (настоящую деталь не вывернуть наизнанку).
 *
 * Перебор: каждая ориентация `part` × каждое положение, где её первый кубик ложится
 * на кубик целого. Если кусок уместился, оставшиеся кубики сравниваются с `rest`
 * по всем 24 ориентациям.
 */
export function composes(whole: Shape, part: Shape, rest: Shape): boolean {
  if (part.length + rest.length !== whole.length || part.length === 0 || rest.length === 0) return false;
  const cells = new Set(whole.map(key));
  for (const turned of allOrientations(part)) {
    for (const anchor of whole) {
      const shift: Cube = [anchor[0] - turned[0][0], anchor[1] - turned[0][1], anchor[2] - turned[0][2]];
      const placed = turned.map((c) => step(c, shift));
      if (!placed.every((c) => cells.has(key(c)))) continue;
      const used = new Set(placed.map(key));
      const left = whole.filter((c) => !used.has(key(c)));
      if (left.length === rest.length && isValidRotation(rest, left)) return true;
    }
  }
  return false;
}
