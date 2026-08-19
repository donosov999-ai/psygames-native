import { createRng, normalizeSeed, randomInt, shuffle } from './rng';
import {
  RHYTHM_PITCH_GENERATOR_VERSION,
  RHYTHM_PITCH_MODES,
  LEVELS,
  type PitchPathRound,
  type RhythmBeat,
  type RhythmEchoRound,
  type RhythmPitchMode,
  type RhythmPitchRound,
} from './types';
import { validateRhythmPitchRound } from './validator';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function rhythmPitchModeForLevel(requestedLevel: number): RhythmPitchMode {
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  return RHYTHM_PITCH_MODES[(level - 1) % RHYTHM_PITCH_MODES.length] as RhythmPitchMode;
}

function generateRhythmRound(seed: string, level: number): RhythmEchoRound {
  const rng = createRng(`${seed}:${level}:rhythm:${RHYTHM_PITCH_GENERATOR_VERSION}`);
  const beatCount = Math.min(12, 3 + Math.floor((level - 1) / 2));
  const bpm = Math.min(160, 60 + Math.floor((level - 1) / 2) * 10);
  const unitMs = 60_000 / bpm;
  const intervalMultipliers: number[] = [];
  for (let index = 0; index < beatCount - 1; index += 1) {
    let multiplier = 1;
    if (level >= 4 && index === 1) multiplier = 2;
    else if (level >= 7 && index === 2) multiplier = rng() < 0.5 ? 0.5 : 1.5;
    else if (level >= 10 && rng() < 0.18) multiplier = 2;
    else if (level >= 12 && rng() < 0.24) multiplier = rng() < 0.5 ? 0.5 : 1.5;
    intervalMultipliers.push(multiplier);
  }
  let onsetMs = 0;
  const beats: RhythmBeat[] = Array.from({ length: beatCount }, (_, index) => {
    const beat = {
      onsetMs: Math.round(onsetMs * 1_000) / 1_000,
      accent: level >= 5 && (index === 0 || rng() < Math.min(0.42, 0.12 + level * 0.01)),
    };
    onsetMs += unitMs * (intervalMultipliers[index] ?? 0);
    return beat;
  });
  const pauseCount = intervalMultipliers.filter((value) => value === 2).length;
  const syncopationCount = intervalMultipliers.filter((value) => value === 0.5 || value === 1.5).length;
  const accentCount = beats.filter((beat) => beat.accent).length;
  return {
    id: `rhythm-pitch:${seed}:${level}:rhythm-echo`,
    seed,
    level,
    mode: 'rhythm-echo',
    difficulty: clamp(Math.round(
      5 + beatCount * 4 + (bpm - 60) * 0.28 + pauseCount * 3 + syncopationCount * 4 + accentCount * 1.5,
    ), 1, 100),
    generatorVersion: RHYTHM_PITCH_GENERATOR_VERSION,
    tutorialReplay: level <= 3,
    beatCount,
    bpm,
    unitMs,
    beats,
    pauseCount,
    syncopationCount,
    accentCount,
  };
}

function generatePitchRound(seed: string, level: number): PitchPathRound {
  const rng = createRng(`${seed}:${level}:pitch:${RHYTHM_PITCH_GENERATOR_VERSION}`);
  const tutorialReplay = level <= 3;
  if (level <= 3) {
    const intervalSemitones = Math.max(3, 7 - level);
    const lowMidi = randomInt(rng, 58, 67);
    const directionAnswer = rng() < 0.5 ? 'higher' : 'lower';
    const sequence = directionAnswer === 'higher' ? [0, 1] : [1, 0];
    const round: PitchPathRound = {
      id: `rhythm-pitch:${seed}:${level}:pitch-path`,
      seed,
      level,
      mode: 'pitch-path',
      difficulty: clamp(Math.round(12 + (7 - intervalSemitones) * 6), 1, 100),
      generatorVersion: RHYTHM_PITCH_GENERATOR_VERSION,
      tutorialReplay,
      task: 'direction',
      toneCount: 2,
      pitchLevelCount: 2,
      intervalSemitones,
      frequenciesHz: [midiToFrequency(lowMidi), midiToFrequency(lowMidi + intervalSemitones)],
      sequence,
      directionAnswer,
    };
    return round;
  }

  const toneCount = Math.min(10, 3 + Math.floor((level - 4) / 2));
  const intervalSemitones = Math.max(1, 6 - Math.floor((level - 4) / 5));
  const centerMidi = randomInt(rng, 62, 70);
  const frequenciesHz = [
    midiToFrequency(centerMidi - intervalSemitones),
    midiToFrequency(centerMidi),
    midiToFrequency(centerMidi + intervalSemitones),
  ];
  const sequence = shuffle(rng, [0, 1, 2]);
  while (sequence.length < toneCount) {
    const prior = sequence[sequence.length - 1];
    const candidates = [0, 1, 2].filter((candidate) => candidate !== prior);
    sequence.push(candidates[randomInt(rng, 0, candidates.length - 1)] as number);
  }
  sequence.length = toneCount;
  return {
    id: `rhythm-pitch:${seed}:${level}:pitch-path`,
    seed,
    level,
    mode: 'pitch-path',
    difficulty: clamp(Math.round(18 + toneCount * 5 + (6 - intervalSemitones) * 7), 1, 100),
    generatorVersion: RHYTHM_PITCH_GENERATOR_VERSION,
    tutorialReplay,
    task: 'sequence',
    toneCount,
    pitchLevelCount: 3,
    intervalSemitones,
    frequenciesHz,
    sequence,
    directionAnswer: null,
  };
}

export function generateRhythmPitchRound(
  seed: string,
  requestedLevel: number,
  requestedMode?: RhythmPitchMode,
): RhythmPitchRound {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.min(LEVELS, Math.max(1, Math.floor(requestedLevel)));
  const mode = requestedMode ?? rhythmPitchModeForLevel(level);
  const round = mode === 'rhythm-echo'
    ? generateRhythmRound(normalizedSeed, level)
    : generatePitchRound(normalizedSeed, level);
  const issues = validateRhythmPitchRound(round);
  if (issues.length > 0) throw new Error(`Generated invalid Rhythm/Pitch round: ${issues.join(', ')}`);
  return round;
}
