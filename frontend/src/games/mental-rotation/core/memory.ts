/* psygames-mental-rotation-memory · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 69f1810f */
/**
 * «ПАМЯТЬ»: ПОКАЗАЛИ — СПРЯТАЛИ — УЗНАЙ ПОВЁРНУТОЙ.
 *
 * Решение Дениса 17.09.2026, дословно: «это твой движок и твоя территория ротации) все
 * упражнения на ментальное вращение используют память) чтобы повернуть в уме надо помнить)».
 * Поэтому режим — не «зрительная память с кубиками», а поворотное задание, в котором эталон
 * приходится держать в голове: варианты появляются ПОСЛЕ того, как фигура исчезла, и они
 * повёрнуты. Удержать образ и повернуть его — одно упражнение, а не два.
 *
 * Задание собирает тот же генератор, что «Поворот» (`buildRotationTask`): те же фигуры, путь
 * поворота, подделки-зеркала и перестановки, проверенные перебором 24 ориентаций. Новое одно —
 * время показа.
 *
 * 🔴 ВРЕМЯ ПОКАЗА — ПАРАМЕТР СТУПЕНИ, А НЕ КОНСТАНТА ЭКРАНА. На нём строится лестница режима
 * (вторая ось — фигура, растёт вместе с уровнем, как у «Поворота»): с 13-го уровня 5 секунд,
 * к 50-му — 1,5. Шаг 100 мс: мельче глаз не различит, а числа остаются читаемыми.
 */
import { buildRotationTask } from './rotation';
import type { MemoryTask, Rng } from './types';

/** Уровень, с которого открывается «Память» (он же в `KIND_UNLOCK`). */
export const MEMORY_FROM_LEVEL = 13;
export const MEMORY_EXPOSURE_START_MS = 5000;
export const MEMORY_EXPOSURE_END_MS = 1500;

/** Время показа эталона на уровне: от 5 с на 13-м до 1,5 с на 50-м, дальше не короче. */
export function memoryExposureMs(level: number): number {
  const шагов = 50 - MEMORY_FROM_LEVEL;
  const k = Math.min(1, Math.max(0, (Math.floor(level) - MEMORY_FROM_LEVEL) / шагов));
  const ms = MEMORY_EXPOSURE_START_MS - (MEMORY_EXPOSURE_START_MS - MEMORY_EXPOSURE_END_MS) * k;
  return Math.round(ms / 100) * 100;
}

export function buildMemoryTask(level: number, rng: Rng): MemoryTask {
  const поворот = buildRotationTask(level, rng);
  return { ...поворот, kind: 'memory', exposureMs: memoryExposureMs(level) };
}
