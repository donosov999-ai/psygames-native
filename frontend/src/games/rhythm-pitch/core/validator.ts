import type { RhythmPitchRound } from './types';

export const COMFORTABLE_MIN_FREQUENCY_HZ = 196;
export const COMFORTABLE_MAX_FREQUENCY_HZ = 880;

export function validateRhythmPitchRound(round: RhythmPitchRound): string[] {
  const issues: string[] = [];
  if (round.level < 1 || !Number.isInteger(round.level)) issues.push(`level ${round.level}`);
  if (round.difficulty < 1 || round.difficulty > 100) issues.push(`difficulty ${round.difficulty}`);
  if (round.mode === 'rhythm-echo') {
    if (round.beatCount < 3 || round.beatCount > 12) issues.push(`beat count ${round.beatCount}`);
    if (round.bpm < 60 || round.bpm > 160) issues.push(`BPM ${round.bpm}`);
    if (round.beats.length !== round.beatCount) issues.push('beat length mismatch');
    let prior = -1;
    for (const [index, beat] of round.beats.entries()) {
      if (!Number.isFinite(beat.onsetMs) || beat.onsetMs < 0 || beat.onsetMs <= prior) {
        if (index > 0 || beat.onsetMs !== 0) issues.push(`invalid onset ${index}`);
      }
      prior = beat.onsetMs;
    }
    const intervals = round.beats.slice(1).map((beat, index) => beat.onsetMs - round.beats[index]!.onsetMs);
    const pauseCount = intervals.filter((value) => Math.abs(value - round.unitMs * 2) < 0.01).length;
    const syncopationCount = intervals.filter((value) => (
      Math.abs(value - round.unitMs * 0.5) < 0.01 || Math.abs(value - round.unitMs * 1.5) < 0.01
    )).length;
    if (pauseCount !== round.pauseCount) issues.push('pause count mismatch');
    if (syncopationCount !== round.syncopationCount) issues.push('syncopation count mismatch');
    if (round.beats.filter((beat) => beat.accent).length !== round.accentCount) issues.push('accent count mismatch');
    if (round.level < 4 && round.pauseCount > 0) issues.push('pause introduced before level 4');
    if (round.level < 7 && round.syncopationCount > 0) issues.push('syncopation introduced before level 7');
    if (round.level < 5 && round.accentCount > 0) issues.push('accent introduced before level 5');
  } else {
    if (round.task === 'direction') {
      if (round.toneCount !== 2 || round.pitchLevelCount !== 2) issues.push('direction task shape');
      if (!round.directionAnswer) issues.push('direction answer missing');
    } else {
      if (round.toneCount < 3 || round.toneCount > 10) issues.push(`tone count ${round.toneCount}`);
      if (round.pitchLevelCount !== 3) issues.push('sequence must use three pitch levels');
      if (round.directionAnswer !== null) issues.push('sequence direction answer must be null');
    }
    if (round.sequence.length !== round.toneCount) issues.push('pitch sequence length mismatch');
    if (round.sequence.some((value) => !Number.isInteger(value) || value < 0 || value >= round.pitchLevelCount)) {
      issues.push('pitch sequence index outside levels');
    }
    if (round.frequenciesHz.length !== round.pitchLevelCount) issues.push('frequency level mismatch');
    if (round.frequenciesHz.some((frequency) => (
      !Number.isFinite(frequency)
      || frequency < COMFORTABLE_MIN_FREQUENCY_HZ
      || frequency > COMFORTABLE_MAX_FREQUENCY_HZ
    ))) issues.push('frequency outside comfortable range');
    for (let index = 1; index < round.frequenciesHz.length; index += 1) {
      if (round.frequenciesHz[index]! <= round.frequenciesHz[index - 1]!) issues.push('frequencies not ascending');
    }
    if (round.intervalSemitones < 1 || round.intervalSemitones > 6) issues.push(`interval ${round.intervalSemitones}`);
  }
  return issues;
}
