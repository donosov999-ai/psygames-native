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
import { rejectionReason, isValid, type Cell, type Variant } from '@/src/services/sudoku-core';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Пустая доска 9×9: любая цифра проходит по базовым правилам. */
const empty = (): Cell[][] => Array.from({ length: 9 }, () => Array(9).fill(0) as Cell[]);

describe('причина отказа называется', () => {
  const MARKER: Variant[] = ['sandwich', 'kropki', 'evenodd', 'thermo', 'arrow', 'thermocage',
    'diagonal', 'antiknight', 'hyper', 'nonconsec', 'antiking', 'jigsaw'];

  it.each(MARKER)('%s: цифра прошла по базовым правилам → правило варианта названо', (variant) => {
    const reason = rejectionReason(empty(), 4, 4, 9, 9, 3, 3, variant, 'ru');
    expect(reason.length).toBeGreaterThan(10);
  });

  it('в классике объяснять нечего — там всё видно на доске', () => {
    expect(rejectionReason(empty(), 4, 4, 9, 9, 3, 3, 'none', 'ru')).toBe('');
  });

  /**
   * 🔴 КОНФЛИКТ ПО СТРОКЕ ЧЕЛОВЕК ВИДИТ САМ — доска его подсвечивает. Объяснять
   * там значит спорить с очевидным и приучать не читать строку вовсе.
   */
  it('нарушено базовое правило — молчим, конфликт виден на доске', () => {
    const g = empty();
    g[4][0] = 9;                                   // девятка уже в этой строке
    expect(isValid(g, 4, 4, 9, 9, 3, 3, 'none')).toBe(false);
    expect(rejectionReason(g, 4, 4, 9, 9, 3, 3, 'sandwich', 'ru')).toBe('');
  });

  it('своя же клетка не считается конфликтом', () => {
    const g = empty();
    g[4][4] = 9;                                   // ставим ту же цифру в ту же клетку
    expect(rejectionReason(g, 4, 4, 9, 9, 3, 3, 'sandwich', 'ru').length).toBeGreaterThan(10);
  });

  it('объяснение приходит на языке игрока, а не всегда по-русски', () => {
    const ru = rejectionReason(empty(), 4, 4, 9, 9, 3, 3, 'sandwich', 'ru');
    const en = rejectionReason(empty(), 4, 4, 9, 9, 3, 3, 'sandwich', 'en');
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
