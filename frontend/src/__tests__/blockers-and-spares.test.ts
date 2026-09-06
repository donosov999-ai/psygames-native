/* psygames-blockers-and-spares · VER 1 · 23.08.2026 */
/**
 * ОТКАЗ НАЗЫВАЕТ ВИНОВНЫХ. И СВОБОДНОЕ МЕСТО НЕ ПЛЯШЕТ ОТ РАЗДАЧИ К РАЗДАЧЕ.
 *
 * 🔴 МАДЖОНГ: «ЗАНЯТА» БЕЗ «КЕМ». Тап по занятой плитке отвечал только вибрацией.
 * Правило свободной плитки написано в справке, но на доске из шестидесяти штук
 * глазами его не применить: человек тычет в пару одинаковых рисунков, ничего не
 * происходит, и он не понимает, мешает ли накрывающая плитка, зажатые бока — или
 * игра просто не заметила касания. Это тот же класс, что молчащая судоку.
 *
 * ⚠️ БОКА ВИНОВАТЫ ТОЛЬКО ВМЕСТЕ. Плитка свободна, когда открыт ХОТЬ ОДИН край;
 * подсветить одного бокового соседа — значит соврать про правило. Поэтому боковые
 * попадают в виновные лишь тогда, когда заперты оба.
 *
 * 🔴 СОРТИРОВКА: СВОБОДНОЕ МЕСТО ПЛЯСАЛО. Жалоба звучала «разброс 4–7 вместо
 * гвоздём шести». Разброс — настоящая беда: одна и та же ступень выдавала то
 * просторную доску, то тесную, и сложность решал случай.
 *
 * ⚠️ А ВОТ «ШЕСТЬ» — НЕВЕРНАЯ ПОСЫЛКА, и это видно арифметикой. Замер: с пятого
 * уровня у доски 7–8 годных ниш и 5–6 типов товара. Каждому типу нужна своя ниша,
 * иначе его некуда собирать, поэтому потолок запаса = годные − типы = РОВНО ДВА.
 * Шесть свободных из восьми оставили бы 1–2 ниши на 5–6 типов — доска без решения.
 * Поэтому проверяется то, что имеет смысл: сколько уровень ОБЪЯВИЛ, столько и
 * выдано, одинаково в каждой раздаче.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { dealBoard } from '@/src/games/goods-sort/core/level';
import { blockersOf, isFree } from '@/src/games/mahjong/board';
import { generateDeal } from '@/app/games/mahjong';
import { mahjongLevel } from '@/src/services/mahjongLevels';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';

declare const __dirname: string;
declare function require(id: string): any;

describe('маджонг: отказ называет виновных', () => {
  const deal = (L: number) => {
    const p = mahjongLevel(L);
    for (let k = 0; k < 25; k++) {
      const d = generateDeal(p.layers, p.pairs, p.cols, silhouetteForLevel(L)) as { tiles: any[] };
      if (d.tiles.length) return d.tiles;
    }
    throw new Error(`не собралась раскладка уровня ${L}`);
  };

  it('есть что проверять — занятые плитки на доске есть', () => {
    const tiles = deal(10);
    const alive = tiles.map(() => true);
    const busy = tiles.filter((_, i) => !isFree(tiles, alive, i)).length;
    expect(busy).toBeGreaterThan(3);
  });

  it('🔴 у каждой занятой плитки виновные названы', () => {
    const bad: string[] = [];
    for (const L of [1, 5, 10, 20]) {
      const tiles = deal(L);
      const alive = tiles.map(() => true);
      for (let i = 0; i < tiles.length; i++) {
        if (isFree(tiles, alive, i)) continue;
        if (blockersOf(tiles, alive, i).length === 0 && bad.length < 3) bad.push(`L${L}: плитка ${i} занята, а виновных нет`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** ⚠️ Встречно: у СВОБОДНОЙ плитки виновных быть не должно — иначе подсветка врёт. */
  it('🔴 у свободной плитки виновных нет', () => {
    const bad: string[] = [];
    for (const L of [1, 5, 10, 20]) {
      const tiles = deal(L);
      const alive = tiles.map(() => true);
      for (let i = 0; i < tiles.length; i++) {
        if (!isFree(tiles, alive, i)) continue;
        if (blockersOf(tiles, alive, i).length > 0 && bad.length < 3) bad.push(`L${L}: плитка ${i} свободна, а виновные названы`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ СВОЙСТВО: названные виновные — ТЕ САМЫЕ. Снимаем их с доски, и
   * плитка обязана освободиться. Иначе подсветка показывает не на тех.
   */
  it('🔴 снять названных — и плитка свободна', () => {
    const bad: string[] = [];
    for (const L of [1, 5, 10, 20]) {
      const tiles = deal(L);
      const alive = tiles.map(() => true);
      for (let i = 0; i < tiles.length; i++) {
        if (isFree(tiles, alive, i)) continue;
        const who = blockersOf(tiles, alive, i);
        const after = alive.slice();
        for (const j of who) after[j] = false;
        if (!isFree(tiles, after, i) && bad.length < 3) bad.push(`L${L}: плитка ${i} осталась занятой после снятия ${who.length} названных`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** ⚠️ И не лишних: один открытый бок снимает запрет, значит соседа винить нельзя. */
  it('🔴 боковой сосед виноват только вместе со вторым', () => {
    const bad: string[] = [];
    for (const L of [5, 10, 20]) {
      const tiles = deal(L);
      const alive = tiles.map(() => true);
      for (let i = 0; i < tiles.length; i++) {
        if (isFree(tiles, alive, i)) continue;
        const who = blockersOf(tiles, alive, i);
        const t = tiles[i];
        const sides = who.filter((j: number) => tiles[j].layer === t.layer);
        // либо боковых нет вовсе, либо их минимум два — по одному с каждой стороны
        if (sides.length === 1 && bad.length < 3) bad.push(`L${L}: плитка ${i} — назван один боковой из двух`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 экран подсвечивает виновных, а не только вибрирует', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/mahjong.tsx'), 'utf8');
    expect(src).toMatch(/setBlockers\(blockersOf\(tiles, aliveMaskRef\.current, i\)\)/);
    expect(src).toMatch(/const blames = blockers\.includes\(i\)/);
    expect(src).toMatch(/borderColor: blames \? '#dc2626'/);
    // и подсветка гаснет сама: висящая превратилась бы в разметку
    expect(src).toMatch(/setTimeout\(\(\) => setBlockers\(\[\]\), BLOCKERS_MS\)/);
  });
});

describe('сортировка: свободное место не пляшет', () => {
  const POOL = Array.from({ length: 60 }, (_, i) => i % 14);
  const LEVELS = [1, 3, 5, 10, 14, 18, 20, 26, 30, 40];

  it('🔴 сколько уровень объявил — столько и выдано, в каждой раздаче', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      const seen = new Set<number>();
      let declared = -1;
      for (let k = 0; k < 40; k++) {
        const d = dealBoard(L, POOL);
        declared = (d.cfg as unknown as { spares: number }).spares;
        seen.add(d.freeNiches);
      }
      const got = [...seen].sort((a, b) => a - b);
      if (got.length !== 1 || got[0] !== declared) bad.push(`L${L}: объявлено ${declared}, выдано ${got.join('/')}`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА: «нет разброса» нельзя получить обнулением. Свободное
   * место обязано остаться — без него доска не разбирается вовсе.
   */
  it('🔴 свободные ниши есть, а не сведены в ноль ради постоянства', () => {
    for (const L of LEVELS) {
      const d = dealBoard(L, POOL);
      expect(`L${L}: свободных ${d.freeNiches >= 2}`).toBe(`L${L}: свободных true`);
    }
  });

  /**
   * ⚠️ И ПОТОЛОК ЗАПАСА — АРИФМЕТИКА, А НЕ ВКУС. Каждому типу товара нужна своя
   * ниша, иначе его некуда собирать. Отсюда «шесть свободных» из жалобы и
   * невозможны: с пятого уровня годных ниш 7–8 при 5–6 типах.
   */
  it('🔴 запас не превышает того, что остаётся сверх типов', () => {
    for (const L of LEVELS) {
      const d = dealBoard(L, POOL);
      const c = d.cfg as unknown as { slots: number; types: number; obst: { blocked: number; locked: number } };
      const usable = c.slots - c.obst.blocked - c.obst.locked;
      expect(`L${L}: ${d.freeNiches} ≤ ${usable - c.types}`).toBe(`L${L}: ${Math.min(d.freeNiches, usable - c.types)} ≤ ${usable - c.types}`);
    }
  });
});
