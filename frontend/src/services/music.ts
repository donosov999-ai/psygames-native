/**
 * Фоновая музыка — настоящие треки вместо четырёх аккордов.
 *
 * ЧТО БЫЛО. Музыка синтезировалась на лету: прогрессия Am7 → Fmaj7 → Cmaj7 → G6
 * чистыми синусами, без ритма и тембра. Отзыв тестера дословно: «Музыка 3 ноты)
 * или убрать пока или какие нить бесплатные треки сделать». Он был прав по сути,
 * хотя аккордов четыре: слушалось это как упражнение по синтезу, а не как музыка.
 *
 * ЧТО СТАЛО. Шесть инструментальных треков по две минуты, сгенерированы Lyria 3 Pro
 * (Google) через OpenRouter — $0.08 за трек против покупки лицензий. Промпты и
 * скрипт генерации: scratchpad/gen-music.mjs в сессии 13.08.2026.
 *
 * ⚠️ ФОРМАТ MP3, А НЕ OPUS, И ЭТО НЕ НЕДОСМОТР. Opus легче почти вдвое (5 МБ против
 * 7.8), но в WKWebView на macOS он воспроизводится ненадёжно, а десктопная сборка
 * живёт именно там. MP3 играет везде без оговорок.
 *
 * ⚠️ ОБЫЧНЫЙ <audio>, А НЕ WEB AUDIO. Фоновая музыка гибрида пока в WebView, и
 * элементу audio не нужен ни разбуженный AudioContext, ни ручная буферизация — он
 * сам тянет файл по мере проигрывания. Звуковые эффекты остаются на Web Audio:
 * там важна миллисекундная задержка, здесь — нет.
 *
 * ⚠️ ВО ВСЕХ ТРЕКАХ ЕСТЬ НЕСЛЫШИМЫЙ ВОДЯНОЙ ЗНАК SynthID — так устроена модель,
 * отключить нельзя. На слух не влияет, но треки опознаваемы как машинные.
 */

/** Трек: id для выбора по контексту + сам файл. */
export interface Track {
  id: string;
  src: any;
}

/**
 * Библиотека. Порядок важен: без контекста играем подряд с случайного места,
 * чтобы человек не слышал каждый раз одно и то же первым.
 */
export const TRACKS: Track[] = [
  { id: 'soft-piano',   src: require('../../assets/audio/music/soft-piano.mp3') },
  { id: 'warm-strings', src: require('../../assets/audio/music/warm-strings.mp3') },
  { id: 'focus-pulse',  src: require('../../assets/audio/music/focus-pulse.mp3') },
  { id: 'morning',      src: require('../../assets/audio/music/morning.mp3') },
  { id: 'evening',      src: require('../../assets/audio/music/evening.mp3') },
  { id: 'breathing',    src: require('../../assets/audio/music/breathing.mp3') },
];

/** Громкость фона. Музыка играет ПОД упражнением, а не вместо него. */
const VOLUME = 0.18;
const FADE_MS = 800;

let el: HTMLAudioElement | null = null;
let order: number[] = [];
let pos = 0;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let fadeEpoch = 0;
let playEpoch = 0;
let starting = false;
let wanted = false;
let gain = 1;
const holds = new Set<string>();

function srcUri(src: any): string {
  if (typeof src === 'string') return src;
  if (src && typeof src === 'object') return src.uri || src.default || '';
  return '';
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cancelFade(): void {
  fadeEpoch++;
  if (fadeTimer !== null) clearInterval(fadeTimer);
  fadeTimer = null;
}

/** A fade owns a specific element and generation, never the mutable global el. */
function fadeTo(target: number, done?: () => void): void {
  cancelFade();
  const audio = el;
  if (!audio) return;
  const generation = fadeEpoch;
  const from = audio.volume;
  const steps = Math.max(1, Math.round(FADE_MS / 50));
  let i = 0;
  const timer = setInterval(() => {
    if (audio !== el || generation !== fadeEpoch) { clearInterval(timer); return; }
    i++;
    audio.volume = Math.max(0, Math.min(1, from + (target - from) * i / steps));
    if (i >= steps) {
      clearInterval(timer);
      if (fadeTimer === timer) fadeTimer = null;
      done?.();
    }
  }, 50);
  fadeTimer = timer;
}

function allowed(): boolean { return wanted && holds.size === 0; }

function resumeCurrent(): void {
  const audio = el;
  if (!audio || !allowed() || starting) return;
  if (!audio.paused) { fadeTo(VOLUME * gain); return; }
  const epoch = ++playEpoch;
  starting = true;
  // Invoke play synchronously: retry from a user gesture must stay in that gesture.
  try {
    Promise.resolve(audio.play()).then(() => {
      if (audio !== el) { audio.pause(); return; }
      if (epoch !== playEpoch) { if (!allowed()) audio.pause(); return; }
      starting = false;
      if (allowed()) fadeTo(VOLUME * gain);
      else audio.pause();
    }).catch(() => {
      if (epoch === playEpoch) starting = false;
      // Autoplay/interruption rejection is recoverable on the next gesture.
    });
  } catch {
    if (epoch === playEpoch) starting = false;
  }
}

function playAt(index: number): void {
  if (!el || !TRACKS.length || !order.length) return;
  cancelFade();
  playEpoch++;
  starting = false;
  const t = TRACKS[order[index % order.length]];
  el.src = srcUri(t.src);
  el.volume = 0;
  resumeCurrent();
}

function onEnded(): void {
  if (!el) return;
  pos++;
  playAt(pos);
}

/** App-owned playlist: focus changes do not create a new element or reset time. */
export function startMusic(preferId?: string): void {
  if (typeof document === 'undefined' || !TRACKS.length) return;
  wanted = true;
  if (!el) {
    el = document.createElement('audio');
    el.preload = 'none';
    el.loop = false;
    el.addEventListener('ended', onEnded);
    order = shuffled(TRACKS.length);
    const want = preferId ? TRACKS.findIndex((t) => t.id === preferId) : -1;
    if (want >= 0) order = [want, ...order.filter((i) => i !== want)];
    pos = 0;
    playAt(pos);
  } else {
    resumeCurrent();
  }
}

/** Setting off: stop smoothly, but retain track position for a later explicit on. */
export function stopMusic(): void {
  wanted = false;
  playEpoch++;
  starting = false;
  const audio = el;
  fadeTo(0, () => { if (audio === el && !allowed()) audio?.pause(); });
}

/** Games/background temporarily pause the SAME player; preference is untouched. */
export function setMusicSuspended(reason: string, value: boolean): void {
  const was = holds.has(reason);
  if (was === value) return;
  if (value) holds.add(reason); else holds.delete(reason);
  if (allowed()) resumeCurrent();
  else {
    playEpoch++;
    starting = false;
    const audio = el;
    fadeTo(0, () => { if (audio === el && !allowed()) audio?.pause(); });
  }
}

export function setMusicGain(value: number): void {
  gain = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  if (allowed() && el && !el.paused) fadeTo(VOLUME * gain);
}

/** Root teardown only, never a page blur. Invalidates all late play promises. */
export function disposeMusic(): void {
  wanted = false;
  playEpoch++;
  starting = false;
  cancelFade();
  const audio = el;
  el = null;
  holds.clear();
  if (audio) {
    audio.removeEventListener('ended', onEnded);
    try { audio.pause(); audio.src = ''; } catch { /* platform teardown */ }
  }
}

export function isMusicPlaying(): boolean { return !!el && allowed() && !el.paused; }
