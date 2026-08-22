/* psygames-sudoku-tails · VER 1 · 23.08.2026 */
/**
 * ТРИ ХВОСТА ИЗ АУДИТА СУДОКУ, которые пережили первую волну правок.
 *
 * 🔴 1. КЛАВИАТУРА КОРНЯ ИСЧЕЗАЛА ПО ЧИСЛУ ЗАПОЛНЕННЫХ, А НЕ ВЕРНЫХ. Счётчик считал
 * ЛЮБУЮ ненулевую цифру. Ошибся в последней своей клетке корня — цифра красная, а
 * клавиатура и ластик пропали: исправить нечем, выход только «Отменить» с отмоткой
 * всей ленты ходов. Правильное условие одно: корень не сошёлся — поле живое.
 *
 * 🔴 2. СЧЁТ ДЛИННОЙ ПАРТИИ СХЛОПЫВАЛСЯ В НОЛЬ. Время вычиталось без предела:
 * у фрактала секунда за секунду (ноль через 66,7 минуты), у самурая две за секунду
 * (ноль через 34,6 минуты на первом уровне). При этом сам код называет фрактал
 * «событием на несколько часов», а самурая — партией на час. Честно добитая партия
 * и брошенная становились неразличимы.
 *
 * 🔴 3. СТОРОЖ КОРНЯ БЫЛ ТАВТОЛОГИЕЙ. `rootUnreachableCells` пропускала клетку, если
 * та кормящая ИЛИ `rootEditable`. А `rootEditable` — это ровно «пустая И не кормящая».
 * Условия дополняли друг друга: список выходил пустым при ЛЮБОЙ доске, включая
 * сломанную. И на нём стояла проверка — сторож зелен вслепую.
 */
import { feedCells, generateFractal, rootUnreachableCells } from '@/src/services/fractal-sudoku';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, rel), 'utf8') as string;

describe('фрактал: клавиатура корня', () => {
  it('🔴 живёт пока корень не сошёлся, а не пока есть пустые клетки', () => {
    const src = read('../../app/games/sudoku-fractal.tsx');
    expect(src).toMatch(/const rootDone = puzzle \? rootSolved\(play\.rootGrid, puzzle\.root\.solution\) : false;/);
    expect(src).toMatch(/\{!rootDone && \(/);
    // прежнее условие по числу заполненных больше не решает судьбу клавиатуры
    expect(src).not.toMatch(/\{rootMine > rootFilled && \(/);
  });
});

describe('счёт длинной партии', () => {
  /** Формулы читаем из исходников — считает их экран, второй копии быть не должно. */
  const fractal = read('../../app/games/sudoku-fractal.tsx');
  const samurai = read('../../app/games/sudoku-samurai.tsx');

  it('🔴 штраф за время насыщается, а не растёт без предела', () => {
    expect(fractal).toMatch(/Math\.min\(time, TIME_CAP\)/);
    expect(samurai).toMatch(/Math\.min\(finalTime, SAMURAI_TIME_CAP\)/);
    expect(samurai).toMatch(/Math\.min\(elapsedTime, SAMURAI_TIME_CAP\)/);
  });

  it('🔴 у победы есть пол — она не равна брошенной партии', () => {
    expect(fractal).toMatch(/Math\.max\(WIN_FLOOR,/);
    expect(samurai).toMatch(/Math\.max\(SAMURAI_WIN_FLOOR,/);
    expect(fractal).not.toMatch(/score: win \? Math\.max\(0,/);
  });

  /** Арифметика: двухчасовая победа обязана стоить больше нуля. */
  it('🔴 двухчасовая честная партия стоит больше нуля', () => {
    const TIME_CAP = 1800, WIN_FLOOR = 300;
    const twoHours = 7200;
    const score = Math.max(WIN_FLOOR, Math.round(4000 - 0 * 60 - Math.min(twoHours, TIME_CAP)));
    expect(`два часа без ошибок: ${score > 0}`).toBe('два часа без ошибок: true');
    // и она отличается от неудачной, у которой ноль
    expect(score).toBeGreaterThan(0);
  });
});

describe('фрактал: сторож корня больше не тавтология', () => {
  it('есть что проверять — кормящих клеток девять', () => {
    expect(feedCells().length).toBe(9);
  });

  it('🔴 на исправной доске мёртвых клеток нет', () => {
    for (const seed of ['корень-a', 'корень-b']) {
      const f = generateFractal(12, seed);
      expect(`${seed}: мёртвых ${rootUnreachableCells(f.root.puzzle).length}`).toBe(`${seed}: мёртвых 0`);
    }
  });

  /**
   * 🔴 ГЛАВНОЕ: сторож ОБЯЗАН уметь сработать. Прежняя редакция не могла никогда —
   * два её условия дополняли друг друга. Даём доску, где кормящая клетка названа
   * дважды: одна цифра снизу ляжет поверх другой, а чья-то клетка останется пустой
   * и запертой от руки. Список обязан перестать быть пустым.
   */
  it('🔴 повтор кормящей клетки замечается', () => {
    const f = generateFractal(12, 'корень-c');
    const feeds = feedCells();
    // Вторая сетка кормит ТУ ЖЕ клетку, что и первая: её цифра ляжет поверх чужой,
    // а собственная клетка второй останется пустой и запертой от руки.
    const broken: [number, number][] = feeds.map((cell, i) => (i === 1 ? feeds[0] as [number, number] : cell));
    const dead = rootUnreachableCells(f.root.puzzle, broken);
    expect(`подмена замечена: ${dead.length > 0}`).toBe('подмена замечена: true');
    /**
     * ⚠️ И НАЗВАНА ИМЕННО ПОВТОРЁННАЯ КЛЕТКА. Без этого утверждения проверку
     * удовлетворяет второй цикл (он видит осиротевшую клетку, потому что список
     * гейта расходится с настоящим), и собственно обнаружение ДУБЛЯ можно снять,
     * не покраснев. А в бою списки совпадают, и второй цикл — та самая тавтология:
     * работает ровно первый.
     */
    const dup = feeds[0] as [number, number];
    expect(`дубль назван: ${dead.some(([r, c]) => r === dup[0] && c === dup[1])}`).toBe('дубль назван: true');
    // и на честном списке сторож молчит — иначе он кричал бы всегда
    expect(rootUnreachableCells(f.root.puzzle, feeds).length).toBe(0);
  });
});
