/* psygames-proofreading-series-gate · VER 1 · 23.08.2026 */
/**
 * СЕРИЯ КОРРЕКТУРКИ: ЗНАК → СЛОВО → СМЫСЛ ПО ОДНОМУ ПОЛЮ — И ЭТО ДОКАЗЫВАЕТСЯ,
 * А НЕ ОБЕЩАЕТСЯ В КОММЕНТАРИИ.
 *
 * Замер держится на аддитивном методе (Стернберг): каждый следующий блок
 * добавляет РОВНО ОДНО требование, и тогда разность времён — цена добавленного
 * звена. Всё это разваливается от четырёх поломок, и каждая выглядит на экране
 * совершенно нормально:
 *
 *   1. поле пересобралось между блоками — в разности поехала разница ПОЛЕЙ;
 *   2. серия записалась тремя сессиями — разность не посчитать уже никогда,
 *      потому что нечем доказать, что блоки из одного прогона;
 *   3. в блоке «Смысл» засчитывается ЛЮБОЕ слово — тогда это блок «Слово» под
 *      другим названием, и цена семантики выходит нулевой;
 *   4. на поле лежат ОДНИ животные — «собери животных» опять становится «собери
 *      всё», только жалоб не будет: играется как ни в чём не бывало.
 *
 * ⚠️ ПОЭТОМУ ПРОВЕРЯЕМ ПОВЕДЕНИЕ И ЗНАЧЕНИЯ, А НЕ ТЕКСТ ИСХОДНИКА. Раскладка
 * сверяется ПОЭЛЕМЕНТНО (совпадение размеров не значит ничего), партия ведётся
 * теми же вызовами, что зовёт палец, а сессия читается из перехваченного
 * `saveSession`. Каждая проба сперва доказывает, что есть на что смотреть.
 *
 * ⚠️ ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО. «Раскладки совпали» — правда и для
 * двух пустых списков; «чужое слово не засчиталось» — правда и когда не
 * засчитывается вообще ничего. Обе дыры закрыты встречными пробами: сравнение
 * умеет краснеть (перемешанная копия того же поля не равна оригиналу), а рядом
 * с каждым отказом стоит принятие.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_PROOF_PROGRESS,
  MIN_SENSE_CATEGORIES,
  PROOF_MAX_SIZE,
  PROOF_MIN_SIZE,
  PROOF_SERIES_PLAN,
  PROOF_SENSE_LOCALES,
  afterProofSeries,
  blockDone,
  blockKeyAt,
  blockStep,
  blockStepsTotal,
  buildProofField,
  getProofSeriesStrings,
  isSenseLocale,
  namedCategories,
  nextBlock,
  openBlock,
  parseProofProgress,
  pressSignCell,
  pressWordTrace,
  proofSeriesEntry,
  sensePool,
  type ProofField,
  type ProofSeriesState,
} from '@/src/games/proofreading/core';
import { FILLWORDS_LOCALES, isCleared, lettersLeft, wordPool } from '@/src/games/fillwords/core';
import { STABLE_RUNS, recordBlock, seriesDiffs, seriesSession, startSeries } from '@/src/services/series';

declare const __dirname: string;
declare function require(m: string): any;

const TestRenderer = require('react-test-renderer');
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');

jest.setTimeout(180000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

/** Что игра записала в журнал. Единственная подмена — сама запись, не её содержимое. */
const mockSaved: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { mockSaved.push(s); return s; },
}));

/** Язык проб — база приложения ('en' в LanguageContext), он же есть в списке серии. */
const LOCALE = 'en';
const EN = getProofSeriesStrings('en');

/** Поле-пробник: одно и то же зерно даёт одну и ту же раскладку. */
const field = buildProofField(LOCALE, PROOF_MIN_SIZE, 20260823);

// ─────────────────────────────────────────────────────────────────────────────
// ЯДРО: одно поле, три правила
// ─────────────────────────────────────────────────────────────────────────────

/** Пройти блок целиком по его правилу. Возвращает конечное состояние. */
function playBlock(start: ProofSeriesState): ProofSeriesState {
  let s = start;
  const key = blockKeyAt(s.blockIndex);
  if (key === 'sign') {
    s.field.signCells.forEach((cell) => { s = pressSignCell(s, cell).state; });
    return s;
  }
  const targets = key === 'word'
    ? s.field.puzzle.words.map((_, index) => index)
    : [...s.field.senseWords];
  for (const index of targets) s = pressWordTrace(s, s.field.puzzle.words[index].path).state;
  return s;
}

describe('поле у трёх блоков ОДНО И ТО ЖЕ', () => {
  const first = openBlock(field, 0);
  const second = nextBlock(first);
  const third = nextBlock(second);

  it('есть что сравнивать: поле непустое, буквы стоят в каждой клетке', () => {
    expect(field.puzzle.letters.length).toBe(PROOF_MIN_SIZE * PROOF_MIN_SIZE);
    expect(field.puzzle.letters.filter((ch) => !!ch).length).toBe(field.puzzle.letters.length);
    expect(field.puzzle.words.length).toBeGreaterThan(2);
  });

  it('🔴 буквы второго и третьего блока совпадают с первым ПОЭЛЕМЕНТНО', () => {
    expect(second.field.puzzle.letters).toEqual(first.field.puzzle.letters);
    expect(third.field.puzzle.letters).toEqual(first.field.puzzle.letters);
    // и это не «совпал размер»: сверяется каждая клетка по своему месту
    const mismatch = first.field.puzzle.letters.findIndex((ch, i) => third.field.puzzle.letters[i] !== ch);
    expect(`первое расхождение раскладок: ${mismatch}`).toBe('первое расхождение раскладок: -1');
  });

  it('🔴 и слова с их путями те же самые — переложить их между блоками тоже нельзя', () => {
    const shape = (s: ProofSeriesState) => s.field.puzzle.words.map((w) => `${w.word}:${w.path.join('-')}`);
    expect(shape(second)).toEqual(shape(first));
    expect(shape(third)).toEqual(shape(first));
    expect(shape(first).length).toBeGreaterThan(2);
  });

  it('🔴 и сравнение умеет краснеть: перемешанная копия того же поля не равна', () => {
    const shuffled = [...first.field.puzzle.letters].reverse();
    expect(shuffled).not.toEqual(first.field.puzzle.letters);
  });

  it('🔴 порядок блоков жёсткий: знак → слово → смысл', () => {
    expect([0, 1, 2].map(blockKeyAt)).toEqual(['sign', 'word', 'sense']);
    expect([...PROOF_SERIES_PLAN]).toEqual(['sign', 'word', 'sense']);
  });

  it('переход к следующему блоку обнуляет взятое, но не поле', () => {
    const played = pressSignCell(first, first.field.signCells[0]).state;
    expect(played.taken.filter(Boolean).length).toBe(1);
    const after = nextBlock(played);
    expect(after.taken.filter(Boolean).length).toBe(0);
    expect(after.session.found).toEqual([]);
    expect(after.field.puzzle.letters).toEqual(played.field.puzzle.letters);
  });
});

describe('блок «Знак» идёт по тем же буквам, что и остальные два', () => {
  it('🔴 знаки взяты ИЗ поля, а не подсажены в него', () => {
    for (const sign of field.signs) expect(field.puzzle.letters).toContain(sign);
    const own = field.puzzle.letters
      .map((ch, index) => (field.signs.includes(ch) ? index : -1))
      .filter((index) => index >= 0);
    // Список целей — ровно клетки с этими буквами, ни одной лишней и ни одной забытой.
    expect([...field.signCells]).toEqual(own);
  });

  it('🔴 число ответов блока сопоставимо с числом слов — иначе разность мерит объём работы', () => {
    const bad: string[] = [];
    for (const locale of PROOF_SENSE_LOCALES) {
      for (let size = PROOF_MIN_SIZE; size <= PROOF_MAX_SIZE; size += 1) {
        for (const seed of [7, 1009, 20260823]) {
          const f = buildProofField(locale, size, seed);
          const gap = Math.abs(f.signCells.length - f.puzzle.words.length);
          if (gap > 3) bad.push(`${locale}/${size}/${seed}: знаков ${f.signCells.length}, слов ${f.puzzle.words.length}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 клетка со знаком — ход, чужая буква — ошибка, повторная — ничто', () => {
    const state = openBlock(field, 0);
    const hit = pressSignCell(state, field.signCells[0]);
    expect(`${hit.result} · взято ${blockStep(hit.state)} · ошибок ${hit.state.errors}`)
      .toBe('hit · взято 1 · ошибок 0');
    const other = field.puzzle.letters.findIndex((ch) => !field.signs.includes(ch));
    expect(other).toBeGreaterThanOrEqual(0);
    const miss = pressSignCell(hit.state, other);
    expect(`${miss.result} · взято ${blockStep(miss.state)} · ошибок ${miss.state.errors}`)
      .toBe('miss · взято 1 · ошибок 1');
    const again = pressSignCell(hit.state, field.signCells[0]);
    expect(`${again.result} · ошибок ${again.state.errors}`).toBe('ignored · ошибок 0');
  });

  it('блок закрывается ровно тогда, когда закрыты ВСЕ клетки знака', () => {
    let state = openBlock(field, 0);
    field.signCells.forEach((cell, i) => {
      expect(`шаг ${i}: доигран ${blockDone(state)}`).toBe(`шаг ${i}: доигран false`);
      state = pressSignCell(state, cell).state;
    });
    expect(`доигран ${blockDone(state)} · ошибок ${state.errors}`).toBe('доигран true · ошибок 0');
    expect(blockStepsTotal(field, 'sign')).toBe(field.signCells.length);
  });
});

describe('блок «Смысл» требует смысла, а не любого слова', () => {
  const pool = sensePool(LOCALE);
  const others = field.puzzle.words
    .map((_, index) => index)
    .filter((index) => !field.senseWords.includes(index));

  it('🔴 на поле лежат И слова нужной категории, И слова ДРУГИХ категорий', () => {
    expect(field.senseWords.length).toBeGreaterThanOrEqual(2);
    expect(others.length).toBeGreaterThanOrEqual(field.senseWords.length);
    // «Другая категория» — не «непонятно какая»: категория известна и она иная.
    for (const index of field.senseWords) {
      expect(pool.catOf.get(field.puzzle.words[index].word)).toBe(field.category);
    }
    for (const index of others) {
      const cat = pool.catOf.get(field.puzzle.words[index].word);
      expect(typeof cat).toBe('string');
      expect(cat).not.toBe(field.category);
    }
  });

  it('🔴 у каждого целевого слова есть чужое слово ТОЙ ЖЕ ДЛИНЫ — длина не выдаёт цель', () => {
    const bad: string[] = [];
    for (const locale of PROOF_SENSE_LOCALES) {
      for (let size = PROOF_MIN_SIZE; size <= PROOF_MAX_SIZE; size += 1) {
        for (const seed of [3, 77, 4242, 20260823]) {
          const f = buildProofField(locale, size, seed);
          const p = sensePool(locale);
          const alien = f.puzzle.words
            .filter((_, index) => !f.senseWords.includes(index))
            .map((w) => w.path.length);
          for (const index of f.senseWords) {
            const len = f.puzzle.words[index].path.length;
            if (!alien.includes(len)) bad.push(`${locale}/${size}/${seed}: цель длины ${len} без пары`);
          }
          if (f.senseWords.length < 2) bad.push(`${locale}/${size}/${seed}: целей ${f.senseWords.length}`);
          if (!p.targets.includes(f.category)) bad.push(`${locale}/${size}/${seed}: категория ${f.category} не в целях`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 чужое слово по своему же пути — ОШИБКА, и клетки оно не съедает', () => {
    const state = openBlock(field, 2);
    const alien = field.puzzle.words[others[0]];
    const before = lettersLeft(state.session);
    const step = pressWordTrace(state, alien.path);
    expect(`${step.result} · взято ${blockStep(step.state)} · ошибок ${step.state.errors}`)
      .toBe('miss · взято 0 · ошибок 1');
    expect(`букв на поле: ${lettersLeft(step.state.session)} из ${before}`)
      .toBe(`букв на поле: ${before} из ${before}`);
  });

  it('🔴 целевое слово тем же жестом — ход: отказ выше не «отказ всему подряд»', () => {
    const state = openBlock(field, 2);
    const target = field.puzzle.words[field.senseWords[0]];
    const step = pressWordTrace(state, target.path);
    expect(`${step.result} · взято ${blockStep(step.state)} · ошибок ${step.state.errors}`)
      .toBe('hit · взято 1 · ошибок 0');
  });

  it('🔴 то же самое слово в блоке «Слово» засчитывается — блоки и правда разные', () => {
    const wordBlock = openBlock(field, 1);
    const alien = field.puzzle.words[others[0]];
    const step = pressWordTrace(wordBlock, alien.path);
    expect(`${step.result} · ошибок ${step.state.errors}`).toBe('hit · ошибок 0');
  });

  it('🔴 блок «Смысл» закрывается на ЦЕЛЯХ, а чужие слова остаются лежать на поле', () => {
    const done = playBlock(openBlock(field, 2));
    expect(`доигран ${blockDone(done)} · целей ${blockStep(done)} из ${blockStepsTotal(field, 'sense')}`)
      .toBe(`доигран true · целей ${field.senseWords.length} из ${field.senseWords.length}`);
    expect(isCleared(done.session)).toBe(false);         // поле НЕ пустое: чужие слова целы
    expect(lettersLeft(done.session)).toBeGreaterThan(0);
  });

  it('🔴 а блок «Слово» на том же поле разбирает его ЦЕЛИКОМ', () => {
    const done = playBlock(openBlock(field, 1));
    expect(`доигран ${blockDone(done)} · разобрано ${isCleared(done.session)}`)
      .toBe('доигран true · разобрано true');
    expect(lettersLeft(done.session)).toBe(0);
  });

  it('сорвавшийся жест не считается ошибкой: прыжок через клетку — не ответ', () => {
    const state = openBlock(field, 2);
    const target = field.puzzle.words[field.senseWords[0]].path;
    const far = field.puzzle.letters
      .map((_, cell) => cell)
      .find((cell) => Math.abs(cell - target[0]) > PROOF_MIN_SIZE + 1) as number;
    const step = pressWordTrace(state, [target[0], far]);
    expect(`${step.result} · ошибок ${step.state.errors}`).toBe('ignored · ошибок 0');
  });
});

describe('серия ядром: одна сессия, три блока, две разности', () => {
  it('🔴 три блока по одному полю дают ОДНУ сессию и обе разности', () => {
    let run = startSeries('proofreading_series', field.size, PROOF_SERIES_PLAN, 0);
    let state = openBlock(field, 0);
    const times = [30_000, 70_000, 95_000];
    for (let i = 0; i < PROOF_SERIES_PLAN.length; i += 1) {
      const played = playBlock(state);
      expect(`блок ${i} доигран: ${blockDone(played)}`).toBe(`блок ${i} доигран: true`);
      run = recordBlock(run, { key: blockKeyAt(i), timeMs: times[i], errors: played.errors, done: true });
      state = nextBlock(played);
      expect(state.field.puzzle.letters).toEqual(field.puzzle.letters);   // поле не менялось ни разу
    }
    const session = seriesSession(run);
    expect((session.details.blocks as any[]).map((b) => b.key)).toEqual(['sign', 'word', 'sense']);
    expect(seriesDiffs(run)).toEqual({ word_minus_sign: 40_000, sense_minus_sign: 65_000 });
    // Цена смысла — T₃−T₂, и она считается из этих двух разностей.
    const diffs = seriesDiffs(run) as Record<string, number>;
    expect(diffs.sense_minus_sign - diffs.word_minus_sign).toBe(25_000);
    expect(session.game_type).toBe('proofreading_series');
  });

  it('🔴 прерванная серия не даёт разностей ВООБЩЕ', () => {
    let run = startSeries('proofreading_series', field.size, PROOF_SERIES_PLAN, 0);
    run = recordBlock(run, { key: 'sign', timeMs: 30_000, errors: 0, done: true });
    run = recordBlock(run, { key: 'word', timeMs: 50_000, errors: 0, done: false });
    expect(seriesDiffs(run)).toBeNull();
    const session = seriesSession(run);
    expect(session.details.series_complete).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(session.details, 'diffs')).toBe(false);
  });
});

describe('уровень серии — модель C поверх блоков корректурки', () => {
  const full = (level: number, errors: [number, number, number]) => {
    let run = startSeries('proofreading_series', level, PROOF_SERIES_PLAN, 0);
    PROOF_SERIES_PLAN.forEach((key, i) => {
      run = recordBlock(run, { key, timeMs: 30_000, errors: errors[i], done: true });
    });
    return run;
  };

  it('🔴 старт — с минимального поля по блокам, прежние поля остаются видны', () => {
    const entry = proofSeriesEntry(EMPTY_PROOF_PROGRESS, 7);   // одиночные филворды уже на 7×7
    expect(`старт ${entry.level} · слово ${entry.perBlock.word} · смысл ${entry.perBlock.sense}`)
      .toBe('старт 5 · слово 7 · смысл 5');
  });

  it('🔴 одного чистого прогона мало — нужна устойчивость', () => {
    const once = afterProofSeries(EMPTY_PROOF_PROGRESS, full(5, [0, 0, 0]), 5);
    expect(`выросло: ${once.raised} · осталось ${once.runsLeft}`)
      .toBe(`выросло: false · осталось ${STABLE_RUNS - 1}`);
    const twice = afterProofSeries(once.progress, full(5, [0, 0, 0]), 5);
    expect(`выросло: ${twice.raised} · поле ${twice.nextLevel}`).toBe('выросло: true · поле 6');
    expect(twice.progress.sizes).toEqual({ sign: 6, word: 6, sense: 6 });
    expect(twice.progress.streaks).toEqual({ sign: 0, word: 0, sense: 0 });
  });

  it('🔴 грязный блок держит поле, даже если два других безупречны', () => {
    let p = EMPTY_PROOF_PROGRESS;
    for (let i = 0; i < STABLE_RUNS + 1; i += 1) p = afterProofSeries(p, full(5, [0, 0, 5]), 5).progress;
    const out = afterProofSeries(p, full(5, [0, 0, 5]), 5);
    expect(`выросло: ${out.raised} · держит: ${out.weakest} · поле ${out.nextLevel}`)
      .toBe('выросло: false · держит: sense · поле 5');
  });

  it('🔴 прерванная серия не двигает уровень ни вверх, ни вниз', () => {
    const p = afterProofSeries(EMPTY_PROOF_PROGRESS, full(5, [0, 0, 0]), 5).progress;
    let broken = startSeries('proofreading_series', 5, PROOF_SERIES_PLAN, 0);
    broken = recordBlock(broken, { key: 'sign', timeMs: 30_000, errors: 0, done: true });
    broken = recordBlock(broken, { key: 'word', timeMs: 30_000, errors: 0, done: false });
    const out = afterProofSeries(p, broken, 5);
    expect(`выросло: ${out.raised}`).toBe('выросло: false');
    expect(out.progress.streaks).toEqual(p.streaks);
  });

  it('сохранённый мусор не роняет вход в серию', () => {
    expect(parseProofProgress('не json')).toEqual(EMPTY_PROOF_PROGRESS);
    expect(parseProofProgress(null)).toEqual(EMPTY_PROOF_PROGRESS);
    expect(parseProofProgress('{"sizes":{"sign":99}}').sizes.sign).toBe(PROOF_MAX_SIZE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЯЗЫКИ И КАТЕГОРИИ — СЧИТАНЫ ПО ДАННЫМ, А НЕ ОБЪЯВЛЕНЫ СПИСКОМ
// ─────────────────────────────────────────────────────────────────────────────

const APP_LOCALES: string[] = (() => {
  const dict = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
  const decl = /type Language =([^;]+);/.exec(dict)!;
  return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m: any) => m[1]).sort();
})();

describe('язык годится для «Смысла» тогда и только тогда, когда данные это позволяют', () => {
  it('есть что проверять: языков приложения двенадцать, поддержанных меньше', () => {
    expect(APP_LOCALES.length).toBe(12);
    expect(PROOF_SENSE_LOCALES.length).toBeGreaterThanOrEqual(3);
    expect(PROOF_SENSE_LOCALES.length).toBeLessThan(APP_LOCALES.length);
  });

  it('🔴 у каждого поддержанного языка хватает КАТЕГОРИЙ, у отвергнутого — нет', () => {
    const rich = (locale: string): number => sensePool(locale).targets.length;
    const supported = PROOF_SENSE_LOCALES.map(rich);
    const rejected = APP_LOCALES.filter((l) => !PROOF_SENSE_LOCALES.includes(l)).map(rich);
    expect(Math.min(...supported)).toBeGreaterThanOrEqual(MIN_SENSE_CATEGORIES);
    // Связь держится сама: будь список написан руками, она бы не держалась.
    expect(Math.min(...supported)).toBeGreaterThan(Math.max(0, ...rejected));
    for (const locale of APP_LOCALES) {
      expect(`${locale}: ${isSenseLocale(locale)}`).toBe(`${locale}: ${PROOF_SENSE_LOCALES.includes(locale)}`);
    }
  });

  it('🔴 без поля филвордов язык не проходит, сколько бы категорий ни было', () => {
    for (const locale of PROOF_SENSE_LOCALES) expect(FILLWORDS_LOCALES).toContain(locale);
    const noField = APP_LOCALES.filter((l) => !FILLWORDS_LOCALES.includes(l));
    expect(noField.length).toBeGreaterThan(0);          // проверять и правда есть что
    for (const locale of noField) {
      expect(`${locale}: серия ${isSenseLocale(locale)} · слов ${wordPool(locale).all.length}`)
        .toBe(`${locale}: серия false · слов ${wordPool(locale).all.length}`);
    }
  });

  it('🔴 на языке без категорий поле серии не собирается, а бросает', () => {
    const noSense = APP_LOCALES.find((l) => !isSenseLocale(l)) as string;
    expect(() => buildProofField(noSense, PROOF_MIN_SIZE, 1)).toThrow();
  });

  /**
   * 🔴 ГЛАВНАЯ ПРОБА ПРО КАТЕГОРИИ: задание блока звучит «собери только {категорию}»,
   * и если у категории нет имени в языке человека, задание нечем назвать. Именно
   * это и держит тему `transport` (она есть только в банке анаграмм) вне целей —
   * без единого поимённого запрета в коде.
   */
  it('🔴 у каждой целевой категории есть имя во ВСЕХ двенадцати языках', () => {
    const { translateFor } = require('@/src/contexts/LanguageContext');
    const bad: string[] = [];
    const all = new Set<string>();
    for (const locale of PROOF_SENSE_LOCALES) for (const cat of sensePool(locale).targets) all.add(cat);
    expect(all.size).toBeGreaterThan(5);
    for (const cat of all) {
      for (const locale of APP_LOCALES) {
        const key = `catVocab_${cat}`;
        const name = translateFor(locale, key);
        if (!name || name === key) bad.push(`${locale}.${key}: нет перевода`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 категории целей — из корпуса с именами, а темы банка анаграмм в цели не лезут', () => {
    const named = new Set(namedCategories());
    for (const locale of PROOF_SENSE_LOCALES) {
      for (const cat of sensePool(locale).targets) expect(named.has(cat)).toBe(true);
    }
    // «transport» в данных есть (иначе проба ничего не сторожит), но имени у него нет.
    const themed = new Set<string>();
    for (const locale of PROOF_SENSE_LOCALES) for (const cat of sensePool(locale).byCategory.keys()) themed.add(cat);
    expect(themed.has('transport')).toBe(true);
    expect(named.has('transport')).toBe(false);
    for (const locale of PROOF_SENSE_LOCALES) expect(sensePool(locale).targets).not.toContain('transport');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЭКРАН: играем по-настоящему — монтаж, нажатия, жесты, чтение того, что видно
// ─────────────────────────────────────────────────────────────────────────────

/** Каркас GameShell спрашивает безопасные поля — без метрик он падает на монтаже. */
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
/** ⚠️ Только внешние совпадения: TouchableOpacity отдаёт второй узел с теми же пропами. */
const OUTER = { deep: false };
/** Длительность врезки — ровно как в экране (см. INTERLUDE_MS). */
const INTERLUDE = 2500;
/**
 * Зерно, которое экран возьмёт при монтаже: `useState(() => Math.floor(random * 1e9) + 1)`.
 * Подменяем ГПСЧ, чтобы знать раскладку заранее — иначе жест вести некуда.
 */
const FIXED_RANDOM = 0.20260823;
const SCREEN_SEED = Math.floor(FIXED_RANDOM * 1e9) + 1;

function textsIn(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string') { out.push(n); return; }
    if (typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) (n.children as any[]).forEach(walk);
  };
  walk(node);
  return out;
}
const joined = (node: any): string => textsIn(node).join('');

async function settle() {
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
}

async function advance(ms: number) {
  await TestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

async function mountProof() {
  await AsyncStorage.clear();
  mockSaved.length = 0;
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/proofreading').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await settle();
  return r;
}

/**
 * КЛЕТКА ПОЛЯ — квадратный узел с ОДНОЙ буквой внутри. Опознаём по признаку
 * самой клетки, а не по testID: его можно повесить куда угодно, и проверка
 * перестанет отличать поле от чего угодно другого.
 */
function cells(r: any): any[] {
  return r.root.findAll((n: any) => {
    const st = StyleSheet.flatten(n.props?.style) as any;
    if (!st || typeof st.width !== 'number' || st.width !== st.height) return false;
    return /^\p{L}$/u.test(joined(n).trim());
  }, OUTER);
}

/** Раскладка так, как её видит человек: буквы клеток по порядку отрисовки. */
const layout = (r: any): string[] => cells(r).map((n: any) => joined(n).trim());

function pressLabel(r: any, label: string) {
  const btns = r.root.findAll((n: any) => (
    typeof n.props?.onPress === 'function' && joined(n).includes(label)
  ), OUTER);
  if (btns.length !== 1) throw new Error(`кнопку «${label}» не опознать: найдено ${btns.length}`);
  TestRenderer.act(() => { btns[0].props.onPress(); });
}

function tapCell(r: any, index: number) {
  const node = cells(r)[index];
  if (!node || typeof node.props.onPress !== 'function') throw new Error(`клетка ${index} не нажимается`);
  TestRenderer.act(() => { node.props.onPress(); });
}

/** Сетка серии как поверхность жеста: узел с обработчиком ведения пальца. */
function traceSurface(r: any): any {
  const nodes = r.root.findAll((n: any) => {
    if (typeof n.props?.onResponderMove !== 'function') return false;
    const st = StyleSheet.flatten(n.props?.style) as any;
    return !!st && st.flexWrap === 'wrap';
  }, OUTER);
  if (nodes.length !== 1) throw new Error(`поле жеста не опознать: найдено ${nodes.length}`);
  return nodes[0];
}

/**
 * Событие касания в координатах поля.
 *
 * ⚠️ ЧАСЫ КАСАНИЯ ОБЯЗАНЫ ИДТИ ВПЕРЁД. `PanResponder` глушит повторное движение с
 * той же меткой времени (`_accountsForMovesUpTo === mostRecentTimeStamp`), и с
 * одинаковой меткой до экрана доезжает ровно ПЕРВЫЙ шаг линии: слово выходит
 * недоведённым, а проба краснеет с совершенно правдоподобным «слово не
 * засчиталось». Поймано ровно так, в первом же прогоне.
 */
function touchAt(x: number, y: number, at: number) {
  const bank = [{
    touchActive: true,
    startPageX: x, startPageY: y, startTimeStamp: 0,
    currentPageX: x, currentPageY: y, currentTimeStamp: at,
    previousPageX: x, previousPageY: y, previousTimeStamp: at - 1,
  }];
  return {
    nativeEvent: {
      locationX: x, locationY: y, pageX: x, pageY: y,
      identifier: 1, timestamp: at, touches: [], changedTouches: [], target: 1,
    },
    touchHistory: { touchBank: bank, numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: at },
  };
}

let touchClock = 1;

/** Провести пальцем по клеткам — тем же путём, что и человек. */
function dragAlong(r: any, path: readonly number[], side: number) {
  const node = traceSurface(r);
  const size = (StyleSheet.flatten(cells(r)[0].props.style) as any).width + 2;
  const at = (index: number) => {
    touchClock += 1;
    return touchAt(
      (index % side) * size + size / 2,
      Math.floor(index / side) * size + size / 2,
      touchClock,
    );
  };
  TestRenderer.act(() => {
    node.props.onResponderGrant(at(path[0]));
    for (const cell of path.slice(1)) node.props.onResponderMove(at(cell));
    node.props.onResponderRelease(at(path[path.length - 1]));
  });
}

/** Что показывает шапка блока: «взято / всего». Читаем то же, что видит человек. */
function hudProgress(r: any): string {
  const m = /(\d+)\/(\d+)/.exec(joined(r.root));
  if (!m) throw new Error('счётчик блока в шапке не найден');
  return m[0];
}

/** Сколько ошибок показано в шапке. Ноль шапка не показывает вовсе. */
function hudErrors(r: any): number {
  const m = /Errors (\d+)/.exec(joined(r.root));
  return m ? Number(m[1]) : 0;
}

describe('экран: серия идёт по одному полю и пишет одну сессию', () => {
  let randomSpy: any;
  beforeEach(() => {
    jest.useFakeTimers();
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(FIXED_RANDOM);
  });
  afterEach(() => {
    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  /** Поле, которое соберёт экран при этом зерне. Знать его нужно, чтобы вести палец. */
  const screenField = (): ProofField => buildProofField(LOCALE, PROOF_MIN_SIZE, SCREEN_SEED);

  it('🔴 все три блока сыграны по ОДНОЙ И ТОЙ ЖЕ раскладке, сверено поэлементно', async () => {
    const r = await mountProof();
    const f = screenField();
    const side = f.size;
    try {
      pressLabel(r, EN.entry);
      const first = layout(r);
      expect(first.length).toBe(side * side);                   // есть что сравнивать
      expect(first).toEqual(f.puzzle.letters);                  // экран взял поле у ядра
      expect(joined(r.root)).toContain(EN.blockSign);

      for (const cell of f.signCells) tapCell(r, cell);          // блок 1 — знаки
      await advance(INTERLUDE);
      const second = layout(r);
      // ⚠️ Доказываем, что блок и правда СМЕНИЛСЯ. Без этого проба «раскладка та
      // же» проходит и на застрявшем первом блоке — сравнивая поле само с собой.
      expect(joined(r.root)).toContain(EN.blockWord);
      expect(hudProgress(r)).toBe(`0/${f.puzzle.words.length}`);
      for (const word of f.puzzle.words) dragAlong(r, word.path, side);   // блок 2 — все слова
      await advance(INTERLUDE);
      const third = layout(r);
      expect(joined(r.root)).toContain(EN.blockSense);
      expect(hudProgress(r)).toBe(`0/${f.senseWords.length}`);
      for (const index of f.senseWords) dragAlong(r, f.puzzle.words[index].path, side);
      await settle();

      expect(second).toEqual(first);
      expect(third).toEqual(first);
      const moved = first.findIndex((ch, i) => third[i] !== ch);
      expect(`первое расхождение раскладок: ${moved}`).toBe('первое расхождение раскладок: -1');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже размонтирован */ } }); }
  });

  it('🔴 серия пишет ОДНУ сессию с тремя блоками внутри, а не три сессии', async () => {
    const r = await mountProof();
    const f = screenField();
    const side = f.size;
    try {
      pressLabel(r, EN.entry);
      await advance(30_000);
      for (const cell of f.signCells) tapCell(r, cell);
      expect(`сессий после первого блока: ${mockSaved.length}`).toBe('сессий после первого блока: 0');
      await advance(INTERLUDE);
      await advance(70_000);
      for (const word of f.puzzle.words) dragAlong(r, word.path, side);
      await advance(INTERLUDE);
      await advance(95_000);
      for (const index of f.senseWords) dragAlong(r, f.puzzle.words[index].path, side);
      await settle();

      expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
      const s = mockSaved[0];
      expect(s.game_type).toBe('proofreading_series');
      expect((s.details.blocks as any[]).map((b) => b.key)).toEqual(['sign', 'word', 'sense']);
      expect(s.details.series_complete).toBe(true);
      expect(s.details.level).toBe(PROOF_MIN_SIZE);
      // Разности — из времён блоков, а не из воздуха: часы двигали ровно на столько,
      // и врезка (2,5 с) в блок не попала.
      expect(s.details.diffs).toEqual({ word_minus_sign: 40_000, sense_minus_sign: 65_000 });
      // 🔴 И разбор ПОКАЗЫВАЕТ обе цены, причём цену смысла — как T₃−T₂ (65−40),
      // а не как разность от первого блока: иначе она была бы 65 с и врала бы
      // на всю цену сегментации.
      const report = joined(r.root);
      expect(report).toContain(EN.seriesDone);
      expect(report).toContain(`${EN.signSpeed}: 30.0`);
      expect(report).toContain(`${EN.segmentCost}: +40.0`);
      expect(report).toContain(`${EN.senseCost}: +25.0`);
      // И доигранная серия не получает ВТОРУЮ запись при уходе с экрана.
      await TestRenderer.act(async () => { r.unmount(); });
      await settle();
      expect(`сессий после ухода: ${mockSaved.length}`).toBe('сессий после ухода: 1');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже размонтирован */ } }); }
  });

  it('🔴 в блоке «Смысл» чужое слово не засчитывается, а целевое — засчитывается', async () => {
    const r = await mountProof();
    const f = screenField();
    const side = f.size;
    try {
      pressLabel(r, EN.entry);
      for (const cell of f.signCells) tapCell(r, cell);
      await advance(INTERLUDE);
      for (const word of f.puzzle.words) dragAlong(r, word.path, side);
      await advance(INTERLUDE);

      const alien = f.puzzle.words.findIndex((_, index) => !f.senseWords.includes(index));
      expect(alien).toBeGreaterThanOrEqual(0);
      expect(joined(r.root)).toContain(EN.blockSense);
      expect(`${hudProgress(r)} · ошибок ${hudErrors(r)}`).toBe(`0/${f.senseWords.length} · ошибок 0`);

      dragAlong(r, f.puzzle.words[alien].path, side);              // чужая категория
      await settle();
      expect(`${hudProgress(r)} · ошибок ${hudErrors(r)}`).toBe(`0/${f.senseWords.length} · ошибок 1`);

      dragAlong(r, f.puzzle.words[f.senseWords[0]].path, side);    // своя категория
      await settle();
      expect(`${hudProgress(r)} · ошибок ${hudErrors(r)}`).toBe(`1/${f.senseWords.length} · ошибок 1`);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже размонтирован */ } }); }
  });

  it('🔴 врезка называет новое правило и говорит, что поле прежнее', async () => {
    const r = await mountProof();
    const f = screenField();
    try {
      pressLabel(r, EN.entry);
      for (const cell of f.signCells) tapCell(r, cell);
      await advance(100);                                          // врезка на экране
      const shown = joined(r.root);
      expect(shown).toContain(EN.ruleChanges);
      expect(shown).toContain(EN.sameField);
      expect(shown).toContain(EN.blockWord);
      expect(cells(r)).toHaveLength(0);                            // поля во время врезки нет
      await advance(INTERLUDE - 100);
      expect(cells(r)).toHaveLength(f.size * f.size);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже размонтирован */ } }); }
  });

  it('🔴 выход на середине: блоки записаны, разностей НЕТ ВООБЩЕ', async () => {
    const r = await mountProof();
    const f = screenField();
    const side = f.size;
    try {
      pressLabel(r, EN.entry);
      await advance(30_000);
      for (const cell of f.signCells) tapCell(r, cell);            // первый блок доигран
      await advance(INTERLUDE);
      await advance(10_000);
      dragAlong(r, f.puzzle.words[0].path, side);                  // второй начат и брошен
      const quit = r.root.findAll((n: any) => (
        typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === EN.leave
      ), OUTER);
      expect(`кнопок выхода: ${quit.length}`).toBe('кнопок выхода: 1');
      await TestRenderer.act(async () => { quit[0].props.onPress(); });
      await settle();

      expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
      const s = mockSaved[0];
      expect((s.details.blocks as any[]).map((b) => `${b.key}:${b.done}`)).toEqual(['sign:true', 'word:false']);
      expect(s.details.series_complete).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(s.details, 'diffs')).toBe(false);
      expect(joined(r.root)).toContain(EN.notFinished);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже размонтирован */ } }); }
  });

  it('🔴 уход мимо кнопок (аппаратная «назад») серию не теряет', async () => {
    const r = await mountProof();
    pressLabel(r, EN.entry);
    await advance(30_000);
    await TestRenderer.act(async () => { r.unmount(); });
    await settle();

    expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
    const s = mockSaved[0];
    expect((s.details.blocks as any[]).map((b) => `${b.key}:${b.done}`)).toEqual(['sign:false']);
    expect(s.details.series_complete).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(s.details, 'diffs')).toBe(false);
  });

  it('🔴 вход в серию назван, и с какого поля она начнётся — сказано ДО старта', async () => {
    const r = await mountProof();
    try {
      const shown = joined(r.root);
      expect(shown).toContain(EN.entry);
      expect(shown).toContain(`${PROOF_MIN_SIZE}×${PROOF_MIN_SIZE}`);
      expect(shown).toContain(EN.yourLevels.split('{')[0].trim());
    } finally { TestRenderer.act(() => r.unmount()); }
  });
});
