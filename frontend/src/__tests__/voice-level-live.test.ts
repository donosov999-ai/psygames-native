/**
 * СЛЫШНО ЛИ ЧЕЛОВЕКА — ОН ДОЛЖЕН УЗНАТЬ ВО ВРЕМЯ ЗАПИСИ, А НЕ НИКОГДА.
 *
 * ЗАЧЕМ. Замер по боевой базе 20.08.2026, 35 голосовых заметок: с одного устройства
 * (OnePlus 8 Pro, Android 11, WebView Chrome/90) 13 из 16 — цифровая тишина. Проверка
 * по размеру файла не оставляет места сомнению: у немых заметок поток ровно 235 байт/с,
 * у нормальной речи — от 6300 до 15000 байт/с, разница в шестьдесят раз. Средняя длина
 * немой заметки — 164 секунды: человек говорил почти три минуты в мёртвый микрофон,
 * получал «спасибо» и уходил уверенный, что рассказал о проблеме.
 *
 * Уровень мы ЗАМЕРЯЛИ и клали в `audio_peak` — то есть знали про тишину в момент
 * записи и молчали. Против этого и заводился обратный контур.
 *
 * ⚠️ ЭТОТ ГЕЙТ НЕ ЧИНИТ ЧУЖОЙ МИКРОФОН. Он держит на месте то, что микрофонный отказ
 * ВИДЕН: живой уровень пока человек говорит, честный порог и выбор перед отправкой.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import { shouldWarnSilent, startRecording, ensureMicPermission, MAX_RECORD_SEC, SILENCE_PEAK, AUDIO_MAX_BYTES, type VoiceNote } from '@/src/services/voiceNote';

const SRC = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8') as string;

/**
 * ⚠️ КОММЕНТАРИИ СРЕЗАЕМ ПЕРЕД ПОИСКОМ ПО ИСХОДНИКУ.
 * Здесь и в соседних файлах много объяснений, и в них дословно встречаются те же
 * имена, что мы ищем. Гейт, ищущий по всему тексту, зеленеет от собственного
 * комментария и перестаёт что-либо проверять.
 */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Фейковый микрофон: `level` — что «слышит» анализатор, 0 = цифровая тишина. */
function installMic(opts: {
  level: number; ctx?: 'ok' | 'stuck' | 'none' | 'lazy'; deafStop?: boolean;
  /** Дорожка помечена `muted` с самого начала: система звук не отдаёт. */
  muted?: boolean;
  /** Дорожку заглушили ПОСРЕДИ записи — звонок, другое приложение. */
  muteAfter?: boolean;
  /** Заглушили посреди записи и ВЕРНУЛИ до остановки. */
  muteThenBack?: boolean;
  /** Старый WebView без `getAudioTracks` — спрашивать дорожку нечем. */
  noTrackApi?: boolean;
  /**
   * Что слышно, если попросить СЫРОЙ микрофон (обработка выключена). Не задано —
   * устройство отвечает одинаково на оба запроса, как и было до выбора источника.
   */
  rawLevel?: number;
  /** Сырой микрофон устройство не даёт вовсе — отказ по условиям. */
  rawFails?: boolean;
  /** Обработанный микрофон устройство не даёт вовсе. */
  processedFails?: boolean;
  /** Что отвечает `navigator.permissions` про микрофон. */
  permission?: string;
  /** Микрофоны, которые видит браузер: `true` — у устройства есть ИМЯ. */
  devices?: boolean[];
}) {
  const mode = opts.ctx ?? 'ok';
  let wakes = 0;
  const listeners: Record<string, Array<() => void>> = {};
  const audioTrack: any = {
    stop: jest.fn(), kind: 'audio',
    muted: !!opts.muted, readyState: 'live', label: 'Фейковый микрофон',
    addEventListener: (ev: string, fn: () => void) => { (listeners[ev] ??= []).push(fn); },
  };
  const tracks = [audioTrack];
  const stream: any = { getTracks: () => tracks };
  if (!opts.noTrackApi) stream.getAudioTracks = () => tracks;
  /** Заглушить дорожку на ходу — ровно так это делает система. */
  (globalThis as any).__muteTrackNow = () => {
    audioTrack.muted = true;
    for (const fn of listeners.mute ?? []) fn();
  };
  if (opts.muteAfter) setTimeout(() => (globalThis as any).__muteTrackNow(), 5);
  /**
   * ⚠️ ЗАГЛУШИЛИ И ВЕРНУЛИ — тот случай, ради которого подписка и нужна.
   * Звонок кончился, микрофон отдали обратно, и К МОМЕНТУ ОСТАНОВКИ дорожка
   * снова здорова. Снимок состояния на выходе тут покажет «всё хорошо», а в
   * файле — дыра. Поймать это можно только тем, что мы слушали событие.
   */
  if (opts.muteThenBack) {
    setTimeout(() => (globalThis as any).__muteTrackNow(), 5);
    setTimeout(() => { audioTrack.muted = false; }, 12);
  }
  /**
   * Система отвечает на прямые вопросы о доступе: разрешение и список устройств.
   * ИМЕНА у устройств `enumerateDevices` отдаёт ровно при выданном доступе —
   * на этом и держится различие «не дали» против «дали, но молчит».
   */
  (globalThis as any).navigator.permissions = {
    query: async () => ({ state: opts.permission ?? 'granted' }),
  };

  /** Сырым считается запрос с ЯВНО выключенной обработкой — так его шлёт openMic. */
  const isRaw = (c: any) => !!c?.audio && typeof c.audio === 'object' && c.audio.echoCancellation === false;
  const micCalls: string[] = [];
  (globalThis as any).navigator.mediaDevices = {
    getUserMedia: async (c: any) => {
      const raw = isRaw(c);
      micCalls.push(raw ? 'raw' : 'processed');
      if (raw && opts.rawFails) throw new Error('OverconstrainedError');
      if (!raw && opts.processedFails) throw new Error('NotAllowedError');
      // Одно и то же устройство, но слышно по-разному в зависимости от того,
      // каким путём его открыли, — ровно это и происходит на Android.
      stream.__level = raw ? (opts.rawLevel ?? opts.level) : opts.level;
      return stream;
    },
    enumerateDevices: async () => (opts.devices ?? [true]).map((named, i) => ({
      kind: 'audioinput', deviceId: `d${i}`, label: named ? `Микрофон ${i}` : '',
    })),
  };

  const recs: any[] = [];
  class FakeRec {
    state = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    ondataavailable: any = null;
    onstop: any = null;
    private iv: any = null;
    constructor(public s: any, public o: any) { recs.push(this); }
    static isTypeSupported() { return true; }
    start(slice: number) {
      this.state = 'recording';
      this.iv = setInterval(() => this.ondataavailable?.({ data: { size: 235 } }), slice);
    }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      clearInterval(this.iv);
      this.ondataavailable?.({ data: { size: 100 } });
      // deafStop — WebView, который глохнет молча: состояние сменилось, события нет.
      if (!opts.deafStop) this.onstop?.();
    }
  }
  (globalThis as any).MediaRecorder = FakeRec;

  // 128 = середина шкалы = тишина. Отклонение от неё и есть уровень.
  // Читаем ЛЕНИВО: уровень зависит от того, каким путём открыли микрофон.
  const byteNow = () => 128 + Math.round(((stream.__level ?? opts.level) as number) * 127);
  class FakeCtx {
    // Контекст, заведённый после await, приходит suspended — как в реальном Chrome.
    state = 'suspended';
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (b: Uint8Array) => b.fill(byteNow()) }; }
    createMediaStreamSource() { return { connect: () => {} }; }
    close() {}
    resume() {
      wakes++;
      // 'lazy' — жест уже «остыл», и первый resume() не проходит. Ровно это и
      // происходит в Chrome с контекстом, созданным после await getUserMedia.
      if (mode === 'ok' || (mode === 'lazy' && wakes >= 3)) this.state = 'running';
      return Promise.resolve();
    }
  }
  const w = ((globalThis as any).window = (globalThis as any).window || {});
  w.AudioContext = mode === 'none' ? undefined : FakeCtx;
  w.webkitAudioContext = undefined;
  return { tracks, recs, micCalls };
}

describe('живой уровень доходит до интерфейса, пока человек говорит', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('при живом звуке тик несёт ненулевой уровень ЕЩЁ ДО остановки', async () => {
    jest.useFakeTimers();
    installMic({ level: 0.5 });
    const seen: number[] = [];
    const r = await startRecording((_s, level) => seen.push(level));
    jest.advanceTimersByTime(3000);
    // Именно во время записи: после остановки полоска уже никому не нужна.
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(SILENCE_PEAK);
    r.cancel();
  });

  it('на тишине тик несёт нули — молчащая запись выглядит иначе, чем говорящая', async () => {
    jest.useFakeTimers();
    installMic({ level: 0 });
    const seen: number[] = [];
    const r = await startRecording((_s, level) => seen.push(level));
    jest.advanceTimersByTime(3000);
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThan(SILENCE_PEAK);
    r.cancel();
  });
});

describe('порог тишины срабатывает только на настоящем замере', () => {
  afterEach(() => { jest.useRealTimers(); });

  const grab = async (opts: { level: number; ctx?: 'ok' | 'stuck' | 'none' | 'lazy' }) => {
    jest.useFakeTimers();
    installMic(opts);
    const r = await startRecording();
    jest.advanceTimersByTime(3000);
    return r.stop();
  };

  it('нулевой сигнал → запись немая и это ЗАМЕРЕНО', async () => {
    const n = await grab({ level: 0 });
    expect(n).toBeTruthy();
    expect(n!.measured).toBe(true);
    expect(n!.peak).toBeLessThan(SILENCE_PEAK);
  });

  it('нормальный сигнал → немой НЕ считается', async () => {
    const n = await grab({ level: 0.5 });
    expect(n!.measured).toBe(true);
    expect(n!.peak).toBeGreaterThanOrEqual(SILENCE_PEAK);
  });

  /**
   * ⚠️ САМОЕ ВАЖНОЕ ЗДЕСЬ. AudioContext, созданный после await (а getUserMedia — это
   * await), теряет пользовательский жест и остаётся `suspended`. Анализатор на таком
   * контексте отдаёт ровно 128 в каждом сэмпле — картинку, неотличимую от мёртвого
   * микрофона. Обвинить исправный микрофон хуже, чем промолчать: человек полезет в
   * разрешения на пустом месте и перестанет верить предупреждению вообще.
   */
  it('контекст не проснулся → peak = 0, но measured = false («не знаем», а не «тишина»)', async () => {
    const n = await grab({ level: 0.5, ctx: 'stuck' });
    expect(n!.peak).toBe(0);
    expect(n!.measured).toBe(false);
  });

  it('AudioContext нет вовсе → measured = false', async () => {
    const n = await grab({ level: 0.5, ctx: 'none' });
    expect(n!.measured).toBe(false);
  });

  /**
   * Один resume() может не пройти: к моменту создания контекста пользовательский жест
   * уже «остыл». Будить надо на каждом тике, пока не проснётся, — иначе исправный
   * микрофон навсегда останется «незамеренным» и уровень человек не увидит вообще.
   */
  it('контекст просыпается не с первого раза — всё равно замеряем', async () => {
    const n = await grab({ level: 0.5, ctx: 'lazy' });
    expect(n!.measured).toBe(true);
    expect(n!.peak).toBeGreaterThanOrEqual(SILENCE_PEAK);
  });
});

describe('за потолком длины запись не превращается в разговор с пустотой', () => {
  afterEach(() => { jest.useRealTimers(); });

  /**
   * 🔴 РАЗБОР 20.08.2026. В базе лежат заметки на 495, 540 и 648 секунд при потолке 180 —
   * и все три с пустым `audio_path`. Столько человек ГОВОРИЛ, а не столько записалось:
   * автостоп глушил рекордер на третьей минуте, но `onstop` висел только внутри `stop()`,
   * то есть существовал лишь когда останавливал человек. Микрофон оставался открытым,
   * счётчик продолжал тикать, и последние восемь минут уходили в мёртвый рекордер.
   */
  it('автостоп отпускает микрофон', async () => {
    jest.useFakeTimers();
    const { tracks } = installMic({ level: 0.5 });
    const r = await startRecording();
    jest.advanceTimersByTime(MAX_RECORD_SEC * 3 * 1000);
    expect(tracks[0].stop).toHaveBeenCalled();
    r.cancel();
  });

  it('счётчик на экране встаёт вместе с рекордером, а не бежит дальше', async () => {
    jest.useFakeTimers();
    installMic({ level: 0.5 });
    const secs: number[] = [];
    const r = await startRecording((sec) => secs.push(sec));
    jest.advanceTimersByTime(MAX_RECORD_SEC * 3 * 1000);
    expect(Math.max(...secs)).toBeLessThanOrEqual(MAX_RECORD_SEC);
    r.cancel();
  });

  it('длина заметки — сколько записалось, а не сколько человек говорил', async () => {
    jest.useFakeTimers();
    installMic({ level: 0.5 });
    const r = await startRecording();
    jest.advanceTimersByTime(MAX_RECORD_SEC * 3 * 1000);
    const n = await r.stop();
    expect(n!.seconds).toBeLessThanOrEqual(MAX_RECORD_SEC);
  });

  /**
   * ⚠️ ХУДШИЙ СЛУЧАЙ И ЕСТЬ БОЕВОЙ. Рекордер уходит в `inactive` МОЛЧА, без `onstop`
   * (кривой старый WebView — тот самый Chrome/90), человек жмёт «стоп» через девять
   * минут. Именно так рождается `audio_seconds: 648` при потолке 180: длина по часам,
   * а не по звуку. Дольше потолка записи не бывает по построению.
   */
  it('рекордер заглох молча, человек остановил через 9 минут — длина всё равно честная', async () => {
    jest.useFakeTimers();
    installMic({ level: 0.5, deafStop: true });
    const r = await startRecording();
    jest.advanceTimersByTime(648 * 1000);
    const n = await r.stop();
    expect(n!.seconds).toBeLessThanOrEqual(MAX_RECORD_SEC);
  });

  it('о самостоятельной остановке сообщают наверх — иначе интерфейс останется «записывающим»', async () => {
    jest.useFakeTimers();
    installMic({ level: 0.5 });
    const auto = jest.fn();
    const r = await startRecording(undefined, auto);
    jest.advanceTimersByTime((MAX_RECORD_SEC + 5) * 1000);
    expect(auto).toHaveBeenCalled();
    r.cancel();
  });
});

describe('интерфейс показывает уровень и не отправляет немую запись молча', () => {
  const widget = () => code('components/FeedbackWidget.tsx');

  it('во время записи рисуется живая полоска уровня', () => {
    const src = widget();
    expect(src).toContain('styles.levelTrack');
    // Висит на состоянии записи и на живом уровне, а не на константе.
    expect(src).toMatch(/\{rec && \(\s*<View[\s\S]{0,400}levelTrack/);
    expect(src).toMatch(/width: `\$\{[^`]*lvl\.level/);
  });

  it('подпись отличает «слышим» от «тишина»', () => {
    const src = widget();
    expect(src).toContain("t('voiceLevelHearing')");
    expect(src).toContain("t('voiceLevelSilence')");
    expect(src).toContain('lvl.peak >= SILENCE_PEAK');
  });

  it('немая запись не уезжает без согласия человека', () => {
    const src = widget();
    expect(src).toContain('if (note && micSilent && !silentAck && !ackSilent) return;');
    // ...и выбор ему дан: отправить как есть или написать текстом.
    expect(src).toContain("t('voiceSendAnyway')");
    expect(src).toContain("t('voiceWriteInstead')");
  });

  /**
   * 🔴 ПРАВИЛО ПРОВЕРЯЕТСЯ ВЫЗОВОМ, А НЕ ПОИСКОМ СТРОКИ В ЭКРАНЕ.
   *
   * Прежняя редакция искала в исходнике виджета дословное
   * `v.measured && v.peak < SILENCE_PEAK`. Она держалась ровно до тех пор, пока
   * условие не переехало в функцию, — и покраснела на ПРАВИЛЬНОЙ правке, ничего
   * при этом не проверив по существу. Хуже того, поломка «решать только по пику»
   * оставалась зелёной: сама-то строка была на месте.
   *
   * Теперь зовём `shouldWarnSilent` и требуем от него четырёх ответов подряд.
   * Экран это же правило и вызывает — отдельная проверка ниже следит, чтобы он
   * не завёл своё.
   */
  it('🔴 правило предупреждения даёт верный ответ на все четыре случая', () => {
    const note = (o: Partial<VoiceNote>): VoiceNote => ({
      blob: {} as Blob, seconds: 5, mime: 'audio/webm',
      peak: 0.5, measured: true, track: null, ...o,
    } as VoiceNote);
    const cases: Array<[string, boolean]> = [
      [`замер дал тишину: ${shouldWarnSilent(note({ peak: 0, measured: true }))}`, true],
      [`замера не было — не знаем, молчим: ${shouldWarnSilent(note({ peak: 0, measured: false }))}`, false],
      [`дорожка зажата, замера нет: ${shouldWarnSilent(note({ peak: 0, measured: false, track: { muted: true, readyState: 'live', label: '', everMuted: true } }))}`, true],
      [`всё исправно: ${shouldWarnSilent(note({}))}`, false],
    ];
    expect(cases.map(([t]) => t)).toEqual([
      'замер дал тишину: true',
      'замера не было — не знаем, молчим: false',
      'дорожка зажата, замера нет: true',
      'всё исправно: false',
    ]);
  });

  /** Экран обязан звать общее правило, а не заводить своё условие рядом. */
  it('🔴 экран решает общим правилом, а не своим условием', () => {
    const w = widget();
    expect(`зовёт правило: ${/shouldWarnSilent\s*\(/.test(w)}`).toBe('зовёт правило: true');
    expect(`своего порога нет: ${!/peak\s*<\s*SILENCE_PEAK/.test(w)}`).toBe('своего порога нет: true');
  });

  /**
   * ⚠️ ГЕЙТ, КОТОРЫЙ ЗЕЛЕНЕЕТ ПРИ ВЫКЛЮЧЕННОМ ПОКАЗЕ, НИЧЕГО НЕ ПРОВЕРЯЕТ.
   * `{false && ...}` оставляет разметку в исходнике и убирает её с экрана.
   */
  it('ни один блок записи не выключен литералом', () => {
    expect(widget()).not.toMatch(/\{\s*(false|null|0)\s*&&/);
  });
});

describe('почему запись не долетела — записывается в сам репорт', () => {
  const svc = () => code('services/appFeedback.ts');

  /**
   * Три потери (495, 540, 648 секунд) разбирать было НЕЧЕМ: сирот в бакете нет, значит
   * заливка не доходила вовсе, а ни размера блоба, ни причины отказа мы не сохраняли
   * ни разу. Размер тут точно ни при чём — самый крупный файл за всё время 502 КБ при
   * потолке бакета 8 МБ, — но узнать это можно было только запросом к хранилищу.
   */
  it('размер и исход заливки уезжают вместе с репортом', () => {
    const src = svc();
    // ⚠️ Именно в СТРОКЕ репорта, а не «где-то в файле»: объявления `let audio_up`
    // и `const audio_bytes` остаются на месте, даже если поля выкинуть из row.
    expect(src).toContain('audio_bytes, audio_up,');
    expect(src).toContain("audio_up = 'too_big'");
    expect(src).toContain("'timeout'");
  });

  it('потолок бакета известен коду, а не выясняется отказом хранилища', () => {
    expect(AUDIO_MAX_BYTES).toBe(8 * 1024 * 1024);
    // Сравнение целиком: одного упоминания в импорте мало — оно переживёт `if (false)`.
    expect(svc()).toContain('args.audio.blob.size > AUDIO_MAX_BYTES');
  });

  it('ни одна ветка отправки не выключена литералом', () => {
    expect(svc()).not.toMatch(/if\s*\(\s*(false|true)\s*\)/);
  });

  /**
   * ⚠️ ЭТО НЕ ТЕОРИЯ. В бакете скриншотов лежат ЧЕТЫРЕ осиротевших файла: они долиты,
   * но ни одна строка репорта на них не ссылается. Так выглядит заливка, брошенная по
   * плоскому тайм-ауту и дошедшая уже после того, как человеку сказали «не загрузилось».
   * У записи сирот нет вовсе — те три заливки не доходили никогда.
   */
  /**
   * ⚠️ ПРОВЕРКА ПЕРЕПИСАНА 21.08.2026. Она искала два вызова ДОСЛОВНО и покраснела
   * на правильной правке: обе заливки поехали через общий подъёмник с повторной
   * попыткой (запись тестировщицы — 15 299 байт живой речи — потерялась, потому
   * что попытка была одна). Держать здесь форму вызова значит запрещать любое
   * изменение вокруг него; смысл — что ожидание считается ОТ РАЗМЕРА файла и что
   * у записи и скриншота свои потолки.
   */
  it('ожидание заливки считается от размера — и у записи, и у скриншота', () => {
    const src = svc();
    // uploadMs зовётся от размера, а не от константы
    expect(src).toMatch(/uploadMs\(\s*[\w.]*\.size\s*,/);
    // у каждой заливки свой потолок, и оба доезжают до вызова
    expect(src).toMatch(/AUDIO_CAP_MS\s*\)/);
    expect(src).toMatch(/SHOT_CAP_MS\s*\)/);
    expect(src).not.toContain('AUDIO_UPLOAD_MS');
    expect(src).not.toContain('SHOT_UPLOAD_MS');
  });

  it('судьба скриншота тоже уезжает в репорт', () => {
    expect(svc()).toContain('shot_bytes, shot_up');
  });

  it('замер уровня отличим в базе от «замерить не вышло»', () => {
    expect(svc()).toContain('audio_measured');
  });

  /**
   * «Спасибо» узнаётся по значку за долю секунды, а «запись не загрузилась» надо
   * прочесть и решить, что делать. Те же 3.2 секунды на плохую новость — почти то же
   * самое, что не сказать: человек увидит, что шторка мигнула.
   */
  it('на плохую новость даётся больше времени, чем на «спасибо»', () => {
    expect(code('components/FeedbackWidget.tsx'))
      .toContain('res.audioLost ? 9000 : 3200');
  });
});


/**
 * 🔴 ДОРОЖКА ОТВЕЧАЕТ О СЕБЕ САМА — И ЭТО ДРУГОЙ ИСТОЧНИК, ЧЕМ ПИК.
 *
 * Пик — наш вывод из сэмплов: «нули, значит звука нет». Он требует анализатора и
 * проснувшегося AudioContext, и на секунду опаздывает. `muted` у дорожки — прямой
 * ответ устройства «звук не отдаю», читается в момент старта и работает там, где
 * замер невозможен вовсе.
 *
 * Ради этого всё и затевалось: на OnePlus 8 Pro 13 записей из 16 приехали немыми,
 * человек говорил до восьми минут. Android в таком случае НЕ бросает ошибку —
 * поток отдаёт, файл пишет, дорожку помечает `muted`.
 */
describe('состояние звуковой дорожки', () => {
  it('🔴 зажатый системой микрофон виден сразу, без анализатора', async () => {
    installMic({ level: 0, ctx: 'none', muted: true });
    const rec = await startRecording();
    const note = await rec.stop();
    expect(`muted: ${note?.track?.muted}`).toBe('muted: true');
    // Замера нет вовсе — и всё равно знаем, что микрофон молчит.
    expect(`measured: ${note?.measured}`).toBe('measured: false');
  });

  it('🔴 микрофон отобрали ПОСРЕДИ записи — на старте было чисто', async () => {
    installMic({ level: 0.5, muteAfter: true });
    const rec = await startRecording();
    await new Promise((r) => setTimeout(r, 30));
    const note = await rec.stop();
    expect(`был заглушён: ${note?.track?.everMuted}`).toBe('был заглушён: true');
  });

  /**
   * 🔴 ЗАГЛУШИЛИ И ВЕРНУЛИ. Единственный случай, который ловится ТОЛЬКО подпиской:
   * на старте дорожка здорова, на остановке снова здорова, а в середине записи
   * была дыра. Проверка без этого случая зеленела и без подписки — я на этом
   * попался, когда ломал её в первый раз.
   */
  it('🔴 заглушили и вернули — дыра в середине записи не пропадает', async () => {
    installMic({ level: 0.5, muteThenBack: true });
    const rec = await startRecording();
    await new Promise((r) => setTimeout(r, 30));
    const note = await rec.stop();
    expect(`на выходе дорожка здорова: ${note?.track?.muted === false}`).toBe('на выходе дорожка здорова: true');
    expect(`но дыра записана: ${note?.track?.everMuted}`).toBe('но дыра записана: true');
    expect(`и человека предупредят: ${shouldWarnSilent(note)}`).toBe('и человека предупредят: true');
  });

  it('исправный микрофон дорожку не оговаривает', async () => {
    installMic({ level: 0.5 });
    const rec = await startRecording();
    const note = await rec.stop();
    expect(`muted: ${note?.track?.muted} everMuted: ${note?.track?.everMuted}`)
      .toBe('muted: false everMuted: false');
  });

  it('старый WebView без getAudioTracks — «не знаем», а не «всё хорошо»', async () => {
    installMic({ level: 0.5, noTrackApi: true });
    const rec = await startRecording();
    const note = await rec.stop();
    expect(note?.track).toBeNull();
  });
});

/**
 * КАКИМ МИКРОФОНОМ СНЯТА ЗАМЕТКА.
 *
 * 🔴 ЗАЧЕМ ЭТО ПРОВЕРЯТЬ. Прошлая попытка починить немоту (07.08.2026) состояла в
 * том, что отказ сделали видимым, а причину оставили гипотезой — и 13 дней никто
 * не мог сказать, сработало или нет. Теперь путь захвата ВИДЕН в каждой заметке,
 * и связка «источник + пик» отвечает на вопрос по боевым отчётам. Гейт держит на
 * месте ровно это: что источник выбирается как задумано и доезжает до заметки.
 */
describe('выбор микрофона', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 просим СЫРОЙ микрофон — обработанный не трогаем вовсе', async () => {
    const { micCalls } = installMic({ level: 0.5 });
    const r = await startRecording();
    expect(micCalls).toEqual(['raw']);
    r.cancel();
  });

  it('🔴 источник уезжает в заметку, а не остаётся догадкой', async () => {
    installMic({ level: 0.5 });
    const r = await startRecording();
    const note = await r.stop();
    expect(note?.source).toBe('raw');
  });

  it('🔴 устройство не умеет выключать обработку → идём обычным путём', async () => {
    const { micCalls } = installMic({ level: 0.5, rawFails: true });
    const r = await startRecording();
    const note = await r.stop();
    expect(micCalls).toEqual(['raw', 'processed']);
    expect(note?.source).toBe('processed');
  });

  /**
   * ⚠️ САМОЕ ВАЖНОЕ ЗДЕСЬ. Отказ в ДОСТУПЕ повторять нельзя: человек получит
   * второй системный диалог подряд за один тап. Отказ в УСЛОВИЯХ — можно и нужно.
   * Различие держится по имени ошибки, и без этой проверки оно тихо исчезнет.
   */
  it('🔴 человек не дал микрофон — вторым запросом не мучаем', async () => {
    const { micCalls } = installMic({ level: 0.5 });
    const md = (globalThis as any).navigator.mediaDevices;
    const inner = md.getUserMedia;
    md.getUserMedia = async (c: any) => {
      await inner(c);                       // считаем попытку
      const e: any = new Error('нет доступа'); e.name = 'NotAllowedError'; throw e;
    };
    await expect(startRecording()).rejects.toThrow('нет доступа');
    expect(micCalls).toEqual(['raw']);
  });

  it('и сырой, и обработанный отказали — ошибка уходит наружу, экран объяснится', async () => {
    installMic({ level: 0.5, rawFails: true, processedFails: true });
    await expect(startRecording()).rejects.toThrow();
  });

  it('немая запись на сыром пути всё равно помечена немой — источник не отменяет замер', async () => {
    jest.useFakeTimers();
    installMic({ level: 0 });
    const r = await startRecording();
    jest.advanceTimersByTime(2000);
    const p = r.stop();
    jest.advanceTimersByTime(2000);
    const note = await p;
    expect(note?.source).toBe('raw');
    expect(shouldWarnSilent(note)).toBe(true);
  });
});

/**
 * СПРОСИТЬ СИСТЕМУ НАПРЯМУЮ — ЕДИНСТВЕННОЕ, ЧЕГО МЫ ЕЩЁ НЕ ДЕЛАЛИ.
 *
 * 🔴 ЗАЧЕМ ПРОВЕРЯТЬ ИСПОЛНЕНИЕМ, А НЕ ПОЛЕМ В ОТЧЁТЕ. Гейт полноты требует,
 * чтобы поле `access` доехало до базы, — но не требует, чтобы его НАПОЛНИЛИ.
 * Поломка «совсем не спрашивать систему» оставалась зелёной: поле уезжало
 * пустым и читалось бы как «старый WebView». Ровно так и выглядит измерение,
 * которого нет.
 */
describe('прямой вопрос системе о микрофоне', () => {
  it('🔴 заметка несёт ответ системы, а не пустоту', async () => {
    installMic({ level: 0.5, permission: 'granted', devices: [true, true] });
    const r = await startRecording();
    const note = await r.stop();
    expect(note?.access).toEqual({ permission: 'granted', inputs: 2, named: 2 });
  });

  /**
   * 🔴 ТОТ САМЫЙ РАЗЛИЧИТЕЛЬ. Устройства видны, имён нет — значит поток отдали,
   * а доступа на самом деле нет. Именно так выглядела дорожка в первом отчёте
   * на 1.210.0: живая, не `muted`, с пустым `label` и нулевым пиком.
   */
  it('🔴 устройства есть, имён нет — это видно в заметке', async () => {
    installMic({ level: 0, permission: 'prompt', devices: [false, false] });
    const r = await startRecording();
    const note = await r.stop();
    expect(note?.access).toEqual({ permission: 'prompt', inputs: 2, named: 0 });
  });

  it('система не умеет отвечать — так и пишем, а не выдумываем', async () => {
    installMic({ level: 0.5 });
    delete (globalThis as any).navigator.permissions;
    const r = await startRecording();
    const note = await r.stop();
    expect(note?.access?.permission).toBe('unsupported');
  });
});

/**
 * РАЗРЕШЕНИЕ У СИСТЕМЫ СПРАШИВАЕМ САМИ.
 *
 * 🔴 ЗАЧЕМ. Боевые отчёты v1.211.0 принесли `{ inputs: 3, named: 0 }` — три
 * микрофонных входа видны, ни одного с именем. Имена пусты ровно пока у страницы
 * нет разрешения. Объявить `RECORD_AUDIO` в манифесте мало: на Android 6+ его
 * надо ЗАПРОСИТЬ во время работы, и три недели этого не делал никто.
 */
describe('разрешение на микрофон', () => {
  const setBridge = (b: any) => { (globalThis as any).window = { ...((globalThis as any).window ?? {}), PsyNative: b }; };
  afterEach(() => { const w = (globalThis as any).window; if (w) delete w.PsyNative; });

  it('моста нет (веб, десктоп, старая сборка) — ничего не делаем', async () => {
    expect(await ensureMicPermission(50)).toBe('no-bridge');
  });

  it('🔴 разрешение уже есть — системный диалог человеку не показываем', async () => {
    const requestMic = jest.fn();
    setBridge({ micState: () => 'granted', requestMic });
    expect(await ensureMicPermission(50)).toBe('granted');
    expect(requestMic).not.toHaveBeenCalled();
  });

  it('🔴 разрешения нет — просим у системы', async () => {
    let state = 'denied';
    const requestMic = jest.fn(() => { state = 'granted'; });
    setBridge({ micState: () => state, requestMic });
    expect(await ensureMicPermission(2_000)).toBe('granted');
    expect(requestMic).toHaveBeenCalledTimes(1);
  });

  it('🔴 человек не ответил — не висим вечно, идём дальше', async () => {
    setBridge({ micState: () => 'denied', requestMic: jest.fn() });
    const t0 = Date.now();
    expect(await ensureMicPermission(600)).toBe('denied');
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it('🔴 запись спрашивает разрешение ДО того, как просит микрофон у браузера', async () => {
    const order: string[] = [];
    setBridge({ micState: () => 'denied', requestMic: () => order.push('спросили систему') });
    const { micCalls } = installMic({ level: 0.5 });
    const md = (globalThis as any).navigator.mediaDevices;
    const inner = md.getUserMedia;
    md.getUserMedia = async (c: any) => { order.push('попросили микрофон'); return inner(c); };
    const r = await startRecording();
    expect(order[0]).toBe('спросили систему');
    expect(micCalls.length).toBeGreaterThan(0);
    r.cancel();
  }, 30_000);
});

/**
 * УСТАРЕВШИЙ WEBVIEW — детектор пожирателя голоса (28.08.2026).
 * Замер по базе: 45 немых записей (−91 дБ) — один OnePlus 8 Pro, WebView
 * Chrome/90, при granted и не-muted дорожке. Живые записи — 91+ (Pixel 91,
 * прочие 150). Детектор зовёт вещи по имени вместо ложного «проверьте
 * разрешение», и подсказка существует на всех двенадцати языках.
 */
describe('устаревший WebView', () => {
  const { staleWebViewMajor, STALE_WEBVIEW_BELOW } = require('@/src/services/voiceNote');
  const UA_ONEPLUS = 'Mozilla/5.0 (Linux; Android 11; OnePlus8Pro Build/QKR1.191246.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.210 Mobile Safari/537.36';
  const UA_XIAOMI = 'Mozilla/5.0 (Linux; Android 13; M2102J20SG; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.0.0 Mobile Safari/537.36';
  const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';

  it('живой немой кейс ловится, живой здоровый и десктоп — нет', () => {
    expect(staleWebViewMajor(UA_ONEPLUS)).toBe(90);      // тот самый OnePlus
    expect(staleWebViewMajor(UA_XIAOMI)).toBeNull();     // свежий WebView
    expect(staleWebViewMajor(UA_DESKTOP)).toBeNull();    // Chrome 90, но НЕ Android-WebView
    expect(STALE_WEBVIEW_BELOW).toBe(100);
  });

  it('подсказка существует в базовом словаре и всех десяти оверлеях', () => {
    const fs2 = require('fs');
    const path2 = require('path');
    const base = fs2.readFileSync(path2.join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    expect(base.includes('voiceStaleWebView:')).toBe(true);
    for (const lang of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
      const overlay = fs2.readFileSync(path2.join(__dirname, '..', 'contexts', 'translations', `${lang}.ts`), 'utf8');
      expect(`${lang}: ${overlay.includes('"voiceStaleWebView"')}`).toBe(`${lang}: true`);
    }
  });

  it('виджет предпочитает точную причину общей', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'FeedbackWidget.tsx'), 'utf8');
    expect(src).toMatch(/staleWebViewMajor\(\) !== null \? t\('voiceStaleWebView'\)/);
  });
});
