import * as music from '@/src/services/music';
import { menuMusicAllowed } from '@/src/services/musicRoute';

class AudioStub {
  volume = 0;
  paused = true;
  currentTime = 0;
  src = '';
  preload = '';
  loop = false;
  listeners = new Map<string, () => void>();
  pending: (() => void)[] = [];
  reject = false;
  defer = false;
  plays = 0;
  addEventListener(n: string, f: () => void) { this.listeners.set(n, f); }
  removeEventListener(n: string) { this.listeners.delete(n); }
  play() {
    this.plays++;
    if (this.reject) return Promise.reject(new Error('autoplay'));
    if (this.defer) return new Promise<void>((resolve) => this.pending.push(() => { this.paused = false; resolve(); }));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
}

describe('music is owned by the app, not Home focus', () => {
  let audio: AudioStub;
  let created: number;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  beforeEach(() => {
    jest.useFakeTimers();
    created = 0;
    audio = new AudioStub();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { created++; return audio; } } });
    music.disposeMusic();
    music.setMusicGain(1);
  });
  afterEach(() => {
    music.disposeMusic();
    jest.clearAllTimers();
    jest.useRealTimers();
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  it('all five tabs keep one element, track and time', async () => {
    music.startMusic();
    await flush();
    jest.advanceTimersByTime(900);
    audio.currentTime = 37;
    const src = audio.src;
    for (const path of ['/', '/games', '/warmup-picker', '/statistics', '/pet', '/settings']) {
      music.setMusicSuspended('route', !menuMusicAllowed(path));
      music.startMusic();
    }
    expect(created).toBe(1);
    expect(audio.currentTime).toBe(37);
    expect(audio.src).toBe(src);
    expect(audio.plays).toBe(1);
    expect(music.isMusicPlaying()).toBe(true);
  });

  it('native game hold overrides the hidden web tab; old close token cannot authorize new game', () => {
    expect(menuMusicAllowed('/games', '/games/sudoku')).toBe(false);
    expect(menuMusicAllowed('/games', '/settings')).toBe(true);
    expect(menuMusicAllowed('/games/stroop')).toBe(false);
    expect(menuMusicAllowed('/warmup-bridge')).toBe(false);
  });

  it('pause/resume during fade cannot pause the new intent or create overlapping players', async () => {
    music.startMusic(); await flush(); jest.advanceTimersByTime(900);
    audio.currentTime = 42;
    music.setMusicSuspended('route', true);
    jest.advanceTimersByTime(200);
    music.setMusicSuspended('route', false);
    jest.advanceTimersByTime(1000);
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(42);
    expect(created).toBe(1);
    expect(audio.volume).toBeCloseTo(.18);
  });

  it('late play resolution after disable cannot restart music or raise volume', async () => {
    audio.defer = true;
    music.startMusic();
    music.stopMusic();
    audio.pending.shift()!();
    await flush();
    jest.advanceTimersByTime(900);
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);
    expect(music.isMusicPlaying()).toBe(false);
  });

  it('autoplay rejection is retried on the next gesture without rebuilding the playlist', async () => {
    audio.reject = true;
    music.startMusic(); await flush();
    expect(music.isMusicPlaying()).toBe(false);
    audio.reject = false;
    music.startMusic(); await flush();
    expect(audio.plays).toBe(2);
    expect(created).toBe(1);
    expect(music.isMusicPlaying()).toBe(true);
  });

  it('volume and background suppression are independent of the opt-in setting', async () => {
    music.startMusic(); await flush(); jest.advanceTimersByTime(900);
    music.setMusicGain(0); jest.advanceTimersByTime(900);
    expect(audio.volume).toBe(0);
    music.setMusicSuspended('background', true); jest.advanceTimersByTime(900);
    expect(audio.paused).toBe(true);
    music.setMusicGain(.5);
    music.setMusicSuspended('background', false); await flush(); jest.advanceTimersByTime(900);
    expect(audio.volume).toBeCloseTo(.09);
  });

  it('root disposal invalidates pending fade/play and releases the element', async () => {
    audio.defer = true;
    music.startMusic();
    music.disposeMusic();
    audio.pending.shift()!(); await flush();
    jest.advanceTimersByTime(2000);
    expect(music.isMusicPlaying()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    expect(audio.paused).toBe(true);
  });
});
