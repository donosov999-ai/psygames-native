/* psygames-mental-rotation-pieces · VER 1 · 16.09.2026 */
/* psygames-spatial-claude-mac · задача 5a1b4d25 · not an app release */
/**
 * «НЕДОСТАЮЩАЯ ЧАСТЬ» И «СБОРКА» — ДВА РЕЖИМА НА ОДНОМ РАЗРЕЗЕ (`split.ts`).
 *
 * «Недостающая часть»: целая фигура, часть кубиков нарисована пустыми → какой кусок
 * заполнит пустоту. Варианты — куски, каждый повёрнут по-своему.
 * «Сборка»: два куска, каждый повёрнут по-своему → какая фигура из них сложится.
 * Варианты — целые фигуры.
 *
 * 🔴 ПУСТОТА РИСУЕТСЯ, А НЕ ДОГАДЫВАЕТСЯ. Можно было показать целое и остаток двумя
 * картинками — но тогда игрок решает не пространственную задачу, а загадку «где
 * внутри целого лежит остаток». Отзыв Дениса 16.09.2026: не понял правил — ушёл.
 * Поэтому место недостающих кубиков видно прямо на фигуре, а вращать в голове
 * приходится варианты.
 *
 * 🔴 ВЕРНЫЙ ОТВЕТ ОДИН — ПЕРЕБОРОМ, А НЕ НА ВИД. Подделка отбрасывается, если:
 *   · она — поворот верного куска (или другой уже взятой подделки);
 *   · из неё вместе со вторым куском складывается целое (`composes`) — в любом
 *     положении и любой ориентации. Такая «подделка» — второй верный ответ.
 *
 * ⚠️ ВЕРНЫЙ ВАРИАНТ ПОВЁРНУТ ОБЯЗАТЕЛЬНО. Кусок, нарисованный ровно так, как стоит
 * пустота в фигуре, находится сравнением картинок — без поворота в голове.
 *
 * ⚠️ КУСОК «НЕДОСТАЮЩЕЙ ЧАСТИ» — НЕ МЕНЬШЕ ЧЕТЫРЁХ КУБИКОВ. Из двух кубиков фигура
 * одна, из трёх — две: подделок того же размера не набрать, а подделка другого
 * размера отсеивается счётом кубиков, без пространства.
 *
 * 🔴 ПУСТОТА НЕ БОЛЬШЕ СПЛОШНОЙ ЧАСТИ И СТОИТ К ЗРИТЕЛЮ (живой кадр 16.09.2026).
 * Первый вариант на 11-м уровне резал фигуру из шести кубиков на пустоту из четырёх
 * и два сплошных, да ещё пустота оказывалась ЗА сплошными: на экране стоял столбик
 * из двух кубиков и один пунктирный контур — что заполнять, понять было нельзя.
 * Отсюда два правила: режим открывается с восьми кубиков (`KIND_UNLOCK.missing`),
 * а фигура поворачивается так, чтобы пустота была ближе к зрителю, чем остаток.
 */
import { isValidRotation, mirrorShape, normalizeShape, rotateShape, shapeKey } from './geometry';
import { rotationLevelSpec } from './levels';
import { pick, shuffle } from './rng';
import { levelParams, relocateCube, rotationCandidates } from './rotation';
import { tumble } from './same';
import { composes, isFaceConnected, splitShape } from './split';
import type { AssemblyTask, MissingTask, PieceFlaw, PieceOption, Rng, Shape } from './types';

/** Самый мелкий кусок «недостающей части» — см. шапку. */
export const MIN_MISSING_PIECE = 4;

/**
 * Подделки для верной фигуры `truth`. `fitsAnyway` отвечает, не станет ли подделка
 * вторым верным ответом; `others` — фигуры того же размера для подделки «другая фигура».
 */
function decoys(
  truth: Shape, count: number, oneCubeOnly: boolean, others: readonly Shape[],
  fitsAnyway: (candidate: Shape) => boolean, rng: Rng,
): PieceOption[] | null {
  const taken: Shape[] = [truth];
  const out: PieceOption[] = [];
  for (let attempt = 0; out.length < count && attempt < 150; attempt++) {
    const roll = rng();
    const flaw: PieceFlaw = oneCubeOnly || roll < 0.5 ? 'one-cube' : roll < 0.8 || others.length === 0 ? 'mirror' : 'other';
    const source = flaw === 'one-cube' ? relocateCube(truth, rng) : flaw === 'mirror' ? mirrorShape(truth) : pick(rng, others);
    if (!source || source.length !== truth.length || !isFaceConnected(source)) continue;
    if (taken.some((t) => isValidRotation(t, source))) continue;
    if (fitsAnyway(source)) continue;
    taken.push(source);
    out.push({ shape: tumble(source, rng), isMatch: false, flaw });
  }
  return out.length === count ? out : null;
}

/** Глубина кубика к зрителю в изометрии рисователя: больше — ближе (так сортируются грани). */
const depth = (c: readonly number[]): number => c[0] + c[1] + c[2];
const meanDepth = (s: Shape): number => s.reduce((sum, c) => sum + depth(c), 0) / s.length;

/**
 * Поворот целого, при котором пустота ближе всего к зрителю относительно остатка.
 * Перебор 64 сочетаний четвертей (все 24 ориентации с повторами); из равных берётся
 * случайная, иначе фигура стояла бы всегда одним боком.
 */
export function holeFacingViewer(whole: Shape, hole: Shape, rng: Rng): { whole: Shape; hole: Shape } {
  const key = (c: readonly number[]) => c.join(',');
  const holeKeys = new Set(hole.map(key));
  let best: { whole: Shape; hole: Shape }[] = [];
  let bestScore = -Infinity;
  for (let rx = 0; rx < 4; rx++) for (let ry = 0; ry < 4; ry++) for (let rz = 0; rz < 4; rz++) {
    const turn = (s: Shape): Shape => rotateShape(rotateShape(rotateShape(s, 'x', rx), 'y', ry), 'z', rz);
    const tagged = turn(whole).map((c, i) => ({ c, inHole: holeKeys.has(key(whole[i])) }));
    const all = normalizeShape(tagged.map((t) => t.c));
    const turnedHole = all.filter((_, i) => tagged[i].inHole);
    const turnedRest = all.filter((_, i) => !tagged[i].inHole);
    const score = Math.round((meanDepth(turnedHole) - meanDepth(turnedRest)) * 1000);
    if (score > bestScore) { bestScore = score; best = []; }
    if (score === bestScore) best.push({ whole: all, hole: turnedHole });
  }
  return pick(rng, best);
}

/** Повернуть так, чтобы картинка НЕ совпала с `drawnAs`. null — фигура так симметрична, что не выходит. */
function turnedAway(shape: Shape, drawnAs: Shape, rng: Rng): Shape | null {
  const seen = shapeKey(normalizeShape(drawnAs));
  for (let i = 0; i < 16; i++) {
    const turned = tumble(shape, rng);
    if (shapeKey(turned) !== seen) return turned;
  }
  return null;
}

export function buildMissingTask(level: number, rng: Rng): MissingTask {
  const p = levelParams(level);
  const spec = rotationLevelSpec(level);
  const wholes = rotationCandidates(p);
  for (let attempt = 0; attempt < 200; attempt++) {
    const picked = normalizeShape(pick(rng, wholes));
    const size = Math.max(MIN_MISSING_PIECE, Math.floor(picked.length / 3));
    if (picked.length - size < size) continue;                 // пустота не больше сплошной части
    const cut = splitShape(picked, rng, MIN_MISSING_PIECE, size);
    if (!cut) continue;
    const { whole, hole } = holeFacingViewer(picked, cut[0], rng);
    const holeKeys = new Set(hole.map((c) => c.join(',')));
    const rest = whole.filter((c) => !holeKeys.has(c.join(',')));
    const correct = turnedAway(hole, hole, rng);
    if (!correct) continue;
    const wrong = decoys(hole, p.optionCount - 1, spec.foil === 'one-cube', [],
      (candidate) => composes(whole, rest, candidate), rng);
    if (!wrong) continue;
    const options = shuffle(rng, [{ shape: correct, isMatch: true, flaw: 'none' as const }, ...wrong]);
    return { kind: 'missing', whole, hole, options, correctIdx: options.findIndex((o) => o.isMatch) };
  }
  throw new Error(`missing ${level}: не собралось задание с единственным ответом за 200 попыток`);
}

export function buildAssemblyTask(level: number, rng: Rng): AssemblyTask {
  const p = levelParams(level);
  const spec = rotationLevelSpec(level);
  const wholes = rotationCandidates(p);
  for (let attempt = 0; attempt < 200; attempt++) {
    const whole = normalizeShape(pick(rng, wholes));
    const cut = splitShape(whole, rng, 2, Math.floor(whole.length / 2));
    if (!cut) continue;
    const [a, b] = cut;
    const others = wholes.filter((s) => s.length === whole.length && !isValidRotation(whole, s));
    const wrong = decoys(whole, p.optionCount - 1, spec.foil === 'one-cube', others,
      (candidate) => composes(candidate, a, b), rng);
    if (!wrong) continue;
    const options = shuffle(rng, [{ shape: tumble(whole, rng), isMatch: true, flaw: 'none' as const }, ...wrong]);
    return {
      kind: 'assembly', parts: [tumble(a, rng), tumble(b, rng)], options,
      correctIdx: options.findIndex((o) => o.isMatch),
    };
  }
  throw new Error(`assembly ${level}: не собралось задание с единственным ответом за 200 попыток`);
}
