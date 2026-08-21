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
  /**
   * Что сказала о себе САМА звуковая дорожка в момент записи.
   *
   * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ `peak`. Пик — это вывод: «сэмплы нулевые, значит звука
   * нет». Дорожка же отвечает прямо. Android, отказываясь отдать микрофон,
   * НЕ БРОСАЕТ ОШИБКУ: `getUserMedia` возвращает поток, `MediaRecorder` пишет
   * валидный файл правильной длительности — просто из нулей. Но дорожка при
   * этом помечена `muted`, и это видно СРАЗУ, до первого слова.
   *
   * Разница в цене: пик мы узнаём через секунду работы анализатора, а `muted`
   * читается в момент старта. Человек, у которого система молча зажала
   * микрофон, узнаёт об этом до того, как начал говорить, а не после восьми
   * минут рассказа.
   *
   * `null` — старый WebView без `getAudioTracks`, спрашивать нечего.
   */
  track: TrackState | null;
  /**
   * Каким микрофоном она снята: сырым или обработанным. См. `openMic`.
   *
   * 🔴 ЗАЧЕМ В ЗАМЕТКЕ. Источник выбирается замером на живом устройстве, и
   * узнать, какой из путей на чужом телефоне сработал, можно только отсюда:
   * поле уезжает в репорт. Без него мы снова будем гадать по сэмплам.
   */
  source: MicSource;
  /** Что система думает о нашем доступе к микрофону. См. `MicAccess`. */
  access: MicAccess | null;
  /**
   * Чем кончился разговор с системой о разрешении: `no-bridge` (моста нет —
   * веб, десктоп или сборка без нативной части), `granted`, `denied`.
   *
   * 🔴 ЗАЧЕМ. 21.08.2026 я выпустил запрос разрешения и НЕ записал, какой веткой
   * он пошёл. Первый же отчёт показал, что разрешения по-прежнему нет, — и
   * отличить «мост не встал» от «человек отказал» стало нечем. Это две разные
   * починки, и без этого поля выбор между ними снова был бы гаданием.
   */
  micGate: string;
}

/**
 * ЧТО СИСТЕМА ДУМАЕТ О НАШЕМ ДОСТУПЕ К МИКРОФОНУ.
 *
 * 🔴 ЗАЧЕМ, ЕСЛИ ЕСТЬ ПИК И ЕСТЬ ДОРОЖКА. Замер 21.08.2026, первый отчёт на
 * 1.210.0: `audio_source: raw` (сырой микрофон, как и задумано), `audio_peak: 0`,
 * дорожка живая и НЕ `muted`, файл 8493 байта залился. То есть гипотеза, ради
 * которой этот релиз и делался — «обработка звука уводит захват на путь, где
 * Android отдаёт нули», — НЕ ПОДТВЕРДИЛАСЬ: сырой путь дал ту же тишину.
 *
 * Единственное новое, что сказала дорожка: `label` ПУСТОЙ. В Chromium имя
 * устройства появляется только когда доступ к микрофону выдан по-настоящему;
 * пустое имя при живой дорожке — признак того, что поток отдали, а устройство
 * за ним не стоит.
 *
 * Признак косвенный, поэтому спрашиваем прямо и обе стороны сразу:
 *   · что говорит `navigator.permissions` про микрофон;
 *   · сколько микрофонов видит браузер и у скольких есть ИМЯ — имена
 *     `enumerateDevices` отдаёт РОВНО при выданном доступе, и «устройств
 *     несколько, имён ноль» отличает «не дали» от «дали, но молчит».
 *
 * ⚠️ ЭТО ИЗМЕРЕНИЕ, А НЕ ПОЧИНКА. Ничего не меняет в записи и ничего не чинит —
 * следующий отчёт просто ответит на вопрос, вместо того чтобы задать новый.
 */
export interface MicAccess {
  /** `granted` / `denied` / `prompt` / `unsupported` / `error`. */
  permission: string;
  /** Сколько микрофонов видит браузер. */
  inputs: number;
  /** У скольких из них есть имя. Ноль при непустом `inputs` — доступа нет. */
  named: number;
}

/** Спрашиваем систему напрямую. Любая осечка — это `error`, а не молчание. */
export async function askMicAccess(): Promise<MicAccess> {
  let permission = 'unsupported';
  try {
    const q = (navigator as any).permissions?.query;
    if (q) {
      const st = await (navigator as any).permissions.query({ name: 'microphone' as any });
      permission = String(st?.state ?? 'unsupported');
    }
  } catch {
    permission = 'error';
  }
  let inputs = 0;
  let named = 0;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    for (const d of list) {
      if (d.kind !== 'audioinput') continue;
      inputs++;
      if (String(d.label ?? '').trim()) named++;
    }
  } catch { /* старый WebView — останутся нули */ }
  return { permission, inputs, named };
}

/** Состояние звуковой дорожки: что о себе сказало само устройство. */
export interface TrackState {
  /** Система не отдаёт звук в дорожку. На Android это и есть «микрофон зажат». */
  muted: boolean;
  /** `ended` — дорожку отобрали на ходу (звонок, другое приложение). */
  readyState: string;
  /** Имя устройства, как его назвала система: помогает узнать чужую гарнитуру. */
  label: string;
  /** Дорожка была `muted` хоть раз ЗА ВРЕМЯ записи, а не только на старте. */
  everMuted: boolean;
}

/** Ниже этого пика считаем, что микрофон не отдал звук (тишина ≈ 0.0005). */
export const SILENCE_PEAK = 0.01;

/**
 * НАДО ЛИ СКАЗАТЬ ЧЕЛОВЕКУ «МЫ ВАС НЕ СЛЫШИМ».
 *
 * 🔴 ПОЧЕМУ ФУНКЦИЕЙ, А НЕ УСЛОВИЕМ В ЭКРАНЕ. Правило жило строкой внутри
 * виджета, и проверить его было нечем: гейт звал запись, а решение принимал
 * экран. Поломка «вернуть решение только к пику» оставалась ЗЕЛЁНОЙ — самая
 * дорогая часть работы не проверялась вовсе.
 *
 * Два независимых основания, и оба нужны:
 *   · дорожка сказала о себе `muted` — прямой ответ устройства, читается сразу
 *     и работает без анализатора;
 *   · замер дал тишину — вывод из сэмплов, на секунду позже, но ловит случаи,
 *     когда дорожка о себе врёт или API её состояния нет.
 *
 * ⚠️ `measured: false` НЕ повод предупреждать: это «не знаем», а не «тишина».
 * Обвинить исправный микрофон хуже, чем промолчать.
 */
export function shouldWarnSilent(note: VoiceNote | null | undefined): boolean {
  if (!note) return false;
  if (note.track?.everMuted) return true;
  return note.measured && note.peak < SILENCE_PEAK;
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

/** Как часто пересчитываем уровень для живой полоски. */
const LEVEL_MS = 100;

/** Каким путём открыт микрофон. */
export type MicSource =
  /** Сырой: обработка выключена. */                       'raw'
  /** Обработанный: как просит браузер по умолчанию. */   | 'processed'
  /** Сырой, но проверить его не вышло — нечем мерить. */ | 'raw-unprobed';

/**
 * 🔴 ПОЧЕМУ МЫ ПРОСИМ СЫРОЙ МИКРОФОН, А НЕ ОБЫЧНЫЙ.
 *
 * Замер по боевой базе 20.08.2026: голосом отчитывались с 16 устройств, слышимую
 * речь дало РОВНО ОДНО — семь записей за 2 августа. Остальные пятнадцать, на
 * двенадцати версиях приложения, дали цифровую тишину: файл валидный,
 * длительность верная, пик −91 дБ. Немота — не особенность чьего-то телефона, а
 * то, что происходит почти всегда.
 *
 * Голый `getUserMedia({ audio: true })` включает обработку по умолчанию —
 * эхоподавление, шумодав, авто-усиление. Chromium ради аппаратного
 * эхоподавления открывает микрофон путём голосовой связи, и на части устройств
 * этот путь отдаёт нули, НЕ БРОСАЯ ОШИБКИ: дорожка живая, `muted` не выставлен,
 * рекордер честно пишет пустоту. Выключенная обработка уводит захват на обычный
 * путь. Для голосовой заметки это ещё и лучше по существу: без авто-усиления и
 * агрессивного шумодава тихая речь не съедается.
 *
 * ⚠️ ЭТО ГИПОТЕЗА, И ОНА ПОМЕЧЕНА КАК ГИПОТЕЗА. Проверять её пробой внутри записи
 * я не стал: чтобы отличить живой микрофон от нулей, надо слушать его несколько
 * сотен миллисекунд, и это начало речи — у ВСЕХ, ради случая, когда запасной путь
 * и так почти всегда мёртв. Поэтому проверка вынесена в поле: каждая заметка
 * несёт `source`, рядом лежит замеренный пик, и связка «источник + пик» отвечает
 * на вопрос по боевым отчётам за несколько дней. Соврать этой паре нечем.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ. Это не починка «наверняка»: если сырой путь даст ту же
 * тишину, мы узнаем об этом из первых же заметок — и будем знать ТОЧНО, а не
 * гадать по сэмплам, как гадали 13 дней после прошлой попытки.
 */
const RAW_AUDIO: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};
const PROCESSED_AUDIO: MediaStreamConstraints = { audio: true };

/**
 * СПРОСИТЬ РАЗРЕШЕНИЕ У СИСТЕМЫ — ДО ТОГО, КАК ПРОСИТЬ МИКРОФОН У БРАУЗЕРА.
 *
 * 🔴 ЗАЧЕМ. Три недели голосовые приезжали немыми с 15 устройств из 16. Причину
 * искали в записи и не нашли: поток отдаётся, дорожка живая, `muted` не выставлен,
 * файл валидный и правильной длительности — из нулей.
 *
 * Ответ дала диагностика, уехавшая в v1.211.0. Боевые отчёты принесли прямой
 * ответ системы: `{ inputs: 3, named: 0, permission: 'unsupported' }` — три
 * микрофонных входа видны, и НИ ОДНОГО С ИМЕНЕМ. Имена устройств пусты ровно до
 * тех пор, пока у страницы нет действующего разрешения на микрофон. Значит
 * разрешения нет — при том, что `RECORD_AUDIO` объявлен в манифесте с v1.170.
 *
 * ⚠️ ОБЪЯВИТЬ ≠ ПОЛУЧИТЬ. На Android 6+ опасное разрешение надо ещё ЗАПРОСИТЬ во
 * время работы. Расчёт был на wry (его WebChromeClient просит сам) — в бою этот
 * путь не сработал ни на одном устройстве, и спорить с фактом нечем. Поэтому
 * запрос идёт через мост `PsyNative`, который ставит нативная часть сборки.
 *
 * ⚠️ ЗДЕСЬ НЕТ МОСТА — И ЭТО НОРМАЛЬНО. Веб, десктоп и старые сборки моста не
 * имеют: тогда ничего не делаем и идём как раньше. Отказ человека тоже не
 * тупик — просто пойдём дальше и предупредим по пику, как сегодня.
 */
interface PsyNativeBridge {
  micState?: () => string;
  requestMic?: () => void;
}

/** Сколько ждём ответа человека на системный диалог, прежде чем идти дальше. */
export const MIC_GRANT_WAIT_MS = 15_000;
const MIC_POLL_MS = 250;

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const bridge = (): PsyNativeBridge | null =>
  (typeof window !== 'undefined' ? ((window as any).PsyNative ?? null) : null);

/**
 * @param waitMs потолок ожидания — параметр, а не только константа: без него
 *               проверка «человек не ответил» шла бы пятнадцать секунд.
 */
export async function ensureMicPermission(waitMs = MIC_GRANT_WAIT_MS): Promise<string> {
  const n = bridge();
  if (typeof n?.micState !== 'function' || typeof n?.requestMic !== 'function') return 'no-bridge';
  if (n.micState() === 'granted') return 'granted';
  n.requestMic();
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await nap(MIC_POLL_MS);
    if (n.micState() === 'granted') return 'granted';
  }
  return 'denied';
}

/**
 * ОТКАЗ В ДОСТУПЕ И ОТКАЗ В УСЛОВИЯХ — РАЗНЫЕ ВЕЩИ.
 *
 * Человек не дал микрофон → повторять запрос нельзя: он получит второй системный
 * диалог подряд, а экран обязан сказать «доступа нет». Устройство не умеет
 * выключать обработку → это не про доступ, и обычный путь надо попробовать.
 */
const DENIED = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);

/** Открытый микрофон и то, каким путём его дали. */
interface OpenMic {
  stream: MediaStream;
  source: MicSource;
}

async function openMic(): Promise<OpenMic> {
  try {
    return { stream: await navigator.mediaDevices.getUserMedia(RAW_AUDIO), source: 'raw' };
  } catch (e: any) {
    if (DENIED.has(String(e?.name))) throw e;
    return { stream: await navigator.mediaDevices.getUserMedia(PROCESSED_AUDIO), source: 'processed' };
  }
}

export async function startRecording(
  onTick?: (sec: number, level: number) => void,
  onAutoStop?: () => void,
): Promise<Recorder> {
  const micGate = await ensureMicPermission();
  const mic = await openMic();
  const { stream } = mic;

  /**
   * Спрашиваем систему о доступе СРАЗУ, не дожидаясь конца записи: `label` у
   * устройств `enumerateDevices` живёт ровно пока доступ выдан, а к моменту
   * сборки заметки дорожка уже остановлена (`readyState: ended`).
   */
  const accessAsked: Promise<MicAccess | null> = askMicAccess().catch(() => null);

  /**
   * Спрашиваем дорожку о ней самой. Делать это надо ДО записи: `muted` на старте
   * означает, что система звук не отдаёт, и говорить человеку об этом надо
   * сейчас, а не по итогам замера через секунду.
   *
   * ⚠️ Подписка на `mute`/`unmute` нужна отдельно от снимка: микрофон отбирают и
   * посреди записи — входящим звонком или другим приложением, — и тогда на
   * старте всё было хорошо, а в файле половина тишины.
   */
  const at0 = stream.getAudioTracks?.()[0] ?? null;
  let everMuted = !!at0?.muted;
  if (at0) {
    at0.addEventListener?.('mute', () => { everMuted = true; });
  }
  const trackState = (): TrackState | null => (at0 ? {
    muted: !!at0.muted,
    readyState: String(at0.readyState ?? ''),
    label: String(at0.label ?? ''),
    everMuted: everMuted || !!at0.muted,
  } : null);

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
      track: trackState(),
      source: mic.source,
      micGate,
      // Наполняется в `finish`: ответ системы приходит своим темпом, и у короткой
      // записи заметка успела бы собраться раньше него — поле уехало бы пустым
      // и читалось как «старый WebView». Поймано проверкой исполнением.
      access: null,
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
    const done2 = settle;
    settle = null;
    if (!done2) return;
    const note = buildNote();
    if (!note) { done2(null); return; }
    /**
     * ⚠️ ОТВЕТ СИСТЕМЫ ДОЖИДАЕМСЯ ЗДЕСЬ, А НЕ НА СТАРТЕ. На старте это была бы
     * задержка перед записью у ВСЕХ; здесь — уже после того, как человек нажал
     * «стоп», и стоит она те же пару тактов. Опрос запущен в начале, пока
     * дорожка жива: `enumerateDevices` отдаёт имена ровно при выданном доступе.
     */
    accessAsked.then((a) => { note.access = a; done2(note); }).catch(() => done2(note));
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
