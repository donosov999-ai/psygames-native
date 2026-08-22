/* psygames-mental-rotation-session · VER 1 · 23.08.2026 */
/**
 * СМЕСЬ ЗАДАНИЙ — И БИОМАРКЕР, КОТОРЫЙ ОТ НЕЁ НЕ ПОРТИТСЯ.
 *
 * 🔴 ГЛАВНАЯ ОПАСНОСТЬ НОВЫХ ВИДОВ ЗАДАНИЙ. У игры есть НАСТОЯЩАЯ измеряемая
 * величина — `angle_response_slope`, наклон времени ответа по углу поворота
 * (мс/градус). Она осмысленна ровно там, где угол ОПРЕДЕЛЁН. У проекции и
 * развёртки угла нет вовсе; сложи их в ту же регрессию — и наклон станет шумом,
 * который выглядит как измерение. Поэтому:
 *
 *   · вид задания пишется в КАЖДУЮ запись пробы и уезжает в сессию;
 *   · в регрессию берутся ТОЛЬКО поворотные пробы с известным углом;
 *   · доля поворотных проб в партии не опускается ниже 60% — иначе точек для
 *     наклона остаётся слишком мало, и величина теряет смысл тихо, без ошибки.
 *
 * ⚠️ ОТБОР ПРОБ — ФУНКЦИЯ, А НЕ ПРАВИЛО В ГОЛОВЕ. «Не забыть проверить вид
 * задания перед записью точки» — это то самое место, где через месяц потеряется
 * условие. Здесь отбор один, и проба в прогоне кормит его проекциями и
 * развёртками, требуя, чтобы наклон их не заметил.
 */
import { buildNetTask } from './net';
import { buildProjectionTask } from './projection';
import { buildRotationTask, levelParams } from './rotation';
import { shuffle } from './rng';
import type { MentalRotationTask, Rng, TaskKind } from './types';

/** С какого уровня появляется вид задания. Поворот — с первого и всегда. */
export const KIND_UNLOCK: Record<TaskKind, number> = { rotation: 1, projection: 3, net: 5 };

/** Ниже этой доли поворотных проб партия опускаться не должна — см. шапку. */
export const MIN_ROTATION_SHARE = 0.6;

export function unlockedKinds(level: number): TaskKind[] {
  return (Object.keys(KIND_UNLOCK) as TaskKind[]).filter((k) => level >= KIND_UNLOCK[k]);
}

/**
 * План партии: какой пробе быть каким заданием.
 *
 * Первая проба всегда поворотная: партия начинается с того, ради чего игра и
 * заведена, а новые виды подмешиваются дальше и вразбивку — подряд идущие
 * однотипные пробы человек проходит на инерции.
 */
export function planTaskKinds(level: number, trials: number, rng: Rng): TaskKind[] {
  const plan: TaskKind[] = Array.from({ length: Math.max(0, trials) }, () => 'rotation');
  const extras = unlockedKinds(level).filter((k) => k !== 'rotation');
  if (plan.length < 3 || extras.length === 0) return plan;

  const rotationMin = Math.max(2, Math.ceil(plan.length * MIN_ROTATION_SHARE));
  const extraCount = Math.max(0, plan.length - rotationMin);
  if (extraCount === 0) return plan;

  const positions: number[] = [];
  for (let i = 1; i <= extraCount; i++) {
    let at = Math.round((i * plan.length) / (extraCount + 1));
    if (at < 1) at = 1;
    if (at > plan.length - 1) at = plan.length - 1;
    while (positions.includes(at) && at > 1) at--;
    while (positions.includes(at) && at < plan.length - 1) at++;
    if (!positions.includes(at)) positions.push(at);
  }

  const order = shuffle(rng, extras);
  positions.forEach((at, i) => { plan[at] = order[i % order.length] as TaskKind; });
  return plan;
}

export function buildTask(kind: TaskKind, level: number, rng: Rng): MentalRotationTask {
  const p = levelParams(level);
  if (kind === 'projection') {
    return buildProjectionTask({ minCubes: p.minC, maxCubes: p.maxC, optionCount: p.optionCount }, rng);
  }
  if (kind === 'net') return buildNetTask({ optionCount: p.optionCount }, rng);
  return buildRotationTask(level, rng);
}

// ─── замер ────────────────────────────────────────────────────────────────

export interface TrialRecord {
  kind: TaskKind;
  /** Угол поворота в градусах. У проекции и развёртки его нет — 0. */
  angle: number;
  /** Время ответа, мс. */
  rt: number;
  correct: boolean;
}

/**
 * Точки для регрессии: только поворотные пробы, только верные ответы, только с
 * ненулевым углом. Ошибочный ответ временем не измеряется — человек мог гадать.
 */
export function slopeSamples(records: readonly TrialRecord[]): { angle: number; rt: number }[] {
  return records
    .filter((r) => r.kind === 'rotation' && r.correct && r.angle > 0)
    .map((r) => ({ angle: r.angle, rt: r.rt }));
}

/** Наклон RT по углу (мс/градус). Меньше — быстрее ротация в голове. */
export function angleResponseSlope(records: readonly TrialRecord[]): number {
  const pairs = slopeSamples(records);
  if (pairs.length < 2) return 0;
  const n = pairs.length;
  const sumX = pairs.reduce((s, p) => s + p.angle, 0);
  const sumY = pairs.reduce((s, p) => s + p.rt, 0);
  const sumXY = pairs.reduce((s, p) => s + p.angle * p.rt, 0);
  const sumXX = pairs.reduce((s, p) => s + p.angle * p.angle, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;                 // все углы одинаковы — наклона нет
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Среднее время по ТЕМ ЖЕ пробам, что и наклон. Не по всем верным ответам:
 * проекция и развёртка отвечаются в другом темпе, и общее среднее перестало бы
 * сравниваться с прежними партиями этой же игры.
 */
export function meanSlopeRt(records: readonly TrialRecord[]): number {
  const pairs = slopeSamples(records);
  if (pairs.length === 0) return 0;
  return Math.round(pairs.reduce((s, p) => s + p.rt, 0) / pairs.length);
}

export function taskKindCounts(records: readonly TrialRecord[]): Record<TaskKind, number> {
  const out: Record<TaskKind, number> = { rotation: 0, projection: 0, net: 0 };
  for (const r of records) out[r.kind] += 1;
  return out;
}
