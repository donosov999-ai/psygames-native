/**
 * voiceNote — голосовая заметка к репорту, v1.166.0.
 *
 * ЗАЧЕМ. Валя диктует репорты голосом, а до нас доезжает то, что расслышал её
 * телефон: «глубоко запечатательное дыхание» вместо «диафрагмальное», «я сделала
 * 10 лет» вместо «10 раз». Смысл приходится угадывать, а половина претензии —
 * в интонации («ну какая кнопка начать снова?!»), которую распознавание съедает
 * целиком. Оригинал звука убирает этот слой потерь.
 *
 * ЧТО ЭТО НЕ ДЕЛАЕТ. Не распознаёт речь на устройстве и не заменяет текст:
 * человек по-прежнему пишет (или диктует клавиатурой), а запись идёт РЯДОМ.
 * Расшифровка — наша забота, whisper на brainkit, не его телефона.
 *
 * ПОЧЕМУ MediaRecorder, а не expo-av. Приложение живёт в WebView (Tauri), тут
 * доступен штатный веб-API, и он же работает в браузерной сборке. Отдельная
 * нативная зависимость дала бы второй путь кода ради того же результата.
 */

/** Потолок записи. Дальше останавливаем сами: 8 МБ в бакете ≈ 4 минуты opus. */
export const MAX_RECORD_SEC = 180;

export interface VoiceNote {
  blob: Blob;
  /** Длительность в секундах — показываем человеку и кладём в контекст репорта. */
  seconds: number;
  mime: string;
  /**
   * Пиковая громкость за запись, 0..1. Ноль означает, что дорожка была, а звука в
   * ней не было.
   *
   * ЗАЧЕМ. Две Валины голосовые заметки (02.08 и 07.08, 15 и 21 секунда) приехали
   * ПОЛНОСТЬЮ немыми: замер ffmpeg — mean_volume = max_volume = −91 дБ, то есть
   * цифровая тишина. Файл при этом валидный и правильной длительности, размер
   * 3.6 и 5 КБ — столько opus и весит на тишине. Права RECORD_AUDIO в манифесте
   * есть с v1.170, getUserMedia отдаёт поток, MediaRecorder честно пишет — но
   * сэмплов в дорожке нет (похоже на отказ системы отдавать микрофон, Android
   * в таких случаях молча шлёт нули вместо ошибки).
   *
   * Отладить чужой телефон отсюда нельзя, а вот сделать отказ ВИДИМЫМ можно:
   * человек узнаёт сразу, а не пишет три минуты в пустоту, и мы видим уровень
   * в контексте репорта.
   */
  peak: number;
}

/** Ниже этого пика считаем, что микрофон не отдал звук (тишина ≈ 0.0005). */
export const SILENCE_PEAK = 0.01;

/** Поддерживает ли эта сборка запись вообще (старый WebView, десктоп без микрофона). */
export function canRecord(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** Первый поддерживаемый контейнер. Android WebView — webm/opus, iOS — mp4. */
function pickMime(): string {
  const wanted = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const m of wanted) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* старый WebView */ }
  }
  return '';
}

export interface Recorder {
  /** Остановить и получить запись. null — если ничего не записалось. */
  stop: () => Promise<VoiceNote | null>;
  /** Бросить запись и отпустить микрофон, ничего не возвращая. */
  cancel: () => void;
}

/**
 * Начать запись. Бросает, если человек отказал в доступе к микрофону —
 * вызывающий показывает подсказку и остаётся с обычным текстовым репортом.
 */
export async function startRecording(onTick?: (sec: number) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  let stopped = false;

  // Слушаем уровень параллельно записи — MediaRecorder про громкость ничего не знает
  // и одинаково довольна и речью, и тишиной.
  let peak = 0;
  let audioCtx: AudioContext | null = null;
  let levelTimer: ReturnType<typeof setInterval> | null = null;
  try {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let m = 0;
        for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128) / 128; if (d > m) m = d; }
        if (m > peak) peak = m;
      }, 200);
    }
  } catch { /* нет AudioContext — просто останемся без замера */ }

  /**
   * ⚠️ ПОТОЛОК ПРОВЕРЯЕМ ЗДЕСЬ, А НЕ ТОЛЬКО ПО ТАЙМЕРУ.
   *
   * 14.08.2026 приехала заметка на 329 секунд при потолке 180: автостоп не сработал.
   * Он висел на одном setInterval, а Android-вебвью душит таймеры JS, когда экран
   * гаснет или приложение уходит в фон — человек говорит, счётчик стоит, запись
   * не останавливается. Дальше упирается в 8 МБ бакета, и заметка теряется целиком.
   *
   * ondataavailable тикает от САМОГО рекордера (нативная часть, таймслайс 1000 мс) —
   * этот источник времени не зависит от того, что вебвью сделал с таймерами.
   */
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
    if (Date.now() - startedAt >= MAX_RECORD_SEC * 1000 && rec.state === 'recording') {
      try { rec.stop(); } catch { /* уже остановлен */ }
    }
  };
  rec.start(1000);   // таймслайсы: если WebView прибьют, уже записанное не пропадёт

  const release = () => {
    stopped = true;
    clearInterval(timer);
    if (levelTimer) clearInterval(levelTimer);
    try { audioCtx?.close(); } catch { /* уже закрыт */ }
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* поток уже мёртв */ }
  };

  const timer = setInterval(() => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    onTick?.(sec);
    if (sec >= MAX_RECORD_SEC && rec.state === 'recording') {
      try { rec.stop(); } catch { /* уже остановлен */ }
    }
  }, 500);

  return {
    stop: () =>
      new Promise<VoiceNote | null>((resolve) => {
        if (stopped) { resolve(null); return; }
        const finish = () => {
          release();
          if (!chunks.length) { resolve(null); return; }
          const type = rec.mimeType || mime || 'audio/webm';
          resolve({
            blob: new Blob(chunks, { type }),
            seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
            mime: type,
            peak,
          });
        };
        if (rec.state === 'inactive') { finish(); return; }
        rec.onstop = finish;
        try { rec.stop(); } catch { finish(); }
      }),
    cancel: () => {
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* уже стоит */ }
      release();
      chunks.length = 0;
    },
  };
}

/** Расширение файла по mime — чтобы в бакете лежало с понятным именем. */
export function extFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}
