/* psygames-mental-rotation-same · VER 1 · 12.09.2026 */
/* psygames-spatial-claude-mac · задача 148ecbb4 · not an app release */
/**
 * «ОДИНАКОВАЯ ФИГУРА» — ДВЕ ФИГУРЫ, ОТВЕТ ДА/НЕТ.
 *
 * Самый короткий режим из всех: вопрос один, вариантов два. Вся работа — в
 * ЧЕСТНОСТИ ПАРЫ, и она проверяется перебором 24 ориентаций, а не «похоже/не похоже».
 *
 * 🔴 ЧЕТЫРЕ ЛОВУШКИ, КАЖДАЯ ИЗ КОТОРЫХ ТИХО ПРЕВРАЩАЕТ РЕЖИМ В МУСОР.
 *
 * 1. ⚠️ УГАДЫВАНИЕ ДАЁТ 50 %. Это единственный бинарный режим игры. Долю верных
 *    ответов с него НЕЛЬЗЯ складывать в общую точность партии как есть: случайный
 *    игрок наберёт здесь половину, а на четырёх вариантах — четверть. Лестница
 *    строится не числом вариантов (их всегда два), а близостью подделки к оригиналу
 *    и числом кубиков.
 *
 * 2. 🔴 ЗЕРКАЛО ПЛОСКОЙ ФИГУРЫ — ЗАКОННЫЙ ПОВОРОТ. Плоскую фигуру можно перевернуть
 *    в пространстве, и зеркальная копия совпадёт с оригиналом. Если взять такую
 *    фигуру в пару «нет», правильным ответом окажется «да», а игра скажет «неверно».
 *    Поэтому фигуры берутся киральные (`isChiral`), а сама пара всё равно
 *    перепроверяется `isValidRotation` — не «наверное, зеркало», а перебором.
 *
 * 3. ⚠️ ПАРА «ДА» ИЗ ДВУХ ОДИНАКОВЫХ КАРТИНОК — ЭТО НЕ ЗАДАНИЕ. Если правая фигура
 *    после нормализации совпала с левой кубик в кубик, отвечать «да» можно не
 *    поворачивая ничего в голове. Такая пара отбрасывается: поворот обязан что-то
 *    менять.
 *
 * 4. ⚠️ ОТВЕТ НЕ ПЕРЕМЕШИВАЕТСЯ. Кнопки «Да» и «Нет» стоят на своих местах всю
 *    партию. Перемешивать их — значит заставлять читать подпись каждый раз вместо
 *    того, чтобы думать о фигуре; это меряет чтение, а не ротацию.
 */
import { isValidRotation, mirrorShape, normalizeShape, rotateShape, shapeKey } from './geometry';
import { rotationLevelSpec } from './levels';
import { moveOneCube } from './projection';
import { pick, randomInt } from './rng';
import { levelParams, rotationCandidates } from './rotation';
import type { Axis, Rng, SameOption, SameTask, Shape } from './types';

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** Случайная ориентация: по случайному числу четвертей вокруг каждой оси. */
export function tumble(shape: Shape, rng: Rng): Shape {
  let out = shape;
  for (const axis of AXES) out = rotateShape(out, axis, randomInt(rng, 0, 3));
  return normalizeShape(out);
}

export function buildSameTask(level: number, rng: Rng): SameTask {
  const p = levelParams(level);
  const spec = rotationLevelSpec(level);
  const candidates = rotationCandidates(p);
  if (candidates.length === 0) throw new Error(`нет фигур размера ${p.minC}–${p.maxC}`);

  const wantSame = rng() < 0.5;

  for (let attempt = 0; attempt < 200; attempt++) {
    const left = normalizeShape(pick(rng, candidates));

    if (wantSame) {
      const right = tumble(left, rng);
      // Ловушка 3: одинаковая картинка — не задание.
      if (shapeKey(right) === shapeKey(left)) continue;
      // Ловушка 2 наоборот: поворот обязан остаться поворотом. Проверка дешёвая,
      // а без неё опечатка в `tumble` прошла бы незамеченной — фигура «та же»
      // только по замыслу автора.
      if (!isValidRotation(left, right)) continue;
      return pair(left, right, true, 'none');
    }

    const useMirror = spec.foil !== 'one-cube';
    const source = useMirror ? mirrorShape(left) : moveOneCube(left, rng);
    if (!source) continue;
    const right = tumble(source, rng);
    // Ловушка 2: подделка обязана НЕ быть поворотом оригинала.
    if (isValidRotation(left, right)) continue;
    return pair(left, right, false, useMirror ? 'mirror' : 'one-cube');
  }

  throw new Error(`same ${level}: не собралась честная пара за 200 попыток`);
}

function pair(left: Shape, right: Shape, isSame: boolean, flaw: SameTask['flaw']): SameTask {
  const options: SameOption[] = [
    { answer: true, isMatch: isSame },
    { answer: false, isMatch: !isSame },
  ];
  return { kind: 'same', left, right, isSame, flaw, options, correctIdx: isSame ? 0 : 1 };
}
