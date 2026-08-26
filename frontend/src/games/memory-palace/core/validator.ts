/* psygames-memory-palace-validator · VER 1 · 19.08.2026 */
import { FIXED_PALACE_ROUTE } from './content';
import { LEVELS, type MemoryPalaceRound } from './types';

function duplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validateMemoryPalaceRound(round: MemoryPalaceRound): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(round.level) || round.level < 1 || round.level > LEVELS) {
    issues.push('invalid level');
  }
  if (round.difficulty < 1 || round.difficulty > 100) issues.push('invalid difficulty');
  if (round.lociCount < 5 || round.lociCount > 12) issues.push('loci count outside 5..12');
  if (round.loci.length !== round.lociCount) issues.push('loci length mismatch');
  if (round.targetItems.length !== round.lociCount) issues.push('target item count mismatch');
  if (round.distractorItems.length < 2 || round.distractorItems.length > 4) issues.push('distractor count outside 2..4');
  if (round.recallCandidates.length !== round.targetItems.length + round.distractorItems.length) {
    issues.push('candidate count mismatch');
  }

  const locusIds = round.loci.map((locus) => locus.id);
  const expectedLocusIds = FIXED_PALACE_ROUTE.slice(0, round.lociCount).map((locus) => locus.id);
  if (duplicates(locusIds)) issues.push('duplicate locus');
  if (JSON.stringify(locusIds) !== JSON.stringify(expectedLocusIds)) issues.push('fixed route changed');
  if (round.loci.some((locus, index) => locus.order !== index + 1)) issues.push('locus order mismatch');

  const targetIds = round.targetItems.map((item) => item.id);
  const distractorIds = round.distractorItems.map((item) => item.id);
  const candidateIds = round.recallCandidates.map((item) => item.id);
  if (duplicates(targetIds)) issues.push('duplicate target item');
  if (duplicates(distractorIds)) issues.push('duplicate distractor item');
  if (targetIds.some((id) => distractorIds.includes(id))) issues.push('target/distractor overlap');
  if (duplicates(candidateIds)) issues.push('duplicate recall candidate');
  const expectedCandidates = [...targetIds, ...distractorIds].sort();
  if (JSON.stringify([...candidateIds].sort()) !== JSON.stringify(expectedCandidates)) {
    issues.push('candidate membership mismatch');
  }
  if (round.targetItems.some((item) => !item.label.ru || !item.label.en)) issues.push('target label missing');
  if (round.loci.some((locus) => !locus.label.ru || !locus.label.en)) issues.push('locus label missing');
  if (round.directions[0] !== 'forward' || round.directions[1] !== 'reverse') issues.push('directions mismatch');
  return issues;
}
