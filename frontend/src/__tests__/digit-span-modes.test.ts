/* psygames-digit-span-modes · VER 1 · 23.08.2026 */
/**
 * «ЦИФРОВОЙ РЯД»: ТРЕТИЙ РЕЖИМ, ГОЛОС, ОХВАТ В ШАПКЕ И ТЕМП — ПРОВЕРЯЮТСЯ ИГРОЙ.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ НЕТ НИ ОДНОЙ РЕГУЛЯРКИ ПО ИСХОДНИКУ. Проверка, читающая текст
 * файла, зеленеет от комментария рядом с кодом — в этом проекте на том обжигались
 * шесть раз за два дня. Поэтому экран монтируется по-настоящему (react-test-
 * renderer, тот же приём, что в `samurai-building.test.ts`), партия играется
 * нажатиями и вводом, а сверяются ЗНАЧЕНИЯ на экране: какие цифры показали, что
 * засчитали верным, что стоит в шапке, через сколько миллисекунд пришёл ввод.
 *
 * ЧТО СТЕРЕЖЁТСЯ, по пунктам:
 *
 *  1. РЕЖИМ «ПО ВОЗРАСТАНИЮ» (Digit Sequencing из батареи BACS). Показали
 *     5-2-8-1 — верным обязан быть ввод 1-2-5-8, а ввод 5-2-8-1 обязан быть
 *     ошибкой, и строка «было: …» обязана показать тот же ответ, каким считали.
 *     Проба нарочно устроена так, что показанный порядок НЕ совпадает с
 *     возрастающим: иначе она была бы верна при обоих правилах сразу.
 *
 *  2. ПОДАЧА ГОЛОСОМ. Выбран голос и говорить есть чем — цифры произносятся, и
 *     на экране их НЕТ (иначе голос бессмыслен). Говорить нечем — партия идёт
 *     ЭКРАНОМ и человеку написана причина. Беззвучная тишина запрещена прямо
 *     шапкой `src/services/tts.ts`, и ловится она здесь: при выключенной речи в
 *     раунде обязана остаться хотя бы одна форма стимула.
 *
 *  3. ОХВАТ И РЕКОРД В ШАПКЕ — ПО ХОДУ ПАРТИИ. Взял длину 4 — шапка показывает
 *     4 НЕ ДОЖИДАЯСЬ конца партии. И встречная сторона: партия, которая в рекорд
 *     не идёт (свободная), рекорд на экране не двигает — иначе человеку показали
 *     бы число, которого назавтра нигде не окажется.
 *
 *  4. ТЕМП. В свободной партии ползунок правда меняет скорость показа (быстрый
 *     доводит до ввода там, где медленный ещё показывает), а в личной игре по
 *     уровням тот же ползунок не меняет НИЧЕГО: темп остаётся за уровнем, иначе
 *     охваты станут несравнимы (та же причина, что у `countsForRecord`).
 *
 *  5. СЛОВАРЬ МОДУЛЯ — двенадцать языков, ни одной мёртвой строки: те же
 *     требования, что держит `games-module-i18n.test.ts` для пяти других игр.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {
  DIGIT_SPAN_LOCALES,
  getDigitSpanStrings,
  type DigitSpanLocale,
} from '@/src/games/digit-span/core/i18n';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const TestRenderer = require('react-test-renderer');

// Монтаж настоящего экрана с его графом импортов не укладывается в пять секунд
// умолчания — а урезать проверку до «быстрой» значит перестать играть партию.
jest.setTimeout(90000);

// ─────────────────────────────────────────────────────────────────────────────
// ПОДСТАВКИ ВНЕШНЕГО МИРА. Всё, что не относится к проверяемому поведению:
// параметры маршрута, речь системы, запись сессии и отправка рекорда.
// ─────────────────────────────────────────────────────────────────────────────

/** Параметры маршрута: ими игра отличает свободную партию (`wu=1`) от личной. */
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => mockParams,
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

/**
 * Речь: что человек УСЛЫШАЛ (`mockSpoken`) и сколько раз игра пыталась говорить
 * (`mockSpeakCalls`) — это разные вещи, и различать их обязательно.
 *
 * ⚠️ УСТРОЙСТВО БЕЗ ГОЛОСА МОЛЧИТ ПО-НАСТОЯЩЕМУ. Подставка ведёт себя как живой
 * слой: при поднятой причине (`mockTtsBlock`) вызов проходит, а звука нет —
 * ровно поэтому обещать голос вслепую нельзя, и ровно это ловится пробой ниже.
 */
let mockTtsBlock: 'sound-off' | 'no-voice' | null = null;
const mockSpoken: string[] = [];
let mockSpeakCalls = 0;
jest.mock('@/src/services/tts', () => ({
  // Речь занимает время, как настоящая: иначе фазы «сейчас звучит» не будет ни на
  // одном кадре, и проверить, что человеку в это время написали, стало бы нечем.
  speakSequence: async (words: string[], _lang: string, gapMs: number) => {
    mockSpeakCalls += 1;
    if (mockTtsBlock === null) mockSpoken.push(...words.map(String));
    await new Promise((r) => setTimeout(r, gapMs));
  },
  speak: async () => {},
  ttsCancel: () => {},
  ttsAvailable: () => mockTtsBlock !== 'no-voice',
  ttsBlockedReason: () => mockTtsBlock,
}));

const mockSaved: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { mockSaved.push(s); return { ok: true }; },
}));

/** Отправка рекорда — единственное, что в лидерборде подменено; правило зачёта настоящее. */
const mockSubmitted: number[] = [];
jest.mock('@/src/services/leaderboard', () => ({
  ...jest.requireActual('@/src/services/leaderboard'),
  submitScore: async (_id: string, score: number) => { mockSubmitted.push(score); return { ok: true }; },
}));

const BEST_KEY = 'psygames_leaderboard_personal_best_digit_span';

// ─────────────────────────────────────────────────────────────────────────────
// ИГРАЕМ ПО-НАСТОЯЩЕМУ: монтаж экрана, нажатия, ввод, чтение того, что видно.
// ─────────────────────────────────────────────────────────────────────────────

interface Game {
  root: any;
  /** Есть ли на экране элемент с такой меткой. */
  has: (id: string) => boolean;
  /** Весь текст внутри элемента с меткой, одной строкой. */
  textOf: (id: string) => string;
  press: (id: string) => void;
  /** Набрать ответ в поле — так же, как это делает клавиатура. */
  type: (s: string) => Promise<void>;
  /** Прокрутить время игры (таймеры показа) и дать промисам доиграть. */
  tick: (ms: number) => Promise<void>;
  /** Дать доиграть только промисам (озвучка ничего не ждёт по таймеру). */
  settle: () => Promise<void>;
  unmount: () => void;
}

function textUnder(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textUnder).join('');
  return textUnder(node.children);
}

function findByTestID(json: any, id: string): any[] {
  const out: any[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.props?.testID === id) out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(json);
  return out;
}

function mountGame(): Game {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/digit-span').default;
  // Игровая фаза живёт в GameShell, а он спрашивает безопасные поля экрана.
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: metrics },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(WarmupProvider, null, React.createElement(Screen)))))),
    );
  });

  const settle = async () => {
    await TestRenderer.act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
  };
  /**
   * ⚠️ ВРЕМЯ ИДЁТ ШАГАМИ, А НЕ ОДНИМ ПРЫЖКОМ. Озвучка — цепочка «сказал → подождал
   * → сказал»: следующий таймер ставится только после того, как разрешился
   * предыдущий промис. Один большой `advanceTimersByTime` прокрутил бы часы мимо
   * ещё не заведённых таймеров, и ряд оборвался бы на второй цифре.
   */
  const tick = async (ms: number) => {
    await TestRenderer.act(async () => {
      for (let left = ms; left > 0; left -= 50) {
        jest.advanceTimersByTime(Math.min(50, left));
        await Promise.resolve();
        await Promise.resolve();
      }
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
  };
  const press = (id: string) => {
    const node = r.root.findAll((n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function')[0];
    if (!node) throw new Error(`нет кнопки ${id}`);
    TestRenderer.act(() => { node.props.onPress(); });
  };
  const type = async (s: string) => {
    const node = r.root.findAll((n: any) => n.props?.testID === 'ds-input' && typeof n.props?.onChangeText === 'function')[0];
    if (!node) throw new Error('поля ввода нет на экране');
    await TestRenderer.act(async () => { node.props.onChangeText(s); });
    await tick(400);   // авто-проверка ответа ждёт 250 мс, чтобы человек увидел свою последнюю цифру
  };

  return {
    root: r,
    has: (id: string) => findByTestID(r.toJSON(), id).length > 0,
    textOf: (id: string) => findByTestID(r.toJSON(), id).map(textUnder).join(' '),
    press, type, tick, settle,
    unmount: () => TestRenderer.act(() => r.unmount()),
  };
}

/** Верно ли засчитан последний ответ — по значку, а не по слову: значок один во всех языках. */
function verdict(g: Game): 'right' | 'wrong' | 'none' {
  const names = g.root.root.findAll((n: any) => typeof n.props?.name === 'string').map((n: any) => n.props.name);
  if (names.includes('checkmark-circle')) return 'right';
  if (names.includes('close-circle')) return 'wrong';
  return 'none';
}

/**
 * Ряд, который показала игра. Первая цифра видна сразу, дальше по одной каждые
 * `gapMs`; читаем ровно в моменты смены — так порядок берётся с экрана, а не из
 * предположения о генераторе.
 */
async function watchDigits(g: Game, len: number, gapMs: number): Promise<number[]> {
  const seen: number[] = [Number(g.textOf('ds-digit').trim())];
  for (let i = 1; i < len; i++) {
    await g.tick(gapMs);
    seen.push(Number(g.textOf('ds-digit').trim()));
  }
  await g.tick(gapMs + 400);   // последняя цифра гаснет, экран уходит в ввод
  return seen;
}

/**
 * Ряд из цифр 5-2-8-1 в любом их сдвиге: 5281, 2815, 8152, 1528 — ни один из
 * четырёх не отсортирован, поэтому проба различает «прямой порядок» и «по
 * возрастанию» при любом раскладе.
 *
 * ⚠️ ПОРЯДОК ЦИФР НЕ ЗАКРЕПЛЯЕМ, А ЧИТАЕМ С ЭКРАНА. Счётчик случайных чисел не наш:
 * первый монтаж экрана тратит их на своё, и жёстко ожидаемый ряд краснел бы от
 * порядка запуска проб, а не от поломки игры. Закреплён НАБОР — этого хватает,
 * чтобы доказать, что подставка сработала.
 */
const FIXED = [0.51, 0.23, 0.85, 0.14];
const FIXED_DIGITS = [1, 2, 5, 8];
function fixSequence(): void {
  let i = 0;
  jest.spyOn(Math, 'random').mockImplementation(() => FIXED[i++ % FIXED.length]);
}

/** Ряд и правда пришёл из подставки, и он не отсортирован — иначе проба пуста. */
function assertFixedRow(shown: number[]): void {
  expect([...shown].sort((a, b) => a - b)).toEqual(FIXED_DIGITS);
  const ascending = [...shown].sort((a, b) => a - b).join('');
  expect(`показано ${shown.join('')}, по возрастанию ${ascending}, это разные ряды: ${shown.join('') !== ascending}`)
    .toBe(`показано ${shown.join('')}, по возрастанию ${ascending}, это разные ряды: true`);
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockParams = {};
  mockTtsBlock = null;
  mockSpoken.length = 0;
  mockSpeakCalls = 0;
  mockSaved.length = 0;
  mockSubmitted.length = 0;
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. РЕЖИМ «ПО ВОЗРАСТАНИЮ»
// ─────────────────────────────────────────────────────────────────────────────

describe('режим «по возрастанию» — ответ это отсортированный ряд', () => {
  it('🔴 ряд из цифр 5-2-8-1: верным считается ввод по возрастанию', async () => {
    mockParams = { wu: '1', mode: 'ascending', startLen: '4' };
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();   // свободная партия стартует сама, как только известен уровень
      const shown = await watchDigits(g, 4, 1100);
      assertFixedRow(shown);   // проба обязана различать правила: показанный порядок ≠ возрастающий
      const ascending = [...shown].sort((a, b) => a - b).join('');

      await g.type(ascending);
      expect(`ввод ${ascending} → ${verdict(g)}`).toBe(`ввод ${ascending} → right`);
    } finally { g.unmount(); }
  });

  it('🔴 тот же ряд, введённый как показан, — ошибка, и «было» показывает возрастающий', async () => {
    mockParams = { wu: '1', mode: 'ascending', startLen: '4' };
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();
      const shown = await watchDigits(g, 4, 1100);
      assertFixedRow(shown);
      const asShown = shown.join('');
      const ascending = [...shown].sort((a, b) => a - b).join('');

      await g.type(asShown);
      expect(`ввод ${asShown} → ${verdict(g)}`).toBe(`ввод ${asShown} → wrong`);
      // Строка «было: …» обязана назвать тот же ответ, по которому считали.
      const all = textUnder(g.root.toJSON());
      expect(`на экране назван ${ascending}: ${all.includes(ascending)}`).toBe(`на экране назван ${ascending}: true`);
      expect(`на экране назван ${asShown}: ${all.includes(asShown)}`).toBe(`на экране назван ${asShown}: false`);
    } finally { g.unmount(); }
  });

  it('🔴 прямой и обратный режимы не задеты третьим', async () => {
    for (const mode of ['forward', 'backward'] as const) {
      mockParams = { wu: '1', mode, startLen: '4' };
      fixSequence();
      const g = mountGame();
      try {
        await g.settle();
        const shown = await watchDigits(g, 4, 1100);
        assertFixedRow(shown);
        const want = (mode === 'forward' ? shown : [...shown].reverse()).join('');
        await g.type(want);
        expect(`${mode}: ввод ${want} → ${verdict(g)}`).toBe(`${mode}: ввод ${want} → right`);
      } finally { g.unmount(); jest.restoreAllMocks(); }
    }
  });

  it('🔴 повторяющиеся цифры сортировке не мешают — ответ однозначен', () => {
    const { expectedDigits } = require('@/app/games/digit-span');
    expect(expectedDigits([5, 2, 5, 1], 'ascending')).toEqual([1, 2, 5, 5]);
    expect(expectedDigits([7, 7, 7], 'ascending')).toEqual([7, 7, 7]);
    // и сам показанный ряд не портится сортировкой на месте
    const seq = [3, 1, 2];
    expectedDigits(seq, 'ascending');
    expect(seq).toEqual([3, 1, 2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ПОДАЧА: ЭКРАН ИЛИ ГОЛОС
// ─────────────────────────────────────────────────────────────────────────────

describe('подача цифр: экран или голос', () => {
  it('🔴 голосом — цифры произносятся, и на экране их нет', async () => {
    mockTtsBlock = null;
    mockParams = { wu: '1', delivery: 'voice', startLen: '4' };
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();
      // Пока ряд звучит: первая цифра уже произнесена, а смотреть не на что —
      // и об этом на поле НАПИСАНО, а не оставлено пустое место.
      expect(`произнесено к первому кадру: ${mockSpoken.length}`).toBe('произнесено к первому кадру: 1');
      expect(`цифра на экране: ${g.has('ds-digit')}`).toBe('цифра на экране: false');
      expect(`сказано, что слушаем: ${g.textOf('ds-listening').length > 3}`).toBe('сказано, что слушаем: true');

      await g.tick(1100 * 4 + 400);
      const heard = mockSpoken.map(Number);
      assertFixedRow(heard);   // прозвучал весь ряд, а не первая цифра
      // Услышанный ряд принимается тем же полем ввода — и засчитывается верным.
      await g.type(heard.join(''));
      expect(`ввод услышанного ${heard.join('')} → ${verdict(g)}`).toBe(`ввод услышанного ${heard.join('')} → right`);
    } finally { g.unmount(); }
  });

  it('🔴 голоса в системе нет — партия идёт ЭКРАНОМ, а не беззвучной пустотой', async () => {
    mockTtsBlock = 'no-voice';
    mockParams = { wu: '1', delivery: 'voice', startLen: '4' };
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();
      // ГЛАВНОЕ: стимул не пропал. Беззвучная пустота — это партия без задачи.
      const shown = await watchDigits(g, 4, 1100);
      assertFixedRow(shown);
      await g.type(shown.join(''));
      expect(`ввод показанного ${shown.join('')} → ${verdict(g)}`).toBe(`ввод показанного ${shown.join('')} → right`);
      // Услышать было нечего — и игра даже не пыталась говорить в пустоту.
      expect(`услышано: ${mockSpoken.length}`).toBe('услышано: 0');
      expect(`попыток заговорить: ${mockSpeakCalls}`).toBe('попыток заговорить: 0');
    } finally { g.unmount(); }
  });

  it('🔴 на экране настроек написана ПРИЧИНА, и она разная для двух бед', async () => {
    /**
     * Сверяем не с русской строкой, а с НАБОРОМ переводов: язык интерфейса в
     * прогоне не задан, но взятый КЛЮЧ виден всё равно — попадание в набор
     * `voiceNoVoice` и есть доказательство, что причина названа правильная.
     * Наборы не пересекаются — иначе проверка ничего бы не различала.
     */
    const noVoiceAll = new Set(DIGIT_SPAN_LOCALES.map((l) => getDigitSpanStrings(l).voiceNoVoice));
    const soundOffAll = new Set(DIGIT_SPAN_LOCALES.map((l) => getDigitSpanStrings(l).voiceSoundOff));
    expect([...noVoiceAll].filter((v) => soundOffAll.has(v))).toEqual([]);
    for (const [block, expected] of [
      ['no-voice', noVoiceAll],
      ['sound-off', soundOffAll],
    ] as const) {
      mockTtsBlock = block;
      mockParams = {};
      const g = mountGame();
      try {
        await g.settle();
        const warn = g.textOf('ds-voice-warning');
        expect(`${block}: причина написана: ${warn.length > 10}`).toBe(`${block}: причина написана: true`);
        expect(`${block}: названа своя причина: ${expected.has(warn)}`).toBe(`${block}: названа своя причина: true`);
        // Кнопка голоса не притворяется рабочей.
        const voiceBtn = g.root.root.findAll((n: any) => n.props?.testID === 'ds-delivery-voice')[0];
        expect(`${block}: кнопка голоса выключена: ${!!voiceBtn?.props?.disabled}`).toBe(`${block}: кнопка голоса выключена: true`);
      } finally { g.unmount(); }
    }
    // А когда говорить есть чем — ни предупреждения, ни выключенной кнопки.
    mockTtsBlock = null;
    mockParams = {};
    const ok = mountGame();
    try {
      await ok.settle();
      expect(`предупреждение при живом голосе: ${ok.has('ds-voice-warning')}`).toBe('предупреждение при живом голосе: false');
      const voiceBtn = ok.root.root.findAll((n: any) => n.props?.testID === 'ds-delivery-voice')[0];
      expect(`кнопка голоса выключена: ${!!voiceBtn?.props?.disabled}`).toBe('кнопка голоса выключена: false');
    } finally { ok.unmount(); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ОХВАТ И РЕКОРД В ШАПКЕ ПАРТИИ
// ─────────────────────────────────────────────────────────────────────────────

describe('охват и рекорд видно по ходу партии', () => {
  it('🔴 взятая длина попадает в шапку СРАЗУ, не дожидаясь конца партии', async () => {
    await AsyncStorage.setItem(BEST_KEY, '3');
    mockParams = {};   // личная игра, первый уровень — она в рекорд идёт
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();
      // до партии в шапке ничего нет — она появляется вместе с игрой
      g.press('ds-start');
      await g.settle();
      expect(`старт: ${g.textOf('ds-span-record')}`).toContain('0');
      expect(`старт: ${g.textOf('ds-span-record')}`).toContain('3');

      const shown = await watchDigits(g, 4, 1100);
      await g.type([...shown].join(''));
      expect(`ответ: ${verdict(g)}`).toBe('ответ: right');

      // ПАРТИЯ ЕЩЁ ИДЁТ: длина взята, следующий ряд ещё не показан.
      const hud = g.textOf('ds-span-record');
      expect(`шапка по ходу партии: ${hud.includes('4')}`).toBe('шапка по ходу партии: true');
      // и рекорд подрос вместе с охватом — 4 больше прежних 3
      expect(`рекорд перебит на глазах: ${!hud.includes('3')}`).toBe('рекорд перебит на глазах: true');
    } finally { g.unmount(); }
  });

  it('🔴 партия, которая в рекорд не идёт, рекорд на экране НЕ двигает', async () => {
    await AsyncStorage.setItem(BEST_KEY, '3');
    mockParams = { wu: '1', startLen: '4' };   // свободная партия: в таблицу не идёт
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();
      const shown = await watchDigits(g, 4, 1100);
      await g.type([...shown].join(''));
      expect(`ответ: ${verdict(g)}`).toBe('ответ: right');
      const hud = g.textOf('ds-span-record');
      expect(`охват показан: ${hud.includes('4')}`).toBe('охват показан: true');
      expect(`рекорд остался прежним: ${hud.includes('3')}`).toBe('рекорд остался прежним: true');
    } finally { g.unmount(); }
  });

  it('🔴 рекорда ещё нет — шапка не выдумывает ноль', () => {
    const { hudRecord } = require('@/app/games/digit-span');
    expect(hudRecord(null, 0, true)).toBe(null);
    expect(hudRecord(null, 5, true)).toBe(5);
    expect(hudRecord(null, 5, false)).toBe(null);
    expect(hudRecord(6, 4, true)).toBe(6);
    expect(hudRecord(6, 9, true)).toBe(9);
    expect(hudRecord(6, 9, false)).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ТЕМП ПОКАЗА
// ─────────────────────────────────────────────────────────────────────────────

/** Дошла ли партия до ввода за столько-то миллисекунд от начала показа. */
async function reachesInputWithin(params: Record<string, string>, ms: number): Promise<boolean> {
  mockParams = params;
  const g = mountGame();
  try {
    await g.settle();
    if (params.wu !== '1') g.press('ds-start');
    await g.settle();
    await g.tick(ms);
    return g.has('ds-input');
  } finally { g.unmount(); }
}

describe('темп показа — рычаг только свободной партии', () => {
  /** 4 цифры: быстрый темп укладывается в 3400 мс (750×4+400), обычный и медленный — нет. */
  const WINDOW = 3400;

  it('🔴 в свободной партии быстрый темп правда быстрее медленного', async () => {
    expect(`быстрый успел: ${await reachesInputWithin({ wu: '1', pace: 'fast', startLen: '4' }, WINDOW)}`)
      .toBe('быстрый успел: true');
    expect(`медленный успел: ${await reachesInputWithin({ wu: '1', pace: 'slow', startLen: '4' }, WINDOW)}`)
      .toBe('медленный успел: false');
    // и медленный всё-таки доходит — проба меряет темп, а не сломанную партию
    expect(`медленный дошёл за своё время: ${await reachesInputWithin({ wu: '1', pace: 'slow', startLen: '4' }, 7000)}`)
      .toBe('медленный дошёл за своё время: true');
  });

  it('🔴 в личной игре по уровням тот же рычаг не меняет ничего', async () => {
    // Уровень 1 — это 1100 мс на цифру: 4400+400 > 3400, в окно быстрого не влезает.
    expect(`уровень с «быстрым» рычагом: ${await reachesInputWithin({ pace: 'fast' }, WINDOW)}`)
      .toBe('уровень с «быстрым» рычагом: false');
    expect(`уровень со «медленным» рычагом: ${await reachesInputWithin({ pace: 'slow' }, WINDOW)}`)
      .toBe('уровень со «медленным» рычагом: false');
    // обе партии одинаковы: доходят до ввода ровно на своём, уровневом темпе
    expect(`уровень дошёл на своём темпе: ${await reachesInputWithin({ pace: 'fast' }, 5000)}`)
      .toBe('уровень дошёл на своём темпе: true');
  });

  it('🔴 ползунок показан там, где он живой, и не показан там, где он врал бы', async () => {
    // Личная игра: экран настроек — первое, что видно, и ползунка там нет. Показать
    // его значило бы дать рычаг, который партии не касается.
    mockParams = {};
    const ladder = mountGame();
    try {
      await ladder.settle();
      expect(`в игре по уровням ползунок есть: ${ladder.has('ds-pace-slow')}`).toBe('в игре по уровням ползунок есть: false');
      expect(`а выбор режима на месте: ${ladder.has('ds-mode-ascending')}`).toBe('а выбор режима на месте: true');
    } finally { ladder.unmount(); }

    /**
     * Свободная партия стартует сама, поэтому до её настроек человек доходит через
     * итог — «сыграть снова». Идём ровно этой дорогой: проверка «ползунок есть»
     * без неё означала бы «нарисован там, куда не попасть».
     */
    mockParams = { wu: '1', startLen: '4' };
    fixSequence();
    const g = mountGame();
    try {
      await g.settle();
      for (let round = 0; round < 2; round++) {   // две ошибки на одной длине — партия окончена
        await g.tick(1100 * 4 + 800);
        await g.type('0000');                     // ряд 5-2-8-1: этот ответ заведомо неверный
      }
      await g.settle();
      const retry = g.root.root.findAll((n: any) => typeof n.props?.onPress === 'function')
        .find((n: any) => n.findAll((c: any) => c.props?.name === 'refresh').length > 0);
      expect(`итог партии с кнопкой «ещё раз»: ${!!retry}`).toBe('итог партии с кнопкой «ещё раз»: true');
      // Заодно встречная сторона рекорда: свободная партия в таблицу не ушла.
      expect(`отправлено в таблицу: ${mockSubmitted.length}`).toBe('отправлено в таблицу: 0');
      expect(`партия записана в историю: ${mockSaved.length}`).toBe('партия записана в историю: 1');
      TestRenderer.act(() => { retry.props.onPress(); });
      await g.settle();
      expect(`в свободной партии ползунок есть: ${g.has('ds-pace-slow')}`).toBe('в свободной партии ползунок есть: true');
      expect(`и подпись под ним объясняет, почему только здесь: ${g.has('ds-pace-fast')}`)
        .toBe('и подпись под ним объясняет, почему только здесь: true');
    } finally { g.unmount(); }
  });

  it('🔴 ступени темпа и правда разные и упорядочены', () => {
    const { showTiming, PACE_STEPS } = require('@/app/games/digit-span');
    const free = PACE_STEPS.map((p: any) => showTiming({ isPreset: true, level: 1, pace: p }));
    expect(free.map((x: any) => x.gapMs)).toEqual([...free.map((x: any) => x.gapMs)].sort((a: number, b: number) => b - a));
    expect(new Set(free.map((x: any) => x.gapMs)).size).toBe(PACE_STEPS.length);
    // цифра не должна висеть дольше, чем длится шаг: иначе две цифры наложатся
    for (const x of free) expect(`держится ${x.showMs} при шаге ${x.gapMs}: ${x.showMs < x.gapMs}`)
      .toBe(`держится ${x.showMs} при шаге ${x.gapMs}: true`);
    // в личной игре все три ступени дают ОДНО И ТО ЖЕ — темп там не рычаг
    const ladder = PACE_STEPS.map((p: any) => showTiming({ isPreset: false, level: 1, pace: p }));
    expect(new Set(ladder.map((x: any) => `${x.showMs}/${x.gapMs}`)).size).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. СЛОВАРЬ МОДУЛЯ — те же требования, что у games-module-i18n
// ─────────────────────────────────────────────────────────────────────────────

/** Языки приложения читаем из самого LanguageContext, а не переписываем сюда. */
const APP_LOCALES: string[] = (() => {
  const src = readFileSync(join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8') as string;
  const decl = /type Language =([^;]+);/.exec(src)!;
  return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m: any) => m[1]).sort();
})();

/** Комментарии — не код: имя ключа в шапке файла не должно сходить за его вызов. */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); out += ' '; i = e < 0 ? s.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); out += ' '; i = e < 0 ? s.length : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === c) break; j++; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

describe('словарь «Цифрового ряда» знает все двенадцать языков', () => {
  const screen = stripComments(readFileSync(join(__dirname, '../../app/games/digit-span.tsx'), 'utf8') as string);

  it('в списке языков приложения ровно двенадцать — иначе сверять не с чем', () => {
    expect(APP_LOCALES.length).toBe(12);
  });

  it('🔴 языки модуля и языки приложения — один список', () => {
    expect([...DIGIT_SPAN_LOCALES].sort()).toEqual(APP_LOCALES);
  });

  it('🔴 в каждом языке те же ключи, что в русском, и ни одного пустого', () => {
    const ruKeys = Object.keys(getDigitSpanStrings('ru')).sort();
    expect(ruKeys.length).toBeGreaterThan(8);
    const holes: string[] = [];
    for (const locale of DIGIT_SPAN_LOCALES) {
      const s = getDigitSpanStrings(locale) as unknown as Record<string, string>;
      const keys = Object.keys(s).sort();
      for (const k of ruKeys) if (!keys.includes(k)) holes.push(`${locale}: нет ключа ${k}`);
      for (const k of keys) if (!ruKeys.includes(k)) holes.push(`${locale}: лишний ключ ${k}`);
      for (const [k, v] of Object.entries(s)) {
        if (typeof v !== 'string' || v.trim().length === 0) holes.push(`${locale}.${k}: пусто`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 ни одна строка не осталась английской копией', () => {
    const en = getDigitSpanStrings('en') as unknown as Record<string, string>;
    const stub: string[] = [];
    for (const locale of DIGIT_SPAN_LOCALES) {
      if (locale === 'en') continue;
      const s = getDigitSpanStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(s)) if (v === en[k]) stub.push(`${locale}.${k}: «${v}» — как по-английски`);
    }
    expect(stub).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      const s = getDigitSpanStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(s)) {
        const bare = String(v).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        if (bare.length > 2 && !re.test(String(v))) bad.push(`${locale}.${k}: «${v}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 каждый ключ словаря вызывается на экране игры', () => {
    const used = new Set<string>();
    for (const m of screen.matchAll(/\bds\.(\w+)\b/g)) used.add(m[1]);
    const dead = Object.keys(getDigitSpanStrings('ru')).filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });

  it('проба «ключ вызывается» умеет отличать вызов от упоминания в комментарии', () => {
    const read = (code: string) => [...stripComments(code).matchAll(/\bds\.(\w+)\b/g)].map((m: any) => m[1]);
    expect(read('<Text>{ds.paceLabel}</Text>')).toContain('paceLabel');
    expect(read('/* про ds.paceLabel рассказано тут */\n// ds.listening\n')).toEqual([]);
    // и на самом экране проба что-то нашла, а не молчит вхолостую
    expect([...screen.matchAll(/\bds\.(\w+)\b/g)].length).toBeGreaterThan(8);
  });

  it('незнакомый язык — английский, а не пустота на экране', () => {
    const fallback = getDigitSpanStrings('xx' as DigitSpanLocale);
    expect(fallback).toEqual(getDigitSpanStrings('en'));
  });
});
