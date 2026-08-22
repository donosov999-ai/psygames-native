/* psygames-goods-sort-hint-legal · VER 1 · 22.08.2026 */
/**
 * ПОДСКАЗКА НЕ ПОКАЗЫВАЕТ ХОД, КОТОРЫЙ ИГРА ОТВЕРГНЕТ. И ДОСКА НЕ РАЗДАЁТСЯ РЕШЁННОЙ.
 *
 * 🔴 ПОДСКАЗКА. Прежний `findHint` звался с ёмкостью по умолчанию (три) и про
 * строгую укладку не знал вовсе — а с 18-го уровня ниши бывают на два и на четыре,
 * с 14-го через два на третий укладка строгая. Человек тратил одну из трёх
 * подсказок, тащил товар в подсвеченную нишу — и не происходило ничего: ни тычка,
 * ни звука. Подсказка сама туда и показала.
 *
 * 🔴 ГОТОВАЯ ТРОЙКА В РАЗДАЧЕ. Замер по 300 раздач на уровень: с двадцатого — там
 * появляются ниши на четыре — доска приезжала с уже сложенной тройкой в 5,3 %
 * случаев (L20 — 5,3 %, L26 — 4,7 %, L38 — 6,0 %). Она схлопывается первым же
 * касанием: очко и место в нише достаются ни за что, а задача короче на три товара.
 *
 * ⚠️ ПРОВЕРЯЕМ ТЕМ ЖЕ, ЧЕМ ИГРА ПРИНИМАЕТ ХОД (`placementOk` с настоящей ёмкостью
 * и настоящим признаком строгой укладки), а не своей копией правила.
 */
import { capsFor, dealBoard, findHint, placementOk, strictPlacement } from '@/app/games/goods-sort';
import { makeBoard, tripleIn } from '@/src/games/goods-sort/core/board';
import { hintMove } from '@/src/games/goods-sort/core/solver';

const POOL = Array.from({ length: 60 }, (_, i) => i % 14);
const LEVELS = [3, 18, 20, 26, 38, 41];
const DEALS = 20;

describe('сортировка товаров: раздача', () => {
  it('есть что проверять — доски настоящие', () => {
    const d = dealBoard(26, POOL);
    expect(d.cells.length).toBeGreaterThan(6);
    expect(d.cells.flat().length).toBeGreaterThan(10);
  });

  it('🔴 ни одна раздача не приезжает с готовой тройкой', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      for (let k = 0; k < DEALS; k++) {
        const d = dealBoard(L, POOL);
        const at = d.cells.findIndex((c) => tripleIn(c) !== null);
        if (at >= 0 && bad.length < 3) bad.push(`L${L}: ниша ${at} = [${d.cells[at]?.join(',')}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** ⚠️ Встречно: пересборка не должна выродить доску в пустую или однотипную. */
  it('🔴 доска осталась задачей, а не опустела ради условия', () => {
    for (const L of LEVELS) {
      const d = dealBoard(L, POOL);
      const items = d.cells.flat();
      const types = new Set(items).size;
      expect(`L${L}: товаров ${items.length > 6}, типов ${types >= 2}`).toBe(`L${L}: товаров true, типов true`);
    }
  });
});

describe('сортировка товаров: подсказка', () => {
  it('🔴 ход из решателя законен по настоящим ёмкостям и укладке', () => {
    const bad: string[] = [];
    let found = 0;
    for (const L of LEVELS) {
      const strict = strictPlacement(L);
      for (let k = 0; k < DEALS; k++) {
        const d = dealBoard(L, POOL);
        const caps = capsFor(L, d.cells.length);
        const board = makeBoard(d.cells, caps);
        const h = hintMove(board);
        if (!h) continue;
        found++;
        const src = board.cells[h.from] ?? [];
        if (!src.length) { bad.push(`L${L}: ход из пустой ниши`); continue; }
        const top = src[src.length - 1] as number;
        if (!placementOk([...(board.cells[h.to] ?? [])], top, strict, caps[h.to] ?? 3)) {
          if (bad.length < 3) bad.push(`L${L}: ${h.from}→${h.to}, товар ${top}, ниша [${board.cells[h.to]?.join(',')}], ёмкость ${caps[h.to]}`);
        }
      }
    }
    expect(`подсказок найдено: ${found > 40}`).toBe('подсказок найдено: true');   // выборка не выродилась
    expect(bad).toEqual([]);
  });

  /**
   * ⚠️ И ЧТО ЭКРАН БЕРЁТ ХОД ИМЕННО ОТТУДА, пропуская его через свою же проверку
   * приёма. Правило можно починить в ядре и не подключить — ровно так оно и жило.
   */
  it('🔴 экран зовёт решатель и сверяет ход тем, чем принимает', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/goods-sort.tsx'), 'utf8');
    const body = src.slice(src.indexOf('const showHint'), src.indexOf('const reshuffle'));
    expect(body).toMatch(/hintMove\(makeBoard\(cells, capsFor\(level, cells\.length\)\)\)/);
    expect(body).toMatch(/canPlaceInto\(found\.fromCell, found\.toCell\)/);
    // и найденный ход берётся ИМЕННО у решателя, а старая формула — только запасной путь
    expect(body).toMatch(/const found = fromSolver \?\? findHint\(/);
    // и подсказка не списывается раньше проверки
    expect(body.indexOf('canPlaceInto(found.fromCell')).toBeLessThan(body.indexOf('setHints'));
  });

  it('🔴 раздача сверяется с готовой тройкой, а не только с решаемостью', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/goods-sort.tsx'), 'utf8');
    const deal = src.slice(src.indexOf('export function dealBoard'), src.indexOf('export function levelCfg'));
    expect(deal).toMatch(/tripleIn\(cell\) !== null/);
    expect(deal).toMatch(/dealtWrong\(cells\)/);
  });
});

declare const __dirname: string;
declare function require(id: string): any;
