/* psygames-mental-rotation-shapes · VER 2 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.1 · psygames-codex-mac · not an app release */
/**
 * БИБЛИОТЕКА ФИГУР ИЗ КУБИКОВ — общая для всех трёх видов заданий.
 *
 * Раньше набор лежал прямо в экране, и проекция считалась бы по другой копии
 * координат: два списка кубиков рано или поздно расходятся, и «правильная»
 * проекция перестаёт быть проекцией показанной фигуры. Список ОДИН, и берут его
 * и поворот, и проекция.
 *
 * ⚠️ ПЛОСКАЯ ФИГУРА — НЕ ТО ЖЕ, ЧТО КИРАЛЬНАЯ, И ЭТО РЕШАЕТ ЗАДАНИЕ. Фигуру, у
 * которой все кубики в одной плоскости, можно ПЕРЕВЕРНУТЬ в пространстве — и её
 * зеркальная копия окажется законным поворотом. Значит зеркальный отвлекающий
 * вариант на такой фигуре невозможен (он был бы вторым верным ответом), а вид
 * сверху у неё вырождается в полоску клеток. Поэтому здесь есть и плоские, и
 * объёмные фигуры, а отбор под задание идёт по свойству, а не по названию:
 * поворот просит киральных (`isChiral`), проекция — объёмных (`isVolumetric`).
 * Проба в тестах требует от библиотеки связности и попарной различимости: две
 * фигуры, оказавшиеся поворотами друг друга, сделали бы «другую фигуру» верным
 * ответом.
 */
import type { Shape, Cube } from './types';
import {createRng,pick} from './rng';
import {allOrientations,normalizeShape,shapeKey} from './geometry';

export const SHAPE_LIBRARY: readonly Shape[] = [
  // L (4)
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]],
  // Z (4)
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]],
  // T со ступенькой в глубину (4)
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  // лесенка (5)
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]],
  // ступенька в глубину (5)
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [2, 1, 1]],
  // длинная L (5)
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [3, 1, 0]],
  // угол с отростком вверх (5)
  [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 2, 0], [1, 2, 1]],
  // змейка через три плоскости (6)
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [2, 1, 1], [2, 2, 1]],
  // ветка (6)
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 1], [2, 2, 1]],
  // тройник с отростком в глубину (6): единственная в библиотеке фигура с
  // РАЗВИЛКОЙ — «крюк с полкой», стоявший тут сперва, оказался поворотом ветки
  // выше, и отвлекающий вариант «другая фигура» становился вторым верным
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0], [1, 1, 1], [1, 2, 1]],
  // лестница 3D (7)
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 1, 1], [3, 1, 1], [3, 2, 1]],
  // спираль (7)
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1], [2, 1, 1], [2, 2, 1], [1, 2, 1]],
  // коромысло (8)
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0], [2, 2, 1], [3, 2, 1], [3, 2, 2]],
] as const as readonly Shape[];

/** Фигуры нужного размера. Пустым набор не бывает — проба в тестах это стережёт. */
export function shapesOfSize(minCubes: number, maxCubes: number): Shape[] {
  const extra:Shape[]=[];
  for(let n=Math.max(9,minCubes);n<=Math.min(13,maxCubes);n++)extra.push(...extendedShapes(n));
  return [...SHAPE_LIBRARY,...extra]
    .filter((s) => s.length >= minCubes && s.length <= maxCubes)
    .map((s) => s.map((c) => [...c] as [number, number, number]));
}

const extendedCache=new Map<number,Shape[]>();
const ADJACENT:Cube[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
/** Grow by face adjacency, keep compact extents and reject rotational duplicates.
 * Original 4..8 library remains unchanged for existing exercises/art assets. */
function extendedShapes(count:number):Shape[] {
  const cached=extendedCache.get(count);if(cached)return cached;
  const random=createRng(`rotation-shapes-${count}`),out:Shape[]=[],seen=new Set<string>();
  for(let attempt=0;attempt<300&&out.length<12;attempt++){
    let shape=SHAPE_LIBRARY[2].map(c=>[...c] as Cube);
    while(shape.length<count){
      const occupied=new Set(shape.map(c=>c.join(','))),frontier=new Map<string,Cube>();
      for(const c of shape)for(const d of ADJACENT){
        const candidate=c.map((v,i)=>v+d[i]) as Cube;
        if(occupied.has(candidate.join(',')))continue;
        if(boundingBox([...shape,candidate]).some(span=>span>4))continue;
        frontier.set(candidate.join(','),candidate);
      }
      shape.push(pick(random,[...frontier.values()]));
    }
    shape=normalizeShape(shape);
    const canonical=allOrientations(shape).map(shapeKey).sort()[0];
    if(!seen.has(canonical)){seen.add(canonical);out.push(shape);}
  }
  if(out.length<3)throw new Error(`insufficient distinct ${count}-cube shapes`);
  extendedCache.set(count,out);return out;
}

/** Габарит фигуры по осям — по нему видно, плоская она или объёмная. */
export function boundingBox(shape: Shape): [number, number, number] {
  const span = (i: 0 | 1 | 2): number => Math.max(...shape.map((c) => c[i])) - Math.min(...shape.map((c) => c[i])) + 1;
  return [span(0), span(1), span(2)];
}

/**
 * Объёмная фигура: занимает не меньше двух клеток по КАЖДОЙ оси. У плоской
 * фигуры вид сверху (или сбоку) — полоска в одну клетку шириной, и задание на
 * проекцию превращается в «сосчитай кубики в ряд».
 */
export function isVolumetric(shape: Shape): boolean {
  return boundingBox(shape).every((s) => s >= 2);
}
