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
}

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

  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(1000);   // таймслайсы: если WebView прибьют, уже записанное не пропадёт

  const release = () => {
    stopped = true;
    clearInterval(timer);
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
