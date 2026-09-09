/* psygames-mental-rotation-rotation · VER 3 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
/**
 * КЛАССИКА ШЕПАРДА-МЕТЦЛЕРА — И ЗАПИСАННЫЙ ПУТЬ ПОВОРОТА.
 *
 * Задание прежнее: среди вариантов один — законный поворот эталона, остальные
 * зеркала и другие фигуры. Новое здесь одно, и ради него код и переехал из
 * экрана в ядро: КАЖДЫЙ ПОВОРОТ ЗАПИСЫВАЕТСЯ ПОШАГОВО (`steps`, по 90° за шаг).
 *
 * 🔴 ЗАЧЕМ. Раньше после ошибки человек видел только «неверно» — и уходил с
 * партии, не узнав, ПОЧЕМУ правильный вариант правильный. Разбор (`replay.ts`)
 * прогоняет эталон через промежуточные ориентации к правильному ответу, и
 * построить его можно только по записанному пути: из готовой повёрнутой фигуры
 * путь обратно не восстановить — ориентаций 24, а показать надо ту самую.
 *
 * ⚠️ УГОЛ — ЭТО НЕ УКРАШЕНИЕ, А ОСЬ БИОМАРКЕРА. `angleSum` = 90° × число шагов,
 * и по нему считается наклон времени ответа. Поэтому шаги не «примерно», а ровно
 * те, что применены к фигуре: проба в тестах сверяет последний кадр разбора с
 * правильным вариантом.
 *
 * ⚠️ ЗЕРКАЛО РАБОТАЕТ НЕ НА ЛЮБОЙ ФИГУРЕ. Плоскую фигуру (все кубики в одной
 * плоскости) можно перевернуть в пространстве, и зеркальная копия окажется
 * ЗАКОННЫМ поворотом. Поэтому для поворотных проб предпочитаются киральные
 * фигуры, а всякая подделка всё равно проверяется `isValidRotation` — не
 * «наверное, зеркало», а перебором 24 ориентаций.
 */
import { isValidRotation, mirrorShape, normalizeShape, rotateShape, shapeKey } from './geometry';
import { pick, randomInt, shuffle } from './rng';
import { shapesOfSize } from './shapes';
import {rotationLevelSpec} from './levels';
import type { Axis, Cube, RotationOption, RotationStep, RotationTask, Rng, Shape } from './types';

export interface LevelParams {
  minC: number;
  maxC: number;
  axes: Axis[];
  optionCount: number;
  /** Составные повороты (косые ракурсы) — верхние уровни. */
  compound: boolean;
}

/**
 * Уровень → параметры пробы. Единственный источник: экран берёт отсюда же —
 * иначе подпись «4–5 кубиков, ось Z» на настройке разъедется с тем, что выпало.
 */
export function levelParams(level: number): LevelParams {
  const s=rotationLevelSpec(level);
  return {minC:s.cubes,maxC:s.cubes,axes:[...new Set(s.path)],optionCount:s.optionCount,compound:new Set(s.path).size>1};
}

/** Фигура кирального типа: зеркальная копия НЕ является её поворотом. */
export function isChiral(shape: Shape): boolean {
  return !isValidRotation(shape, mirrorShape(shape));
}

/**
 * Фигуры для поворотной пробы. Киральные — первым выбором: на них зеркальный
 * отвлекающий вариант вообще возможен. Если в размерной полосе таких меньше
 * двух, берём полосу целиком: партия важнее красоты отбора, а подделки всё равно
 * проверяются перебором ориентаций.
 */
export function rotationCandidates(p: LevelParams): Shape[] {
  const band = shapesOfSize(p.minC, p.maxC);
  const chiral = band.filter(isChiral);
  return chiral.length >= 2 ? chiral : band;
}

function applySteps(shape: Shape, steps: RotationStep[]): Shape {
  let out = shape;
  for (const step of steps) out = rotateShape(out, step.axis, 1);
  return normalizeShape(out);
}

export function buildRotationTask(level: number, rng: Rng): RotationTask {
  const p = levelParams(level);
  const spec=rotationLevelSpec(level);
  const candidates = rotationCandidates(p);
  if (candidates.length === 0) throw new Error(`нет фигур размера ${p.minC}–${p.maxC}`);
  let base = pick(rng, candidates);

  // Поворот, который что-то меняет: вариант, совпавший с эталоном пиксель в
  // пиксель, отвечается без ротации в голове — и портит замер.
  // Keep more than one angle in a session, otherwise the RT/angle regression
  // degenerates to a constant-X sample. Every extra quarter is actually applied.
  const steps = spec.path.map(axis=>({axis}));
  if(rng()<.5)steps.push({axis:spec.path[spec.path.length-1]});
  let correctShape = applySteps(base, steps);
  for (let guard = 0; guard < 12 && shapeKey(correctShape) === shapeKey(normalizeShape(base)); guard++) {
    base = pick(rng, candidates);
    correctShape = applySteps(base, steps);
  }

  const options: RotationOption[] = [{ shape: correctShape, isMatch: true, flaw: 'none' }];
  const taken = new Set<string>([shapeKey(correctShape)]);

  const others = candidates.filter((s) => shapeKey(s) !== shapeKey(base));
  const spoil = (): { shape: Shape; flaw: 'mirror' | 'other' } | null => {
    if(spec.foil==='one-cube'){
      const changed=relocateCube(base,rng);
      if(!changed)return null;
      const cand=applySteps(changed,steps);
      if(isValidRotation(base,cand)||taken.has(shapeKey(cand)))return null;
      return {shape:cand,flaw:'other'};
    }
    const wantMirror = rng() < 0.55;
    const source = wantMirror ? mirrorShape(base) : (others.length ? pick(rng, others) : mirrorShape(base));
    const flaw: 'mirror' | 'other' = wantMirror || others.length === 0 ? 'mirror' : 'other';
    let cand = source;
    for (const axis of p.axes) cand = rotateShape(cand, axis, randomInt(rng, 1, 3));
    cand = normalizeShape(cand);
    // Зеркало плоской фигуры — законный поворот; «другая фигура» может оказаться
    // поворотом эталона. И то и другое — второй верный ответ на экране.
    if (isValidRotation(base, cand)) return null;
    if (taken.has(shapeKey(cand))) return null;
    return { shape: cand, flaw };
  };

  for (let attempt = 0; options.length < p.optionCount && attempt < 200; attempt++) {
    const spoiled = spoil();
    if (!spoiled) continue;
    taken.add(shapeKey(spoiled.shape));
    options.push({ shape: spoiled.shape, isMatch: false, flaw: spoiled.flaw });
  }

  if(options.length!==p.optionCount)throw new Error(`rotation ${level}: insufficient distinct options`);

  const mixed = shuffle(rng, options);
  return {
    kind: 'rotation',
    base: normalizeShape(base),
    options: mixed,
    correctIdx: mixed.findIndex((o) => o.isMatch),
    steps,
    angleSum: steps.length * 90,
  };
}

/** Move exactly one cube while preserving face-connectedness and cube count. */
export function relocateCube(base:Shape,rng:Rng):Shape|null {
  const removed=randomInt(rng,0,base.length-1),rest=base.filter((_,i)=>i!==removed);
  const key=(c:Cube)=>c.join(','),occupied=new Set(rest.map(key));
  const neighbors:Cube[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const seen=new Set([key(rest[0])]),queue=[rest[0]];
  for(let i=0;i<queue.length;i++)for(const d of neighbors){
    const c=queue[i].map((v,j)=>v+d[j]) as Cube,k=key(c);
    if(occupied.has(k)&&!seen.has(k)){seen.add(k);queue.push(c);}
  }
  if(seen.size!==rest.length)return null;
  const frontier=new Map<string,Cube>();
  for(const c of rest)for(const d of neighbors){
    const next=c.map((v,i)=>v+d[i]) as Cube,k=key(next);
    if(!occupied.has(k)&&k!==key(base[removed]))frontier.set(k,next);
  }
  if(!frontier.size)return null;
  return [...rest,pick(rng,[...frontier.values()])];
}
