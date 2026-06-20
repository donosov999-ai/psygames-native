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
const MUSIC_KEY = 'psygames_music_on';   // S1: фоновая музыка меню (OPT-IN, дефолт off)

let _soundEnabled = true;     // дефолт ON; loadPrefs перезапишет из хранилища
let _hapticEnabled = true;
let _musicOn = false;         // S1: музыка OPT-IN (дефолт off)
let _prefsLoaded = false;
let _audioCtx: any = null;

async function loadPrefs() {
  if (_prefsLoaded) return;
  try {
    const v = await AsyncStorage.getItem(SOUND_KEY);
    _soundEnabled = v === null ? true : v === 'true';
    const h = await AsyncStorage.getItem(HAPTIC_KEY);
    _hapticEnabled = h === null ? true : h === 'true';
    const m = await AsyncStorage.getItem(MUSIC_KEY);
    _musicOn = m === 'true';
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
export async function getMusicEnabled(): Promise<boolean> { await loadPrefs(); return _musicOn; }
export async function setMusicEnabled(v: boolean) {
  _musicOn = v;
  try { await AsyncStorage.setItem(MUSIC_KEY, String(v)); } catch {}
  if (v) startMusic(); else stopMusic();
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
    if (!c) return;
    // WKWebView (Safari/Tauri macOS) требует «разогрев» пустым буфером от жеста — одного resume() мало (урок TypeRIGHTing).
    try {
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf; src.connect(c.destination); src.start(0);
    } catch { /* no-op */ }
    if (c.state === 'running') {
      ['pointerdown', 'keydown', 'touchend'].forEach((e) => (window as any).removeEventListener(e, _unlock));
    }
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((e) => (window as any).addEventListener(e, _unlock, { passive: true }));
}

const MASTER_GAIN = 0.8;   // R: общее смягчение громкости (приятнее/ровнее). Слайдер громкости V — отдельной задачей.
function beep(frequency: number, duration_ms: number, volume: number = 0.1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const t0 = ctx.currentTime;
    const dur = Math.max(0.05, duration_ms / 1000);
    const v = Math.max(0.0001, volume * MASTER_GAIN);
    // R-ребаланс: мягкая атака (0→v за 12 мс) убирает щелчок/резкость; плавный экспон. спад в конце.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
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
// G-геймификация: раздельные звуки (отличны от обычной победы sndWin).
export function sndLevelUp() { if (_soundEnabled) { beep(523, 90, 0.1); setTimeout(() => beep(659, 90, 0.1), 90); setTimeout(() => beep(784, 100, 0.1), 180); setTimeout(() => beep(1047, 130, 0.11), 280); setTimeout(() => beep(1319, 280, 0.11), 410); } } // 5-нот восходящая фанфара уровня
export function sndStreak()  { if (_soundEnabled) { beep(880, 70, 0.09); setTimeout(() => beep(1175, 150, 0.09), 70); } } // быстрый яркий чайм стрика
// SND-T: таймер в играх на время — тихий тик последних 5 секунд + сигнал «время вышло».
export function sndTimerTick() { if (_soundEnabled) beep(1000, 45, 0.045); }
export function sndTimerEnd()  { if (_soundEnabled) { beep(523, 130, 0.09); setTimeout(() => beep(392, 230, 0.09), 130); } }

// ── Фоновая музыка меню (S1) — мягкое синтез-арпеджио, OPT-IN, очень тихо. F: плавное затухание через мастер-гейн. ──
let _musicTimer: any = null;
let _musicIdx = 0;
let _musicGain: any = null;
const MUSIC_NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];   // C-E-G-C-G-E
export function startMusic(): void {
  if (!_musicOn || _musicTimer) return;
  const ac = getAudioCtx(); if (!ac) return;
  _musicGain = ac.createGain();
  _musicGain.gain.value = 1;
  _musicGain.connect(ac.destination);
  const playNote = () => {
    const c = getAudioCtx(); if (!c || !_musicGain) return;
    const f = MUSIC_NOTES[_musicIdx % MUSIC_NOTES.length]; _musicIdx++;
    try {
      const t0 = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.03, t0 + 0.4);     // тихо (0.03)
      g.gain.linearRampToValueAtTime(0.0001, t0 + 1.7);
      osc.connect(g); g.connect(_musicGain);              // через мастер-гейн музыки → можно плавно гасить
      osc.start(t0); osc.stop(t0 + 1.8);
    } catch { /* no-op */ }
  };
  playNote();
  _musicTimer = setInterval(playNote, 1600);
}
export function stopMusic(): void {
  if (_musicTimer) { clearInterval(_musicTimer); _musicTimer = null; }
  const g = _musicGain; _musicGain = null;
  if (!g) return;
  // F: плавное затухание 0.5с вместо резкого обрыва, затем отключаем узел.
  try {
    const c = getAudioCtx();
    if (c) { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.5); }
    setTimeout(() => { try { g.disconnect(); } catch { /* no-op */ } }, 700);
  } catch { try { g.disconnect(); } catch { /* no-op */ } }
}
