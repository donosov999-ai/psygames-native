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

/**
 * Потолок бакета `feedback-audio` — 8 МБ (снято с `storage.buckets` 20.08.2026).
 * Хранится здесь, чтобы отправка могла отказать ДО заливки и сказать об этом,
 * а не выяснять это молчаливым отказом хранилища.
 */
export const AUDIO_MAX_BYTES = 8 * 1024 * 1024;

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
   *
   * Замер по бакету 20.08.2026 подтверждает порог с другой стороны: у немых
   * заметок OnePlus 8 Pro поток ровно 235 байт/с, у нормальной речи — от 6300
   * до 15000 байт/с. Разница в шестьдесят раз, ошибиться негде.
   */
  peak: number;
  /**
   * Удалось ли вообще замерить уровень. `false` — анализатор не отработал ни разу
   * (нет AudioContext, или он так и не вышел из `suspended`), и тогда `peak = 0`
   * означает «не знаем», а НЕ «тишина».
   *
   * ⚠️ БЕЗ ЭТОГО ФЛАГА ПРЕДУПРЕЖДЕНИЕ ВРЁТ. AudioContext, созданный после `await`
   * (а `getUserMedia` — это await), теряет пользовательский жест и в Chrome
   * заводится в состоянии `suspended`. Анализатор на таком контексте отдаёт ровно
   * 128 в каждом сэмпле — ту же картину, что и мёртвый микрофон. Показать по этому
   * «мы вас не слышим» человеку с исправным микрофоном — хуже, чем молчать.
   */
  measured: boolean;
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

/** Как часто пересчитываем уровень для живой полоски. */
const LEVEL_MS = 100;

/**
 * Начать запись. Бросает, если человек отказал в доступе к микрофону —
 * вызывающий показывает подсказку и остаётся с обычным текстовым репортом.
 *
 * @param onTick  секунды И текущий уровень 0..1 — чтобы человек ВИДЕЛ, что его
 *                слышно, пока говорит. Немая запись обязана выглядеть иначе,
 *                чем говорящая, — иначе узнать об отказе микрофона неоткуда.
 * @param onAutoStop  запись упёрлась в потолок и остановилась сама.
 */
export async function startRecording(
  onTick?: (sec: number, level: number) => void,
  onAutoStop?: () => void,
): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();

  /** Когда рекордер РЕАЛЬНО замолчал. 0 — ещё пишет. См. `seconds` ниже. */
  let endedAt = 0;
  /** Остановились сами, упершись в потолок (а не по кнопке человека). */
  let ceiling = false;
  let released = false;

  // Слушаем уровень параллельно записи — MediaRecorder про громкость ничего не знает
  // и одинаково довольна и речью, и тишиной.
  let peak = 0;
  let level = 0;
  /** Сколько раз анализатор реально отработал. 0 → `measured: false`, см. VoiceNote. */
  let reads = 0;
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
      // Контекст, заведённый после await, приходит `suspended` и отдаёт ровную
      // тишину. Будим сразу и продолжаем будить на каждом тике, пока не проснётся:
      // один resume() может не пройти, если жест к этому моменту уже «остыл».
      const wake = () => { try { void (audioCtx as any)?.resume?.()?.catch?.(() => {}); } catch { /* нет resume */ } };
      wake();
      levelTimer = setInterval(() => {
        if (!audioCtx) return;
        if (audioCtx.state !== 'running') { wake(); return; }
        analyser.getByteTimeDomainData(buf);
        let m = 0;
        for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128) / 128; if (d > m) m = d; }
        reads++;
        level = m;
        if (m > peak) peak = m;
      }, LEVEL_MS);
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
      ceiling = true;
      try { rec.stop(); } catch { /* уже остановлен */ }
    }
  };
  rec.start(1000);   // таймслайсы: если WebView прибьют, уже записанное не пропадёт

  const release = () => {
    if (released) return;
    released = true;
    clearInterval(timer);
    if (levelTimer) clearInterval(levelTimer);
    try { audioCtx?.close(); } catch { /* уже закрыт */ }
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* поток уже мёртв */ }
  };

  const buildNote = (): VoiceNote | null => {
    if (!chunks.length) return null;
    const type = rec.mimeType || mime || 'audio/webm';
    return {
      blob: new Blob(chunks, { type }),
      /**
       * 🔴 ДЛИНА СЧИТАЕТСЯ ДО МОМЕНТА, КОГДА РЕКОРДЕР ЗАМОЛЧАЛ, А НЕ ДО «СЕЙЧАС».
       *
       * Замер 20.08.2026 по боевой базе: заметки на 495, 540 и 648 секунд при
       * потолке 180. Столько человек ГОВОРИЛ, а не столько записалось: автостоп
       * глушил рекордер на третьей минуте, но не отпускал ни микрофон, ни счётчик,
       * и на экране продолжало тикать. Человек одиннадцать минут наговаривал в
       * мёртвый рекордер и видел бегущее время.
       *
       * Потолок здесь жёсткий, а не декоративный: `endedAt` спасает только когда
       * `onstop` пришёл. На кривом WebView рекордер уходит в `inactive` молча, и
       * тогда `endedAt` остаётся нулём — длина снова считалась бы по часам. Дольше
       * потолка запись быть не может по построению, так и пишем.
       */
      seconds: Math.min(
        MAX_RECORD_SEC,
        Math.max(1, Math.round(((endedAt || Date.now()) - startedAt) / 1000)),
      ),
      mime: type,
      peak,
      measured: reads > 0,
    };
  };

  /**
   * 🔴 ЕДИНСТВЕННЫЙ ВЫХОД ИЗ ЗАПИСИ. Раньше `onstop` вешался только внутри `stop()`,
   * то есть существовал лишь тогда, когда останавливал ЧЕЛОВЕК. Автостоп по потолку
   * дёргал `rec.stop()` в пустоту: рекордер замолкал, а `release()` не звался —
   * микрофон оставался открытым, AudioContext живым, таймер продолжал слать секунды
   * в интерфейс. Проверено исполнением: при потолке 180 счётчик добегал до 540, а
   * `stream.getTracks()[0].stop()` не вызывался ни разу.
   */
  let settle: ((v: VoiceNote | null) => void) | null = null;
  const done = new Promise<VoiceNote | null>((res) => { settle = res; });
  const finish = () => {
    if (!endedAt) endedAt = Date.now();
    release();
    settle?.(buildNote());
    settle = null;
  };
  rec.onstop = () => {
    finish();
    if (ceiling) onAutoStop?.();
  };

  const timer = setInterval(() => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    onTick?.(sec, level);
    if (sec >= MAX_RECORD_SEC && rec.state === 'recording') {
      ceiling = true;
      try { rec.stop(); } catch { /* уже остановлен */ }
    }
  }, 500);

  return {
    stop: () => {
      // Уже стоит (автостоп по потолку) — заметка посчитана, отдаём ту же.
      if (rec.state === 'inactive') finish();
      else {
        try { rec.stop(); } catch { finish(); }
        // Страховка: на кривом WebView `onstop` может не прийти вовсе, и тогда
        // интерфейс навсегда остался бы в состоянии «идёт запись», а микрофон —
        // открытым. `finish` идемпотентен, лишний вызов ничего не портит.
        setTimeout(finish, 1500);
      }
      return done;
    },
    cancel: () => {
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* уже стоит */ }
      chunks.length = 0;
      if (!endedAt) endedAt = Date.now();
      release();
      settle?.(null);
      settle = null;
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
