/* psygames-fillwords-core-gate · VER 1 · 22.08.2026 */
/**
 * ФИЛВОРДЫ: ПОЛЕ РАЗБИРАЕТСЯ ЦЕЛИКОМ, ЛИНИЯ ИДЁТ ПО СОСЕДЯМ, УРОВЕНЬ НЕ
 * ЗАКРЫВАЕТСЯ РАНЬШЕ ПОСЛЕДНЕЙ БУКВЫ.
 *
 * 🔴 ЗАЧЕМ. У этого режима ровно одно правило, отличающее его от обычного
 * «поиска слов»: лишних букв на поле НЕТ. Сломать его можно молча и тремя
 * способами сразу, и ни один не виден ни в типах, ни на экране до конца партии:
 *
 *   1. сумма длин слов не совпала с числом клеток — остаётся хвост, который
 *      нечем закрыть, и уровень нельзя пройти вообще ничем;
 *   2. слова легли внахлёст — «разобрано» становится противоречивым: клетка
 *      принадлежит двум словам, и второе уже не снять;
 *   3. зачёт слова по буквам вместо клеток — человек соберёт «кот» из букв трёх
 *      соседних слов, съест чужие клетки, и поле снова станет неразбираемым.
 *
 * ⚠️ ПРОБЫ ГОНЯЮТ НАСТОЯЩИЙ ПУТЬ ИГРЫ. Поле собирает `generateFillwords` —
 * тот самый, что зовёт экран; жест разбирает `applyTrace` — тот самый, что
 * зовёт обработчик пальца. Формулы покрытия здесь не повторяются: проверяется
 * РЕЗУЛЬТАТ работы генератора (кто владеет клеткой), а не то, как он считает.
 *
 * ⚠️ ОТКАЗ ПРОВЕРЯЕТСЯ ПО ПРИЧИНЕ, А НЕ ПО ФАКТУ ОТКАЗА. «Жест не принят» — 
 * слишком слабое утверждение: оно остаётся истинным и когда проверку соседства
 * убрали вовсе (линия просто не совпадёт ни с одним словом). Поэтому пробы
 * требуют конкретный код причины: убери проверку соседства — прыжок начнёт
 * получать `no-match`, и проба покраснеет.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import {
  FILLWORDS_INK,
  FILLWORDS_LOCALES,
  FILLWORDS_MIN_WORD,
  FILLWORDS_TINTS,
  applyTrace,
  areAdjacent,
  createFillwordsSession,
  fillwordsLevel,
  generateFillwords,
  isCleared,
  isFillwordsLocale,
  lettersLeft,
  resolveTrace,
  takeHint,
  unfoundWordIndexes,
  wordPool,
  type CellIndex,
  type FillwordsPuzzle,
  type FillwordsSession,
} from '@/src/games/fillwords/core';
import { contrastRatio } from '@/src/services/onGradientText';

const ROOT = join(__dirname, '../..');

/** Уровни-пробники: начало лесенки, каждая ступень размера поля и её хвост. */
const LEVELS = [1, 2, 5, 9, 13, 17, 25];
const SEEDS = [1, 2, 3, 7, 11, 29, 101, 9973];

function build(locale: string, level: number, seed: number): FillwordsPuzzle {
  const cfg = fillwordsLevel(level);
  return generateFillwords({
    rows: cfg.rows,
    cols: cfg.cols,
    locale,
    seed,
    maxWordLen: cfg.maxWordLen,
  });
}

/** Кто владеет клеткой по УЛОЖЕННЫМ словам: -1 свободна, -2 занята дважды. */
function ownership(puzzle: FillwordsPuzzle): number[] {
  const owner = new Array<number>(puzzle.rows * puzzle.cols).fill(-1);
  puzzle.words.forEach((planted, index) => {
    for (const cell of planted.path) owner[cell] = owner[cell] === -1 ? index : -2;
  });
  return owner;
}

/** Разыграть партию до конца НАСТОЯЩИМ путём: жест → applyTrace. */
function playThrough(puzzle: FillwordsPuzzle): { session: FillwordsSession; clearedEarly: number } {
  let session = createFillwordsSession(puzzle);
  let clearedEarly = 0;
  puzzle.words.forEach((planted, index) => {
    const step = applyTrace(session, planted.path);
    if (!step.trace.ok) throw new Error(`слово ${planted.word} не принялось по своему же пути`);
    session = step.session;
    if (index < puzzle.words.length - 1 && isCleared(session)) clearedEarly++;
  });
  return { session, clearedEarly };
}

describe('филворды: раскладка покрывает поле целиком', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(FILLWORDS_LOCALES.length).toBeGreaterThanOrEqual(3);
    expect(LEVELS.length * SEEDS.length).toBeGreaterThan(20);
    expect(build(FILLWORDS_LOCALES[0], 1, 1).words.length).toBeGreaterThan(2);
  });

  it('🔴 каждая клетка принадлежит ровно одному слову — ни дыр, ни нахлёстов', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      for (const level of LEVELS) {
        for (const seed of SEEDS) {
          // Отказ генератора — тоже провал ЭТОЙ пробы: тripwire внутри него
          // бросает как раз на дыре в покрытии, и молчать об этом нельзя.
          try {
            const puzzle = build(locale, level, seed);
            const owner = ownership(puzzle);
            const holes = owner.filter((o) => o === -1).length;
            const overlaps = owner.filter((o) => o === -2).length;
            if (holes || overlaps) {
              bad.push(`${locale}/ур.${level}/seed ${seed}: пустых клеток ${holes}, занятых дважды ${overlaps}`);
            }
          } catch (error) {
            bad.push(`${locale}/ур.${level}/seed ${seed}: ${(error as Error).message}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 сумма длин слов равна числу клеток — хвоста не остаётся', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      for (const level of LEVELS) {
        for (const seed of SEEDS) {
          const puzzle = build(locale, level, seed);
          const cells = puzzle.rows * puzzle.cols;
          const sum = puzzle.words.reduce((acc, w) => acc + w.path.length, 0);
          if (sum !== cells) bad.push(`${locale}/ур.${level}/seed ${seed}: букв в словах ${sum}, клеток ${cells}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 слово читается по своему пути: буквы поля совпадают со словом', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      for (const seed of SEEDS) {
        const puzzle = build(locale, 9, seed);
        for (const planted of puzzle.words) {
          const spelled = planted.path.map((cell) => puzzle.letters[cell]).join('');
          if (spelled !== planted.word) bad.push(`${locale}/seed ${seed}: по пути читается «${spelled}», а слово «${planted.word}»`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 путь слова — непрерывная линия по соседям, без возвратов', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      for (const level of LEVELS) {
        const puzzle = build(locale, level, 42);
        for (const planted of puzzle.words) {
          const seen = new Set<CellIndex>();
          planted.path.forEach((cell, i) => {
            if (seen.has(cell)) bad.push(`${locale}/ур.${level}: «${planted.word}» дважды заходит в клетку ${cell}`);
            seen.add(cell);
            if (i > 0 && !areAdjacent(planted.path[i - 1], cell, puzzle.cols)) {
              bad.push(`${locale}/ур.${level}: «${planted.word}» прыгает с ${planted.path[i - 1]} на ${cell}`);
            }
          });
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('слова в одном поле не повторяются и взяты из словаря языка', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      const known = new Set(wordPool(locale).all);
      for (const level of LEVELS) {
        const puzzle = build(locale, level, 5);
        const seen = new Set<string>();
        for (const planted of puzzle.words) {
          if (seen.has(planted.word)) bad.push(`${locale}/ур.${level}: «${planted.word}» уложено дважды`);
          seen.add(planted.word);
          if (!known.has(planted.word)) bad.push(`${locale}/ур.${level}: «${planted.word}» не из словаря языка`);
          if (planted.word.length < FILLWORDS_MIN_WORD) bad.push(`${locale}/ур.${level}: «${planted.word}» короче ${FILLWORDS_MIN_WORD}`);
          if (planted.word.length > fillwordsLevel(level).maxWordLen) {
            bad.push(`${locale}/ур.${level}: «${planted.word}» длиннее потолка уровня`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('одно зерно — одно поле: раскладка воспроизводима', () => {
    const a = build(FILLWORDS_LOCALES[0], 9, 777);
    const b = build(FILLWORDS_LOCALES[0], 9, 777);
    expect(b.letters.join('')).toBe(a.letters.join(''));
    expect(b.words.map((w) => w.word + w.path.join('.'))).toEqual(a.words.map((w) => w.word + w.path.join('.')));
  });
});

describe('филворды: жест по несоседним клеткам не принимается', () => {
  /**
   * ⚠️ Поле собирается ЛЕНИВО и один раз. Собери его прямо в теле describe — и
   * отказ генератора уронит сбор всего набора: прогон покажет «0 тестов», и
   * какая именно проба поймала поломку, останется неизвестным.
   */
  let built: FillwordsPuzzle | null = null;
  /** Поле пробы: собирается лениво и один раз на весь набор. */
  const field = (): FillwordsPuzzle => (built ?? (built = build(FILLWORDS_LOCALES[0], 9, 3)));
  /** Свежая партия на каждую пробу — пробы не должны цепляться друг за друга. */
  const fresh = (): FillwordsSession => createFillwordsSession(field());

  /** Две свободные клетки, которые ТОЧНО не соседи (диагональ тоже соседство). */
  function farPair(puzzle: FillwordsPuzzle): [CellIndex, CellIndex] {
    const total = puzzle.rows * puzzle.cols;
    for (let a = 0; a < total; a++) {
      for (let b = a + 1; b < total; b++) if (!areAdjacent(a, b, puzzle.cols)) return [a, b];
    }
    throw new Error('на поле не нашлось двух несоседних клеток — проба бессмысленна');
  }

  it('есть что проверять: пара несоседних клеток на поле существует', () => {
    const puzzle = field();
    const [a, b] = farPair(puzzle);
    expect(areAdjacent(a, b, puzzle.cols)).toBe(false);
  });

  it('🔴 прыжок через клетку отклонён ИМЕННО как несоседство', () => {
    const [a, b] = farPair(field());
    const trace = resolveTrace(fresh(), [a, b]);
    expect(trace.ok ? 'принят' : trace.reason).toBe('not-adjacent');
  });

  it('🔴 слово с выломанной серединой — тоже несоседство, а не «слово из тех же клеток»', () => {
    const puzzle = field();
    const long = puzzle.words.find((w) => w.path.length >= 4);
    expect(long).toBeDefined();
    const path = [...(long as { path: CellIndex[] }).path];
    // Меняем середину на заведомо далёкую клетку: набор клеток почти тот же,
    // линия — уже нет. Проба ловит зачёт «по набору клеток» вместо линии.
    const middle = Math.floor(path.length / 2);
    const outsider = puzzle.letters
      .map((_, cell) => cell)
      .find((cell) => !path.includes(cell) && !areAdjacent(cell, path[middle - 1], puzzle.cols));
    expect(outsider).toBeDefined();
    path[middle] = outsider as CellIndex;
    const trace = resolveTrace(fresh(), path);
    expect(trace.ok ? 'принят' : trace.reason).toBe('not-adjacent');
  });

  it('🔴 отклонённый жест ничего не разбирает', () => {
    const [a, b] = farPair(field());
    const session = fresh();
    const before = lettersLeft(session);
    const step = applyTrace(session, [a, b]);
    expect(step.trace.ok).toBe(false);
    expect(lettersLeft(step.session)).toBe(before);
    expect(step.session.found).toEqual([]);
  });

  it('🔴 линия, вернувшаяся на свою же клетку, отклонена как возврат', () => {
    const word = field().words[0];
    const trace = resolveTrace(fresh(), [word.path[0], word.path[1], word.path[0]]);
    expect(trace.ok ? 'принят' : trace.reason).toBe('repeat');
  });

  it('🔴 один тап словом не считается', () => {
    const trace = resolveTrace(fresh(), [field().words[0].path[0]]);
    expect(trace.ok ? 'принят' : trace.reason).toBe('too-short');
  });

  it('🔴 линия по соседям, но не по слову, не засчитывается', () => {
    const puzzle = field();
    const planted = new Set(puzzle.words.map((w) => w.path.join('.')));
    const total = puzzle.rows * puzzle.cols;
    let probe: CellIndex[] | null = null;
    for (let a = 0; a < total && !probe; a++) {
      for (let b = 0; b < total && !probe; b++) {
        if (!areAdjacent(a, b, puzzle.cols)) continue;
        for (let c = 0; c < total; c++) {
          if (c === a || !areAdjacent(b, c, puzzle.cols)) continue;
          const path = [a, b, c];
          if (planted.has(path.join('.')) || planted.has([...path].reverse().join('.'))) continue;
          probe = path;
          break;
        }
      }
    }
    expect(probe).not.toBeNull();
    const trace = resolveTrace(fresh(), probe as CellIndex[]);
    expect(trace.ok ? 'принят' : trace.reason).toBe('no-match');
  });

  it('🔴 уже разобранные клетки второй раз не отдаются', () => {
    const puzzle = field();
    const first = applyTrace(fresh(), puzzle.words[0].path);
    expect(first.trace.ok).toBe(true);
    const again = resolveTrace(first.session, puzzle.words[0].path);
    expect(again.ok ? 'принят' : again.reason).toBe('taken');
  });

  it('слово принимается и в обратную сторону — человек ведёт от той буквы, что увидел', () => {
    const puzzle = field();
    const session = fresh();
    const backwards = [...puzzle.words[1].path].reverse();
    const step = applyTrace(session, backwards);
    expect(step.trace.ok).toBe(true);
    expect(lettersLeft(step.session)).toBe(lettersLeft(session) - puzzle.words[1].path.length);
  });
});

describe('филворды: уровень не закрывается, пока на поле есть буквы', () => {
  it('🔴 после каждого слова, кроме последнего, поле НЕ считается разобранным', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      for (const level of [1, 9, 17]) {
        const puzzle = build(locale, level, 13);
        const played = playThrough(puzzle);
        if (played.clearedEarly > 0) bad.push(`${locale}/ур.${level}: поле объявлено разобранным ${played.clearedEarly} раз до конца`);
        if (!isCleared(played.session)) bad.push(`${locale}/ур.${level}: все слова найдены, а поле не разобрано`);
        if (lettersLeft(played.session) !== 0) bad.push(`${locale}/ур.${level}: осталось букв ${lettersLeft(played.session)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 счётчик оставшихся букв убывает ровно на длину найденного слова', () => {
    const puzzle = build(FILLWORDS_LOCALES[0], 13, 21);
    let session = createFillwordsSession(puzzle);
    const steps: string[] = [];
    for (const planted of puzzle.words) {
      const before = lettersLeft(session);
      const step = applyTrace(session, planted.path);
      session = step.session;
      const after = lettersLeft(session);
      if (before - after !== planted.path.length) steps.push(`«${planted.word}»: было ${before}, стало ${after}`);
      if (after > 0 && isCleared(session)) steps.push(`«${planted.word}»: поле «разобрано», а букв ${after}`);
    }
    expect(steps).toEqual([]);
    expect(lettersLeft(session)).toBe(0);
    expect(isCleared(session)).toBe(true);
  });

  it('🔴 промах не приближает к победе: буквы остаются на месте', () => {
    const puzzle = build(FILLWORDS_LOCALES[0], 5, 8);
    const session = createFillwordsSession(puzzle);
    const first = puzzle.words[0].path;
    const wrong = [first[0], first[1]];
    const step = applyTrace(session, wrong);
    expect(step.trace.ok).toBe(false);
    expect(lettersLeft(step.session)).toBe(lettersLeft(session));
    expect(step.session.mistakes).toBe(1);
  });

  it('подсказка показывает начало ненайденного слова и не разбирает поле за игрока', () => {
    const puzzle = build(FILLWORDS_LOCALES[0], 9, 4);
    const session = createFillwordsSession(puzzle);
    const { session: after, hint } = takeHint(session);
    expect(hint).not.toBeNull();
    const shown = hint as { wordIndex: number; cells: CellIndex[] };
    expect(unfoundWordIndexes(after)).toContain(shown.wordIndex);
    expect(shown.cells).toEqual(puzzle.words[shown.wordIndex].path.slice(0, shown.cells.length));
    expect(shown.cells.length).toBeLessThan(puzzle.words[shown.wordIndex].path.length);
    expect(lettersLeft(after)).toBe(lettersLeft(session));
    expect(after.hints).toBe(1);
  });
});

describe('филворды: где нет слов — там нет режима', () => {
  /** Языки приложения читаем из самого LanguageContext: список руками протух бы. */
  const APP_LOCALES: string[] = (() => {
    const dict = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
    const decl = /type Language =([^;]+);/.exec(dict) as RegExpExecArray;
    return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m: RegExpMatchArray) => m[1]).sort();
  })();

  it('есть что проверять: языков приложения двенадцать', () => {
    expect(APP_LOCALES.length).toBe(12);
  });

  it('🔴 режим предлагается только на языках приложения', () => {
    expect(FILLWORDS_LOCALES.filter((l) => !APP_LOCALES.includes(l))).toEqual([]);
  });

  it('🔴 на поддержанном языке поле собирается на всей лесенке', () => {
    const bad: string[] = [];
    for (const locale of FILLWORDS_LOCALES) {
      for (const level of LEVELS) {
        try {
          const puzzle = build(locale, level, level * 31 + 5);
          if (puzzle.letters.some((ch) => !ch)) bad.push(`${locale}/ур.${level}: на поле есть пустая клетка`);
        } catch (error) {
          bad.push(`${locale}/ур.${level}: ${(error as Error).message}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ВТОРАЯ ПОЛОВИНА ЧЕСТНОСТИ. Мало не предлагать режим — генератор обязан
   * ГРОМКО отказаться, если его всё-таки позвали на языке без словаря. Тихий
   * возврат пустого поля и есть тот самый «молчаливый пустой экран»: игра
   * открылась, поле есть, а играть не во что.
   */
  it('🔴 на языке без словаря генератор отказывается вслух, а не отдаёт пустое поле', () => {
    const bad: string[] = [];
    for (const locale of APP_LOCALES.filter((l) => !FILLWORDS_LOCALES.includes(l))) {
      if (isFillwordsLocale(locale)) { bad.push(`${locale}: числится непригодным, а порог проходит`); continue; }
      let threw = false;
      try {
        build(locale, 1, 1);
      } catch {
        threw = true;
      }
      if (!threw) bad.push(`${locale}: словаря нет, а поле собралось — значит, оно из ниоткуда`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 пригодность языка считается по словарю, а не объявлена списком', () => {
    // Пул поддержанного языка обязан быть заметно больше пула отвергнутого:
    // если бы список был написан руками, эта связь не держалась бы.
    const supported = FILLWORDS_LOCALES.map((l) => wordPool(l).all.length);
    const rejected = APP_LOCALES.filter((l) => !FILLWORDS_LOCALES.includes(l)).map((l) => wordPool(l).all.length);
    expect(Math.min(...supported)).toBeGreaterThan(Math.max(0, ...rejected));
  });
});

describe('филворды: разобранное слово видно и различимо', () => {
  /** CIELAB — чтобы «различимы» считалось глазом, а не разностью hex-строк. */
  function lab(hex: string): [number, number, number] {
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const deltaE = (a: string, b: string): number => {
    const [l1, a1, b1] = lab(a);
    const [l2, a2, b2] = lab(b);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
  };

  it('🔴 буква на разобранной плитке читается (AA 4.5 по WCAG)', () => {
    const weak = FILLWORDS_TINTS
      .map((tint) => ({ tint, ratio: contrastRatio(tint, FILLWORDS_INK) }))
      .filter((x) => x.ratio < 4.5)
      .map((x) => `${x.tint}: ${x.ratio.toFixed(2)}`);
    expect(weak).toEqual([]);
  });

  /**
   * Порог 20, а не 28 как у насыщенной палитры «Соедини точки»: плитки здесь
   * НАМЕРЕННО светлые — на них лежит тёмная буква, и восемь светлых оттенков
   * физически живут в меньшем объёме Lab. Вторым признаком у слова работает
   * форма змейки, а не только цвет.
   */
  it('🔴 соседние слова не сливаются в два одинаковых пятна', () => {
    const clashes: string[] = [];
    for (let i = 0; i < FILLWORDS_TINTS.length; i++) {
      for (let j = i + 1; j < FILLWORDS_TINTS.length; j++) {
        const d = deltaE(FILLWORDS_TINTS[i], FILLWORDS_TINTS[j]);
        if (d < 20) clashes.push(`${FILLWORDS_TINTS[i]} и ${FILLWORDS_TINTS[j]}: ΔE ${d.toFixed(1)}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});
