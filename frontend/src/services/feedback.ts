/**
 * Feedback service — audio beeps + haptic vibration.
 *
 * Cross-platform:
 *  - Web: Web Audio API short tone
 *  - Native: Vibration API
 *
 * User can disable both independently in Settings (psygames_sound /
 * psygames_haptic flags in AsyncStorage). Defaults: sound ON, haptic ON.
 */

import { Vibration, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_KEY = 'psygames_sound_enabled';
const HAPTIC_KEY = 'psygames_haptic_enabled';

let _soundEnabled: boolean | null = null;
let _hapticEnabled: boolean | null = null;
let _audioCtx: any = null;

async function loadPrefs() {
  try {
    if (_soundEnabled === null) {
      const v = await AsyncStorage.getItem(SOUND_KEY);
      _soundEnabled = v === null ? true : v === 'true';
    }
    if (_hapticEnabled === null) {
      const v = await AsyncStorage.getItem(HAPTIC_KEY);
      _hapticEnabled = v === null ? true : v === 'true';
    }
  } catch {
    _soundEnabled = true; _hapticEnabled = true;
  }
}
loadPrefs();

export async function getSoundEnabled(): Promise<boolean> {
  await loadPrefs();
  return _soundEnabled ?? true;
}
export async function getHapticEnabled(): Promise<boolean> {
  await loadPrefs();
  return _hapticEnabled ?? true;
}
export async function setSoundEnabled(v: boolean) {
  _soundEnabled = v;
  try { await AsyncStorage.setItem(SOUND_KEY, String(v)); } catch {}
}
export async function setHapticEnabled(v: boolean) {
  _hapticEnabled = v;
  try { await AsyncStorage.setItem(HAPTIC_KEY, String(v)); } catch {}
}

function getAudioCtx(): any {
  if (typeof window === 'undefined') return null;
  if (_audioCtx) return _audioCtx;
  const W = window as any;
  const Ctor = W.AudioContext || W.webkitAudioContext;
  if (!Ctor) return null;
  try { _audioCtx = new Ctor(); } catch { return null; }
  return _audioCtx;
}

function beep(frequency: number, duration_ms: number, volume: number = 0.1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    // smooth fade out to avoid click
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration_ms / 1000);
    osc.stop(ctx.currentTime + duration_ms / 1000 + 0.05);
  } catch {}
}

function vibrate(pattern: number | number[]) {
  try {
    if (Platform.OS === 'web') {
      const nav = (typeof navigator !== 'undefined') ? (navigator as any) : null;
      if (nav && nav.vibrate) nav.vibrate(pattern);
    } else {
      Vibration.vibrate(pattern);
    }
  } catch {}
}

// ─── public API ────────────────────────────────────────────────────────

export function fbCorrect() {
  if (_soundEnabled) beep(880, 80, 0.08);            // high short ping
  if (_hapticEnabled) vibrate(20);
}

export function fbWrong() {
  if (_soundEnabled) beep(220, 200, 0.12);           // low buzz
  if (_hapticEnabled) vibrate([0, 30, 30, 30]);
}

export function fbStimulus() {
  // subtle tick when stimulus appears (CPT, Posner) — short, very quiet
  if (_soundEnabled) beep(660, 30, 0.04);
}

export function fbComplete() {
  // success chime: 3-note arpeggio
  if (_soundEnabled) {
    beep(523, 100, 0.1);                              // C
    setTimeout(() => beep(659, 100, 0.1), 100);       // E
    setTimeout(() => beep(784, 200, 0.1), 200);       // G
  }
  if (_hapticEnabled) vibrate([0, 50, 30, 50, 30, 100]);
}

export function fbAchievement() {
  // 4-note melody for new achievement
  if (_soundEnabled) {
    beep(523, 80, 0.12);
    setTimeout(() => beep(659, 80, 0.12), 80);
    setTimeout(() => beep(784, 80, 0.12), 160);
    setTimeout(() => beep(1047, 200, 0.12), 240);
  }
  if (_hapticEnabled) vibrate([0, 40, 20, 40, 20, 40, 20, 100]);
}
