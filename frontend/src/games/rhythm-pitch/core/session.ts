import { generateRhythmPitchRound, rhythmPitchModeForLevel } from './generator';
import {
  estimateLatencyOffset,
  scorePitchCompletion,
  scoreRhythmCompletion,
} from './scoring';
import {
  LEVELS,
  type PitchDirection,
  type RhythmPitchActivePhase,
  type RhythmPitchSession,
  type RhythmPitchSessionConfig,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isActivePhase(phase: RhythmPitchSession['phase']): phase is RhythmPitchActivePhase {
  return phase === 'calibration' || phase === 'ready' || phase === 'playback' || phase === 'response';
}

export function createRhythmPitchSession(config: RhythmPitchSessionConfig): RhythmPitchSession {
  const level = Math.min(LEVELS, Math.max(1, Math.floor(config.level)));
  const mode = config.mode ?? rhythmPitchModeForLevel(level);
  const safeConfig: Required<RhythmPitchSessionConfig> = {
    seed: config.seed,
    level,
    mode,
  };
  return {
    config: safeConfig,
    round: generateRhythmPitchRound(safeConfig.seed, safeConfig.level, safeConfig.mode),
    phase: 'rules',
    pausedFrom: null,
    volume: 0.65,
    calibrationPlaying: false,
    calibrationComplete: false,
    calibrationExpectedTimes: [],
    calibrationTaps: [],
    calibrationOffsetMs: 0,
    calibrationSamples: 0,
    responseStartedAt: null,
    rhythmTaps: [],
    pitchDirectionResponse: null,
    pitchSequenceResponse: [],
    replayCount: 0,
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    audioError: null,
    result: null,
  };
}

export function startRhythmPitchRound(
  session: RhythmPitchSession,
  now: number,
): RhythmPitchSession {
  if (session.phase !== 'rules') return session;
  return {
    ...session,
    phase: 'calibration',
    startedAt: now,
    audioError: null,
  };
}

export function setCalibrationVolume(
  session: RhythmPitchSession,
  volume: number,
): RhythmPitchSession {
  if (session.phase !== 'calibration' || session.calibrationPlaying) return session;
  return { ...session, volume: Math.round(clamp(volume, 0.1, 1) * 100) / 100 };
}

export function startCalibrationPlayback(
  session: RhythmPitchSession,
  expectedTimesMs: readonly number[],
): RhythmPitchSession {
  if (session.phase !== 'calibration' || expectedTimesMs.length === 0) return session;
  return {
    ...session,
    calibrationPlaying: true,
    calibrationComplete: false,
    calibrationExpectedTimes: [...expectedTimesMs],
    calibrationTaps: [],
    audioError: null,
  };
}

export function recordCalibrationTap(
  session: RhythmPitchSession,
  timestampMs: number,
): RhythmPitchSession {
  if (session.phase !== 'calibration' || !session.calibrationPlaying || !Number.isFinite(timestampMs)) {
    return session;
  }
  if (session.calibrationTaps.length >= session.calibrationExpectedTimes.length) return session;
  return { ...session, calibrationTaps: [...session.calibrationTaps, timestampMs] };
}

export function completeCalibrationPlayback(session: RhythmPitchSession): RhythmPitchSession {
  if (session.phase !== 'calibration' || !session.calibrationPlaying) return session;
  const estimate = estimateLatencyOffset(session.calibrationExpectedTimes, session.calibrationTaps);
  const calibrationComplete = estimate.samples >= 2;
  return {
    ...session,
    calibrationPlaying: false,
    calibrationComplete,
    calibrationOffsetMs: calibrationComplete ? estimate.offsetMs : 0,
    calibrationSamples: estimate.samples,
  };
}

export function continueAfterCalibration(session: RhythmPitchSession): RhythmPitchSession {
  if (session.phase !== 'calibration' || !session.calibrationComplete || session.calibrationPlaying) return session;
  return { ...session, phase: 'ready' };
}

export function markAudioUnavailable(
  session: RhythmPitchSession,
  message: string,
): RhythmPitchSession {
  if (session.phase === 'disposed') return session;
  return {
    ...session,
    phase: 'unavailable',
    pausedFrom: null,
    calibrationPlaying: false,
    audioError: message,
  };
}

export function startAudioRoundPlayback(session: RhythmPitchSession): RhythmPitchSession {
  if (session.phase !== 'ready') return session;
  return {
    ...session,
    phase: 'playback',
    responseStartedAt: null,
    rhythmTaps: [],
    pitchDirectionResponse: null,
    pitchSequenceResponse: [],
    result: null,
    audioError: null,
  };
}

export function completeAudioRoundPlayback(
  session: RhythmPitchSession,
  responseStartedAt: number,
): RhythmPitchSession {
  if (session.phase !== 'playback' || !Number.isFinite(responseStartedAt)) return session;
  return {
    ...session,
    phase: 'response',
    responseStartedAt,
  };
}

export function recordRhythmTap(
  session: RhythmPitchSession,
  timestampMs: number,
): RhythmPitchSession {
  if (session.phase !== 'response' || session.round.mode !== 'rhythm-echo' || !Number.isFinite(timestampMs)) {
    return session;
  }
  return { ...session, rhythmTaps: [...session.rhythmTaps, timestampMs] };
}

function scoreOptions(session: RhythmPitchSession, now: number) {
  return {
    durationMs: Math.max(0, now - (session.startedAt ?? now) - session.pausedMs),
    calibrationOffsetMs: session.calibrationOffsetMs,
    calibrationSamples: session.calibrationSamples,
    replayCount: session.replayCount,
  };
}

export function submitRhythmResponse(
  session: RhythmPitchSession,
  now: number,
): RhythmPitchSession {
  if (session.phase !== 'response' || session.round.mode !== 'rhythm-echo' || session.responseStartedAt === null) {
    return session;
  }
  return {
    ...session,
    phase: 'result',
    result: scoreRhythmCompletion(
      session.round,
      session.rhythmTaps,
      session.responseStartedAt,
      scoreOptions(session, now),
    ),
  };
}

export function selectPitchDirection(
  session: RhythmPitchSession,
  direction: PitchDirection,
  now: number,
): RhythmPitchSession {
  if (session.phase !== 'response'
    || session.round.mode !== 'pitch-path'
    || session.round.task !== 'direction') return session;
  const round = session.round;
  const updated = { ...session, pitchDirectionResponse: direction };
  return {
    ...updated,
    phase: 'result',
    result: scorePitchCompletion(
      round,
      direction,
      [],
      scoreOptions(updated, now),
    ),
  };
}

export function appendPitchLevel(
  session: RhythmPitchSession,
  levelIndex: number,
): RhythmPitchSession {
  if (session.phase !== 'response'
    || session.round.mode !== 'pitch-path'
    || session.round.task !== 'sequence'
    || !Number.isInteger(levelIndex)
    || levelIndex < 0
    || levelIndex >= session.round.pitchLevelCount
    || session.pitchSequenceResponse.length >= session.round.toneCount) return session;
  return { ...session, pitchSequenceResponse: [...session.pitchSequenceResponse, levelIndex] };
}

export function removeLastPitchLevel(session: RhythmPitchSession): RhythmPitchSession {
  if (session.phase !== 'response'
    || session.round.mode !== 'pitch-path'
    || session.round.task !== 'sequence'
    || session.pitchSequenceResponse.length === 0) return session;
  return { ...session, pitchSequenceResponse: session.pitchSequenceResponse.slice(0, -1) };
}

export function submitPitchSequence(
  session: RhythmPitchSession,
  now: number,
): RhythmPitchSession {
  if (session.phase !== 'response'
    || session.round.mode !== 'pitch-path'
    || session.round.task !== 'sequence'
    || session.pitchSequenceResponse.length !== session.round.toneCount) return session;
  return {
    ...session,
    phase: 'result',
    result: scorePitchCompletion(
      session.round,
      null,
      session.pitchSequenceResponse,
      scoreOptions(session, now),
    ),
  };
}

export function replayTutorialAudio(session: RhythmPitchSession): RhythmPitchSession {
  if (session.phase !== 'response' || !session.round.tutorialReplay) return session;
  return {
    ...session,
    phase: 'playback',
    responseStartedAt: null,
    rhythmTaps: [],
    pitchDirectionResponse: null,
    pitchSequenceResponse: [],
    replayCount: session.replayCount + 1,
  };
}

export function pauseRhythmPitchSession(
  session: RhythmPitchSession,
  now: number,
): RhythmPitchSession {
  if (!isActivePhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    pauseStartedAt: now,
    calibrationPlaying: false,
  };
}

export function resumeRhythmPitchSession(
  session: RhythmPitchSession,
  now: number,
): RhythmPitchSession {
  if (session.phase !== 'paused' || !session.pausedFrom) return session;
  const pausedDuration = session.pauseStartedAt === null
    ? 0
    : Math.max(0, now - session.pauseStartedAt);
  const targetPhase = session.pausedFrom === 'playback'
    ? 'ready'
    : session.pausedFrom;
  return {
    ...session,
    phase: targetPhase,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pausedDuration,
  };
}

export function restartRhythmPitchSession(
  session: RhythmPitchSession,
  now: number,
): RhythmPitchSession {
  if (session.phase === 'rules') return createRhythmPitchSession(session.config);
  return {
    ...session,
    phase: session.calibrationComplete ? 'ready' : 'calibration',
    pausedFrom: null,
    calibrationPlaying: false,
    responseStartedAt: null,
    rhythmTaps: [],
    pitchDirectionResponse: null,
    pitchSequenceResponse: [],
    replayCount: 0,
    startedAt: now,
    pauseStartedAt: null,
    pausedMs: 0,
    audioError: null,
    result: null,
  };
}

export function disposeRhythmPitchSession(session: RhythmPitchSession): RhythmPitchSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    calibrationPlaying: false,
    calibrationExpectedTimes: [],
    calibrationTaps: [],
    rhythmTaps: [],
    pitchSequenceResponse: [],
    responseStartedAt: null,
    startedAt: null,
    pauseStartedAt: null,
    result: null,
  };
}

export function rhythmPitchSessionFingerprint(session: RhythmPitchSession): string {
  return JSON.stringify({
    roundId: session.round.id,
    phase: session.phase,
    volume: session.volume,
    calibrationComplete: session.calibrationComplete,
    calibrationOffsetMs: session.calibrationOffsetMs,
    rhythmTaps: session.rhythmTaps,
    pitchDirectionResponse: session.pitchDirectionResponse,
    pitchSequenceResponse: session.pitchSequenceResponse,
    replayCount: session.replayCount,
  });
}
