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
   * ПИК ПО САМОМУ ФАЙЛУ, 0..1. `null` — декодировать запись не удалось.
   *
   * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ `peak`. `peak` — это замер ПОТОКА во время записи, и он
   * существует только там, где есть чем мерить: у веб-пути AudioContext, у
   * нативного — `recLevel` с моста, которого в сборках до 04.09.2026 нет вовсе.
   * Ровно поэтому у 32 из 34 нативных заметок в базе стоит `audio_measured: false`
   * — а `measured: false` по правилу ниже означает «не знаем», и предупреждение
   * НЕ показывается. Тридцать два отзыва уехали с «спасибо» при пустом звуке.
   *
   * Замер 05.09.2026, четыре скачанных из бакета `.m4a` (1,5 / 10,8 / 37,9 /
   * 168,8 с), `ffmpeg -af volumedetect`: у всех четырёх
   * `mean_volume = max_volume = −91,0 дБ` — цифровая тишина при валидном
   * AAC 16 кГц моно и правильной длительности. Поток при этом 4057–5003 байт/с
   * по всем 34 — и у немых, и у говорящих: AAC пишется постоянным битрейтом, и
   * по РАЗМЕРУ немую запись от живой не отличить в принципе.
   *
   * Значит единственный честный источник правды — сам файл. Декодируем его после
   * остановки и меряем пик по сэмплам: это работает на ОБОИХ путях, не зависит ни
   * от версии моста, ни от того, проснулся ли AudioContext.
   */
  filePeak: number | null;
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

/** Сколько ждём декодирования записи, прежде чем сдаться и ответить «не знаю». */
export const PROBE_CAP_MS = 2000;

/**
 * ПИК ПО ГОТОВОМУ ФАЙЛУ — ЕДИНСТВЕННЫЙ ЗАМЕР, КОТОРОМУ НЕЧЕМ СОВРАТЬ.
 *
 * Меряем то, что реально уедет в бакет, а не поток, который мы слушали рядом.
 * `null` — декодера нет или он не справился: тогда честно «не знаем», и решение
 * остаётся за живым замером (см. `shouldWarnSilent`).
 *
 * ⚠️ КОНТЕКСТ НА 8 кГц, А НЕ НА ШТАТНЫХ 48. `decodeAudioData` разворачивает
 * запись в float-сэмплы по частоте контекста: три минуты на 48 кГц — это 32 МБ
 * в памяти телефона, на 8 кГц — 5,4 МБ. Пик от частоты дискретизации не зависит,
 * а тишина остаётся тишиной при любом пересчёте.
 *
 * ⚠️ ПОТОЛОК ОЖИДАНИЯ ОБЯЗАТЕЛЕН. Это тот же класс, что html2canvas в отправке
 * отзыва: декодер на кривом WebView способен не ответить НИКОГДА, а try/catch
 * зависание не ловит. Проиграл гонку — заметка уходит без замера файла, что
 * лучше, чем кнопка «стоп», которая не отпускает.
 */
export async function probeBlobPeak(
  blob: Blob | null | undefined,
  capMs = PROBE_CAP_MS,
): Promise<number | null> {
  try {
    if (!blob || !blob.size || typeof (blob as any).arrayBuffer !== 'function') return null;
    const OAC: any = (globalThis as any).OfflineAudioContext
      || (globalThis as any).webkitOfflineAudioContext;
    if (!OAC) return null;
    const bytes = await blob.arrayBuffer();
    const ctx = new OAC(1, 1, 8000);
    if (typeof ctx?.decodeAudioData !== 'function') return null;
    const decoded: any = await Promise.race([
      new Promise<any>((res) => {
        try {
          // Старая (колбэчная) и новая (промисная) подписи — WebView 90 умеет обе,
          // но какую именно, зависит от сборки; поддерживаем обе разом.
          const p = ctx.decodeAudioData(bytes, (b: any) => res(b), () => res(null));
          if (p && typeof p.then === 'function') p.then((b: any) => res(b), () => res(null));
        } catch { res(null); }
      }),
      new Promise<null>((res) => setTimeout(() => res(null), capMs)),
    ]);
    if (!decoded || typeof decoded.getChannelData !== 'function') return null;
    let m = 0;
    const channels = Number(decoded.numberOfChannels ?? 1) || 1;
    for (let ch = 0; ch < channels; ch++) {
      const d: Float32Array = decoded.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const a = d[i] < 0 ? -d[i] : d[i];
        if (a > m) m = a;
      }
    }
    return m;
  } catch {
    return null;   // нет декодера, битый контейнер, нет памяти — всё это «не знаем»
  }
}

/**
 * Байт в секунду, ниже которых файл заведомо пуст — при любом кодеке.
 *
 * 📍 Замер 05.09.2026: 69 файлов `.webm` скачаны из бакета и промерены
 * `ffmpeg -af volumedetect`, из них у 36 в репорте известен размер и длина.
 * Проверка порога против вердикта ffmpeg на этих 36:
 *   · немых поймано 35 из 35, пропущено 0;
 *   · живых оболгано 0;
 *   · поток у немых  — 234–384 байт/с;
 *   · поток у живого — 16 181 байт/с;
 *   · поток у `.m4a` (AAC 32 кбит/с, постоянный битрейт) — 4057–5003 байт/с,
 *     и у немых, и у говорящих ОДИНАКОВО (34 отзыва, `audio_bytes` в базе).
 *
 * Порог 700 стоит вдвое выше самой тяжёлой тишины (384) и вшестеро ниже самого
 * лёгкого живого потока (4057, AAC) — промахнуться между ними нечем.
 *
 * 🔴 ЧЕГО ЭТОТ ПОРОГ НЕ УМЕЕТ, И ЭТО ГЛАВНОЕ. Немую запись AAC он не видит В
 * ПРИНЦИПЕ: постоянный битрейт пишет одинаковое число байт и на речь, и на
 * тишину. Ровно поэтому приём «235 против 6300», которым ловили немой opus, за
 * три недели не поймал ни одного из 34 немых `.m4a`, — и ровно поэтому появился
 * `probeBlobPeak`. Здесь остаётся то, что порог умеет честно: поймать файл, в
 * котором данных нет вовсе или почти нет (обрыв, пустой контейнер).
 */
export const EMPTY_STREAM_BPS = 700;

/** Файл меньше этого — заголовок контейнера без данных, звука там нет ни при каком кодеке. */
export const EMPTY_BLOB_BYTES = 1024;

/**
 * ПУСТАЯ ЛИ ЗАПИСЬ ПО ОДНОМУ ЛИШЬ ФАЙЛУ, БЕЗ ДЕКОДЕРА.
 *
 * Нужна там, где `probeBlobPeak` ответил «не знаю»: старый WebView без
 * `decodeAudioData`, битый контейнер, нехватка памяти. Молчаливая потеря хуже
 * отказа, поэтому у заслона обязан быть путь, не требующий вообще ничего.
 */
export function looksEmptyRecording(note: VoiceNote | null | undefined): boolean {
  if (!note) return false;
  const bytes = note.blob?.size ?? 0;
  if (bytes < EMPTY_BLOB_BYTES) return true;
  return bytes / Math.max(1, note.seconds) < EMPTY_STREAM_BPS;
}

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
 *
 * 🔴 ТРЕТЬЕ И ГЛАВНОЕ ОСНОВАНИЕ — САМ ФАЙЛ (05.09.2026). Два прежних работают
 * только там, где есть чем мерить поток, и ровно там их и не было: на нативном
 * пути `track` всегда `null` (звук в WebView не попадает), а `measured` в
 * сборках без `recLevel` — `false`. Итог по базе: 34 отзыва `.m4a`, у ВСЕХ
 * `audio_peak: 0`, у 32 `audio_measured: false` → правило возвращало `false` →
 * человек видел «спасибо». Скачанные файлы при этом — цифровая тишина
 * (`ffmpeg volumedetect`: −91,0 дБ и среднее, и пик).
 *
 * `filePeak` меряет то, что уедет на сервер, и потому старше обоих выводов:
 * если файл декодирован, спор окончен — судим по нему. Живой замер мог слышать
 * речь, а в файл её не записать; уехал бы всё равно файл.
 */
export function shouldWarnSilent(note: VoiceNote | null | undefined): boolean {
  if (!note) return false;
  if (note.track?.everMuted) return true;
  if (looksEmptyRecording(note)) return true;
  if (note.filePeak != null) return note.filePeak < SILENCE_PEAK;
  return note.measured && note.peak < SILENCE_PEAK;
}

/**
 * УСТАРЕВШИЙ ANDROID WEBVIEW — ГЛАВНЫЙ ИЗВЕСТНЫЙ ПОЖИРАТЕЛЬ ГОЛОСА.
 *
 * 🔴 ЗАМЕР 28.08.2026 по всем голосовым базы: 45 немых записей (−91 дБ, поток
 * 237 Б/с — opus на тишине) пришли с ОДНОГО устройства — OnePlus 8 Pro,
 * Android 11, WebView Chrome/90 (2021 год). При этом mic granted (мост
 * подтверждает), дорожка не muted — разрешение НИ ПРИ ЧЁМ, звук съедает сам
 * стек записи старого WebView. Все живые записи — WebView 91+ (Pixel/Chrome 91,
 * Xiaomi/Samsung/Poco Chrome 150, пики −15…0 дБ).
 *
 * Совет «проверьте разрешение» для этого случая ЛОЖНЫЙ — разрешение выдано.
 * Правильный совет один: обновить «Android System WebView» в Play. Порог 100
 * мягкий: живой Chrome/91 тоже получит подсказку, и это не вред — обновление
 * WebView безвредно и полезно, а формулировка говорит «может не работать».
 */
export const STALE_WEBVIEW_BELOW = 100;

export function staleWebViewMajor(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): number | null {
  if (!/;\s*wv\)/.test(ua) || !/Android/.test(ua)) return null;   // не Android-WebView — не наш случай
  const m = /Chrome\/(\d+)/.exec(ua);
  if (!m) return null;
  const major = Number(m[1]);
  return major < STALE_WEBVIEW_BELOW ? major : null;
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
  /** Запись идёт нативно за мостом. */
  native?: true;
  /**
   * Путь умеет мерить уровень прямо во время записи. У веб-пути это так всегда,
   * у нативного — только когда мост отдаёт `recLevel` (сборки с 04.09.2026).
   * Полоска уровня рисуется ровно по этому флагу: без него она врала бы «тишина»
   * на живой записи, а с ним МОЛЧАНИЕ ВИДНО СРАЗУ — ради этого всё и делалось.
   */
  metered?: boolean;
}

/** Как часто пересчитываем уровень для живой полоски. */
const LEVEL_MS = 100;

/** Каким путём открыт микрофон. */
export type MicSource =
  /** Сырой: обработка выключена. */                       'raw'
  /** Обработанный: как просит браузер по умолчанию. */   | 'processed'
  /** Сырой, но проверить его не вышло — нечем мерить. */ | 'raw-unprobed'
  /** Нативный MediaRecorder за мостом — обход мёртвого стека записи WebView. */ | 'native';

/**
 * 🔴 ПОЧЕМУ МЫ ПРОСИМ СЫРОЙ МИКРОФОН, А НЕ ОБЫЧНЫЙ.
 *
 * ⚠️ ЗДЕСЬ БЫЛ НЕВЕРНЫЙ ВЫВОД, И ОН СТОИЛ ТРЁХ НЕДЕЛЬ. Стояло: «голосом
 * отчитывались с 16 устройств, слышимую речь дало ровно одно… немота — не
 * особенность чьего-то телефона, а то, что происходит почти всегда». Шестнадцать
 * было числом ОТЧЁТОВ, а не устройств: строки посчитали за носители.
 *
 * Пересчёт 04.09.2026 по всем 98 голосовым базы, с группировкой по модели из
 * user-agent и замером каждого файла (`ffmpeg volumedetect`):
 *
 *   OnePlus 8 Pro (WebView 90) — 80 файлов, ВСЕ немые: −91 дБ и среднее, и пик,
 *                                на обоих путях записи (веб `raw` и нативный).
 *   Pixel, Xiaomi, Samsung, Redmi — 18 файлов, немых 0, пики −2,1…0,0 дБ.
 *
 * То есть приложение пишет звук нормально, а глушит запись ОДИН аппарат — на нём
 * тишину отдаёт и системный MediaRecorder при `granted`. Это не лечится из кода;
 * лечится тем, что человек узнаёт о тишине СРАЗУ (см. замер уровня на нативном
 * пути ниже), а не через три недели по расшифровке.
 *
 * Сырой микрофон ниже оставлен: он не вредит и убирает обработку, которая на
 * части устройств режет тихую речь. Но лечением немоты он не был.
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
  /** Нативная запись (задача 06790750): есть только в сборках со свежим патчем. */
  startRec?: () => string;
  stopRec?: () => string;
  cancelRec?: () => void;
  /**
   * Максимум амплитуды ПОСЛЕ предыдущего вызова, 0..32767; −1 = не пишем или
   * метода нет. Появился 04.09.2026: без него нативный путь не знал, слышно ли
   * человека, и полоска уровня пряталась — см. `startNativeRecording`.
   */
  recLevel?: () => number;
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

/**
 * НАТИВНАЯ ЗАПИСЬ ЗА МОСТОМ (задача 06790750) — обход мёртвого стека WebView.
 *
 * Диагноз саги немых голосовых (28.08.2026): на устаревшем Android System WebView
 * (Chrome<100) `getUserMedia` отдаёт поток, дорожка не muted, а PCM — нули. Обе
 * прошлые починки (runtime-запрос, ранняя привязка моста) стек записи WebView
 * обойти не могут по построению. Здесь микрофон пишет НАТИВНЫЙ MediaRecorder
 * (AAC/m4a 16 кГц моно) по ту сторону моста, файл возвращается base64.
 *
 * 🔴 УРОВЕНЬ ЗДЕСЬ МЕРЯЕТСЯ НЕ ЧЕРЕЗ WebAudio, А МОСТОМ. Звук в WebView не
 * попадает, поэтому раньше писали `measured: false`, полоска уровня пряталась, а
 * предупреждение о тишине не срабатывало вовсе. Цена честности оказалась выше
 * ожидаемой: 04.09.2026 замером по 98 голосовым выяснилось, что на OnePlus 8 Pro
 * система отдаёт цифровую тишину (−91 дБ) ОБОИМ путям записи при `granted`, тогда
 * как Pixel, Xiaomi, Samsung и Redmi через то же приложение пишут живой звук
 * (−15…−46 дБ). То есть глушит устройство, а приложение три недели молчало об
 * этом — человек наговаривал 169 секунд и был уверен, что отчёт ушёл.
 *
 * `MediaRecorder.getMaxAmplitude()` знает уровень и на нативном пути. Опрашиваем
 * его тем же таймером; первый ответ после старта — сброс базы, его отбрасываем.
 * Если метода нет (сборка со старым патчем моста), ведём себя как раньше:
 * `measured: false`, полоски нет, вранья нет.
 */
function startNativeRecording(
  n: Required<Pick<PsyNativeBridge, 'startRec' | 'stopRec'>> & PsyNativeBridge,
  onTick?: (sec: number, level: number) => void,
  onAutoStop?: () => void,
): Recorder | null {
  let st = '';
  try { st = n.startRec(); } catch { return null; }
  if (st !== 'ok') return null;                        // мост не смог — обычный путь
  const startedAt = Date.now();
  /**
   * Умеет ли эта сборка мерить уровень. Проверяем ВЫЗОВОМ, а не наличием метода:
   * `recLevel` возвращает −1, когда запись не идёт или замер недоступен, и тогда
   * обещать полоску нельзя. Первый ответ — сброс базы `getMaxAmplitude`, в пик
   * не идёт.
   */
  let мерим = false;
  try { мерим = typeof n.recLevel === 'function' && n.recLevel() >= 0; } catch { мерим = false; }
  let пик = 0;
  let endedAt = 0;
  let ceiling = false;
  let settled = false;

  let settle: ((v: VoiceNote | null) => void) | null = null;
  const done = new Promise<VoiceNote | null>((res) => { settle = res; });

  const finish = (cancelled: boolean) => {
    if (settled) return;
    settled = true;
    if (!endedAt) endedAt = Date.now();
    clearInterval(timer);
    const give = settle;
    settle = null;
    if (cancelled) {
      try { n.cancelRec?.(); } catch { /* мост умер — записи всё равно конец */ }
      give?.(null);
      return;
    }
    let b64 = '';
    try { b64 = n.stopRec(); } catch { b64 = ''; }
    if (!b64 || b64.startsWith('error')) { give?.(null); return; }
    let blob: Blob | null = null;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: 'audio/mp4' });
    } catch { blob = null; }
    if (!blob || !blob.size) { give?.(null); return; }
    const note: VoiceNote = {
      blob,
      seconds: Math.min(MAX_RECORD_SEC, Math.max(1, Math.round((endedAt - startedAt) / 1000))),
      mime: 'audio/mp4',
      peak: пик,
      filePeak: null,                                   // заполнится замером файла ниже
      measured: мерим,                                  // мерим мостом — см. шапку
      track: null,
      source: 'native',
      micGate: 'granted',                               // startRec не стартует без разрешения
      access: null,
    };
    /**
     * 🔴 ЗАМЕР ФАЙЛА ИМЕННО ЗДЕСЬ, А НЕ В ЭКРАНЕ. На этом пути другого источника
     * правды нет вовсе: `track` всегда `null`, а `measured` в сборках без
     * `recLevel` — `false`, и заслон был выключен у 32 отзывов из 34. Ждём
     * недолго и не насмерть (см. `PROBE_CAP_MS`), а `stop()` и так возвращает
     * промис — интерфейс уже умеет его дожидаться.
     */
    probeBlobPeak(blob)
      .then((p) => { note.filePeak = p; give?.(note); })
      .catch(() => give?.(note));
  };

  const timer = setInterval(() => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    let уровень = 0;
    if (мерим) {
      let amp = -1;
      try { amp = n.recLevel!(); } catch { amp = -1; }
      if (amp >= 0) {
        уровень = Math.min(1, amp / 32767);
        if (уровень > пик) пик = уровень;
      }
    }
    onTick?.(sec, уровень);
    if (sec >= MAX_RECORD_SEC) {
      ceiling = true;
      finish(false);
      if (ceiling) onAutoStop?.();
    }
  }, 500);

  return {
    native: true,
    metered: мерим,
    stop: () => { finish(false); return done; },
    cancel: () => { finish(true); },
  };
}

export async function startRecording(
  onTick?: (sec: number, level: number) => void,
  onAutoStop?: () => void,
): Promise<Recorder> {
  const micGate = await ensureMicPermission();

  /**
   * Старый WebView + мост с записью → нативный путь. Порог тот же, что у
   * подсказки staleWebViewMajor: на живых стеках (Chrome 100+) WebView пишет
   * сам и даёт уровень-индикатор — нативный обход там только отнял бы замер.
   */
  const nb = bridge();
  if (staleWebViewMajor() !== null
      && typeof nb?.startRec === 'function' && typeof nb?.stopRec === 'function'
      && micGate === 'granted') {
    const nat = startNativeRecording(nb as any, onTick, onAutoStop);
    if (nat) return nat;
  }

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
      filePeak: null,          // заполняется в `finish` замером готового файла
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
    /**
     * Замер файла идёт рядом с ответом системы — оба нужны к моменту, когда
     * заметка попадёт на экран, и оба ограничены по времени. Веб-путь мерит поток
     * сам, но поток и файл — разные вещи: рекордер способен честно слышать речь и
     * не записать её (кривой WebView), а уедет всё равно файл.
     */
    Promise.all([accessAsked.catch(() => null), probeBlobPeak(note.blob).catch(() => null)])
      .then(([a, p]) => { note.access = a; note.filePeak = p; done2(note); })
      .catch(() => done2(note));
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
