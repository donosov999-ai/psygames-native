/* psygames-fillwords-screen-gate · VER 1 · 22.08.2026 */
/**
 * ФИЛВОРДЫ ПРИШИТЫ К ЭКРАНУ, А НЕ ЛЕЖАТ РЯДОМ С НИМ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ ГЕЙТА ЯДРА. Ядро можно вылизать до блеска, и оно останется
 * мёртвым грузом: кнопка режима нарисована, а состояние никуда не идёт; жест
 * написан, а к сетке не привязан; поле собирается, а `isCleared` никто не
 * спрашивает. В этом проекте так уже было — в SET бейдж отсчёта был написан,
 * переведён на двенадцать языков и покрыт гейтом, но не показывался ни разу,
 * потому что состояние, от которого висел показ, нигде не присваивалось.
 *
 * ⚠️ ЧТО ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ. Правило шага линии живёт в ядре (`stepTrace`)
 * именно затем, чтобы его можно было ПРОГНАТЬ: экран сообщает клетку, ядро
 * решает, что стало с линией. Пробы ниже ведут линию так же, как её ведёт палец,
 * и смотрят на результат — а не пересказывают правило своими словами.
 *
 * ⚠️ ЧТО ПРОВЕРЯЕТСЯ ЧТЕНИЕМ И ПОЧЕМУ ЭТОГО МАЛО. Привязку жеста к сетке и
 * ветку «языка без словаря» исполнением не снять: рендерера экранов в прогоне
 * нет (`testMatch` — только `*.test.ts`, а экран это `.tsx` с роутером и
 * контекстами). Поэтому они читаются из исходника С ВЫРЕЗАННЫМИ КОММЕНТАРИЯМИ:
 * иначе рассказ о механизме в шапке засчитался бы за механизм — на этом в
 * проекте гейты краснели зелёным шесть раз за два дня.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

import {
  FILLWORDS_LOCALES,
  applyTrace,
  areAdjacent,
  createFillwordsSession,
  fillwordsLevel,
  generateFillwords,
  isCleared,
  lettersLeft,
  stepTrace,
  type CellIndex,
} from '@/src/games/fillwords/core';

const ROOT = join(__dirname, '../..');
const SCREEN_PATH = join(ROOT, 'app/games/proofreading.tsx');

/** Комментарии — не код. Строковые литералы сохраняем: в них живут вызовы. */
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

const screen = (): string => stripComments(readFileSync(SCREEN_PATH, 'utf8') as string);

/** Кусок разметки от `<Тег` до его закрытия — по балансу самого тега. */
function elementAt(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) return '';
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '<' && src[i + 1] !== '/') depth++;
    else if (src.startsWith('/>', i)) { depth--; if (depth === 0) return src.slice(at, i + 2); }
    else if (src[i] === '<' && src[i + 1] === '/') { depth--; if (depth === 0) return src.slice(at, src.indexOf('>', i) + 1); }
  }
  return src.slice(at);
}

const puzzle = generateFillwords({ ...fillwordsLevel(9), locale: FILLWORDS_LOCALES[0], seed: 2026 });

describe('филворды: линия ведётся тем же правилом, что и на экране', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(puzzle.words.length).toBeGreaterThan(3);
    expect(screen().length).toBeGreaterThan(5000);
  });

  /** Провести линию по клеткам слова так же, как это делает палец: по шагу за клетку. */
  function dragAlong(cells: readonly CellIndex[]): CellIndex[] {
    const session = createFillwordsSession(puzzle);
    let path: CellIndex[] = [];
    for (const cell of cells) path = stepTrace(session, path, cell);
    return path;
  }

  it('🔴 ведение по клеткам слова собирает его целиком, и слово засчитывается', () => {
    const word = puzzle.words[0];
    const path = dragAlong(word.path);
    expect(path).toEqual(word.path);
    const step = applyTrace(createFillwordsSession(puzzle), path);
    expect(step.trace.ok).toBe(true);
    expect(lettersLeft(step.session)).toBe(lettersLeft(createFillwordsSession(puzzle)) - word.path.length);
  });

  it('🔴 палец, соскользнувший на несоседнюю клетку, линию НЕ удлиняет', () => {
    const session = createFillwordsSession(puzzle);
    const word = puzzle.words.find((w) => w.path.length >= 3) as { path: CellIndex[] };
    const path = [word.path[0], word.path[1]];
    const far = puzzle.letters
      .map((_, cell) => cell)
      .find((cell) => !areAdjacent(cell, path[1], puzzle.cols) && cell !== path[1]) as CellIndex;
    expect(areAdjacent(far, path[1], puzzle.cols)).toBe(false);
    expect(stepTrace(session, path, far)).toEqual(path);
  });

  it('🔴 шаг назад по своей линии стирает хвост, а не начинает заново', () => {
    const session = createFillwordsSession(puzzle);
    const word = puzzle.words.find((w) => w.path.length >= 3) as { path: CellIndex[] };
    const path = [word.path[0], word.path[1], word.path[2]];
    expect(stepTrace(session, path, word.path[1])).toEqual([word.path[0], word.path[1]]);
  });

  it('🔴 линия не заходит в уже разобранное слово', () => {
    const first = applyTrace(createFillwordsSession(puzzle), puzzle.words[0].path);
    expect(first.trace.ok).toBe(true);
    const taken = puzzle.words[0].path[0];
    const neighbour = puzzle.letters
      .map((_, cell) => cell)
      .find((cell) => areAdjacent(cell, taken, puzzle.cols) && first.session.owner[cell] === -1);
    if (neighbour === undefined) return;       // у слова нет свободных соседей — проверять нечего
    expect(stepTrace(first.session, [neighbour], taken)).toEqual([neighbour]);
  });
});

describe('филворды: режим пришит к экрану корректурной пробы', () => {
  it('🔴 экран зовёт ядро, а не собирает поле сам', () => {
    const src = screen();
    const missing = [
      'generateFillwords(',
      'createFillwordsSession(',
      'stepTrace(',
      'applyTrace(',
      'isCleared(',
      'takeHint(',
    ].filter((call) => !src.includes(call));
    expect(missing).toEqual([]);
  });

  /**
   * 🔴 ЖЕСТ ПРИВЯЗАН К СЕТКЕ. Обработчик можно написать целиком и не подключить
   * — тогда поле просто не отзывается на палец, и ни один другой гейт этого не
   * увидит: код на месте, типы сходятся, тесты ядра зелены.
   */
  it('🔴 обработчик пальца стоит на том же контейнере, что и буквы поля', () => {
    const src = screen();
    const handlersAt = src.indexOf('fwPan.panHandlers');
    const lettersAt = src.indexOf('.puzzle.letters.map(');
    expect(src).toContain('PanResponder.create(');
    expect(handlersAt).toBeGreaterThan(0);
    // Буквы рисуются ВНУТРИ элемента, который принял обработчик: если жест
    // повесить на другой контейнер, между ними окажется целый кусок разметки.
    expect(lettersAt - handlersAt).toBeGreaterThan(0);
    expect(lettersAt - handlersAt).toBeLessThan(200);
  });

  /**
   * 🔴 ПЕРЕКЛЮЧАТЕЛЬ ДЕЙСТВИТЕЛЬНО ПЕРЕКЛЮЧАЕТ. Мало нарисовать две кнопки:
   * состояние обязано решать, что показано на экране. Иначе кнопки нажимаются,
   * а экран не меняется — декорация, переведённая на двенадцать языков.
   */
  it('🔴 кнопка режима пишет состояние, и от него зависит показ', () => {
    const src = screen();
    expect(/setTaskMode\(/.test(src)).toBe(true);
    expect(/const \[taskMode, setTaskMode\] = useState/.test(src)).toBe(true);
    const gates = (src.match(/taskMode === '(letters|fillwords)'/g) || []).length;
    expect(gates).toBeGreaterThanOrEqual(3);
  });

  /**
   * 🔴 ЧЕСТНЫЙ ОТКАЗ ВМЕСТО ПУСТОГО ЭКРАНА. Там, где словаря нет, кнопки режима
   * быть не должно — но и молчания тоже: человек читает, чего не хватает и на
   * каких языках режим работает.
   */
  it('🔴 без словаря языка кнопка режима не рисуется, а объяснение — рисуется', () => {
    const src = screen();
    expect(src).toContain('isFillwordsLocale(language)');
    // ⚠️ ГРАНИЦА ВЕТКИ ИЩЕТСЯ, А НЕ ОТМЕРЯЕТСЯ ОКНОМ. Здесь стояло «первые 2000
    // символов от `fwAvailable ? (`», и проба сломалась, как только в ветку
    // добавили тумблер «как ведётся линия»: начало else уехало за окно, и поиск
    // `') : ('` не нашёл ничего. Длина ветки — не то, на чём должна держаться
    // проверка; ищем разделитель от начала ветки и режем по нему.
    const начало = src.indexOf('fwAvailable ? (');
    const разделитель = src.indexOf(') : (', начало);
    expect(разделитель).toBeGreaterThan(начало);
    const branch = src.slice(начало, разделитель);
    expect(branch).toContain('setTaskMode(');            // кнопка — в ветке «словарь есть»
    const elseBranch = src.slice(разделитель, разделитель + 1200);
    expect(elseBranch).toContain('fwStrings.noDictionary');
    expect(elseBranch).not.toContain('setTaskMode(');
    // Список языков — именами из общего каталога, а не кодами руками.
    expect(src).toContain('FILLWORDS_LOCALES');
  });

  /**
   * 🔴 ПОРОГА «≥N%» У ФИЛВОРДОВ НЕТ. Уровень закрывается только полностью
   * разобранным полем. Если сюда просочится общий критерий корректуры, человек
   * начнёт проходить филворды, оставляя буквы на поле, — а это отменяет
   * единственное правило режима.
   */
  it('🔴 проход уровня филвордов решает isCleared, а не доля найденного', () => {
    const src = screen();
    const passed = src.slice(src.indexOf('const passed ='), src.indexOf('const passed =') + 400);
    expect(passed).toContain('isCleared(');
    expect(passed.slice(0, passed.indexOf('minFoundPctRef'))).toContain('fwRoundRef.current');
  });

  it('🔴 в зарядке филворды не запускаются — у неё свой сценарий и свой хронометраж', () => {
    const src = screen();
    const round = src.slice(src.indexOf('const fillwordsRound ='), src.indexOf('const fillwordsRound =') + 200);
    expect(round).toContain('!isPreset');
    expect(round).toContain("taskMode === 'fillwords'");
  });

  it('🔴 подсказка стоит в шапке (служебное действие), а не в полосе ответа', () => {
    const src = screen();
    const header = elementAt(src, '<GameAuxBar');
    expect(header).toContain('GameAuxAction');
    expect(header).toContain("t('btn_hint')");
    expect(src.includes('toolbar={')).toBe(false);
  });

  it('гейт умеет отличать код от комментария — иначе все проверки выше пусты', () => {
    expect(stripComments("/* generateFillwords( */\n// applyTrace(\nconst x = 1;")).not.toContain('generateFillwords(');
    expect(stripComments('const s = "applyTrace(";')).toContain('applyTrace(');
  });
});
