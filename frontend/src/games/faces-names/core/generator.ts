import {
  FACT_LIBRARY,
  SYNTHETIC_PERSON_LIBRARY,
  combinedPersonDistance,
  faceDistance,
  factDistance,
  nameDistance,
} from './content';
import {
  createRng,
  normalizeSeed,
  randomInt,
  shuffle,
  type Rng,
} from './rng';
import {
  FACES_NAMES_GENERATOR_VERSION,
  type FacesNamesPuzzle,
  type FacesNamesTrial,
  type InterferencePrompt,
  type SyntheticPerson,
} from './types';
import { validateFacesNamesPuzzle } from './validator';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function personCountForLevel(level: number): number {
  return Math.min(12, 2 + Math.floor((level - 1) / 3));
}

function meanPairSimilarity(
  people: readonly SyntheticPerson[],
  distance: (left: SyntheticPerson, right: SyntheticPerson) => number,
): number {
  let total = 0;
  let count = 0;
  for (let left = 0; left < people.length; left += 1) {
    for (let right = left + 1; right < people.length; right += 1) {
      total += 1 - distance(people[left] as SyntheticPerson, people[right] as SyntheticPerson);
      count += 1;
    }
  }
  return count === 0 ? 0 : round(total / count);
}

function chooseStudiedPeople(rng: Rng, count: number, closeness: number): SyntheticPerson[] {
  const shuffled = shuffle(rng, SYNTHETIC_PERSON_LIBRARY);
  const anchor = shuffled[0] as SyntheticPerson;
  const chosen = [anchor];
  const remaining = shuffled.slice(1);
  while (chosen.length < count) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index] as SyntheticPerson;
      const minimumDistance = Math.min(...chosen.map((person) => combinedPersonDistance(person, candidate)));
      const desiredDistance = 0.9 - closeness * 0.74;
      const score = Math.abs(minimumDistance - desiredDistance) + rng() * 0.005;
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    chosen.push(remaining.splice(bestIndex, 1)[0] as SyntheticPerson);
  }
  return chosen;
}

function chooseControlledPeople(
  rng: Rng,
  target: SyntheticPerson,
  candidates: readonly SyntheticPerson[],
  count: number,
  closeness: number,
  distance: (left: SyntheticPerson, right: SyntheticPerson) => number,
): SyntheticPerson[] {
  const desiredDistance = 0.88 - closeness * 0.72;
  return shuffle(rng, candidates)
    .sort((left, right) => (
      Math.abs(distance(target, left) - desiredDistance)
      - Math.abs(distance(target, right) - desiredDistance)
    ))
    .slice(0, count);
}

function chooseControlledFacts(
  rng: Rng,
  targetFactId: string,
  count: number,
  closeness: number,
): string[] {
  const desiredDistance = closeness >= 0.5 ? 0.2 : 0.9;
  return shuffle(rng, FACT_LIBRARY.filter((fact) => fact.id !== targetFactId))
    .sort((left, right) => (
      Math.abs(factDistance(targetFactId, left.id) - desiredDistance)
      - Math.abs(factDistance(targetFactId, right.id) - desiredDistance)
    ))
    .slice(0, count)
    .map((fact) => fact.id);
}

function createInterferencePrompts(rng: Rng, count: number): InterferencePrompt[] {
  return Array.from({ length: count }, (_, index) => {
    const left = randomInt(rng, 1, 9);
    const right = randomInt(rng, 1, 9);
    const answer = left + right;
    const options = new Set<number>([answer]);
    while (options.size < 3) {
      const offset = randomInt(rng, 1, 3) * (rng() < 0.5 ? -1 : 1);
      options.add(Math.max(1, answer + offset));
    }
    return {
      id: `interference-${index}`,
      left,
      right,
      answer,
      options: shuffle(rng, [...options]),
    };
  });
}

export function generateFacesNamesPuzzle(seed: string, requestedLevel: number): FacesNamesPuzzle {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.max(1, Math.floor(requestedLevel));
  const rng = createRng(`${normalizedSeed}:${level}:${FACES_NAMES_GENERATOR_VERSION}`);
  const closeness = clamp((level - 1) / 32, 0, 1);
  const studiedPeople = chooseStudiedPeople(rng, personCountForLevel(level), closeness);
  const studiedIds = new Set(studiedPeople.map((person) => person.id));
  const recognitionOptionCount = Math.min(4, 2 + Math.floor((level - 1) / 8));
  const nameOptionCount = recognitionOptionCount;
  const factRecallEnabled = level >= 8;
  const immediateRecall = level <= 4;
  const trialTargets = level >= 5 ? shuffle(rng, studiedPeople) : [...studiedPeople];
  const peopleById = new Map(studiedPeople.map((person) => [person.id, person]));
  let recognitionSimilarityTotal = 0;
  let recognitionDistractorCount = 0;

  const trials: FacesNamesTrial[] = trialTargets.map((target, index) => {
    const recognitionDistractors = chooseControlledPeople(
      rng,
      target,
      SYNTHETIC_PERSON_LIBRARY.filter((person) => !studiedIds.has(person.id)),
      recognitionOptionCount - 1,
      closeness,
      faceDistance,
    );
    const nameDistractors = chooseControlledPeople(
      rng,
      target,
      SYNTHETIC_PERSON_LIBRARY.filter((person) => person.id !== target.id),
      nameOptionCount - 1,
      closeness,
      nameDistance,
    );
    for (const person of [...recognitionDistractors, ...nameDistractors]) {
      peopleById.set(person.id, person);
    }
    for (const distractor of recognitionDistractors) {
      recognitionSimilarityTotal += 1 - faceDistance(target, distractor);
      recognitionDistractorCount += 1;
    }
    const factIds = factRecallEnabled
      ? shuffle(rng, [
        target.factId,
        ...chooseControlledFacts(rng, target.factId, nameOptionCount - 1, closeness),
      ])
      : [];
    return {
      id: `trial-${index}`,
      targetPersonId: target.id,
      recognitionPersonIds: shuffle(rng, [target.id, ...recognitionDistractors.map((person) => person.id)]),
      namePersonIds: shuffle(rng, [target.id, ...nameDistractors.map((person) => person.id)]),
      factIds,
    };
  });

  const interferenceCount = immediateRecall ? 1 : Math.min(6, 2 + Math.floor((level - 5) / 7));
  const meanFaceSimilarity = meanPairSimilarity(studiedPeople, faceDistance);
  const meanNameSimilarity = meanPairSimilarity(studiedPeople, nameDistance);
  const meanRecognitionDistractorSimilarity = recognitionDistractorCount === 0
    ? 0
    : round(recognitionSimilarityTotal / recognitionDistractorCount);
  const difficulty = clamp(Math.round(
    5
    + studiedPeople.length * 4
    + interferenceCount * 3
    + recognitionOptionCount * 3
    + meanFaceSimilarity * 14
    + meanNameSimilarity * 10
    + meanRecognitionDistractorSimilarity * 12
    + (factRecallEnabled ? 10 : 0)
    + (immediateRecall ? 0 : 5),
  ), 1, 100);
  const puzzle: FacesNamesPuzzle = {
    id: `faces-names:${normalizedSeed}:${level}`,
    seed: normalizedSeed,
    level,
    difficulty,
    people: [...peopleById.values()],
    studiedPersonIds: studiedPeople.map((person) => person.id),
    trials,
    interferencePrompts: createInterferencePrompts(rng, interferenceCount),
    factRecallEnabled,
    immediateRecall,
    meanFaceSimilarity,
    meanNameSimilarity,
    meanRecognitionDistractorSimilarity,
    generatorVersion: FACES_NAMES_GENERATOR_VERSION,
  };
  const validation = validateFacesNamesPuzzle(puzzle);
  if (!validation.valid) {
    throw new Error(`Generated invalid Faces & Names puzzle: ${validation.issues.join(', ')}`);
  }
  return puzzle;
}

export function personById(puzzle: FacesNamesPuzzle, id: string): SyntheticPerson | null {
  return puzzle.people.find((person) => person.id === id) ?? null;
}
