/* psygames-mental-rotation-viewpoint · VER 1 · 12.09.2026 */
/* psygames-spatial-claude-mac · задача 148ecbb4 · not an app release */
/**
 * «ТОЧКА ЗРЕНИЯ» — ОДНА ФИГУРА, ЧЕТЫРЕ РАКУРСА, ОТМЕЧЕНО ОТКУДА СМОТРИМ.
 *
 * Чем это НЕ повторяет уже написанное, и почему на этот вопрос пришлось отвечать
 * дважды:
 *
 *   `rotation`   — вариантов несколько, и они РАЗНЫЕ ФИГУРЫ (зеркало, переставленный
 *                  кубик). Спрашивается «какая из фигур — законный поворот эталона».
 *   `projection` — ответ ПЛОСКИЙ: множество клеток вдоль оси взгляда, силуэт без глубины.
 *   `viewpoint`  — фигура ОДНА и та же во всех вариантах. Меняется только МЕСТО,
 *                  откуда на неё смотрят. Спрашивается «что видно с отмеченной точки».
 *
 * 🔴 ПОЧЕМУ ЭТО ВООБЩЕ ВОЗМОЖНО БЕЗ НОВОЙ МАТЕМАТИКИ. Наша целочисленная геометрия
 * (`rotateX/Y/Z` в `geometry.ts`) умеет ТОЛЬКО четверти оборота — 24 ориентации, и
 * ни одного промежуточного положения. А рисователь `shapeSurface(shape,size,axis,degrees)`
 * принимает угол в градусах ДРОБНЫМ и уже сейчас корректно отбраковывает невидимые
 * грани, сортирует по глубине и подсвечивает по нормали. То есть «взгляд под 45°»
 * физически невыразим существующим режимом поворота, но полностью готов к рисованию.
 * Отсюда и лестница: 90° — ракурсы знакомые, 45° — промежуточные, на них фигуру
 * приходится доворачивать в голове, а не узнавать по заученному силуэту.
 *
 * 🔴 ЕДИНСТВЕННОСТЬ ОТВЕТА ДОКАЗЫВАЕТСЯ ПРОГОНОМ РИСОВАТЕЛЯ, А НЕ РАССУЖДЕНИЕМ.
 * У симметричной фигуры два разных угла дают ОДНУ И ТУ ЖЕ картинку — и тогда на
 * экране два правильных ответа, а игра засчитает один. Проверять это «по виду
 * фигуры» бесполезно: симметрия бывает не только очевидная. Поэтому каждый ракурс
 * прогоняется через тот самый `shapeSurface`, которым он потом и рисуется, и от
 * результата берётся отпечаток (`viewFingerprint`). Совпали отпечатки — ракурс не
 * берётся в варианты. Это проверка ПОВЕДЕНИЕМ прибора, а не чтением исходника.
 *
 * ⚠️ ОТПЕЧАТОК СЧИТАЕТСЯ ПРИ ФИКСИРОВАННОМ РАЗМЕРЕ. `shapeSurface` масштабирует
 * фигуру под переданный `size`, поэтому сравнивать картинки, снятые при разных
 * размерах, нельзя. Внутри генератора размер всегда `FINGERPRINT_SIZE`; на экране
 * рисуется своим размером — от этого отпечаток не зависит, потому что сравниваются
 * только ракурсы между собой.
 */
import { clearestOrientation } from './occlusion';
import { pick, shuffle } from './rng';
import { shapesOfSize } from './shapes';
import { levelParams } from './rotation';
import { shapeSurface } from './surface';
import type { Axis, Rng, Shape, ViewpointOption, ViewpointTask } from './types';

/** Размер, при котором снимается отпечаток ракурса. Только для сравнения. */
export const FINGERPRINT_SIZE = 240;

/** До какого знака округляются экранные координаты отпечатка. */
const FINGERPRINT_PRECISION = 1;

/**
 * Ось обзора — вертикаль экрана. Обход фигуры кругом, как вокруг предмета на столе:
 * это и есть житейское «посмотреть с другой стороны». Наклон сверху/снизу — другая
 * задача, и он тут сознательно не берётся: два угла сразу делают вариант неразличимым
 * без подписи.
 */
export const VIEWPOINT_AXIS: Axis = 'y';

/**
 * Отпечаток ракурса: что РЕАЛЬНО нарисуется. Берутся вершины всех видимых граней в
 * порядке отрисовки, округлённые до десятых пикселя. Две картинки с одинаковым
 * отпечатком неразличимы глазом, как бы ни отличались углы, их породившие.
 */
export function viewFingerprint(shape: Shape, degrees: number): string {
  return shapeSurface(shape, FINGERPRINT_SIZE, VIEWPOINT_AXIS, degrees)
    .map((f) => f.points.map(([x, y]) => `${x.toFixed(FINGERPRINT_PRECISION)},${y.toFixed(FINGERPRINT_PRECISION)}`).join(' '))
    .join('|');
}

/**
 * Ракурсы уровня. Шаг 90° — знакомые положения; 45° добавляет промежуточные, где
 * силуэт не узнаётся, а достраивается. Ступень берётся из ТОЙ ЖЕ лестницы, что и у
 * поворота (`levelParams`), чтобы «уровень 12» значил одно и то же во всех режимах.
 */
export function viewpointAngles(level: number): number[] {
  const step = levelParams(level).compound ? 45 : 90;
  const out: number[] = [];
  for (let a = 0; a < 360; a += step) out.push(a);
  return out;
}

/**
 * Фигуры для ракурсной пробы — объёмные. Плоская фигура при обходе кругом дважды
 * вырождается в линию, и два варианта из четырёх становятся мусором.
 */
export function viewpointCandidates(minCubes: number, maxCubes: number): Shape[] {
  const band = shapesOfSize(minCubes, maxCubes);
  const solid = band.filter((s) => new Set(s.map((c) => c[0])).size > 1 && new Set(s.map((c) => c[2])).size > 1);
  return solid.length > 0 ? solid : band;
}

export function buildViewpointTask(level: number, rng: Rng): ViewpointTask {
  const p = levelParams(level);
  const angles = viewpointAngles(level);
  const candidates = viewpointCandidates(p.minC, p.maxC);
  if (candidates.length === 0) throw new Error(`нет фигур размера ${p.minC}–${p.maxC}`);

  // Фигура, у которой РАЗЛИЧИМЫХ ракурсов хватает на все варианты. У сильно
  // симметричной их меньше, чем углов: такая фигура просто не берётся.
  //
  // 🔴 НОЛЬ ИДЁТ В ПЕРЕБОР ПЕРВЫМ И ТУТ ЖЕ ВЫБРАСЫВАЕТСЯ. Эталон на экране показан
  // именно под 0°, поэтому вариант «0°» был бы ответом без единого поворота в голове
  // — просто «та же картинка, что сверху». И вместе с нулём выпадает ЛЮБОЙ угол с
  // тем же отпечатком: у симметричной фигуры вид с 180° бывает неотличим от вида с
  // 0°, и он так же обесценил бы задание.
  for (const исходная of shuffle(rng, candidates)) {
    /*
     * 🔴 ЭТАЛОН ПОКАЗЫВАЕТСЯ ПОД РАКУРСОМ, ГДЕ ВИДНЫ ВСЕ КУБИКИ.
     *
     * 📍 Отчёт 8db157b4 (17.09.2026, «Точка зрения», раунд 7/10): «кубики изначально
     * не содержат такое количество, впечатление, что ошибочно считается» — на кадре
     * верный ответ выглядит фигурой ИЗ БОЛЬШЕГО ЧИСЛА КУБИКОВ, чем видно на эталоне.
     * Так и было: эталон под своим углом прятал кубик, а вариант с другого угла его
     * открывал. Замер координатора: 500 заданий из 500 со скрытым кубиком.
     *
     * Крутить безопасно: отпечатки ракурсов и все варианты считаются ОТ ЭТОЙ ЖЕ
     * фигуры, ниже по коду, — повернули её, повернулось и всё задание целиком.
     */
    const shape = clearestOrientation(исходная, (варианты) => pick(rng, варианты));
    const distinct = new Map<string, number>();
    for (const a of angles) {
      const key = viewFingerprint(shape, a);
      if (!distinct.has(key)) distinct.set(key, a);
    }
    const offered = [...distinct.values()].filter((a) => a !== 0);
    if (offered.length < p.optionCount) continue;

    const usable = shuffle(rng, offered);
    const degrees = usable[0];
    const options: ViewpointOption[] = [{ degrees, isMatch: true }];
    for (const a of usable.slice(1, p.optionCount)) options.push({ degrees: a, isMatch: false });

    const mixed = shuffle(rng, options);
    return {
      kind: 'viewpoint',
      shape,
      axis: VIEWPOINT_AXIS,
      degrees,
      options: mixed,
      correctIdx: mixed.findIndex((o) => o.isMatch),
    };
  }

  throw new Error(`viewpoint ${level}: нет фигуры с ${p.optionCount} различимыми ракурсами`);
}
