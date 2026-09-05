/* psygames-voice-silent-file-test · VER 1 · 05.09.2026 */
/**
 * НЕМАЯ ЗАПИСЬ ОБЯЗАНА БЫТЬ ВИДНА ПО САМОМУ ФАЙЛУ, А НЕ ПО ПОТОКУ РЯДОМ С НИМ.
 *
 * 📍 ЗАМЕР 05.09.2026, `app_feedback` + бакет `feedback-audio`.
 *   · Отзывов с записью `.m4a` (нативный путь) — 34. У ВСЕХ `audio_peak: 0`,
 *     у 32 из 34 `audio_measured: false`, `audio_track: null`.
 *   · Четыре файла скачаны и промерены `ffmpeg -af volumedetect` (1,5 / 10,8 /
 *     37,9 / 168,8 секунды): у всех `mean_volume = max_volume = −91,0 дБ`, то
 *     есть цифровая тишина при валидном AAC 16 кГц моно и верной длительности.
 *   · Поток у немых `.m4a` — 4057–5003 байт/с по всем 34, ровно столько же
 *     весит и говорящая запись: AAC пишется ПОСТОЯННЫМ битрейтом, и приём
 *     «234 байт/с против 16 181», которым ловили немой opus, здесь не работает.
 *   · Для сравнения, тем же прогоном по 69 файлам `.webm`: со звуком 19, немых 50.
 *     Веб-дорожка работает, немоту даёт устройство — и именно на нативном пути
 *     о ней не узнавал никто.
 *
 * Отсюда дефект: правило предупреждения жило на двух основаниях — `track.muted`
 * и живой замер, — и ОБА на нативном пути отсутствуют по построению (звук в
 * WebView не попадает, `recLevel` появился только 04.09.2026). Тридцать два
 * отзыва уехали с зелёной галочкой и «спасибо» при нулевом звуке.
 *
 * ⚠️ ЭТОТ ГЕЙТ НЕ ЧИНИТ ЧУЖОЙ МИКРОФОН — он держит на месте то, что тишина
 * ВИДНА человеку до отправки, каким бы путём запись ни делалась.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import {
  shouldWarnSilent, probeBlobPeak, looksEmptyRecording, startRecording,
  SILENCE_PEAK, EMPTY_STREAM_BPS, PROBE_CAP_MS, type VoiceNote,
} from '@/src/services/voiceNote';

const SRC = join(__dirname, '..');
/** Комментарии срезаем: в них дословно встречаются те же имена, что мы ищем. */
function code(p: string): string {
  return (readFileSync(join(SRC, p), 'utf8') as string)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const STALE_UA = 'Mozilla/5.0 (Linux; Android 11; OnePlus8Pro Build/QKR1.191246.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.210 Mobile Safari/537.36';

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

/**
 * Заготовка `.m4a`: 40 КБ — вес десяти секунд AAC 32 кбит/с. Размер намеренно
 * РЕАЛЬНЫЙ, потому что по нему немую запись отличить нельзя, и проверка не должна
 * случайно проходить через порог «файл слишком мал».
 */
const M4A_BYTES = new Uint8Array(40_000);
M4A_BYTES.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32], 0);
// btoa, а не Buffer: тест живёт в jsdom, и типов node в проекте нет (поймано tsc).
let бинарно = '';
for (let i = 0; i < M4A_BYTES.length; i += 4096) {
  бинарно += String.fromCharCode(...M4A_BYTES.subarray(i, i + 4096));
}
const M4A_B64 = btoa(бинарно);

/**
 * Декодер платформы, которого в jsdom нет. `samples` — что «услышал» декодер;
 * `never` — декодер, не отвечающий никогда (кривой WebView), `absent` — его нет.
 */
function installDecoder(opts: { samples?: number[]; never?: boolean; absent?: boolean; throws?: boolean }) {
  if (opts.absent) { delete (globalThis as any).OfflineAudioContext; return; }
  (globalThis as any).OfflineAudioContext = class {
    constructor(_ch: number, _len: number, _rate: number) {}
    decodeAudioData(_bytes: ArrayBuffer, ok: (b: any) => void, fail: () => void) {
      if (opts.throws) throw new Error('EncodingError');
      if (opts.never) return;                       // не зовём ни ok, ни fail — вообще
      const data = Float32Array.from(opts.samples ?? [0, 0, 0, 0]);
      setTimeout(() => ok({ numberOfChannels: 1, getChannelData: () => data }), 0);
    }
  };
}

afterEach(() => {
  delete (globalThis as any).OfflineAudioContext;
  delete (window as any).PsyNative;
});

const note = (o: Partial<VoiceNote>): VoiceNote => ({
  blob: { size: 40_000 } as Blob, seconds: 10, mime: 'audio/mp4',
  peak: 0, filePeak: null, measured: false, track: null,
  source: 'native', micGate: 'granted', access: null, ...o,
} as VoiceNote);

describe('пик по самому файлу', () => {
  it('🔴 декодер услышал нули → пик 0', async () => {
    installDecoder({ samples: [0, 0, 0, 0] });
    const p = await probeBlobPeak(new Blob([M4A_BYTES], { type: 'audio/mp4' }));
    expect(`пик немого файла: ${p}`).toBe('пик немого файла: 0');
  });

  it('декодер услышал речь → пик по модулю самого громкого сэмпла', async () => {
    installDecoder({ samples: [0.1, -0.62, 0.3] });
    const p = await probeBlobPeak(new Blob([M4A_BYTES], { type: 'audio/mp4' }));
    expect(p).toBeCloseTo(0.62, 5);
  });

  it('декодера нет вовсе → null, а не выдуманный ноль', async () => {
    installDecoder({ absent: true });
    const p = await probeBlobPeak(new Blob([M4A_BYTES], { type: 'audio/mp4' }));
    expect(`ответ без декодера: ${p}`).toBe('ответ без декодера: null');
  });

  it('декодер бросил исключение → null, отправка не падает', async () => {
    installDecoder({ throws: true });
    expect(await probeBlobPeak(new Blob([M4A_BYTES], { type: 'audio/mp4' }))).toBeNull();
  });

  /**
   * ⚠️ ТОТ ЖЕ КЛАСС, ЧТО ЗАВИСШИЙ html2canvas В ОТПРАВКЕ: декодер на кривом
   * WebView способен не ответить НИКОГДА, и try/catch зависание не ловит.
   * Кнопка «стоп» обязана отпускать в любом случае.
   */
  it('🔴 декодер не отвечает никогда → сдаёмся по потолку, а не висим', async () => {
    installDecoder({ never: true });
    const начало = Date.now();
    const ответ = await probeBlobPeak(new Blob([M4A_BYTES], { type: 'audio/mp4' }), 60);
    const ждали = Date.now() - начало;
    expect(`ответ по потолку: ${ответ}`).toBe('ответ по потолку: null');
    // Уложились в потолок, а не в таймаут jest: без гонки тест висел бы 5 секунд.
    expect(`ждали меньше секунды: ${ждали < 1000}`).toBe('ждали меньше секунды: true');
    expect(PROBE_CAP_MS).toBeLessThanOrEqual(3000);   // потолок по умолчанию — не вечность
  });
});

/**
 * 📍 Числа ниже сняты 05.09.2026 прогоном `ffmpeg -af volumedetect` по всем 69
 * файлам `.webm` из бакета; у 36 из них в репорте есть размер и длина, и на этих
 * 36 порог сверен с вердиктом ffmpeg: немых поймано 35 из 35, живых оболгано 0.
 */
describe('пустой поток виден и без декодера', () => {
  it('🔴 самая «тяжёлая» тишина в бакете, 384 байт/с — ловится', () => {
    expect(looksEmptyRecording(note({ mime: 'audio/webm;codecs=opus', seconds: 164, blob: { size: 164 * 384 } as Blob }))).toBe(true);
  });

  it('живая речь в opus, 16 181 байт/с — не трогаем', () => {
    expect(looksEmptyRecording(note({ mime: 'audio/webm;codecs=opus', seconds: 22, blob: { size: 355_985 } as Blob }))).toBe(false);
  });

  it('порог стоит между самой тяжёлой тишиной и самым лёгким живым потоком (AAC)', () => {
    expect(`384 < ${EMPTY_STREAM_BPS} < 4057`).toBe('384 < 700 < 4057');
  });

  /**
   * 🔴 ГРАНИЦА ПРИЁМА, И ОНА ЖЕ — ПРИЧИНА ВСЕЙ ПОЧИНКИ. Немой `.m4a` из базы
   * (169 секунд, 689 525 байт = 4080 байт/с) по потоку выглядит РОВНО как
   * говорящий: AAC пишется постоянным битрейтом. Здесь функция обязана ответить
   * «не пусто» — и это правильный ответ, а тишину в нём ловит декодер. Если этот
   * случай когда-нибудь начнёт ловиться размером, значит порог уехал в живую речь.
   */
  it('🔴 немой m4a из базы (4080 байт/с) размером НЕ ловится — за него отвечает декодер', () => {
    const немой = note({ mime: 'audio/mp4', seconds: 169, blob: { size: 689_525 } as Blob });
    expect(`размер видит пустоту: ${looksEmptyRecording(немой)}`).toBe('размер видит пустоту: false');
    installDecoder({ samples: [0, 0] });
    return probeBlobPeak(new Blob([M4A_BYTES], { type: 'audio/mp4' }))
      .then((p) => expect(`декодер видит: ${p}`).toBe('декодер видит: 0'));
  });

  it('оборванный файл ловится и в m4a: 60 КБ на 169 секунд — это не запись', () => {
    expect(looksEmptyRecording(note({ mime: 'audio/mp4', seconds: 169, blob: { size: 60_000 } as Blob }))).toBe(true);
  });

  /**
   * ⚠️ КОРОТКИЙ ФАЙЛ ПРОСКАКИВАЕТ МИМО ПОТОКА. 900 байт за одну секунду — это
   * 900 байт/с, то есть ВЫШЕ порога потока, а звука там нет: столько весит один
   * заголовок контейнера. Ловит только отдельная проверка по абсолютному размеру.
   */
  it('🔴 заголовок без данных: 900 байт за секунду — поток пропустит, размер поймает', () => {
    expect(looksEmptyRecording(note({ mime: 'audio/mp4', seconds: 1, blob: { size: 900 } as Blob }))).toBe(true);
    // ...а живая секунда речи весит на порядок больше и мимо не проедет.
    expect(looksEmptyRecording(note({ mime: 'audio/mp4', seconds: 1, blob: { size: 6300 } as Blob }))).toBe(false);
  });
});

describe('правило предупреждения после починки', () => {
  /**
   * 🔴 БОЕВОЙ СЛУЧАЙ ЦЕЛИКОМ. Ровно эта заметка лежит в базе 32 раза:
   * нативный путь, дорожки нет, живого замера нет, пик 0 — и файл при этом
   * цифровая тишина (−91 дБ). До 05.09.2026 правило отвечало `false`.
   */
  it('🔴 нативная заметка без замера, но файл немой → предупреждаем', () => {
    expect(shouldWarnSilent(note({ measured: false, peak: 0, track: null, filePeak: 0 }))).toBe(true);
  });

  it('файл со звуком → молчим, даже если поток замерить было нечем', () => {
    expect(shouldWarnSilent(note({ measured: false, peak: 0, filePeak: 0.42 }))).toBe(false);
  });

  /**
   * ⚠️ ФАЙЛ СТАРШЕ ПОТОКА. Рекордер способен честно слышать речь и не записать
   * её — уедет всё равно файл, и решать обязан он.
   */
  it('🔴 поток слышал речь, а в файле тишина → всё равно предупреждаем', () => {
    expect(shouldWarnSilent(note({ measured: true, peak: 0.5, filePeak: 0 }))).toBe(true);
  });

  it('декодировать не вышло → решает живой замер, как и раньше', () => {
    expect(shouldWarnSilent(note({ measured: false, peak: 0, filePeak: null }))).toBe(false);
    expect(shouldWarnSilent(note({ measured: true, peak: 0, filePeak: null }))).toBe(true);
  });

  it('порог тишины не разъехался с замером файла', () => {
    expect(shouldWarnSilent(note({ filePeak: SILENCE_PEAK }))).toBe(false);
    expect(shouldWarnSilent(note({ filePeak: SILENCE_PEAK - 0.001 }))).toBe(true);
  });
});

/**
 * 🔴 СКВОЗНОЙ ПРОГОН НАТИВНОГО ПУТИ — тот самый, что даёт `.m4a`.
 * Мост БЕЗ `recLevel` (сборки, из которых пришли 32 немых отзыва) + декодер,
 * слышащий нули: заметка обязана вернуться с `filePeak: 0` и зажечь заслон.
 */
describe('нативная запись целиком: тишина доходит до человека', () => {
  const mockBridge = (extra: Record<string, unknown> = {}) => {
    (window as any).PsyNative = {
      micState: () => 'granted',
      requestMic: () => {},
      startRec: () => 'ok',
      stopRec: () => M4A_B64,
      cancelRec: () => {},
      ...extra,
    };
  };

  it('🔴 мост без recLevel + немой файл → заслон срабатывает', async () => {
    setUA(STALE_UA);
    installDecoder({ samples: [0, 0, 0] });
    mockBridge();
    const n = await (await startRecording()).stop();
    expect(n!.mime).toBe('audio/mp4');
    expect(n!.measured).toBe(false);            // мерить поток по-прежнему нечем
    expect(`пик файла: ${n!.filePeak}`).toBe('пик файла: 0');
    expect(`предупреждаем: ${shouldWarnSilent(n)}`).toBe('предупреждаем: true');
  });

  it('живая запись тем же путём → человека не пугаем', async () => {
    setUA(STALE_UA);
    installDecoder({ samples: [0.7, -0.2] });
    mockBridge();
    const n = await (await startRecording()).stop();
    expect(n!.filePeak).toBeCloseTo(0.7, 5);
    expect(shouldWarnSilent(n)).toBe(false);
  });

  it('декодера нет — заметка честно говорит «не знаю», а не «тихо»', async () => {
    setUA(STALE_UA);
    installDecoder({ absent: true });
    mockBridge();
    const n = await (await startRecording()).stop();
    expect(`пик файла: ${n!.filePeak}`).toBe('пик файла: null');
  });
});

/**
 * 🔴 ВЕБ-ПУТЬ МЕРИТ ФАЙЛ ТОЖЕ, И ЭТО НЕ ФОРМАЛЬНОСТЬ.
 *
 * По бакету 05.09.2026 из 69 записей `.webm` немых 50 — веб-дорожка теряет звук
 * чаще, чем кажется. Живой замер там есть, но он держится на AudioContext,
 * который после `await getUserMedia` приходит `suspended` и способен не
 * проснуться вовсе: тогда `measured: false`, и правило снова молчит. Файл же
 * есть всегда.
 */
describe('веб-запись: файл меряется и там', () => {
  /** Микрофон, рекордер и НЕПРОСЫПАЮЩИЙСЯ контекст — то есть живого замера нет. */
  // typeof M4A_BYTES, а не голый Uint8Array: у второго буфер шире (ArrayBufferLike),
  // и Blob его не принимает — поймано `tsc --noEmit`.
  function installWebMic(chunk: typeof M4A_BYTES) {
    const track: any = { stop: () => {}, kind: 'audio', muted: false, readyState: 'live', label: 'Фейк', addEventListener: () => {} };
    const stream: any = { getTracks: () => [track], getAudioTracks: () => [track] };
    (globalThis as any).navigator.permissions = { query: async () => ({ state: 'granted' }) };
    (globalThis as any).navigator.mediaDevices = {
      getUserMedia: async () => stream,
      enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'd0', label: 'Микрофон' }],
    };
    (globalThis as any).MediaRecorder = class {
      state = 'inactive';
      mimeType = 'audio/webm;codecs=opus';
      ondataavailable: any = null;
      onstop: any = null;
      static isTypeSupported() { return true; }
      start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob([chunk], { type: 'audio/webm' }) }); }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    };
    const w = ((globalThis as any).window = (globalThis as any).window || {});
    // Контекст, который никогда не выходит из suspended: живого замера не будет.
    w.AudioContext = class { state = 'suspended'; createAnalyser() { return { fftSize: 512, getByteTimeDomainData: () => {} }; } createMediaStreamSource() { return { connect: () => {} }; } close() {} resume() { return Promise.resolve(); } };
    w.webkitAudioContext = undefined;
  }

  it('🔴 контекст не проснулся, но файл немой → заслон всё равно срабатывает', async () => {
    setUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36');
    installWebMic(M4A_BYTES);                 // 40 КБ: по размеру запись «нормальная»
    installDecoder({ samples: [0, 0, 0] });
    const n = await (await startRecording()).stop();
    expect(`живой замер был: ${n!.measured}`).toBe('живой замер был: false');
    expect(`пик файла: ${n!.filePeak}`).toBe('пик файла: 0');
    expect(`предупреждаем: ${shouldWarnSilent(n)}`).toBe('предупреждаем: true');
  });

  it('файл со звуком тем же путём → не пугаем', async () => {
    setUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36');
    installWebMic(M4A_BYTES);
    installDecoder({ samples: [0.55, -0.1] });
    const n = await (await startRecording()).stop();
    expect(n!.filePeak).toBeCloseTo(0.55, 5);
    expect(shouldWarnSilent(n)).toBe(false);
  });

  /**
   * ⚠️ Веб-путь ставит СТРАХОВОЧНЫЙ таймер на 1,5 с внутри `stop()` — на случай,
   * когда кривой WebView не пришлёт `onstop`. Это боевое поведение, а не утечка;
   * дожидаемся его, иначе jest ругается «did not exit» на живом коде.
   */
  afterAll(() => new Promise<void>((r) => setTimeout(r, 1600)));
});

/**
 * Замер обязан ДОЕЗЖАТЬ до базы: три недели немоту разбирали вслепую именно
 * потому, что поля, отвечающего на вопрос, в репорте не было.
 */
describe('замер файла и согласие человека уезжают в репорт', () => {
  it('🔴 строка репорта несёт audio_file_peak и audio_silent_ack', () => {
    const src = code('services/appFeedback.ts');
    // ⚠️ Именно в строке репорта, а не «где-то в файле»: объявление в типе
    // SendArgs осталось бы на месте, даже если поле выкинуть из row.
    expect(src).toMatch(/audio_filePeak:\s*args\.audio\.filePeak/);
    expect(src).toMatch(/audio_silent_ack:\s*args\.audio\.silentAck/);
  });

  it('🔴 экран передаёт filePeak и согласие, а не роняет их по дороге', () => {
    const src = code('components/FeedbackWidget.tsx');
    expect(src).toMatch(/filePeak:\s*note\.filePeak/);
    expect(src).toMatch(/silentAck:\s*micSilent && \(silentAck \|\| ackSilent\)/);
  });

  /** Зелёная галочка на немой записи — та же молчаливая потеря, только значком. */
  it('🔴 значок «прикреплено» не зеленеет на немой записи', () => {
    const src = code('components/FeedbackWidget.tsx');
    expect(src).toMatch(/note \? \(micSilent \? 'alert-circle' : 'checkmark-circle'\)/);
    expect(src).toMatch(/note \? \(micSilent \? '#b45309' : '#22c55e'\)/);
  });
});
