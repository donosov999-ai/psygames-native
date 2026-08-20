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

import { startRecording, MAX_RECORD_SEC, SILENCE_PEAK, AUDIO_MAX_BYTES } from '@/src/services/voiceNote';

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
function installMic(opts: { level: number; ctx?: 'ok' | 'stuck' | 'none' | 'lazy'; deafStop?: boolean }) {
  const mode = opts.ctx ?? 'ok';
  let wakes = 0;
  const tracks = [{ stop: jest.fn(), kind: 'audio' }];
  const stream = { getTracks: () => tracks };
  (globalThis as any).navigator.mediaDevices = { getUserMedia: async () => stream };

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
  const byte = 128 + Math.round(opts.level * 127);
  class FakeCtx {
    // Контекст, заведённый после await, приходит suspended — как в реальном Chrome.
    state = 'suspended';
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (b: Uint8Array) => b.fill(byte) }; }
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
  return { tracks, recs };
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

  it('порог применяется только к замеренной записи', () => {
    expect(widget()).toContain('v.measured && v.peak < SILENCE_PEAK');
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
  it('ожидание заливки считается от размера — и у записи, и у скриншота', () => {
    const src = svc();
    expect(src).toContain('uploadMs(args.audio.blob.size, AUDIO_CAP_MS)');
    expect(src).toContain('uploadMs(args.shot.size, SHOT_CAP_MS)');
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
