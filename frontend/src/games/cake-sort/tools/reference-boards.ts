/* psygames-cake-sort-reference-boards · VER 2 · 24.09.2026 */
/**
 * СТОЛЫ ДЛЯ КАЛИБРОВКИ ЭТАЛОНА ХОДОВ — ОДИН ИСТОЧНИК НА ЗАМЕР И НА ПРОБУ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ (задача af4c7ff1). Калибровка `REF_PER_TYPE` считалась
 * ПРЯМО В ПРОБЕ: двадцать четыре стола, на каждом точный поиск A* с бюджетом
 * 200 000 узлов. Это 231–346 с на каждый прогон CI ради числа, которое меняется
 * раз в полгода. Теперь замер делается один раз инструментом
 * (`tools/record-reference.gen.ts`) и лежит данными, а проба сверяется с ними и
 * ПЕРЕМЕРЯЕТ живьём небольшую выборку — чтобы дрейф решателя не прошёл молча.
 *
 * ⚠️ Раздача столов обязана быть ОДНА И ТА ЖЕ у инструмента и у пробы: свою
 * копию они бы тихо развели, и сверка сравнивала бы разные доски. Поэтому
 * генератор живёт здесь, а не в каждом из них.
 */
import { CIRCLE, makeBoard, type Board } from '../core/plate';

/** Столы, на которых A* заведомо доходит до дна. Границу подобрал замер, а не вкус. */
export const СТОЛЫ: [number, number][] = [[3, 5], [3, 6], [4, 6], [4, 7], [5, 7], [5, 8]];

/** Сколько раздач на каждый стол. */
export const ЗЕРНА = [1, 2, 3, 4];

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Стол из `types` видов на `plates` тарелках. Тот же способ раздачи, что в игре. */
export function стол(types: number, plates: number, seed: number): Board {
  const все: number[] = [];
  for (let t = 0; t < types; t += 1) for (let k = 0; k < CIRCLE; k += 1) все.push(t);
  const rand = rng(seed);
  for (let i = все.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [все[i], все[j]] = [все[j] as number, все[i] as number];
  }
  const out: number[][] = Array.from({ length: plates }, () => []);
  let i = 0;
  for (const s of все) { while ((out[i] as number[]).length >= CIRCLE) i += 1; (out[i] as number[]).push(s); }
  return makeBoard(out, []);
}

/** Все столы калибровки: виды, тарелки и зерно раздачи. */
export function всеСтолы(): { types: number; plates: number; seed: number }[] {
  const out: { types: number; plates: number; seed: number }[] = [];
  for (const [types, plates] of СТОЛЫ) for (const seed of ЗЕРНА) out.push({ types, plates, seed });
  return out;
}
