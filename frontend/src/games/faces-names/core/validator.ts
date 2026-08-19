import { factById } from './content';
import type { FacesNamesPuzzle, FacesNamesValidation } from './types';

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

export function validateFacesNamesPuzzle(puzzle: FacesNamesPuzzle): FacesNamesValidation {
  const issues: string[] = [];
  const personIds = puzzle.people.map((person) => person.id);
  const personById = new Map(puzzle.people.map((person) => [person.id, person]));
  const studied = new Set(puzzle.studiedPersonIds);

  for (const id of duplicates(personIds)) issues.push(`duplicate person id ${id}`);
  for (const assetId of duplicates(puzzle.people.map((person) => person.face.assetId))) {
    issues.push(`face asset reused under multiple people: ${assetId}`);
  }
  for (const fingerprint of duplicates(puzzle.people.map((person) => person.face.fingerprint))) {
    issues.push(`face fingerprint reused under multiple people: ${fingerprint}`);
  }
  for (const name of duplicates(puzzle.people.map((person) => person.name))) {
    issues.push(`duplicate person name ${name}`);
  }
  if (puzzle.people.some((person) => person.face.source !== 'procedural-synthetic')) {
    issues.push('non-synthetic face source');
  }
  if (duplicates(puzzle.studiedPersonIds).length > 0) issues.push('duplicate studied person');
  if (studied.size < 2 || studied.size > 12) issues.push(`studied person count ${studied.size}`);
  for (const id of studied) {
    if (!personById.has(id)) issues.push(`missing studied person ${id}`);
  }
  if (puzzle.trials.length !== studied.size) issues.push('trial count differs from studied count');
  const trialTargets = puzzle.trials.map((trial) => trial.targetPersonId);
  if (duplicates(trialTargets).length > 0) issues.push('duplicate trial target');
  if (trialTargets.some((id) => !studied.has(id))) issues.push('trial target was not studied');
  if ([...studied].some((id) => !trialTargets.includes(id))) issues.push('studied person lacks a trial');

  for (const trial of puzzle.trials) {
    const target = personById.get(trial.targetPersonId);
    if (!target) {
      issues.push(`missing target ${trial.targetPersonId}`);
      continue;
    }
    if (new Set(trial.recognitionPersonIds).size !== trial.recognitionPersonIds.length) {
      issues.push(`duplicate recognition option ${trial.id}`);
    }
    if (trial.recognitionPersonIds.filter((id) => id === target.id).length !== 1) {
      issues.push(`recognition target count ${trial.id}`);
    }
    if (trial.recognitionPersonIds.length < 2 || trial.recognitionPersonIds.length > 4) {
      issues.push(`recognition option count ${trial.id}`);
    }
    for (const optionId of trial.recognitionPersonIds) {
      if (!personById.has(optionId)) issues.push(`missing recognition option ${optionId}`);
      if (optionId !== target.id && studied.has(optionId)) {
        issues.push(`recognition distractor was studied ${optionId}`);
      }
    }

    if (new Set(trial.namePersonIds).size !== trial.namePersonIds.length) {
      issues.push(`duplicate name option ${trial.id}`);
    }
    if (trial.namePersonIds.filter((id) => id === target.id).length !== 1) {
      issues.push(`name target count ${trial.id}`);
    }
    if (trial.namePersonIds.length < 2 || trial.namePersonIds.length > 4) {
      issues.push(`name option count ${trial.id}`);
    }
    if (trial.namePersonIds.some((id) => !personById.has(id))) {
      issues.push(`missing name option ${trial.id}`);
    }

    if (puzzle.factRecallEnabled) {
      if (new Set(trial.factIds).size !== trial.factIds.length) {
        issues.push(`duplicate fact option ${trial.id}`);
      }
      if (trial.factIds.filter((id) => id === target.factId).length !== 1) {
        issues.push(`fact target count ${trial.id}`);
      }
      if (trial.factIds.length < 2 || trial.factIds.length > 4) {
        issues.push(`fact option count ${trial.id}`);
      }
      if (trial.factIds.some((id) => !factById(id))) issues.push(`missing fact ${trial.id}`);
    } else if (trial.factIds.length !== 0) {
      issues.push(`facts enabled too early ${trial.id}`);
    }
  }

  if (puzzle.interferencePrompts.length < 1 || puzzle.interferencePrompts.length > 6) {
    issues.push(`interference count ${puzzle.interferencePrompts.length}`);
  }
  for (const prompt of puzzle.interferencePrompts) {
    if (prompt.answer !== prompt.left + prompt.right) issues.push(`wrong interference answer ${prompt.id}`);
    if (!prompt.options.includes(prompt.answer)) issues.push(`missing interference answer ${prompt.id}`);
    if (new Set(prompt.options).size !== prompt.options.length) issues.push(`duplicate interference option ${prompt.id}`);
  }
  for (const value of [
    puzzle.difficulty,
    puzzle.meanFaceSimilarity,
    puzzle.meanNameSimilarity,
    puzzle.meanRecognitionDistractorSimilarity,
  ]) {
    if (!Number.isFinite(value)) issues.push('non-finite puzzle metric');
  }
  if (puzzle.difficulty < 1 || puzzle.difficulty > 100) issues.push('difficulty outside 1..100');
  for (const value of [
    puzzle.meanFaceSimilarity,
    puzzle.meanNameSimilarity,
    puzzle.meanRecognitionDistractorSimilarity,
  ]) {
    if (value < 0 || value > 1) issues.push('similarity outside 0..1');
  }
  return { valid: issues.length === 0, issues };
}
