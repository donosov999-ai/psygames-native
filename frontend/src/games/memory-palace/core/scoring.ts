import type {
  DirectionRecallScore,
  MemoryPalaceMetrics,
  MemoryPalaceRound,
  RecallDirection,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isPassed(metrics: MemoryPalaceMetrics): boolean {
  return metrics.accuracy >= 0.7
    && metrics.specific.locationAccuracy >= 0.6
    && metrics.specific.forwardLocationAccuracy >= 0.5
    && metrics.specific.reverseLocationAccuracy >= 0.5;
}

export function scoreRecallDirection(
  direction: RecallDirection,
  forwardPlacements: readonly string[],
  responses: readonly string[],
  targetItemIds: readonly string[],
): DirectionRecallScore {
  const expected = direction === 'forward'
    ? [...forwardPlacements]
    : [...forwardPlacements].reverse();
  const targetSet = new Set(targetItemIds);
  const responseSlice = responses.slice(0, expected.length);
  const itemKnowledgeHits = responseSlice.filter((itemId) => targetSet.has(itemId)).length;
  const locationHits = expected.reduce(
    (total, itemId, index) => total + Number(responseSlice[index] === itemId),
    0,
  );
  const expectedIndex = new Map(expected.map((itemId, index) => [itemId, index]));
  let orderPairHits = 0;
  const orderPairTotal = expected.length * (expected.length - 1) / 2;
  for (let left = 0; left < responseSlice.length; left += 1) {
    for (let right = left + 1; right < responseSlice.length; right += 1) {
      const leftIndex = expectedIndex.get(responseSlice[left] as string);
      const rightIndex = expectedIndex.get(responseSlice[right] as string);
      if (leftIndex !== undefined && rightIndex !== undefined && leftIndex < rightIndex) {
        orderPairHits += 1;
      }
    }
  }
  return {
    direction,
    itemKnowledgeHits,
    locationHits,
    orderPairHits,
    orderPairTotal,
    responses: responseSlice.length,
  };
}

export interface MemoryPalaceScoreOptions {
  durationMs: number;
  placementChanges: number;
}

export function scoreMemoryPalaceCompletion(
  round: MemoryPalaceRound,
  finalizedPlacements: readonly string[],
  forwardResponses: readonly string[],
  reverseResponses: readonly string[],
  options: MemoryPalaceScoreOptions,
): MemoryPalaceMetrics {
  if (finalizedPlacements.length !== round.lociCount) {
    throw new Error('Finalized placements do not cover every locus');
  }
  const targetIds = round.targetItems.map((item) => item.id);
  const directionScores = [
    scoreRecallDirection('forward', finalizedPlacements, forwardResponses, targetIds),
    scoreRecallDirection('reverse', finalizedPlacements, reverseResponses, targetIds),
  ];
  const totalResponses = round.lociCount * directionScores.length;
  const itemKnowledgeHits = directionScores.reduce((sum, score) => sum + score.itemKnowledgeHits, 0);
  const locationHits = directionScores.reduce((sum, score) => sum + score.locationHits, 0);
  const orderPairHits = directionScores.reduce((sum, score) => sum + score.orderPairHits, 0);
  const orderPairTotal = directionScores.reduce((sum, score) => sum + score.orderPairTotal, 0);
  const itemKnowledgeAccuracy = itemKnowledgeHits / totalResponses;
  const locationAccuracy = locationHits / totalResponses;
  const orderAccuracy = orderPairTotal === 0 ? 1 : orderPairHits / orderPairTotal;
  const accuracy = clamp(
    itemKnowledgeAccuracy * 0.35 + locationAccuracy * 0.45 + orderAccuracy * 0.2,
    0,
    1,
  );
  const errors = totalResponses - locationHits;
  return {
    accuracy,
    durationMs: Math.max(0, Math.round(options.durationMs)),
    difficulty: round.difficulty,
    errors,
    score: Math.round(clamp(accuracy * 1_000 + round.difficulty * 4 - errors * 18, 0, 1_500)),
    seed: round.seed,
    generatorVersion: round.generatorVersion,
    details: {
      level: round.level,
    },
    specific: {
      lociCount: round.lociCount,
      targetItemCount: round.targetItems.length,
      distractorCount: round.distractorItems.length,
      placementChanges: Math.max(0, Math.floor(options.placementChanges)),
      itemKnowledgeAccuracy,
      locationAccuracy,
      orderAccuracy,
      forwardLocationAccuracy: directionScores[0]!.locationHits / round.lociCount,
      reverseLocationAccuracy: directionScores[1]!.locationHits / round.lociCount,
      itemKnowledgeHits,
      locationHits,
      orderPairHits,
      orderPairTotal,
      directionScores,
    },
  };
}
