/* psygames-object-tracker-generator · VER 1 · 19.08.2026 */
import { createRng, normalizeSeed, shuffle } from './rng';
import {
  OBJECT_TRACKER_GENERATOR_VERSION,
  LEVELS,
  TRACKER_OBJECT_RADIUS,
  type ObjectTrackerRound,
  type TrackerObjectState,
} from './types';
import { validateObjectTrackerRound } from './validator';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function objectCountForLevel(level: number): number {
  return Math.min(12, 4 + Math.floor((level - 1) / 3));
}

function targetCountForLevel(level: number, objectCount: number): number {
  return Math.min(5, objectCount - 1, 1 + Math.floor((level - 1) / 8));
}

function gridPositions(count: number): { x: number; y: number }[] {
  const columns = Math.min(4, count);
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => ({
    x: (index % columns + 0.5) / columns,
    y: (Math.floor(index / columns) + 0.5) / rows,
  }));
}

export function generateObjectTrackerRound(seed: string, requestedLevel: number): ObjectTrackerRound {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  const rng = createRng(`${normalizedSeed}:${level}:${OBJECT_TRACKER_GENERATOR_VERSION}`);
  const objectCount = objectCountForLevel(level);
  const targetCount = targetCountForLevel(level, objectCount);
  const speedTier = Math.min(10, Math.floor((level - 1) / 3));
  const durationTier = Math.min(10, Math.floor((level - 1) / 4));
  const closeApproachTier = Math.min(8, Math.floor((level - 1) / 5));
  const speed = 0.085 + speedTier * 0.012;
  const durationMs = 2_800 + durationTier * 450;
  const closeApproachStrength = closeApproachTier / 8;
  const positions = shuffle(rng, gridPositions(objectCount));
  const objects: TrackerObjectState[] = positions.map((position, index) => {
    const randomAngle = rng() * Math.PI * 2;
    const centerAngle = Math.atan2(0.5 - position.y, 0.5 - position.x);
    const blend = closeApproachStrength * 0.35;
    const vx = Math.cos(randomAngle) * (1 - blend) + Math.cos(centerAngle) * blend;
    const vy = Math.sin(randomAngle) * (1 - blend) + Math.sin(centerAngle) * blend;
    const magnitude = Math.hypot(vx, vy) || 1;
    return {
      id: `object-${index + 1}`,
      x: position.x,
      y: position.y,
      vx: vx / magnitude * speed,
      vy: vy / magnitude * speed,
    };
  });
  const targetIds = shuffle(rng, objects.map((object) => object.id)).slice(0, targetCount).sort();
  const difficulty = clamp(Math.round(
    4
    + objectCount * 3.5
    + targetCount * 6
    + speedTier * 2
    + durationTier * 1.5
    + closeApproachTier * 2.5,
  ), 1, 100);
  const round: ObjectTrackerRound = {
    id: `object-tracker:${normalizedSeed}:${level}`,
    seed: normalizedSeed,
    level,
    difficulty,
    objectCount,
    targetCount,
    targetIds,
    initialWorld: {
      timeMs: 0,
      objects,
      closeApproaches: 0,
      closePairs: [],
    },
    objectRadius: TRACKER_OBJECT_RADIUS,
    speed,
    speedTier,
    durationMs,
    durationTier,
    closeApproachStrength,
    closeApproachTier,
    generatorVersion: OBJECT_TRACKER_GENERATOR_VERSION,
  };
  const issues = validateObjectTrackerRound(round);
  if (issues.length > 0) throw new Error(`Generated invalid Object Tracker round: ${issues.join(', ')}`);
  return round;
}
