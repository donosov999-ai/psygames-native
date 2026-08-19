/**
 * «РИТМ И ВЫСОТА» — ЧЕМ ЭТА ИГРА ОТЛИЧАЕТСЯ ОТ ОСТАЛЬНЫХ ШЕСТИДЕСЯТИ.
 *
 * Общие гейты проверяют то, что одинаково у всех: прогресс, тропинку, общий
 * экран итога, тихий шаг, часы. Здесь — три вещи, которых больше нет ни у кого,
 * и каждая ломается МОЛЧА.
 *
 * 1. 🔴 ЗВУК ЗДЕСЬ НЕ УКРАШЕНИЕ, А СОДЕРЖАНИЕ. Во всём приложении звук — писк на
 *    нажатие: не прозвучал — никто не заметил. Здесь звук И ЕСТЬ задание, и
 *    поэтому ошибка возможна в ОБЕ стороны:
 *      · игра пищит человеку, который звук выключил (в настройках или вечерним
 *        шагом зарядки) — это то, за что приложение удаляют;
 *      · игра молчит, но пускает играть — человек сидит перед тишиной и жмёт
 *        кнопки наугад, а результат ложится в его статистику.
 *    Проверка одна на приложение — `soundOn()`. Она стоит не на экране, а в
 *    движке: пока звук выключен, не создаётся НИ ОДНОГО осциллятора. Экранной
 *    проверки мало — тумблер можно выключить, когда партия уже идёт.
 *    ⚠️ Считаем осцилляторы, а не читаем исходник: «не звучит» — это про то,
 *    что ничего не создано, а не про то, что где-то написано условие.
 *
 * 2. 🔴 ЧАСЫ ЗВУКА И ЧАСЫ ЭКРАНА — ОДНИ И ТЕ ЖЕ. Модуль сравнивает ОЖИДАЕМОЕ
 *    время каждого удара (его считает движок) с ФАКТИЧЕСКИМ временем нажатия
 *    (его ставит экран). Поправка задержки устройства зажата в −250…+500 мс:
 *    разъехались часы — и разница перестаёт быть задержкой человека, молча
 *    упирается в границу и портит счёт. Снаружи это выглядит как «игра считает
 *    неправильно», причём у всех и всегда.
 *
 * 3. 🔴 СВОЙ ЭКРАН ИТОГА У МОДУЛЯ ВЫКЛЮЧЕН. У модуля есть собственный экран
 *    поздравления. Покажи его — и звёзды по уровням, серия чистых прохождений и
 *    глаз-разрядка не запишутся: они живут только в общем LevelCleared. Ровно
 *    так когда-то выпали из бухгалтерии маджонг и парные картинки. Проверяется
 *    ПОВЕДЕНИЕМ: доигрываем раунд до конца и смотрим, что модуль ушёл со сцены,
 *    а итог отдал наружу.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ ЖИВОЙ РЕНДЕР, А НЕ ПОИСК ПО ИСХОДНИКУ. В этом проекте уже
 * обжигались: в SET бейдж отсчёта был написан, переведён на 12 языков, покрыт
 * гейтом — и не показывался ни разу. Поэтому раунд здесь играется по-настоящему:
 * нажатия идут по нарисованному дереву, а строка «что делать» проверяется тем,
 * что она НА ЭКРАНЕ в фазе ответа.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import React from 'react';
import { AppToneAudioEngine } from '@/src/games/rhythm-pitch/appAudio';
import { RhythmPitchGame } from '@/src/games/rhythm-pitch/RhythmPitchGame';
import {
  generateRhythmPitchRound,
  getRhythmPitchStrings,
  isPassed,
  type RhythmPitchMetrics,
  type RhythmPitchRound,
} from '@/src/games/rhythm-pitch/core';
import type { AudioPlaybackPlan, ToneAudioEngine } from '@/src/games/rhythm-pitch/audio/ToneAudioEngine';
import { setCalmHush, setSoundEnabled } from '@/src/services/feedback';
import { gameNow, holdGame, __resetGameClock } from '@/src/services/gamePause';

const TestRenderer = require('react-test-renderer');
const SCREEN_RAW = readFileSync(join(__dirname, '../../app/games/rhythm-pitch.tsx'), 'utf8') as string;
/**
 * ⚠️ ИСХОДНИК БЕЗ КОММЕНТАРИЕВ — И ЭТО НЕ ПРИДИРКА. Шапка экрана объясняет
 * решения ЦИТАТАМИ кода (`showOwnResults={false}`, `soundOn()`), и проверка по
 * сырому тексту оставалась зелёной, когда сам проп уже переключили: гейт читал
 * объяснение вместо кода. Поймано мутацией 19.08.2026 — ровно тот случай, когда
 * разметка на месте, а поведение мёртвое.
 */
const SCREEN = SCREEN_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, ' ');
const RU = getRhythmPitchStrings('ru');

// ─────────────────────────── поддельный аудиовыход ───────────────────────────

/**
 * Web Audio в jest нет, а считать нужно именно СОЗДАННЫЕ узлы. Поэтому кладём
 * на globalThis минимальный контекст, который умеет ровно то, чем пользуется
 * движок, и считает осцилляторы.
 */
let oscillators = 0;

function installFakeAudio() {
  const node = () => ({
    connect() {}, disconnect() {},
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  });
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain() { return node(); }
    createOscillator() {
      oscillators += 1;
      const osc: any = {
        type: 'sine',
        frequency: { setValueAtTime() {} },
        connect() {}, disconnect() {},
        onended: null as null | (() => void),
        start() {},
        stop() { osc.onended?.(); },
      };
      return osc;
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }
  (globalThis as any).AudioContext = FakeAudioContext;
}

const round = (level: number): RhythmPitchRound => generateRhythmPitchRound('rhythm-pitch-test', level);

beforeAll(installFakeAudio);
beforeEach(async () => {
  oscillators = 0;
  __resetGameClock();
  setCalmHush(false);
  await setSoundEnabled(true);
});
afterEach(async () => {
  setCalmHush(false);
  await setSoundEnabled(true);
});

const engineOf = (extra: Partial<ConstructorParameters<typeof AppToneAudioEngine>[0]> = {}) =>
  new AppToneAudioEngine({ mutedMessage: () => 'звук выключен', ...extra });

describe('звук: единственная проверка — общий тумблер приложения', () => {
  it('есть что проверять: со звуком раунд действительно звучит', async () => {
    const engine = engineOf();
    const r = round(1);
    await engine.playRound(r, 0.6);
    // По осциллятору на удар — иначе поддельный контекст не подключён и весь
    // набор ниже был бы зелен вслепую.
    expect(oscillators).toBe((r as any).beatCount);
    await engine.dispose();
  });

  it('🔴 звук выключен человеком → не создано ни одного осциллятора', async () => {
    await setSoundEnabled(false);
    const engine = engineOf();
    expect(engine.available).toBe(false);
    await expect(engine.playRound(round(1), 0.6)).rejects.toThrow();
    await expect(engine.playCalibration(0.6)).rejects.toThrow();
    expect(oscillators).toBe(0);
    await engine.dispose();
  });

  it('🔴 тихий вечерний шаг глушит так же — и не трогает настройку человека', async () => {
    setCalmHush(true);
    const engine = engineOf();
    expect(engine.available).toBe(false);
    await expect(engine.playCalibration(0.6)).rejects.toThrow();
    expect(oscillators).toBe(0);
    setCalmHush(false);
    // Тумблер человека остался включённым: после вечера игра снова звучит.
    expect(engine.available).toBe(true);
    await engine.playRound(round(2), 0.6);
    expect(oscillators).toBeGreaterThan(0);
    await engine.dispose();
  });

  it('глушение не мешает прибраться: стоп, сон и закрытие идут и без звука', async () => {
    const engine = engineOf();
    await engine.playRound(round(1), 0.6);
    await setSoundEnabled(false);
    // Иначе выключенный звук оставил бы висеть живой AudioContext до перезапуска.
    await expect(engine.stop()).resolves.toBeUndefined();
    await expect(engine.suspend()).resolves.toBeUndefined();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});

describe('часы: ожидаемое время сигнала и время нажатия — на одних часах', () => {
  it('🔴 движок считает ожидаемое время по ИГРОВЫМ часам, а не по своим', async () => {
    const engine = engineOf();
    const before = gameNow();
    const plan = await engine.playRound(round(1), 0.6);
    const after = gameNow();
    // performance.now() в тестовой среде — десятки тысяч, игровые часы — 1.7e12.
    // Ошибись здесь на источник, и разница «ожидали / нажал» станет разницей эпох.
    expect(plan.expectedTimesMs[0]).toBeGreaterThanOrEqual(before);
    expect(plan.expectedTimesMs[0]).toBeLessThanOrEqual(after + 200);
    await engine.dispose();
  });

  it('🔴 пока держат паузу, ожидаемое время не убегает', async () => {
    const engine = engineOf();
    const first = (await engine.playRound(round(1), 0.6)).expectedTimesMs[0] as number;
    const release = holdGame();
    await new Promise((r) => setTimeout(r, 60));
    const held = (await engine.playRound(round(1), 0.6)).expectedTimesMs[0] as number;
    release();
    // Настенных прошло не меньше 50 мс, игровых — почти ноль.
    expect(Math.abs(held - first)).toBeLessThan(30);
    await engine.dispose();
  });

  it('экран отдаёт модулю ТЕ ЖЕ общие часы', () => {
    expect(SCREEN).toMatch(/now=\{gameNow\}/);
    // И свой движок: без этого модуль заведёт собственный, мимо тумблера звука.
    expect(SCREEN).toMatch(/audioEngine=\{engine\}/);
    expect(SCREEN).toMatch(/createAppToneAudioEngine\(/);
  });
});

// ─────────────────────────── живой раунд по дереву ───────────────────────────

type Plan = { plan: AudioPlaybackPlan; finish: () => void };

/** Движок-заглушка: расписание не нужно, нужен управляемый конец воспроизведения. */
function scriptedEngine(now: () => number): ToneAudioEngine & { plans: Plan[] } {
  const plans: Plan[] = [];
  const make = (delays: number[]): AudioPlaybackPlan => {
    let finish = () => {};
    const completed = new Promise<void>((resolve) => { finish = resolve; });
    const plan = { expectedTimesMs: delays.map((d) => now() + d), completed };
    plans.push({ plan, finish });
    return plan;
  };
  return {
    plans,
    available: true,
    async initialize() {},
    async playCalibration() { return make([0, 450, 900, 1_350]); },
    async playRound(r: RhythmPitchRound) {
      return make(r.mode === 'rhythm-echo' ? r.beats.map((b) => b.onsetMs) : r.sequence.map((_, i) => i * 440));
    },
    async stop() {},
    async suspend() {},
    async dispose() {},
  };
}

/** Все подписи, нарисованные на экране прямо сейчас. */
function texts(r: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON());
  return out;
}

/** Нажатие по нарисованной кнопке — по подписи, как это делает человек. */
function press(r: any, label: string) {
  const hit = r.root.findAll(
    (n: any) => typeof n.type !== 'string' && n.props?.accessibilityLabel === label && n.props?.onPress,
    { deep: true },
  );
  if (hit.length === 0) throw new Error(`на экране нет кнопки «${label}»: ${texts(r).join(' · ').slice(0, 300)}`);
  hit[0].props.onPress();
}

describe('раунд играется по-настоящему', () => {
  it('🔴 правило раунда написано на экране, звук не подсказывает ответ, итог уходит наружу', async () => {
    let clock = 5_000;
    const now = () => clock;
    const engine = scriptedEngine(now);
    const results: RhythmPitchMetrics[] = [];
    let r: any;

    await TestRenderer.act(async () => {
      r = TestRenderer.create(React.createElement(RhythmPitchGame as any, {
        seed: 'rhythm-pitch-test',
        level: 1,                 // 1 — эхо ритма (режимы чередуются через один)
        locale: 'ru',
        theme: {
          background: '#fff', surface: '#fff', card: '#fff', text: '#000',
          textSecondary: '#555', border: '#ddd', primary: '#4338ca',
          success: '#0a0', error: '#a00', warning: '#fa0',
        },
        gameGradient: ['#4338ca', '#22d3ee'],
        gameGradientText: '#fff',
        showOwnResults: false,     // ровно как в экране приложения
        audioEngine: engine,
        now,
        onComplete: (m: RhythmPitchMetrics) => results.push(m),
      }));
    });

    // Правила → калибровка задержки.
    await TestRenderer.act(async () => { press(r, RU.start); });
    await TestRenderer.act(async () => { press(r, RU.playCalibration); });
    /**
     * Стучим вместе с сигналами — но с ЗАДЕРЖКОЙ, как настоящий человек с
     * настоящей колонкой: ровно её калибровка и должна вычесть. Без двух
     * замеров калибровка не засчитывается вовсе.
     */
    const LATENCY = 60;
    const pulses = engine.plans[0].plan.expectedTimesMs;
    /**
     * ⚠️ КАЖДОЕ НАЖАТИЕ — В СВОЁМ act. React считает состояние в конце пачки, а
     * время нажатия берётся ВНУТРИ обновления: два тапа в одной пачке получили
     * бы одну и ту же метку времени, и проверка мерила бы не то. На этом здесь
     * уже споткнулись — поправка вышла 280 мс вместо 60.
     */
    await TestRenderer.act(async () => { clock = (pulses[0] as number) + LATENCY; press(r, RU.calibrationTap); });
    await TestRenderer.act(async () => { clock = (pulses[1] as number) + LATENCY; press(r, RU.calibrationTap); });
    await TestRenderer.act(async () => { engine.plans[0].finish(); });
    expect(texts(r).some((t) => t.includes('Калибровка готова'))).toBe(true);

    await TestRenderer.act(async () => { press(r, RU.continue); });
    await TestRenderer.act(async () => { press(r, RU.play); });

    // Пока звучит задание — на экране только «Слушайте…»: ни ритма, ни ответа.
    const playback = texts(r);
    expect(playback).toContain(RU.listening);
    expect(playback).not.toContain(RU.rhythmPrompt);

    await TestRenderer.act(async () => { engine.plans[1].finish(); });

    // 🔴 Фаза ответа: строка «что делать» действительно НА ЭКРАНЕ.
    expect(texts(r)).toContain(RU.rhythmPrompt);

    /**
     * Повторяем ритм в срок — с той же задержкой устройства, что была на
     * калибровке. Раунд обязан быть засчитан: поправку игра уже знает, и если
     * она перестанет вычитаться, этот тест покраснеет первым.
     */
    const beats = (round(1) as any).beats as { onsetMs: number }[];
    const base = clock;
    for (const b of beats) {
      await TestRenderer.act(async () => { clock = base + b.onsetMs + LATENCY; press(r, RU.rhythmTap); });
    }
    expect(texts(r).join(' ')).toContain(`${beats.length}`);   // счётчик тапов дошёл до конца образца
    await TestRenderer.act(async () => { press(r, RU.submit); });

    expect(results).toHaveLength(1);
    expect(results[0].details.level).toBe(1);
    expect(isPassed(results[0])).toBe(true);
    /**
     * И точность РОВНО единица, а не «сойдёт». Сыграно идеально, задержка
     * устройства известна из калибровки — значит ошибка обязана быть нулевой.
     * Порог 0.70 такую поломку проглатывает: перестань вычитаться поправка, и
     * при допуске 300 мс точность просядет всего до 0.8, то есть «зачтено».
     */
    expect(results[0].accuracy).toBeCloseTo(1, 5);
    expect(results[0].specific.meanTimingErrorMs).toBe(0);
    expect(results[0].specific.calibrationOffsetMs).toBe(LATENCY);
    // 🔴 Свой экран поздравления модуль НЕ показывает: сцена отдана приложению.
    expect(r.toJSON()).toBeNull();

    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 нет звука — нет и партии: экран честно говорит, а не пускает в тишину', async () => {
    const now = () => 1_000;
    const engine = scriptedEngine(now);
    (engine as any).available = false;      // тумблер выключен → движок недоступен
    let r: any;
    await TestRenderer.act(async () => {
      r = TestRenderer.create(React.createElement(RhythmPitchGame as any, {
        seed: 'rhythm-pitch-test', level: 1, locale: 'ru',
        theme: {
          background: '#fff', surface: '#fff', card: '#fff', text: '#000',
          textSecondary: '#555', border: '#ddd', primary: '#4338ca',
          success: '#0a0', error: '#a00', warning: '#fa0',
        },
        gameGradient: ['#4338ca', '#22d3ee'], gameGradientText: '#fff',
        showOwnResults: false, audioEngine: engine, now,
      }));
    });
    await TestRenderer.act(async () => { press(r, RU.start); });
    const shown = texts(r);
    expect(shown).toContain(RU.unavailableTitle);
    // Микрофон здесь не просят ни при каких обстоятельствах — это обещание игры.
    expect(shown.join(' ')).toContain('Микрофон');
    await TestRenderer.act(async () => { r.unmount(); });
  });
});

describe('экран: решения приёмки, которые ломаются молча', () => {
  it('🔴 свой экран итога модуля выключен — звёзды пишет общий LevelCleared', () => {
    expect(SCREEN).toMatch(/showOwnResults=\{false\}/);
    expect(SCREEN).toMatch(/<LevelCleared/);
  });

  it('🔴 primary отдан ЦВЕТОМ ИГРЫ, а не акцентом профиля', () => {
    // colors.primary внутри темы модуля означал бы оранжевую шапку в одном
    // профиле и синюю в другом, при неизменном градиенте снаружи.
    const theme = SCREEN.slice(SCREEN.indexOf('theme={{'), SCREEN.indexOf('gameGradient='));
    expect(theme).toMatch(/primary:\s*GRADIENT\[0\]/);
    expect(theme).not.toMatch(/primary:\s*colors\.primary/);
  });

  it('🔴 выключенный звук и тихий шаг разведены: разный текст и разный выход', () => {
    // Тумблер чинится одной кнопкой, спокойный шаг не чинится вовсе — «сыграйте
    // днём». Один общий текст на два случая врал бы в одном из них.
    expect(SCREEN).toMatch(/strings\.soundOffNotice/);
    expect(SCREEN).toMatch(/strings\.enableSound/);
    expect(SCREEN).toMatch(/strings\.calmNotice/);
    expect(SCREEN).toMatch(/isCalm \?/);
    /**
     * ⚠️ И ни одного `t('rhythmPitch…')`: общий словарь эти ключи ещё не знает, а
     * `t()` возвращает незаведённый ключ КАК ЕСТЬ — на экране было бы написано
     * «rhythmPitchSoundOff». Поймано гейтом dictionary-duplicates 19.08.2026.
     */
    expect(SCREEN).not.toMatch(/t\('rhythmPitch/);
    // Обе подписи существуют на обоих языках модуля — иначе «текст есть» это враньё.
    for (const loc of ['ru', 'en'] as const) {
      const st = getRhythmPitchStrings(loc);
      expect(st.soundOffNotice.length).toBeGreaterThan(30);
      expect(st.calmNotice.length).toBeGreaterThan(30);
      expect(st.enableSound.length).toBeGreaterThan(3);
      expect(st.catalogDesc.length).toBeGreaterThan(20);
    }
  });

  it('🔴 автостарт из зарядки ждёт ответа про звук, а не прыгает в тишину', () => {
    const autostart = SCREEN.slice(SCREEN.indexOf('if (autostart'), SCREEN.indexOf('const onComplete'));
    expect(autostart).toMatch(/soundPref !== null/);
    expect(autostart).toMatch(/!muted/);
  });

  it('🔴 плашка итога подписана СЫГРАННЫМ уровнем, а не уже поднятым', () => {
    /**
     * `level` считается из `lvl.level`, а тот растёт сразу в `reach()`: отдай его
     * плашке — и за пройденный первый уровень она скажет «Уровень 2 пройден!».
     * Поймано глазами в браузере на первой же партии, гейтом — здесь.
     */
    const banner = SCREEN.slice(SCREEN.indexOf('<LevelCleared'), SCREEN.indexOf('<GameResult'));
    expect(banner).toMatch(/level=\{doneLevel\}/);
    expect(banner).not.toMatch(/level=\{level\}/);
    expect(SCREEN).toMatch(/setDoneLevel\(level\)/);
  });

  it('уровень уходит в сессию — иначе прогресс не переживёт сброс профиля', () => {
    expect(SCREEN).toMatch(/game_type: 'rhythm_pitch'/);
    expect(SCREEN).toMatch(/details: \{\s*\n\s*level,/);
  });
});
