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
 * ⚠️ ОБЫЧНЫЙ <audio>, А НЕ WEB AUDIO. Приложение везде web (Tauri/WebView), и
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
let fadeTimer: any = null;

/** Метро отдаёт ассет по-разному: строкой на web и объектом с uri на нативе. */
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

function fadeTo(target: number, done?: () => void): void {
  if (!el) return;
  if (fadeTimer) clearInterval(fadeTimer);
  const from = el.volume;
  const steps = Math.max(1, Math.round(FADE_MS / 50));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    if (!el) { clearInterval(fadeTimer); fadeTimer = null; return; }
    el.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)));
    if (i >= steps) { clearInterval(fadeTimer); fadeTimer = null; done?.(); }
  }, 50);
}

function playAt(index: number): void {
  if (!el || !TRACKS.length) return;
  const t = TRACKS[order[index % order.length]];
  el.src = srcUri(t.src);
  el.volume = 0;
  // Автозапуск может быть отклонён до первого жеста — это нормально, не шумим в консоль.
  el.play().then(() => fadeTo(VOLUME)).catch(() => {});
}

/**
 * Запустить фон. Идемпотентно: повторный вызов при играющей музыке ничего не делает.
 * @param preferId начать с этого трека (зарядка вечером → 'evening', дыхание → 'breathing')
 */
export function startMusic(preferId?: string): void {
  if (typeof document === 'undefined') return;   // на всякий: SSR-рендер маршрутов
  if (el) return;
  el = document.createElement('audio');
  el.preload = 'none';
  el.loop = false;   // зацикливаем ПЛЕЙЛИСТ, а не один трек — иначе приедается
  el.addEventListener('ended', () => { pos++; playAt(pos); });

  order = shuffled(TRACKS.length);
  const want = preferId ? TRACKS.findIndex((t) => t.id === preferId) : -1;
  if (want >= 0) {
    // Нужный трек — первым, остальные следом в перемешанном порядке.
    order = [want, ...order.filter((i) => i !== want)];
  }
  pos = 0;
  playAt(pos);
}

/** Остановить с затуханием — обрыв на полуноте слышен и раздражает. */
export function stopMusic(): void {
  if (!el) return;
  const dying = el;
  el = null;
  if (fadeTimer) clearInterval(fadeTimer);
  const from = dying.volume;
  const steps = Math.max(1, Math.round(FADE_MS / 50));
  let i = 0;
  const t = setInterval(() => {
    i++;
    dying.volume = Math.max(0, from * (1 - i / steps));
    if (i >= steps) {
      clearInterval(t);
      try { dying.pause(); dying.src = ''; } catch { /* no-op */ }
    }
  }, 50);
}

/** Играет ли сейчас — для настроек и тестов. */
export function isMusicPlaying(): boolean {
  return !!el && !el.paused;
}
