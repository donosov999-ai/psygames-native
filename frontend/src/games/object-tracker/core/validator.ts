import type {
  ObjectTrackerRound,
  TrackerWorld,
  TrackerWorldValidation,
} from './types';

export function validateTrackerWorld(
  round: ObjectTrackerRound,
  world: TrackerWorld,
  previous?: TrackerWorld,
  deltaMs = 0,
): TrackerWorldValidation {
  const issues: string[] = [];
  const ids = new Set<string>();
  let insideField = true;
  let finite = true;
  let minimumGap = Number.POSITIVE_INFINITY;
  let maximumDisplacement = 0;
  const previousById = new Map(previous?.objects.map((object) => [object.id, object]) ?? []);
  for (const object of world.objects) {
    if (ids.has(object.id)) issues.push(`duplicate object ${object.id}`);
    ids.add(object.id);
    if (![object.x, object.y, object.vx, object.vy].every(Number.isFinite)) finite = false;
    if (object.x < round.objectRadius - 1e-7 || object.x > 1 - round.objectRadius + 1e-7
      || object.y < round.objectRadius - 1e-7 || object.y > 1 - round.objectRadius + 1e-7) {
      insideField = false;
    }
    const prior = previousById.get(object.id);
    if (prior) maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(object.x - prior.x, object.y - prior.y));
  }
  if (!finite) issues.push('non-finite object state');
  if (!insideField) issues.push('object outside field');
  if (world.objects.length !== round.objectCount) issues.push('object count mismatch');
  for (let left = 0; left < world.objects.length; left += 1) {
    for (let right = left + 1; right < world.objects.length; right += 1) {
      const a = world.objects[left];
      const b = world.objects[right];
      if (!a || !b) continue;
      minimumGap = Math.min(minimumGap, Math.hypot(a.x - b.x, a.y - b.y) - round.objectRadius * 2);
    }
  }
  const nonOverlapping = minimumGap >= -2e-6;
  if (!nonOverlapping) issues.push(`objects overlap by ${-minimumGap}`);
  if (previous && deltaMs > 0) {
    const generousMaximum = round.speed * 1.4 * deltaMs / 1_000 + 0.003;
    if (maximumDisplacement > generousMaximum) issues.push(`teleport displacement ${maximumDisplacement}`);
  }
  return {
    valid: issues.length === 0,
    insideField,
    nonOverlapping,
    finite,
    minimumGap: Number.isFinite(minimumGap) ? minimumGap : 1,
    maximumDisplacement,
    issues,
  };
}

export function validateObjectTrackerRound(round: ObjectTrackerRound): string[] {
  const issues: string[] = [];
  if (round.objectCount < 4 || round.objectCount > 12) issues.push(`object count ${round.objectCount}`);
  if (round.targetCount < 1 || round.targetCount > 5 || round.targetCount >= round.objectCount) {
    issues.push(`target count ${round.targetCount}`);
  }
  if (round.targetIds.length !== round.targetCount || new Set(round.targetIds).size !== round.targetCount) {
    issues.push('invalid target IDs');
  }
  const objectIds = new Set(round.initialWorld.objects.map((object) => object.id));
  if (round.targetIds.some((id) => !objectIds.has(id))) issues.push('target missing from world');
  if (round.initialWorld.timeMs !== 0) issues.push('initial time is not zero');
  if (round.durationMs < 2_000 || round.durationMs > 10_000) issues.push('duration outside contract');
  if (round.speed <= 0 || round.speed > 0.3) issues.push('speed outside contract');
  if (round.closeApproachStrength < 0 || round.closeApproachStrength > 1) issues.push('close pressure outside 0..1');
  issues.push(...validateTrackerWorld(round, round.initialWorld).issues);
  return issues;
}
