import type {
  ObjectTrackerRound,
  TrackerObjectState,
  TrackerWorld,
} from './types';

const SUBSTEP_MS = 8;
const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function keepInside(object: TrackerObjectState, radius: number): void {
  if (object.x < radius) {
    object.x = radius;
    object.vx = Math.abs(object.vx);
  } else if (object.x > 1 - radius) {
    object.x = 1 - radius;
    object.vx = -Math.abs(object.vx);
  }
  if (object.y < radius) {
    object.y = radius;
    object.vy = Math.abs(object.vy);
  } else if (object.y > 1 - radius) {
    object.y = 1 - radius;
    object.vy = -Math.abs(object.vy);
  }
}

function applyConvergence(
  object: TrackerObjectState,
  strength: number,
  dtSeconds: number,
  nominalSpeed: number,
): void {
  if (strength <= 0) return;
  const dx = 0.5 - object.x;
  const dy = 0.5 - object.y;
  const distance = Math.hypot(dx, dy) || 1;
  const acceleration = strength * 0.055;
  object.vx += dx / distance * acceleration * dtSeconds;
  object.vy += dy / distance * acceleration * dtSeconds;
  const speed = Math.hypot(object.vx, object.vy);
  const cap = nominalSpeed * 1.3;
  if (speed > cap) {
    object.vx = object.vx / speed * cap;
    object.vy = object.vy / speed * cap;
  }
}

function resolvePair(
  left: TrackerObjectState,
  right: TrackerObjectState,
  radius: number,
  leftIndex: number,
  rightIndex: number,
): void {
  let dx = right.x - left.x;
  let dy = right.y - left.y;
  let distance = Math.hypot(dx, dy);
  if (distance < EPSILON) {
    const angle = ((leftIndex + 1) * 17 + (rightIndex + 1) * 29) * 0.61803398875;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }
  const minimumDistance = radius * 2;
  if (distance >= minimumDistance) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimumDistance - distance + 1e-7;
  left.x -= nx * overlap / 2;
  left.y -= ny * overlap / 2;
  right.x += nx * overlap / 2;
  right.y += ny * overlap / 2;

  const leftNormal = left.vx * nx + left.vy * ny;
  const rightNormal = right.vx * nx + right.vy * ny;
  if (leftNormal > rightNormal) {
    const delta = rightNormal - leftNormal;
    left.vx += delta * nx;
    left.vy += delta * ny;
    right.vx -= delta * nx;
    right.vy -= delta * ny;
  }
}

function closePairs(objects: readonly TrackerObjectState[], threshold: number): Set<string> {
  const pairs = new Set<string>();
  for (let left = 0; left < objects.length; left += 1) {
    for (let right = left + 1; right < objects.length; right += 1) {
      const a = objects[left] as TrackerObjectState;
      const b = objects[right] as TrackerObjectState;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= threshold) {
        pairs.add(pairKey(a.id, b.id));
      }
    }
  }
  return pairs;
}

function singleStep(
  round: ObjectTrackerRound,
  objects: TrackerObjectState[],
  dtMs: number,
): void {
  const dtSeconds = dtMs / 1_000;
  for (const object of objects) {
    applyConvergence(object, round.closeApproachStrength, dtSeconds, round.speed);
    object.x += object.vx * dtSeconds;
    object.y += object.vy * dtSeconds;
    keepInside(object, round.objectRadius);
  }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    for (let left = 0; left < objects.length; left += 1) {
      for (let right = left + 1; right < objects.length; right += 1) {
        resolvePair(
          objects[left] as TrackerObjectState,
          objects[right] as TrackerObjectState,
          round.objectRadius,
          left,
          right,
        );
      }
    }
    for (const object of objects) keepInside(object, round.objectRadius);
  }
}

export function cloneTrackerWorld(world: TrackerWorld): TrackerWorld {
  return {
    timeMs: world.timeMs,
    objects: world.objects.map((object) => ({ ...object })),
    closeApproaches: world.closeApproaches,
    closePairs: [...world.closePairs],
  };
}

export function advanceTrackerWorld(
  round: ObjectTrackerRound,
  world: TrackerWorld,
  requestedDeltaMs: number,
): TrackerWorld {
  const remaining = Math.max(0, round.durationMs - world.timeMs);
  const deltaMs = clamp(Number.isFinite(requestedDeltaMs) ? requestedDeltaMs : 0, 0, remaining);
  if (deltaMs <= 0) return cloneTrackerWorld(world);
  const next = cloneTrackerWorld(world);
  let priorClose = new Set(world.closePairs);
  let elapsed = 0;
  while (elapsed < deltaMs - EPSILON) {
    const step = Math.min(SUBSTEP_MS, deltaMs - elapsed);
    singleStep(round, next.objects, step);
    elapsed += step;
    const currentClose = closePairs(next.objects, round.objectRadius * 2 + 0.055);
    for (const key of currentClose) {
      if (!priorClose.has(key)) next.closeApproaches += 1;
    }
    priorClose = currentClose;
  }
  next.timeMs = Math.min(round.durationMs, world.timeMs + deltaMs);
  next.closePairs = [...priorClose].sort();
  return next;
}

export function simulateTrackerRound(
  round: ObjectTrackerRound,
  sampleMs = 50,
): TrackerWorld[] {
  const frames = [cloneTrackerWorld(round.initialWorld)];
  let world = frames[0] as TrackerWorld;
  while (world.timeMs < round.durationMs) {
    world = advanceTrackerWorld(round, world, sampleMs);
    frames.push(world);
  }
  return frames;
}
