import type { GuideCue, PracticeResult } from './engine';

export type IllustrationKey =
  | 'face-cheeks'
  | 'face-smile'
  | 'face-pucker'
  | 'face-brows'
  | 'face-squint'
  | 'face-jaw'
  | 'face-simhasana'
  | 'face-ears'
  | 'face-forehead'
  | 'neck-shoulder-rolls'
  | 'neck-side-tilt'
  | 'neck-turn'
  | 'thoracic-open'
  | 'thoracic-rotation';

export interface IllustrationRequirement {
  readonly key: IllustrationKey;
  readonly setId: 'face-speech' | 'mobility';
  readonly stepIds: readonly string[];
  readonly altRu: string;
  readonly altEn: string;
}

/**
 * §30.11/§32.3 asset contract. Illustrations are deliberately external to the
 * logic module: they must be volumetric/material-rich, contain no embedded
 * labels, preserve one neutral identity, and be reviewed before integration.
 */
export const ILLUSTRATION_REQUIREMENTS: readonly IllustrationRequirement[] = [
  { key: 'face-cheeks', setId: 'face-speech', stepIds: ['cheeks'], altRu: 'Мягко надутые щёки', altEn: 'Gently puffed cheeks' },
  { key: 'face-smile', setId: 'face-speech', stepIds: ['smile'], altRu: 'Комфортная улыбка', altEn: 'Comfortable smile' },
  { key: 'face-pucker', setId: 'face-speech', stepIds: ['pucker'], altRu: 'Губы мягко собраны трубочкой', altEn: 'Lips gently puckered' },
  { key: 'face-brows', setId: 'face-speech', stepIds: ['brows'], altRu: 'Брови подняты', altEn: 'Brows raised' },
  { key: 'face-squint', setId: 'face-speech', stepIds: ['eyes-soft'], altRu: 'Мягкий прищур', altEn: 'Gentle squint' },
  { key: 'face-jaw', setId: 'face-speech', stepIds: ['jaw'], altRu: 'Челюсть слегка открыта', altEn: 'Jaw slightly open' },
  { key: 'face-simhasana', setId: 'face-speech', stepIds: ['simhasana'], altRu: 'Язык мягко вытянут', altEn: 'Tongue extended gently' },
  { key: 'face-ears', setId: 'face-speech', stepIds: ['ears'], altRu: 'Мягкое растирание ушей', altEn: 'Gentle ear rubbing' },
  { key: 'face-forehead', setId: 'face-speech', stepIds: ['forehead'], altRu: 'Разглаживание лба пальцами', altEn: 'Forehead smoothing with fingers' },
  { key: 'neck-shoulder-rolls', setId: 'mobility', stepIds: ['shoulder-rolls'], altRu: 'Медленные круги плечами', altEn: 'Slow shoulder rolls' },
  { key: 'neck-side-tilt', setId: 'mobility', stepIds: ['side'], altRu: 'Мягкий наклон головы', altEn: 'Gentle head tilt' },
  { key: 'neck-turn', setId: 'mobility', stepIds: ['turn'], altRu: 'Комфортный поворот головы', altEn: 'Comfortable head turn' },
  { key: 'thoracic-open', setId: 'mobility', stepIds: ['open'], altRu: 'Раскрытие грудной клетки', altEn: 'Chest opening' },
  { key: 'thoracic-rotation', setId: 'mobility', stepIds: ['rotate-left', 'rotate-right'], altRu: 'Поворот грудного отдела', altEn: 'Thoracic rotation' },
] as const;

export type FaceBlendshapeName =
  | 'cheekPuff'
  | 'mouthSmile_L'
  | 'mouthSmile_R'
  | 'mouthPucker'
  | 'browInnerUp'
  | 'browOuterUp_L'
  | 'browOuterUp_R'
  | 'eyeSquint_L'
  | 'eyeSquint_R'
  | 'jawOpen'
  | 'tongueOut'
  | 'jawLeft'
  | 'jawRight';

export type FaceTrackableStepId =
  | 'cheeks'
  | 'smile'
  | 'pucker'
  | 'brows'
  | 'eyes-soft'
  | 'jaw'
  | 'simhasana';

export const FACE_BLENDSHAPE_REQUIREMENTS: Readonly<Record<FaceTrackableStepId, readonly FaceBlendshapeName[]>> = {
  cheeks: ['cheekPuff'],
  smile: ['mouthSmile_L', 'mouthSmile_R'],
  pucker: ['mouthPucker'],
  brows: ['browInnerUp', 'browOuterUp_L', 'browOuterUp_R'],
  'eyes-soft': ['eyeSquint_L', 'eyeSquint_R'],
  jaw: ['jawOpen', 'jawLeft', 'jawRight'],
  simhasana: ['tongueOut'],
} as const;

const FACE_BLENDSHAPE_NAMES: readonly FaceBlendshapeName[] = [
  'cheekPuff',
  'mouthSmile_L',
  'mouthSmile_R',
  'mouthPucker',
  'browInnerUp',
  'browOuterUp_L',
  'browOuterUp_R',
  'eyeSquint_L',
  'eyeSquint_R',
  'jawOpen',
  'tongueOut',
  'jawLeft',
  'jawRight',
] as const;

export interface FaceVerificationSample {
  readonly atMs: number;
  readonly blendshapes: Readonly<Partial<Record<FaceBlendshapeName, number>>>;
}

export interface FaceCueFeedback {
  readonly stepId: FaceTrackableStepId;
  readonly reached: boolean;
  /** Current normalized guidance value, not a score. */
  readonly amplitude: number;
  /** Session-local peak for the current cue only. */
  readonly peakAmplitude: number;
  readonly heldMs: number;
  readonly repetitions: number;
  /** Session-local guidance only. Never persist or interpret clinically. */
  readonly leftRightDelta?: number;
}

export type FaceVerificationCapability = 'unknown' | 'supported' | 'unsupported';
export type FaceVerificationPermission = 'unknown' | 'granted' | 'denied';
export type FaceVerificationPhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'requesting-permission'
  | 'starting'
  | 'running'
  | 'suspended'
  | 'unavailable'
  | 'denied'
  | 'failed'
  | 'disposed';
export type FaceVerificationFailureCode =
  | 'capability-failed'
  | 'permission-failed'
  | 'start-failed'
  | 'sample-failed'
  | 'stop-failed';

export interface FaceVerificationProbe {
  readonly capability: Exclude<FaceVerificationCapability, 'unknown'>;
  readonly permission: FaceVerificationPermission;
}

export interface FaceVerificationThresholds {
  /** Integration-supplied guidance threshold; requires device validation. */
  readonly activateAt: number;
  /** Lower release threshold prevents flicker around activateAt. */
  readonly releaseBelow: number;
  /** A longer sample gap starts a new hold instead of inflating heldMs. */
  readonly maxSampleGapMs: number;
}

export interface FaceVerificationSnapshot {
  readonly phase: FaceVerificationPhase;
  readonly capability: FaceVerificationCapability;
  readonly permission: FaceVerificationPermission;
  readonly optedIn: boolean;
  readonly feedback: FaceCueFeedback | null;
  readonly failureCode: FaceVerificationFailureCode | null;
}

/**
 * Optional §39 adapter. The exercise must work when this adapter is absent or
 * permission is denied. Implementations process frames on-device, never expose
 * a frame through this interface, never save video/images, and stop on unmount.
 */
export interface FaceVerificationAdapter {
  readonly kind: 'on-device-face-landmarks';
  /** Capability inspection must not prompt for or open the camera. */
  probe(): Promise<FaceVerificationProbe>;
  requestPermission(): Promise<'granted' | 'denied'>;
  start(): Promise<void>;
  sample(): Promise<FaceVerificationSample | null>;
  stop(): Promise<void>;
}

export interface FaceVerificationController {
  getSnapshot(): FaceVerificationSnapshot;
  inspect(): Promise<FaceVerificationSnapshot>;
  /** Must be called only from an explicit user opt-in action. */
  enable(): Promise<FaceVerificationSnapshot>;
  suspend(): Promise<FaceVerificationSnapshot>;
  /** Resumes only an already-granted session and never prompts automatically. */
  resume(): Promise<FaceVerificationSnapshot>;
  /** Called by the host clock; the controller creates no timer or animation loop. */
  readCue(stepId: string): Promise<FaceCueFeedback | null>;
  disable(): Promise<FaceVerificationSnapshot>;
  dispose(): Promise<FaceVerificationSnapshot>;
}

interface FaceCueTracker {
  stepId: FaceTrackableStepId | null;
  reached: boolean;
  heldMs: number;
  repetitions: number;
  peakAmplitude: number;
  lastSampleAtMs: number | null;
}

function createFaceCueTracker(stepId: FaceTrackableStepId | null = null): FaceCueTracker {
  return {
    stepId,
    reached: false,
    heldMs: 0,
    repetitions: 0,
    peakAmplitude: 0,
    lastSampleAtMs: null,
  };
}

function isFaceTrackableStepId(stepId: string): stepId is FaceTrackableStepId {
  return Object.prototype.hasOwnProperty.call(FACE_BLENDSHAPE_REQUIREMENTS, stepId);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeFaceVerificationSample(sample: FaceVerificationSample): FaceVerificationSample | null {
  if (!Number.isFinite(sample.atMs) || sample.atMs < 0 || typeof sample.blendshapes !== 'object' || sample.blendshapes === null) {
    return null;
  }
  const blendshapes: Partial<Record<FaceBlendshapeName, number>> = {};
  for (const name of FACE_BLENDSHAPE_NAMES) {
    const value = sample.blendshapes[name];
    if (typeof value === 'number' && Number.isFinite(value)) blendshapes[name] = clampUnit(value);
  }
  return { atMs: sample.atMs, blendshapes };
}

function signal(sample: FaceVerificationSample, name: FaceBlendshapeName): number {
  return sample.blendshapes[name] ?? 0;
}

function bilateralDelta(
  sample: FaceVerificationSample,
  leftName: FaceBlendshapeName,
  rightName: FaceBlendshapeName,
): number | undefined {
  const left = sample.blendshapes[leftName];
  const right = sample.blendshapes[rightName];
  return left === undefined || right === undefined ? undefined : Math.abs(left - right);
}

function aggregateFaceCue(
  stepId: FaceTrackableStepId,
  sample: FaceVerificationSample,
): { amplitude: number; leftRightDelta?: number } {
  switch (stepId) {
    case 'cheeks':
      return { amplitude: signal(sample, 'cheekPuff') };
    case 'smile': {
      const left = signal(sample, 'mouthSmile_L');
      const right = signal(sample, 'mouthSmile_R');
      return { amplitude: Math.min(left, right), leftRightDelta: bilateralDelta(sample, 'mouthSmile_L', 'mouthSmile_R') };
    }
    case 'pucker':
      return { amplitude: signal(sample, 'mouthPucker') };
    case 'brows': {
      const outerLeft = signal(sample, 'browOuterUp_L');
      const outerRight = signal(sample, 'browOuterUp_R');
      return {
        amplitude: Math.max(signal(sample, 'browInnerUp'), Math.min(outerLeft, outerRight)),
        leftRightDelta: bilateralDelta(sample, 'browOuterUp_L', 'browOuterUp_R'),
      };
    }
    case 'eyes-soft': {
      const left = signal(sample, 'eyeSquint_L');
      const right = signal(sample, 'eyeSquint_R');
      return { amplitude: Math.min(left, right), leftRightDelta: bilateralDelta(sample, 'eyeSquint_L', 'eyeSquint_R') };
    }
    case 'jaw':
      return { amplitude: Math.min(signal(sample, 'jawOpen'), Math.max(signal(sample, 'jawLeft'), signal(sample, 'jawRight'))) };
    case 'simhasana':
      return { amplitude: signal(sample, 'tongueOut') };
  }
}

function advanceFaceCueTracker(
  tracker: FaceCueTracker,
  stepId: FaceTrackableStepId,
  sample: FaceVerificationSample,
  thresholds: FaceVerificationThresholds,
): FaceCueFeedback | undefined {
  if (tracker.stepId !== stepId) Object.assign(tracker, createFaceCueTracker(stepId));
  if (tracker.lastSampleAtMs !== null && sample.atMs <= tracker.lastSampleAtMs) return undefined;

  const { amplitude, leftRightDelta } = aggregateFaceCue(stepId, sample);
  const gapMs = tracker.lastSampleAtMs === null ? 0 : sample.atMs - tracker.lastSampleAtMs;
  const stale = tracker.lastSampleAtMs !== null && gapMs > thresholds.maxSampleGapMs;
  if (stale) tracker.reached = false;

  const wasReached = tracker.reached;
  if (tracker.reached) {
    if (amplitude < thresholds.releaseBelow) tracker.reached = false;
  } else if (amplitude >= thresholds.activateAt) {
    tracker.reached = true;
  }

  if (!wasReached && tracker.reached) tracker.repetitions += 1;
  if (wasReached && tracker.reached && !stale) tracker.heldMs += gapMs;
  tracker.peakAmplitude = Math.max(tracker.peakAmplitude, amplitude);
  tracker.lastSampleAtMs = sample.atMs;

  return {
    stepId,
    reached: tracker.reached,
    amplitude,
    peakAmplitude: tracker.peakAmplitude,
    heldMs: tracker.heldMs,
    repetitions: tracker.repetitions,
    ...(leftRightDelta === undefined ? {} : { leftRightDelta }),
  };
}

function validateFaceThresholds(thresholds: FaceVerificationThresholds): void {
  if (!Number.isFinite(thresholds.activateAt) || thresholds.activateAt <= 0 || thresholds.activateAt > 1) {
    throw new Error('activateAt must be within (0, 1]');
  }
  if (!Number.isFinite(thresholds.releaseBelow) || thresholds.releaseBelow < 0 || thresholds.releaseBelow >= thresholds.activateAt) {
    throw new Error('releaseBelow must be within [0, activateAt)');
  }
  if (!Number.isFinite(thresholds.maxSampleGapMs) || thresholds.maxSampleGapMs <= 0) {
    throw new Error('maxSampleGapMs must be positive');
  }
}

/**
 * Pure §39 orchestration. It owns only ephemeral numbers and lifecycle state:
 * no camera API, frames, timers, storage, network, logging, or clinical output.
 */
export function createFaceVerificationController(
  adapter: FaceVerificationAdapter | null | undefined,
  thresholds: FaceVerificationThresholds,
): FaceVerificationController {
  validateFaceThresholds(thresholds);
  let state: FaceVerificationSnapshot = adapter
    ? { phase: 'idle', capability: 'unknown', permission: 'unknown', optedIn: false, feedback: null, failureCode: null }
    : { phase: 'unavailable', capability: 'unsupported', permission: 'unknown', optedIn: false, feedback: null, failureCode: null };
  let tracker = createFaceCueTracker();
  let operationVersion = 0;
  let needsStop = false;
  let pendingStart: Promise<void> | null = null;

  const getSnapshot = (): FaceVerificationSnapshot => ({
    ...state,
    feedback: state.feedback ? { ...state.feedback } : null,
  });

  const update = (patch: Partial<FaceVerificationSnapshot>): void => {
    state = { ...state, ...patch };
  };

  const clearGuidance = (): void => {
    tracker = createFaceCueTracker();
    update({ feedback: null });
  };

  const isCurrent = (version: number): boolean => version === operationVersion && state.phase !== 'disposed';

  const stopAdapter = async (force = false): Promise<boolean> => {
    if (!adapter || (!needsStop && !force)) return true;
    needsStop = false;
    try {
      await adapter.stop();
      return true;
    } catch {
      return false;
    }
  };

  const fail = async (failureCode: FaceVerificationFailureCode, stop: boolean): Promise<FaceVerificationSnapshot> => {
    operationVersion += 1;
    clearGuidance();
    update({ phase: 'failed', optedIn: false, failureCode });
    if (stop && !(await stopAdapter(true))) update({ failureCode: 'stop-failed' });
    return getSnapshot();
  };

  const inspect = async (): Promise<FaceVerificationSnapshot> => {
    if (state.phase === 'disposed') return getSnapshot();
    if (!adapter) return getSnapshot();
    if (state.phase === 'running' || state.phase === 'starting' || state.phase === 'requesting-permission') return getSnapshot();
    const version = ++operationVersion;
    clearGuidance();
    update({ phase: 'checking', optedIn: false, failureCode: null });
    try {
      const probe = await adapter.probe();
      if (!isCurrent(version)) return getSnapshot();
      const validCapability = probe.capability === 'supported' || probe.capability === 'unsupported';
      const validPermission = probe.permission === 'unknown' || probe.permission === 'granted' || probe.permission === 'denied';
      if (!validCapability || !validPermission) return fail('capability-failed', false);
      if (probe.capability === 'unsupported') {
        update({ phase: 'unavailable', capability: 'unsupported', permission: 'unknown', optedIn: false });
      } else if (probe.permission === 'denied') {
        update({ phase: 'denied', capability: 'supported', permission: 'denied', optedIn: false });
      } else {
        update({ phase: 'ready', capability: 'supported', permission: probe.permission, optedIn: false });
      }
      return getSnapshot();
    } catch {
      if (!isCurrent(version)) return getSnapshot();
      return fail('capability-failed', false);
    }
  };

  const startGranted = async (): Promise<FaceVerificationSnapshot> => {
    if (!adapter || state.phase === 'disposed' || state.capability !== 'supported' || state.permission !== 'granted') {
      return getSnapshot();
    }
    if (pendingStart) return getSnapshot();
    const version = ++operationVersion;
    needsStop = true;
    update({ phase: 'starting', optedIn: true, feedback: null, failureCode: null });
    let startPromise: Promise<void> | null = null;
    try {
      startPromise = adapter.start();
      pendingStart = startPromise;
      await startPromise;
      if (pendingStart === startPromise) pendingStart = null;
      if (!isCurrent(version)) {
        await stopAdapter(true);
        return getSnapshot();
      }
      update({ phase: 'running', optedIn: true });
      return getSnapshot();
    } catch {
      if (startPromise && pendingStart === startPromise) pendingStart = null;
      if (!isCurrent(version)) {
        await stopAdapter(true);
        return getSnapshot();
      }
      return fail('start-failed', true);
    }
  };

  const enable = async (): Promise<FaceVerificationSnapshot> => {
    if (state.phase === 'disposed' || !adapter) return getSnapshot();
    if (pendingStart) return getSnapshot();
    if (state.phase === 'running' || state.phase === 'starting' || state.phase === 'requesting-permission') return getSnapshot();
    if (state.capability === 'unknown') await inspect();
    const inspected = getSnapshot();
    if (inspected.phase === 'disposed' || inspected.capability !== 'supported') return inspected;
    if (state.permission === 'denied') return getSnapshot();
    update({ optedIn: true, failureCode: null });
    if (state.permission !== 'granted') {
      const version = ++operationVersion;
      update({ phase: 'requesting-permission' });
      try {
        const permission = await adapter.requestPermission();
        if (!isCurrent(version)) return getSnapshot();
        if (permission !== 'granted' && permission !== 'denied') return fail('permission-failed', false);
        if (permission === 'denied') {
          update({ phase: 'denied', permission: 'denied', optedIn: false, feedback: null });
          return getSnapshot();
        }
        update({ permission: 'granted' });
      } catch {
        if (!isCurrent(version)) return getSnapshot();
        return fail('permission-failed', false);
      }
    }
    return startGranted();
  };

  const suspend = async (): Promise<FaceVerificationSnapshot> => {
    if (state.phase === 'disposed') return getSnapshot();
    if (state.phase !== 'running' && state.phase !== 'starting' && state.phase !== 'requesting-permission') return getSnapshot();
    const shouldStop = needsStop;
    operationVersion += 1;
    clearGuidance();
    update({ phase: 'suspended', failureCode: null });
    if (shouldStop && !(await stopAdapter())) {
      update({ phase: 'failed', optedIn: false, failureCode: 'stop-failed' });
    }
    return getSnapshot();
  };

  const resume = async (): Promise<FaceVerificationSnapshot> => {
    if (state.phase !== 'suspended' || !state.optedIn || state.permission !== 'granted' || pendingStart) return getSnapshot();
    return startGranted();
  };

  const readCue = async (stepId: string): Promise<FaceCueFeedback | null> => {
    if (!adapter || state.phase !== 'running') return null;
    if (!isFaceTrackableStepId(stepId)) {
      tracker = createFaceCueTracker();
      update({ feedback: null });
      return null;
    }
    if (tracker.stepId !== stepId) tracker = createFaceCueTracker(stepId);
    const version = operationVersion;
    try {
      const rawSample = await adapter.sample();
      if (!isCurrent(version) || state.phase !== 'running') return null;
      if (rawSample === null) {
        update({ feedback: null });
        return null;
      }
      const sample = normalizeFaceVerificationSample(rawSample);
      if (!sample) {
        update({ feedback: null });
        return null;
      }
      const feedback = advanceFaceCueTracker(tracker, stepId, sample, thresholds);
      if (feedback) update({ feedback });
      return state.feedback ? { ...state.feedback } : null;
    } catch {
      if (isCurrent(version)) await fail('sample-failed', true);
      return null;
    }
  };

  const disable = async (): Promise<FaceVerificationSnapshot> => {
    if (state.phase === 'disposed') return getSnapshot();
    const shouldStop = needsStop;
    operationVersion += 1;
    clearGuidance();
    update({
      phase: state.capability === 'supported'
        ? (state.permission === 'denied' ? 'denied' : 'ready')
        : state.capability === 'unsupported' ? 'unavailable' : 'idle',
      optedIn: false,
      failureCode: null,
    });
    if (shouldStop && !(await stopAdapter())) {
      update({ phase: 'failed', failureCode: 'stop-failed' });
    }
    return getSnapshot();
  };

  const dispose = async (): Promise<FaceVerificationSnapshot> => {
    if (state.phase === 'disposed') return getSnapshot();
    const shouldStop = needsStop;
    operationVersion += 1;
    clearGuidance();
    update({ phase: 'disposed', optedIn: false, failureCode: null });
    if (shouldStop && !(await stopAdapter())) update({ failureCode: 'stop-failed' });
    return getSnapshot();
  };

  return { getSnapshot, inspect, enable, suspend, resume, readCue, disable, dispose };
}

export interface PausePersistenceAdapter {
  /** Called only after the core emitted a completed result. */
  saveCompletion(result: PracticeResult): Promise<void>;
  /** Solo completion counts unlock parallel motor practice. */
  getSoloCompletions(): Promise<Readonly<Record<string, number>>>;
}

export interface PauseGuideAdapter {
  renderIllustration?(cue: GuideCue): unknown;
  playTone?(cue: GuideCue): void;
}
