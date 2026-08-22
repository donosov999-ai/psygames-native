/* psygames-mental-rotation-replay · VER 1 · 23.08.2026 */
/**
 * РАЗБОР ОТВЕТА: ПОКАЗАТЬ САМ ПОВОРОТ.
 *
 * 🔴 ЧТО БЫЛО. После промаха человек видел красную рамку и слово «неверно» — и
 * ровно ничего не узнавал: почему вот ТОТ вариант законный поворот, а выбранный
 * зеркало, оставалось загадкой. Это и есть самая полезная часть подобных
 * тренажёров: не вердикт, а показанное движение.
 *
 * Кадры строятся по записанному пути (`RotationTask.steps`): эталон → 90° →
 * 90° → … → правильный вариант. Промежуточные ориентации человек видит одну за
 * другой и достраивает поворот глазами, а не догадкой.
 *
 * ⚠️ ПОСЛЕДНИЙ КАДР ОБЯЗАН СОВПАСТЬ С ПРАВИЛЬНЫМ ВАРИАНТОМ. Иначе разбор врёт
 * убедительнее, чем молчание: показанный поворот приводит не туда, куда указан
 * ответ. Совпадение — не обещание в комментарии, а проба в прогоне.
 */
import { normalizeShape, rotateShape } from './geometry';
import type { Axis, RotationTask, Shape } from './types';

export interface ReplayFrame {
  /** Номер кадра: 0 — эталон как есть, дальше по одному повороту на 90°. */
  index: number;
  shape: Shape;
  /** Вокруг какой оси пришли в этот кадр. У нулевого кадра оси нет. */
  axis: Axis | null;
}

export function rotationReplay(task: RotationTask): ReplayFrame[] {
  const frames: ReplayFrame[] = [{ index: 0, shape: normalizeShape(task.base), axis: null }];
  let current = task.base;
  task.steps.forEach((step, i) => {
    current = rotateShape(current, step.axis, 1);
    frames.push({ index: i + 1, shape: normalizeShape(current), axis: step.axis });
  });
  return frames;
}
