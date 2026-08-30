/* psygames-goods-sort-caps-board-gate · VER 1 · 30.08.2026 */
/**
 * ЁМКОСТИ НИШ ОБЯЗАНЫ СОВПАДАТЬ С ДОСКОЙ (боевой краш 30.08.2026).
 *
 * 🔴 ЧТО СЛУЧИЛОСЬ. Денис, v2.13.1 на маке: «доска собрана неверно: ниш 9,
 * ёмкостей 7» — игра падала в экран «Something broke» при переходе на уровень.
 * Экран считал ёмкости как `capsFor(level, gridRef.current.slots)` и пересчитывал
 * их по смене `cols`/`rows`. Но число ниш задаёт МАСКА ФОРМЫ: сетка остаётся
 * 3×3, а ниш становится 7 или 9. Замер по 60 уровням: 55 таких переходов на
 * десктопе и 33 на телефоне; L6→L7 — ровно 3×3 и 7→9, то есть числа из репорта.
 *
 * ⚠️ ПОЧЕМУ НЕ «ДОБАВИТЬ SLOTS В ЗАВИСИМОСТИ». Число ниш лежало в `ref`, а ref
 * зависимостям не виден вовсе — тот же приём сломался бы снова на следующем
 * рефе. Лечение структурное: `capsForBoard` берёт число ниш ИЗ САМОЙ ДОСКИ, и
 * длина ответа равна длине доски по построению.
 *
 * Проверяется исполнением: реальные раздачи всех уровней в обеих раскладках.
 */
import { levelCfg, dealBoard, capsFor, capsForBoard } from '@/app/games/goods-sort';
import { makeBoard } from '@/src/games/goods-sort/core/board';

declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

const POOL = Array.from({ length: 23 }, (_, i) => i);

describe('ёмкости ниш и доска — одной длины', () => {
  it('есть что проверять: маска правда меняет число ниш при той же сетке', () => {
    const same: string[] = [];
    for (const narrow of [false, true]) {
      let prev: ReturnType<typeof levelCfg> | null = null;
      for (let L = 1; L <= 60; L++) {
        const cfg = levelCfg(L, POOL.length, narrow);
        if (prev && prev.cols === cfg.cols && prev.rows === cfg.rows && prev.slots !== cfg.slots) {
          same.push(`${narrow ? 'телефон' : 'десктоп'} L${L - 1}→L${L}: ${cfg.cols}×${cfg.rows}, ${prev.slots}→${cfg.slots}`);
        }
        prev = cfg;
      }
    }
    // Если это перестанет быть правдой, гейт ниже зеленеет вслепую.
    expect(same.length).toBeGreaterThan(20);
  });

  it('🔴 на каждом уровне ёмкости совпадают с раздачей, и доска собирается', () => {
    const broken: string[] = [];
    for (const narrow of [false, true]) {
      for (let L = 1; L <= 60; L++) {
        const { cells } = dealBoard(L, POOL, narrow);
        const caps = capsForBoard(L, cells);
        if (caps.length !== cells.length) {
          broken.push(`L${L} (${narrow ? 'телефон' : 'десктоп'}): ниш ${cells.length}, ёмкостей ${caps.length}`);
          continue;
        }
        makeBoard(cells, caps);   // бросит, если длины разойдутся
      }
    }
    expect(broken).toEqual([]);
  });

  it('🔴 переход между уровнями: ёмкости прошлого уровня не годятся новой доске', () => {
    // Ровно тот случай, который ронял игру: L6→L7 на десктопе, сетка та же.
    const prev = dealBoard(6, POOL, false);
    const next = dealBoard(7, POOL, false);
    expect(prev.cfg.cols).toBe(next.cfg.cols);
    expect(prev.cfg.rows).toBe(next.cfg.rows);
    expect(prev.cells.length).not.toBe(next.cells.length);
    // Старая формула (число ниш «откуда-то со стороны») роняет доску...
    expect(() => makeBoard(next.cells, capsFor(7, prev.cells.length))).toThrow(/доска собрана неверно/);
    // ...новая — не может уронить в принципе.
    expect(() => makeBoard(next.cells, capsForBoard(7, next.cells))).not.toThrow();
  });

  it('экран не берёт число ниш для ёмкостей из ref — только из доски', () => {
    const raw: string = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'games', 'goods-sort.tsx'), 'utf8',
    );
    /**
     * ⚠️ КОММЕНТАРИИ ВЫРЕЗАЮТСЯ. Первая редакция этого гейта покраснела на
     * разборе самого дефекта: в шапке `capsForBoard` старая формула приведена
     * ДОСЛОВНО, как пример того, чего делать нельзя. Гейт, читающий слово, а не
     * код, запрещал бы объяснять собственные грабли.
     */
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    expect(code).toContain('capsForBoard(level, cells)');
    expect(code).not.toMatch(/capsFor\(level,\s*gridRef\.current\.slots\)/);
  });
});
