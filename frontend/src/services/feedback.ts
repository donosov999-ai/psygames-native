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

let _soundEnabled = true;     // дефолт ON; loadPrefs перезапишет из хранилища
let _hapticEnabled = true;
let _prefsLoaded = false;
let _audioCtx: any = null;

async function loadPrefs() {
  if (_prefsLoaded) return;
  try {
    const v = await AsyncStorage.getItem(SOUND_KEY);
    _soundEnabled = v === null ? true : v === 'true';
    const h = await AsyncStorage.getItem(HAPTIC_KEY);
    _hapticEnabled = h === null ? true : h === 'true';
  } catch { /* оставляем дефолты ON */ }
  _prefsLoaded = true;
}
loadPrefs();

export async function getSoundEnabled(): Promise<boolean> {
  await loadPrefs();
  return _soundEnabled;
}
export async function getHapticEnabled(): Promise<boolean> {
  await loadPrefs();
  return _hapticEnabled;
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
  const W = window as any;
  if (!_audioCtx) {
    const Ctor = W.AudioContext || W.webkitAudioContext;
    if (!Ctor) return null;
    try { _audioCtx = new Ctor(); } catch { return null; }
  }
  // Браузер/WKWebView (Tauri) держат AudioContext в 'suspended' до жеста — будим, иначе beep молчит.
  try { if (_audioCtx.state === 'suspended') _audioCtx.resume(); } catch {}
  return _audioCtx;
}

// Разблокировка аудио по первому жесту окна (на случай если первый beep пришёл не прямо из тап-обработчика).
if (typeof window !== 'undefined' && (window as any).addEventListener) {
  const _unlock = () => {
    const c = getAudioCtx();
    if (c && c.state === 'running') {
      ['pointerdown', 'keydown', 'touchend'].forEach((e) => (window as any).removeEventListener(e, _unlock));
    }
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((e) => (window as any).addEventListener(e, _unlock, { passive: true }));
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

// ─── ЗВУК-ОНЛИ (хаптик в juice/haptics отдельно) + новые события (v1.58) ──
// Подключены к существующему флагу psygames_sound_enabled (тумблер «Звук» в настройках).
export function sndTap()     { if (_soundEnabled) beep(660, 45, 0.05); }
export function sndCorrect() { if (_soundEnabled) beep(880, 85, 0.09); }
export function sndWrong()   { if (_soundEnabled) beep(220, 180, 0.11); }
export function sndWin()     { if (_soundEnabled) { beep(523, 110, 0.1); setTimeout(() => beep(659, 110, 0.1), 100); setTimeout(() => beep(784, 180, 0.1), 200); setTimeout(() => beep(1047, 220, 0.1), 300); } }   // фанфары до-ми-соль-до
export function sndLose()    { if (_soundEnabled) { beep(392, 170, 0.1); setTimeout(() => beep(330, 170, 0.1), 140); setTimeout(() => beep(262, 230, 0.1), 280); } } // нисходящее
export function sndToken()   { if (_soundEnabled) { beep(1175, 70, 0.09); setTimeout(() => beep(1568, 120, 0.08), 60); } } // звонкая монетка
export function sndCombo(n: number) { if (_soundEnabled) { const f = 520 + Math.min(Math.max(n, 0), 8) * 55; beep(f, 90, 0.08); setTimeout(() => beep(Math.round(f * 1.5), 90, 0.07), 50); } }
export function sndFlip()    { if (_soundEnabled) beep(470, 55, 0.05); }   // свуш переворота
export function sndMatch()   { if (_soundEnabled) { beep(784, 80, 0.09); setTimeout(() => beep(1047, 110, 0.08), 60); } }
export function sndPlace()   { if (_soundEnabled) beep(523, 45, 0.06); }   // мягкий тик
