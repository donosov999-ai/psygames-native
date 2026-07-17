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
const SOUNDPACK_KEY = 'psygames_sound_pack';   // SND-P: звук-пак (форма волны), глобально

let _soundEnabled = true;     // дефолт ON; loadPrefs перезапишет из хранилища
let _hapticEnabled = true;
let _musicOn = false;         // S1: музыка OPT-IN (дефолт off)
let _soundPack: string | null = null;   // SND-P: 'square'|'triangle'|'sawtooth', null=sine (дефолт)
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
    const sp = await AsyncStorage.getItem(SOUNDPACK_KEY);
    _soundPack = sp || null;
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
// SND-P: глобальный звук-пак (форма волны игровых звуков). null = дефолтный sine.
export async function getSoundPack(): Promise<string | null> { await loadPrefs(); return _soundPack; }
export async function setSoundPack(wave: string | null) {
  _soundPack = wave || null;
  try { await AsyncStorage.setItem(SOUNDPACK_KEY, wave || ''); } catch {}
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
    // SND-P v1.114.0: пак может быть составным "waveform:pitchMultiplier" (напр. "sine:1.6" —
    // тот же синус, но выше тоном) — так из 4 базовых форм волны Web Audio получаются новые
    // самостоятельные паки без второго осциллятора.
    const [waveRaw, pitchRaw] = (_soundPack || 'sine').split(':');
    const pitchMult = pitchRaw ? parseFloat(pitchRaw) : 1;
    osc.type = (waveRaw || 'sine') as OscillatorType;
    osc.frequency.value = frequency * (Number.isFinite(pitchMult) && pitchMult > 0 ? pitchMult : 1);
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

// ── Фоновая музыка меню — ГЕНЕРАТИВНЫЙ амбиент, OPT-IN, очень тихо. ──
//
// v1.122.0. Было: массив из 6 элементов (4 разные ноты, до-мажорное трезвучие
// вверх-вниз) через setInterval(1600) → петля ровно 9.6 с, повторяется одинаково.
// Репорт тестировщика: «музыка 3 ноты, просто несколько нот перебирается по кругу».
//
// Стало: ноты выбираются на лету из текущего аккорда медленной прогрессии, со
// случайной длительностью, паузами, октавой и лёгкой расстройкой → сочетание не
// повторяется. Почему так, а не трек-файл: файл весит мегабайты, требует лицензии
// (CC0/CC-BY) и всё равно зацикливается на 2-3 минуте — на фоне тренировки петля
// слышна и раздражает сильнее, чем тишина. Генератор — 0 байт ассетов, без новых
// зависимостей, без пересборки под сторы, и не надоедает.
//
// Гармония: минорная пентатоника + септаккорды — любые две ноты из набора
// звучат консонансно, поэтому случайность не может дать фальшь.
let _musicTimer: any = null;
let _musicGain: any = null;
let _musicChord = 0;
let _musicNoteCount = 0;

/** Прогрессия Am7 → Fmaj7 → Cmaj7 → G6 в MIDI-номерах. Меняется каждые ~6 нот. */
const MUSIC_CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [48, 52, 55, 59],
  [55, 59, 62, 64],
];

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export function startMusic(): void {
  if (!_musicOn || _musicTimer) return;
  const ac = getAudioCtx(); if (!ac) return;
  _musicGain = ac.createGain();
  _musicGain.gain.value = 1;
  _musicGain.connect(ac.destination);

  /** Одна нота: медленная атака + длинный спад = амбиент, а не «пиликанье». */
  const voice = (midi: number, dur: number, peak: number, type: OscillatorType) => {
    const c = getAudioCtx(); if (!c || !_musicGain) return;
    try {
      const t0 = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = type;
      osc.frequency.value = midiToFreq(midi);
      osc.detune.value = (Math.random() - 0.5) * 12;  // ±6 центов — живое биение
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(_musicGain);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    } catch { /* no-op */ }
  };

  const step = () => {
    if (!_musicGain) return;   // stopMusic обнулил мастер-гейн → цепочка обрывается
    const chord = MUSIC_CHORDS[_musicChord % MUSIC_CHORDS.length];

    // Смена аккорда раз в ~6 нот + бас-педаль под неё
    if (_musicNoteCount % 6 === 0) {
      voice(chord[0] - 12, 7 + Math.random() * 3, 0.016, 'sine');
      if (_musicNoteCount > 0) _musicChord++;
    }
    _musicNoteCount++;

    // Мелодия: нота аккорда, иногда октавой выше; изредка пауза (дыхание)
    if (Math.random() > 0.18) {
      const midi = pick(chord) + (Math.random() > 0.7 ? 12 : 0);
      voice(midi, 1.8 + Math.random() * 2.2, 0.022 + Math.random() * 0.012,
            Math.random() > 0.75 ? 'triangle' : 'sine');
    }

    // Следующая нота через случайный интервал → нет машинного пульса
    _musicTimer = setTimeout(step, 1100 + Math.random() * 1600);
  };

  _musicChord = 0; _musicNoteCount = 0;
  _musicTimer = setTimeout(step, 10);
}
export function stopMusic(): void {
  if (_musicTimer) { clearTimeout(_musicTimer); _musicTimer = null; }
  const g = _musicGain; _musicGain = null;
  if (!g) return;
  // F: плавное затухание 0.5с вместо резкого обрыва, затем отключаем узел.
  try {
    const c = getAudioCtx();
    if (c) { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.5); }
    setTimeout(() => { try { g.disconnect(); } catch { /* no-op */ } }, 700);
  } catch { try { g.disconnect(); } catch { /* no-op */ } }
}
