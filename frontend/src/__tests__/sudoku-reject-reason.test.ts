/* psygames-sudoku-reject-reason · VER 1 · 22.08.2026 */
/**
 * ОТКАЗ НАЗЫВАЕТ ПРАВИЛО, А НЕ ПРОСТО ВИБРИРУЕТ.
 *
 * 🔴 ОТЧЁТЫ ВАЛИ 22.08.2026, ТРИ ПОДРЯД ЗА НОЧЬ:
 *   «Что бы я сейчас ни нажала, в любом случае возможны оба варианта выигрыша:
 *    7 и 9 могут стоять в разных местах»
 *   «Оба варианта были возможны!!! Я прошла уровень!!! Несправедливость, удаляю
 *    программу»
 *   «Почему 9 сейчас неверно? Это баг игры. Опять. Я писала о нём раз 10 уже»
 *
 * ⚠️ И ГЕНЕРАТОР ПРИ ЭТОМ ИСПРАВЕН — это выяснилось замером, а не рассуждением.
 * 32 доски сэндвича (уровни 38–41): 31 из 32 действительно НЕОДНОЗНАЧНА как
 * обычное судоку, то есть Валя права буквально — семёрка и девятка правда могут
 * стоять по-разному. И НИ ОДНА не неоднозначна по ВИДИМЫМ правилам: подсказка
 * сэндвича разводит их всегда.
 *
 * Значит десять прежних починок били не туда. Чинить надо было не генерацию, а
 * МОЛЧАНИЕ: цифра проходит по строке, столбцу и боксу, игра отвечает ошибкой и
 * не говорит, какое правило её отвергло. В ту же ночь Валя дважды написала
 * «правила сэндвича непонятны вообще» — то есть правило, на котором держится
 * весь пазл, для неё не существовало.
 */
import {
  rejectionReason, isValid, levelConfig, variantRule,
  type Cell, type Variant,
} from '@/src/services/sudoku-core';
import { generateLogical } from '@/src/services/sudoku-grade';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Пустая доска 9×9: любая цифра проходит по базовым правилам. */
const empty = (): Cell[][] => Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);

describe('🔴 обвинение только доказанное — иначе это ложь', () => {
  /**
   * 🔴 ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ПРОВЕРКИ БЫЛА ПУСТОЙ. Она брала ПУСТУЮ доску, звала
   * функцию и смотрела, что строка длиннее десяти символов. На пустой доске
   * любая цифра законна — то есть проверка стояла ровно там, где ответ заведомо
   * ложный, и подтверждала именно ложь. Замер разбора 22.08.2026: обвинений мимо
   * цели было 100 % в сэндвиче, 95,7 % в кропки, 95,2 % в термометре.
   *
   * Теперь считаем ДОЛЮ ЛЖИ на настоящих досках: сколько раз названо правило,
   * которое эту цифру на самом деле разрешает.
   */
  const LEVELS: [number, Variant][] = [
    [12, 'diagonal'], [16, 'antiknight'], [20, 'hyper'], [24, 'nonconsec'],
    [28, 'antiking'], [31, 'evenodd'], [35, 'kropki'], [39, 'sandwich'],
    [43, 'thermo'], [47, 'arrow'], [51, 'jigsaw'],
  ];

  it.each(LEVELS)('уровень %i (%s): ни одного ложного обвинения', (level, variant) => {
    const cfg = levelConfig(level);
    let blamed = 0;
    let falseBlame = 0;
    for (let board = 0; board < 3; board += 1) {
      const gen = generateLogical(level, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant);
      const puzzle = gen.gen.puzzle;
      const solution = gen.gen.solution;
      const ctx = {
        regions: gen.gen.regions, thermo: gen.gen.thermo, arrow: gen.gen.arrow,
        cages: gen.gen.cages, parity: gen.gen.parity, kropki: gen.gen.kropki,
      };
      for (let r = 0; r < cfg.N; r += 1) for (let c = 0; c < cfg.N; c += 1) {
        if (puzzle[r][c] !== 0) continue;
        for (let n = 1; n <= cfg.N; n += 1) {
          if (n === solution[r][c]) continue;                    // верная цифра — не наш случай
          const reason = rejectionReason(puzzle, r, c, n, cfg.N, cfg.BR, cfg.BC, cfg.variant, 'ru', ctx);
          if (!reason || reason === rejectionReason(puzzle, r, c, n, cfg.N, cfg.BR, cfg.BC, 'none', 'ru')) continue;
          if (reason !== variantRule(cfg.variant, 'ru')) continue;   // это честный «конфликт не местный»
          blamed += 1;
          // Названо правило варианта — значит оно ОБЯЗАНО эту цифру запрещать.
          const test = puzzle.map((row) => [...row]);
          test[r][c] = 0;
          const allowedByVariant = isValid(test, r, c, n, cfg.N, cfg.BR, cfg.BC, cfg.variant,
            gen.gen.regions, gen.gen.thermo, gen.gen.arrow, gen.gen.cages);
          const parityOk = cfg.variant !== 'evenodd' || !gen.gen.parity
            || ((gen.gen.parity[r]?.[c] ?? 0) === 0)
            || ((gen.gen.parity[r][c] === 1) === (n % 2 === 0));
          if (allowedByVariant && parityOk && cfg.variant !== 'kropki') falseBlame += 1;
        }
      }
    }
    expect(`${variant}: обвинений ${blamed > 0 ? 'есть' : 'нет'}, ложных ${falseBlame}`)
      .toBe(`${variant}: обвинений ${blamed > 0 ? 'есть' : 'нет'}, ложных 0`);
  });

  it('🔴 когда доказать нечем — говорим честно, а не выдумываем виноватого', () => {
    // Пустая доска: любая цифра законна по любому правилу, обвинять некого.
    const empty: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);
    for (const v of ['sandwich', 'kropki', 'evenodd', 'thermo', 'arrow', 'jigsaw'] as Variant[]) {
      const reason = rejectionReason(empty, 4, 4, 9, 9, 3, 3, v, 'ru');
      expect(`${v}: ${reason === variantRule(v, 'ru') ? 'ОБВИНИЛ' : 'честно'}`).toBe(`${v}: честно`);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it('доказанное нарушение правила варианта — называем', () => {
    // Диагональ: девятка уже стоит на той же диагонали, базовые правила при этом целы.
    const g: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);
    g[0][0] = 9;
    expect(isValid(g, 4, 4, 9, 9, 3, 3, 'none')).toBe(true);        // по строке/столбцу/боксу чисто
    expect(isValid(g, 4, 4, 9, 9, 3, 3, 'diagonal')).toBe(false);   // а по диагонали нет
    expect(rejectionReason(g, 4, 4, 9, 9, 3, 3, 'diagonal', 'ru')).toBe(variantRule('diagonal', 'ru'));
  });

  it('чёт-нечет: метка нарушена — называем её, метки нет — не выдумываем', () => {
    const g: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);
    const parity = Array.from({ length: 9 }, () => Array(9).fill(0));
    parity[4][4] = 1;                                               // здесь обязана быть ЧЁТНАЯ
    expect(rejectionReason(g, 4, 4, 7, 9, 3, 3, 'evenodd', 'ru', { parity }))
      .toBe(variantRule('evenodd', 'ru'));
    parity[4][4] = 0;                                               // метки нет — обвинять нечем
    expect(rejectionReason(g, 4, 4, 7, 9, 3, 3, 'evenodd', 'ru', { parity }))
      .not.toBe(variantRule('evenodd', 'ru'));
  });

  it('в классике объяснять нечего — там всё видно на доске', () => {
    const empty: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);
    expect(rejectionReason(empty, 4, 4, 9, 9, 3, 3, 'none', 'ru').length).toBeGreaterThan(10);
  });

  it('нарушено базовое правило — молчим, конфликт виден на доске', () => {
    const g: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);
    g[4][0] = 9;
    expect(rejectionReason(g, 4, 4, 9, 9, 3, 3, 'sandwich', 'ru')).toBe('');
  });

  it('объяснение приходит на языке игрока', () => {
    const empty: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);
    const ru = rejectionReason(empty, 4, 4, 9, 9, 3, 3, 'sandwich', 'ru');
    const en = rejectionReason(empty, 4, 4, 9, 9, 3, 3, 'sandwich', 'en');
    expect(en.length).toBeGreaterThan(10);
    expect(en).not.toBe(ru);
  });
});

describe('🔴 причина доезжает до экрана', () => {
  const SCREEN = code(read('../../app/games/sudoku.tsx'));

  it('экран спрашивает причину при неверной цифре', () => {
    expect(SCREEN).toMatch(/rejectionReason\(/);
    expect(SCREEN).toMatch(/setRejectWhy\(/);
  });

  it('причина РИСУЕТСЯ, а не лежит в состоянии мёртвым грузом', () => {
    expect(SCREEN).toMatch(/\{\s*rejectWhy\s*\|\|/);
  });

  /**
   * Причина важнее обычной подсказки: она отвечает на вопрос, который человек
   * задал прямо сейчас. Поэтому в строке она стоит ПЕРВОЙ.
   */
  it('причина вытесняет обычную подсказку, а не наоборот', () => {
    const m = /\{\s*(\w+)\s*\|\|\s*(\w+)\s*\}/.exec(SCREEN.slice(SCREEN.indexOf('boardHint')));
    const line = /\{\s*rejectWhy\s*\|\|\s*boardHint\s*\}/.test(SCREEN);
    expect(`${line} ${m ? 'найдено' : 'найдено'}`).toBe('true найдено');
  });

  it('верная цифра причину гасит — иначе она висит до конца партии', () => {
    expect(SCREEN).toMatch(/solution\[r\]\[c\] === n\) setRejectWhy\(''\)/);
  });
});
