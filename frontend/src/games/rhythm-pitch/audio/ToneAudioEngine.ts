/* psygames-rhythm-pitch-tone-audio-engine · VER 1 · 19.08.2026 */
import type { RhythmPitchRound } from '../core/types';

export interface AudioPlaybackPlan {
  expectedTimesMs: number[];
  completed: Promise<void>;
}

export interface ToneAudioEngine {
  readonly available: boolean;
  initialize(): Promise<void>;
  playCalibration(volume: number): Promise<AudioPlaybackPlan>;
  playRound(round: RhythmPitchRound, volume: number): Promise<AudioPlaybackPlan>;
  stop(): Promise<void>;
  suspend(): Promise<void>;
  dispose(): Promise<void>;
}

export class AudioOutputUnavailableError extends Error {
  constructor(message = 'Audio output is unavailable') {
    super(message);
    this.name = 'AudioOutputUnavailableError';
  }
}

type AudioContextFactory = () => AudioContext;
type PerformanceClock = () => number;

interface ToneEvent {
  delayMs: number;
  durationMs: number;
  frequencyHz: number;
  gain: number;
}

interface ActiveTone {
  oscillator: OscillatorNode;
  envelope: GainNode;
}

export interface WebToneAudioEngineOptions {
  contextFactory?: AudioContextFactory;
  performanceClock?: PerformanceClock;
}

export interface ToneAudioDiagnostics {
  contextCreated: number;
  contextClosed: number;
  contextSuspended: number;
  playbacksStarted: number;
  tonesScheduled: number;
  activeTones: number;
  contextState: AudioContextState | 'none';
  disposed: boolean;
}

function defaultContextFactory(): AudioContext {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Context) throw new AudioOutputUnavailableError();
  return new Context();
}

function defaultPerformanceClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class WebToneAudioEngine implements ToneAudioEngine {
  private context: AudioContext | null = null;
  private activeTones = new Set<ActiveTone>();
  private master: GainNode | null = null;
  private finishCurrent: (() => void) | null = null;
  private disposed = false;
  private generation = 0;
  private contextCreated = 0;
  private contextClosed = 0;
  private contextSuspended = 0;
  private playbacksStarted = 0;
  private tonesScheduled = 0;
  private readonly contextFactory: AudioContextFactory;
  private readonly performanceClock: PerformanceClock;

  constructor(options: WebToneAudioEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
    this.performanceClock = options.performanceClock ?? defaultPerformanceClock;
  }

  get available(): boolean {
    if (this.disposed) return false;
    if (this.context) return this.context.state !== 'closed';
    if (this.contextFactory !== defaultContextFactory) return true;
    const scope = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    return Boolean(scope.AudioContext ?? scope.webkitAudioContext);
  }

  async initialize(): Promise<void> {
    if (this.disposed) throw new AudioOutputUnavailableError('Audio engine has been disposed');
    if (!this.available) throw new AudioOutputUnavailableError();
    if (!this.context) {
      try {
        this.context = this.contextFactory();
        this.contextCreated += 1;
      } catch (error) {
        throw error instanceof AudioOutputUnavailableError
          ? error
          : new AudioOutputUnavailableError();
      }
    }
    if (this.context.state === 'suspended') await this.context.resume();
    if (this.context.state === 'closed') throw new AudioOutputUnavailableError();
  }

  async playCalibration(volume: number): Promise<AudioPlaybackPlan> {
    const events: ToneEvent[] = [0, 450, 900, 1_350].map((delayMs) => ({
      delayMs,
      durationMs: 130,
      frequencyHz: 660,
      gain: 1,
    }));
    return this.schedule(events, volume);
  }

  async playRound(round: RhythmPitchRound, volume: number): Promise<AudioPlaybackPlan> {
    if (round.mode === 'rhythm-echo') {
      const durationMs = Math.min(140, Math.max(80, round.unitMs * 0.24));
      return this.schedule(round.beats.map((beat) => ({
        delayMs: beat.onsetMs,
        durationMs,
        frequencyHz: beat.accent ? 880 : 660,
        gain: beat.accent ? 1 : 0.72,
      })), volume);
    }
    const spacingMs = round.task === 'direction' ? 560 : 440;
    return this.schedule(round.sequence.map((pitchIndex, index) => ({
      delayMs: index * spacingMs,
      durationMs: round.task === 'direction' ? 340 : 280,
      frequencyHz: round.frequenciesHz[pitchIndex] as number,
      gain: 0.82,
    })), volume);
  }

  private async schedule(events: readonly ToneEvent[], volume: number): Promise<AudioPlaybackPlan> {
    if (events.length === 0) throw new AudioOutputUnavailableError('No audio events to play');
    await this.initialize();
    await this.stop();
    const context = this.context;
    if (!context || context.state === 'closed') throw new AudioOutputUnavailableError();

    const generation = ++this.generation;
    this.playbacksStarted += 1;
    this.tonesScheduled += events.length;
    const baseContextTime = context.currentTime + 0.06;
    const basePerformanceTime = this.performanceClock() + 60;
    const master = context.createGain();
    master.gain.setValueAtTime(clamp(volume, 0.1, 1), baseContextTime);
    master.connect(context.destination);
    this.master = master;

    let resolveCompleted = () => {};
    const completed = new Promise<void>((resolve) => {
      resolveCompleted = resolve;
    });
    let remaining = events.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (this.finishCurrent === finish) this.finishCurrent = null;
      for (const tone of this.activeTones) {
        tone.oscillator.onended = null;
        try { tone.oscillator.disconnect(); } catch {}
        try { tone.envelope.disconnect(); } catch {}
      }
      this.activeTones.clear();
      try { master.disconnect(); } catch {}
      if (this.master === master) this.master = null;
      resolveCompleted();
    };
    this.finishCurrent = finish;

    for (const event of events) {
      const startAt = baseContextTime + event.delayMs / 1_000;
      const stopAt = startAt + event.durationMs / 1_000;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const tone: ActiveTone = { oscillator, envelope };
      this.activeTones.add(tone);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(event.frequencyHz, startAt);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, event.gain), startAt + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.onended = () => {
        this.activeTones.delete(tone);
        try { oscillator.disconnect(); } catch {}
        try { envelope.disconnect(); } catch {}
        remaining -= 1;
        if (remaining === 0 && generation === this.generation) finish();
      };
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.015);
    }

    return {
      expectedTimesMs: events.map((event) => basePerformanceTime + event.delayMs),
      completed,
    };
  }

  async stop(): Promise<void> {
    this.generation += 1;
    const finish = this.finishCurrent;
    this.finishCurrent = null;
    for (const tone of this.activeTones) {
      tone.oscillator.onended = null;
      try { tone.oscillator.stop(); } catch {}
      try { tone.oscillator.disconnect(); } catch {}
      try { tone.envelope.disconnect(); } catch {}
    }
    this.activeTones.clear();
    if (this.master) {
      try { this.master.disconnect(); } catch {}
      this.master = null;
    }
    finish?.();
  }

  async suspend(): Promise<void> {
    await this.stop();
    if (this.context?.state === 'running') {
      await this.context.suspend();
      this.contextSuspended += 1;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.stop();
    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
      this.contextClosed += 1;
    }
    this.context = null;
    this.disposed = true;
  }

  getDiagnostics(): ToneAudioDiagnostics {
    return {
      contextCreated: this.contextCreated,
      contextClosed: this.contextClosed,
      contextSuspended: this.contextSuspended,
      playbacksStarted: this.playbacksStarted,
      tonesScheduled: this.tonesScheduled,
      activeTones: this.activeTones.size,
      contextState: this.context?.state ?? 'none',
      disposed: this.disposed,
    };
  }
}

export function createWebToneAudioEngine(): ToneAudioEngine {
  return new WebToneAudioEngine();
}
