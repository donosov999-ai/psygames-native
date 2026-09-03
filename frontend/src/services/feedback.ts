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
import { startMusic as musicStart, stopMusic as musicStop } from '@/src/services/music';

const SOUND_KEY = 'psygames_sound_enabled';
const HAPTIC_KEY = 'psygames_haptic_enabled';
const MUSIC_KEY = 'psygames_music_on';   // S1: фоновая музыка меню (OPT-IN, дефолт off)
const SOUNDPACK_KEY = 'psygames_sound_pack';   // SND-P: звук-пак (форма волны), глобально
const VOLUME_KEY = 'psygames_volume';          // громкость 0…100 (задача fe7f2020)

let _soundEnabled = true;     // дефолт ON; loadPrefs перезапишет из хранилища
/**
 * 🔴 ГРОМКОСТЬ ОТДЕЛЬНО ОТ ТУМБЛЕРА (задача fe7f2020).
 *
 * Тумблер отвечает на «звучать ли», громкость — на «насколько». Свести их в одно
 * нельзя: ползунок в нуле и выключенный звук выглядят одинаково, но означают разное
 * — из нуля человек ждёт, что звук вернётся движением пальца, а из выключенного
 * тумблера ждёт, что вернётся тумблером. Разойдутся — и «у меня пропал звук».
 *
 * Хранится 0…100 (человеческая шкала настройки), в звук уходит долей.
 */
let _volume = 80;             // 80 = прежняя константа MASTER_GAIN 0.8, поведение не меняется
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
    const vol = await AsyncStorage.getItem(VOLUME_KEY);
    _volume = vol === null ? 80 : clampVolume(Number(vol));
  } catch { /* оставляем дефолты ON */ }
  _prefsLoaded = true;
}
loadPrefs();

/**
 * ТИХИЙ ВЕЧЕРНИЙ РЕЖИМ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФЛАГ, А НЕ `setSoundEnabled(false)`. Вечерний и ночной шаг
 * зарядки задуман как успокоение перед сном — писки там ровно то, чего не надо.
 * Но выключить общий тумблер значит ПЕРЕЗАПИСАТЬ настройку человека: он включил
 * звук, а наутро тот молчит, и виноватых нет. Здесь временное глушение поверх,
 * которое живёт только пока идёт спокойный шаг.
 *
 * ⚠️ Правило `calm` до сих пор соблюдали 2 игры из 64 — каждая читала флаг сама
 * и глушила свой таймер. Звук так чинить нельзя: пришлось бы обойти все 64
 * экрана и половину забыть. Глушим в одном месте, там же, где звук и рождается.
 */
let _calmHush = false;

/** Идёт спокойный шаг — звуки молчат, настройка человека не трогается. */
export function setCalmHush(v: boolean) { _calmHush = v; }
export function calmHushNow(): boolean { return _calmHush; }

/** Единственная проверка «звучать ли»: и тумблер человека, и тихий режим. */
export function soundOn(): boolean { return _soundEnabled && !_calmHush; }

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
/** Громкость 0…100. Ноль — тишина, но тумблер при этом остаётся включённым. */
export async function getVolume(): Promise<number> { await loadPrefs(); return _volume; }
export async function setVolume(v: number) {
  _volume = clampVolume(v);
  try { await AsyncStorage.setItem(VOLUME_KEY, String(_volume)); } catch {}
}
/** Ноль и мусор на входе не должны рвать звук: 0…100, целое. */
export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 80;
  return Math.max(0, Math.min(100, Math.round(v)));
}

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

/**
 * Общая громкость долей. Была константой 0.8 — теперь её задаёт человек ползунком,
 * и 80 по умолчанию оставлено НАРОЧНО: у того, кто ничего не трогал, звук ровно
 * такой же, как был. Молчаливая смена громкости при обновлении читалась бы как
 * поломка.
 */
export function masterGain(): number { return clampVolume(_volume) / 100; }
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
    const v = Math.max(0.0001, volume * masterGain());
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

/**
 * Вибрация. Экспортирована с v1.175: тем же путём теперь ходит `juice/haptics`,
 * где раньше стоял гард `Platform.OS === 'web' → return` — а Android-сборка это
 * Tauri, то есть WebView, и для React Native она ровно `web`. Из-за этого вся
 * ветка juice молчала именно на телефонах («вибрацию включил, но её не было»),
 * хотя вот этот путь — через fbCorrect/fbWrong — работал.
 *
 * Настройку спрашиваем ЗДЕСЬ, а не у каждого вызывающего: соседние fb*-функции
 * проверяют `_hapticEnabled` сами, и это ровно та развилка, на которой один
 * новый вызов однажды забудут проверить. Двойная проверка безвредна.
 */
export function vibrate(pattern: number | number[]) {
  if (!_hapticEnabled) return;
  try {
    if (Platform.OS === 'web') {
      const nav = (typeof navigator !== 'undefined') ? (navigator as any) : null;
      if (nav && nav.vibrate) nav.vibrate(pattern);
    } else {
      Vibration.vibrate(pattern);
    }
  } catch {}
}

/** Включена ли вибрация — синхронно, для гарда в хаптик-обёртках. */
export function hapticEnabledNow(): boolean { return _hapticEnabled; }

// ─── public API ────────────────────────────────────────────────────────

export function fbCorrect() {
  if (soundOn()) beep(880, 80, 0.08);            // high short ping
  if (_hapticEnabled) vibrate(20);
}

export function fbWrong() {
  if (soundOn()) beep(220, 200, 0.12);           // low buzz
  if (_hapticEnabled) vibrate([0, 30, 30, 30]);
}

export function fbStimulus() {
  // subtle tick when stimulus appears (CPT, Posner) — short, very quiet
  if (soundOn()) beep(660, 30, 0.04);
}

export function fbComplete() {
  // success chime: 3-note arpeggio
  if (soundOn()) {
    beep(523, 100, 0.1);                              // C
    setTimeout(() => beep(659, 100, 0.1), 100);       // E
    setTimeout(() => beep(784, 200, 0.1), 200);       // G
  }
  if (_hapticEnabled) vibrate([0, 50, 30, 50, 30, 100]);
}

export function fbAchievement() {
  // 4-note melody for new achievement
  if (soundOn()) {
    beep(523, 80, 0.12);
    setTimeout(() => beep(659, 80, 0.12), 80);
    setTimeout(() => beep(784, 80, 0.12), 160);
    setTimeout(() => beep(1047, 200, 0.12), 240);
  }
  if (_hapticEnabled) vibrate([0, 40, 20, 40, 20, 40, 20, 100]);
}

// ─── ЗВУК-ОНЛИ (хаптик в juice/haptics отдельно) + новые события (v1.58) ──
// Подключены к существующему флагу psygames_sound_enabled (тумблер «Звук» в настройках).
/**
 * Сигналы смены фазы дыхания — РАЗНЫЕ для вдоха, задержки и выдоха.
 *
 * ЗАЧЕМ. До v1.181 на любую смену фазы шёл один и тот же `sndTap` + одна и та
 * же вибрация. Дыхательные практики делают с закрытыми глазами — и с закрытыми
 * глазами понять, что именно началось, было нельзя: экран показывал, звук молчал
 * об этом. Теперь тон сам говорит, что делать: вверх — вдох, вниз — выдох,
 * ровно и тихо — задержка. Тогда упражнение можно вести на слух, не глядя.
 *
 * Вибрация различается так же: короткий импульс на вдох, двойной на задержку,
 * длинный на выдох. Это дублирует звук для тех, кто выключил громкость.
 */
function glide(from: number, to: number, ms: number, volume: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const [waveRaw, pitchRaw] = (_soundPack || 'sine').split(':');
    const mult = pitchRaw ? parseFloat(pitchRaw) : 1;
    const k = Number.isFinite(mult) && mult > 0 ? mult : 1;
    osc.type = (waveRaw || 'sine') as OscillatorType;
    const t0 = ctx.currentTime;
    const dur = Math.max(0.08, ms / 1000);
    osc.frequency.setValueAtTime(from * k, t0);
    osc.frequency.exponentialRampToValueAtTime(to * k, t0 + dur);
    const v = Math.max(0.0001, volume * masterGain());
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  } catch {}
}

/** Вдох: тон идёт вверх — как наполнение. */
export function sndBreathIn()   { if (soundOn()) glide(330, 550, 320, 0.07); vibrate(18); }
/** Задержка: ровный тихий тон, ничего не происходит. */
export function sndBreathHold() { if (soundOn()) beep(440, 130, 0.045); vibrate([14, 90, 14]); }
/** Выдох: тон идёт вниз, длиннее — на нём и расслабляются. */
export function sndBreathOut()  { if (soundOn()) glide(520, 300, 420, 0.07); vibrate(60); }

export function sndTap()     { if (soundOn()) beep(660, 45, 0.05); }
export function sndCorrect() { if (soundOn()) beep(880, 85, 0.09); }
export function sndWrong()   { if (soundOn()) beep(220, 180, 0.11); }
export function sndWin()     { if (soundOn()) { beep(523, 110, 0.1); setTimeout(() => beep(659, 110, 0.1), 100); setTimeout(() => beep(784, 180, 0.1), 200); setTimeout(() => beep(1047, 220, 0.1), 300); } }   // фанфары до-ми-соль-до
export function sndLose()    { if (soundOn()) { beep(392, 170, 0.1); setTimeout(() => beep(330, 170, 0.1), 140); setTimeout(() => beep(262, 230, 0.1), 280); } } // нисходящее
export function sndToken()   { if (soundOn()) { beep(1175, 70, 0.09); setTimeout(() => beep(1568, 120, 0.08), 60); } } // звонкая монетка
export function sndCombo(n: number) { if (soundOn()) { const f = 520 + Math.min(Math.max(n, 0), 8) * 55; beep(f, 90, 0.08); setTimeout(() => beep(Math.round(f * 1.5), 90, 0.07), 50); } }
export function sndFlip()    { if (soundOn()) beep(470, 55, 0.05); }   // свуш переворота
export function sndMatch()   { if (soundOn()) { beep(784, 80, 0.09); setTimeout(() => beep(1047, 110, 0.08), 60); } }
export function sndPlace()   { if (soundOn()) beep(523, 45, 0.06); }   // мягкий тик
// G-геймификация: раздельные звуки (отличны от обычной победы sndWin).
export function sndLevelUp() { if (soundOn()) { beep(523, 90, 0.1); setTimeout(() => beep(659, 90, 0.1), 90); setTimeout(() => beep(784, 100, 0.1), 180); setTimeout(() => beep(1047, 130, 0.11), 280); setTimeout(() => beep(1319, 280, 0.11), 410); } } // 5-нот восходящая фанфара уровня
export function sndStreak()  { if (soundOn()) { beep(880, 70, 0.09); setTimeout(() => beep(1175, 150, 0.09), 70); } } // быстрый яркий чайм стрика
// SND-T: таймер в играх на время — тихий тик последних 5 секунд + сигнал «время вышло».
export function sndTimerTick() { if (soundOn()) beep(1000, 45, 0.045); }
export function sndTimerEnd()  { if (soundOn()) { beep(523, 130, 0.09); setTimeout(() => beep(392, 230, 0.09), 130); } }

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
/**
 * Фоновая музыка переехала в services/music.ts на НАСТОЯЩИЕ треки.
 *
 * Раньше здесь жил генератор: прогрессия Am7 → Fmaj7 → Cmaj7 → G6 чистыми синусами,
 * нота раз в 1-2 секунды. Тестер назвал это «3 ноты) или убрать пока» и был прав по
 * сути. Теперь шесть инструментальных треков по две минуты; здесь остались только
 * переходники, чтобы не менять вызовы setMusicEnabled и старые импорты.
 *
 * Звуковые ЭФФЕКТЫ остаются на Web Audio в этом файле: там важна миллисекундная
 * задержка отклика, а музыке — нет.
 */
export function startMusic(preferId?: string): void {
  if (!_musicOn) return;
  musicStart(preferId);
}

export function stopMusic(): void {
  musicStop();
}
