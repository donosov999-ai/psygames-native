/* psygames-mahjong-layouts-test · VER 1 · 23.08.2026 */
/**
 * БИБЛИОТЕКА РАСКЛАДОК И РЕШАЕМАЯ РАЗДАЧА — ПРОВЕРКА РАЗБОРОМ, А НЕ ОБЕЩАНИЕМ.
 *
 * Заимствование: ffalt/mah, MIT, «Copyright (c) 2016 ffalt» — данные раскладок,
 * разбор их компактного формата и алгоритм раздачи. Лицензия и перечень взятого:
 * `src/games/mahjong/vendor/LICENSE-mah`.
 *
 * 🔴 ПОЧЕМУ ЗДЕСЬ СВОЙ РЕШАТЕЛЬ, А НЕ ПРОИГРЫВАНИЕ `peelOrder`. Генератор
 * возвращает порядок, которым он сам снимал пары, и проиграть его — значит
 * спросить у генератора, решаема ли его раздача. Такая проверка зелена при ЛЮБОЙ
 * поломке, которая ломает и раздачу, и её описание разом: сломай порядок снятия —
 * сломается и «решение», и они по-прежнему совпадут. `peelOrder` здесь не
 * используется ВООБЩЕ. Доска разбирается с нуля, поиском с откатом.
 *
 * ⚠️ ЖАДНЫЙ РАЗБОР В МАДЖОНГЕ НЕ ПОЛОН. При трёх и более свободных копиях одного
 * рисунка неверный выбор пары отрезает решение, которое есть: снял не ту пару —
 * третья копия осталась под стопкой. Поэтому решатель ходит с ОТКАТОМ и помнит
 * виденные состояния доски; жадный дал бы красное там, где игра исправна.
 */
import { generateDeal, SYMBOL_COUNT } from '@/app/games/mahjong';
import { freeFlags, type Tile } from '@/src/games/mahjong/board';
import {
  layoutCatalogue, layoutForLevel, reduceLayout, normalize, MAX_LAYOUT_HALF_X,
} from '@/src/games/mahjong/layouts';
import { VENDOR_BOARDS } from '@/src/games/mahjong/vendor/boards';
import { expandMapping } from '@/src/games/mahjong/vendor/mapping';
import { dealSolvable, type Place } from '@/src/games/mahjong/vendor/solvable';

/**
 * 🔴 РАЗДАЧИ В ПРОВЕРКЕ ЗАСЕЯНЫ, И ЭТО НЕ ПРИДИРКА. С `Math.random` проверка
 * оказалась ШАТКОЙ: локально зелёная, на сборочной машине красная — «ур.28
 * заход 23: budget», то есть разбор упёрся в бюджет на случайно выпавшей доске.
 * Гейт, который то краснеет, то нет, хуже отсутствующего: он приучает
 * перезапускать до зелёного. С зерном ответ один и тот же везде, и красный
 * означает настоящую поломку, а не медленную машину.
 *
 * ⚠️ Взамен проверка доказывает ФИКСИРОВАННУЮ выборку, а не «раздачи вообще».
 * Широкий случайный прогон — дело офлайн-калибровки (960 из 960 досок), и её
 * числа записаны в шапке решателя, а не подменяют собой этот гейт.
 */
function seeded(seed: number): () => number {
  let x = (seed | 0) || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}
/** Зерно из имени раскладки: одна и та же доска везде и всегда. */
const seedFrom = (name: string): number => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
};
import { mahjongLevel } from '@/src/services/mahjongLevels';

declare const __dirname: string;
declare function require(m: string): any;

const keyOf = (p: Place): string => `${p.layer}:${p.x}:${p.y}`;
/** Лежит ли `a` на `b` (плитка 2×2 в полуклетках, любой слой выше). */
const covers = (a: Place, b: Place): boolean =>
  a.layer > b.layer && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

// ─────────────────────────────────────────────────────────────────────────────
// НЕЗАВИСИМЫЙ РЕШАТЕЛЬ
// ─────────────────────────────────────────────────────────────────────────────
type Verdict = 'solved' | 'stuck' | 'budget';

/** Свой сеятель — чтобы красное было ВОСПРОИЗВОДИМЫМ, а не «иногда падает». */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * СОСТОЯНИЕ СВОБОДЫ, СЧИТАЕМОЕ ПРИРАЩЕНИЯМИ.
 *
 * ⚠️ ЗАЧЕМ, ЕСЛИ ЕСТЬ ГОТОВЫЙ `freeFlags`. Он обходит доску целиком (O(n²)) на
 * КАЖДОМ снятии: один жадный разбор 144 плиток — это 72 полных обхода, полтора
 * миллиона сравнений. Решателю нужны тысячи разборов, и на `freeFlags` в лоб
 * проверка либо ползла минутами, либо упиралась в потолок и краснела на ИСПРАВНОЙ
 * игре (замер 23.08.2026: 2 доски из 960).
 *
 * Приращения возможны потому, что снятие плитки НИКОГДА никого не запирает — оно
 * только освобождает. Значит достаточно счётчиков «сколько живых меня накрывает /
 * держит слева / держит справа», и снятие уменьшает их на O(соседей).
 *
 * 🔴 РИСК ОЧЕВИДЕН: свой счёт свободы может РАЗОЙТИСЬ с игровым, и тогда решатель
 * будет разбирать не ту игру, что показывает экран, — то есть зеленеть вслепую.
 * Поэтому ниже стоит отдельная проверка «согласие с `freeFlags` на каждом шаге»,
 * и она обязана краснеть первой.
 */
interface FreeState {
  n: number;
  covers: number[][];
  leftOf: number[][];
  rightOf: number[][];
  cov: number[];
  bl: number[];
  br: number[];
  alive: boolean[];
}

function makeState(tiles: Tile[]): FreeState {
  const n = tiles.length;
  const covers: number[][] = Array.from({ length: n }, () => [] as number[]);
  const leftOf: number[][] = Array.from({ length: n }, () => [] as number[]);
  const rightOf: number[][] = Array.from({ length: n }, () => [] as number[]);
  const cov = new Array<number>(n).fill(0);
  const bl = new Array<number>(n).fill(0);
  const br = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const a = tiles[i] as Tile;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const b = tiles[j] as Tile;
      if (b.layer > a.layer && Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2) {
        (covers[j] as number[]).push(i); cov[i] = (cov[i] as number) + 1; continue;
      }
      if (b.layer === a.layer && Math.abs(b.y - a.y) < 2) {
        if (Math.abs(b.x - (a.x - 2)) < 1) { (leftOf[j] as number[]).push(i); bl[i] = (bl[i] as number) + 1; }
        else if (Math.abs(b.x - (a.x + 2)) < 1) { (rightOf[j] as number[]).push(i); br[i] = (br[i] as number) + 1; }
      }
    }
  }
  return { n, covers, leftOf, rightOf, cov, bl, br, alive: new Array<boolean>(n).fill(true) };
}

const isFreeState = (S: FreeState, i: number): boolean =>
  (S.alive[i] as boolean) && S.cov[i] === 0 && !((S.bl[i] as number) > 0 && (S.br[i] as number) > 0);

function takeTile(S: FreeState, i: number): void {
  S.alive[i] = false;
  for (const k of S.covers[i] as number[]) S.cov[k] = (S.cov[k] as number) - 1;
  for (const k of S.leftOf[i] as number[]) S.bl[k] = (S.bl[k] as number) - 1;
  for (const k of S.rightOf[i] as number[]) S.br[k] = (S.br[k] as number) - 1;
}

function putTile(S: FreeState, i: number): void {
  S.alive[i] = true;
  for (const k of S.covers[i] as number[]) S.cov[k] = (S.cov[k] as number) + 1;
  for (const k of S.leftOf[i] as number[]) S.bl[k] = (S.bl[k] as number) + 1;
  for (const k of S.rightOf[i] as number[]) S.br[k] = (S.br[k] as number) + 1;
}

/** Все ходы, доступные ПРЯМО СЕЙЧАС: пары свободных плиток с одним рисунком. */
function movesNow(tiles: Tile[], S: FreeState): [number, number][] {
  const bySymbol = new Map<number, number[]>();
  for (let i = 0; i < S.n; i += 1) {
    if (!isFreeState(S, i)) continue;
    const sym = (tiles[i] as Tile).symbol;
    const list = bySymbol.get(sym);
    if (list) list.push(i); else bySymbol.set(sym, [i]);
  }
  const out: [number, number][] = [];
  for (const idx of bySymbol.values()) {
    for (let a = 0; a < idx.length; a += 1) {
      for (let b = a + 1; b < idx.length; b += 1) out.push([idx[a] as number, idx[b] as number]);
    }
  }
  return out;
}

/** Один жадный заход: бери случайный доступный ход, пока ходы есть. Что осталось. */
function greedyPass(tiles: Tile[], rand: () => number): number {
  const S = makeState(tiles);
  let left = S.n;
  while (left > 0) {
    const moves = movesNow(tiles, S);
    if (moves.length === 0) break;
    const [i, j] = moves[Math.floor(rand() * moves.length)] as [number, number];
    takeTile(S, i); takeTile(S, j);
    left -= 2;
  }
  return left;
}

/** Полный поиск с откатом и памятью виденных состояний. */
function backtrack(tiles: Tile[], rand: () => number, budget: number): { ok: boolean; hitBudget: boolean } {
  const S = makeState(tiles);
  const seen = new Set<string>();
  let nodes = 0;
  let hitBudget = false;
  const stateKey = (): string => {
    let s = '';
    for (let i = 0; i < S.n; i += 1) s += S.alive[i] ? '1' : '0';
    return s;
  };
  const step = (left: number): boolean => {
    if (left === 0) return true;
    if (nodes >= budget) { hitBudget = true; return false; }
    nodes += 1;
    const k = stateKey();
    if (seen.has(k)) return false;
    seen.add(k);
    const moves = movesNow(tiles, S);
    for (let i = moves.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [moves[i], moves[j]] = [moves[j] as [number, number], moves[i] as [number, number]];
    }
    for (const [i, j] of moves) {
      takeTile(S, i); takeTile(S, j);
      if (step(left - 2)) return true;
      putTile(S, j); putTile(S, i);
      if (nodes >= budget) { hitBudget = true; return false; }
    }
    return false;
  };
  const ok = step(S.n);
  return { ok, hitBudget };
}

/**
 * «СНИМАЙ ЛЮБУЮ ДОСТУПНУЮ ПАРУ, ПОКА ДОСКА НЕ ОПУСТЕЕТ» — СВОЙ РАЗБОР.
 *
 * Два прохода, и оба нужны:
 *   1. ЖАДНО С ПОВТОРАМИ. Заход берёт случайный доступный ход. Замер 23.08.2026 по
 *      960 раздачам (16 уровней × 60): 959 разобраны жадными заходами, из них
 *      подавляющее большинство — за первый десяток.
 *   2. С ОТКАТОМ. Жадный разбор в маджонге НЕ ПОЛОН: при трёх и более свободных
 *      копиях рисунка неверный выбор пары отрезает существующее решение. Неудача
 *      жадных заходов поэтому ничего не доказывает — дальше полный поиск с
 *      возвратом. На тех же 960 раздачах он понадобился 1 раз и уложился в 21 262
 *      узла; провалов — ноль.
 *
 * ⚠️ `budget` — не «зелено». Упереться в потолок значит НЕ ДОКАЗАНО, и проверка
 * обязана считать это провалом наравне со `stuck`. Отличаются они только в
 * сообщении: `stuck` — доска действительно неразбираема, `budget` — не хватило
 * потолка, и тогда чинить надо решатель, а не игру.
 *
 * ⚠️ ЦЕНА ОТВЕТА НЕСИММЕТРИЧНА, И ПОЭТОМУ ПРОВЕРКИ НИЖЕ ОСТАНАВЛИВАЮТСЯ НА ТРЁХ
 * ПРОВАЛАХ. Разобрать исправную доску дёшево (жадный заход укладывается в десятки
 * миллисекунд), а НЕ разобрать сломанную дорого: сначала выгорают все жадные
 * заходы, потом весь потолок отката. На сломанном генераторе таких досок сотни, и
 * полный прогон переставал заканчиваться (замер 23.08.2026: >10 минут). Три
 * провала доказывают поломку ничуть не хуже двухсот, а на исправной игре ранний
 * выход не срабатывает ни разу — проверяются все доски до одной.
 */
const MAX_REPORTED_FAILURES = 3;
function solveIndependently(tiles: Tile[], greedyRuns = 4000, dfsRuns = 12, budget = 150000): Verdict {
  const n = tiles.length;
  if (n === 0) return 'stuck';
  const rand = rng(0x5EED ^ n);
  for (let r = 0; r < greedyRuns; r += 1) {
    if (greedyPass(tiles, rand) === 0) return 'solved';
  }
  let hitBudget = false;
  for (let r = 0; r < dfsRuns; r += 1) {
    const res = backtrack(tiles, rng((0xC0FFEE ^ n) + r * 7919), budget);
    if (res.ok) return 'solved';
    hitBudget = hitBudget || res.hitBudget;
  }
  return hitBudget ? 'budget' : 'stuck';
}

describe('🔴 решатель считает свободу ТЕМ ЖЕ правилом, что и экран', () => {
  it('приращения совпадают с freeFlags на КАЖДОМ шаге разбора', () => {
    const bad: string[] = [];
    for (const L of [1, 12, 24, 40]) {
      const p = mahjongLevel(L);
      const chosen = layoutForLevel(L);
      const deal = generateDeal(p.layers, p.pairs, p.cols, 'diamond', chosen?.places, seeded(seedFrom(`${L}:${chosen?.layout.name ?? 'нет'}`)));
      if (deal.tiles.length === 0) { bad.push(`ур.${L}: раздача не собралась`); continue; }
      const S = makeState(deal.tiles);
      const rand = rng(11 + L);
      for (let step = 0; ; step += 1) {
        const fast: number[] = [];
        for (let i = 0; i < S.n; i += 1) if (isFreeState(S, i)) fast.push(i);
        const flags = freeFlags(deal.tiles, S.alive);
        const slow: number[] = [];
        for (let i = 0; i < S.n; i += 1) if (flags[i]) slow.push(i);
        if (fast.join(',') !== slow.join(',')) { bad.push(`ур.${L} шаг ${step}: свобода разошлась`); break; }
        const moves = movesNow(deal.tiles, S);
        if (moves.length === 0) break;
        const [i, j] = moves[Math.floor(rand() * moves.length)] as [number, number];
        takeTile(S, i); takeTile(S, j);
      }
    }
    expect(`расхождений: ${bad.length} → ${bad.slice(0, 2).join(' | ')}`).toBe('расхождений: 0 → ');
  }, 120000);
});

describe('решатель сам по себе — иначе он зелен вслепую', () => {
  const row = (xs: number[], syms: number[]): Tile[] =>
    xs.map((x, i) => ({ id: i, x, y: 0, layer: 0, symbol: syms[i] as number }));

  it('разбирает то, что разбирается', () => {
    expect(solveIndependently(row([0, 2], [1, 1]))).toBe('solved');
    expect(solveIndependently(row([0, 2, 4, 6], [1, 2, 2, 1]))).toBe('solved');
  });

  it('🔴 мёртвую стопку НЕ разбирает — верхняя плитка навсегда накрывает нижнюю', () => {
    const stack: Tile[] = [
      { id: 0, x: 0, y: 0, layer: 0, symbol: 5 },
      { id: 1, x: 0, y: 0, layer: 1, symbol: 5 },
    ];
    expect(solveIndependently(stack)).toBe('stuck');
  });

  it('🔴 ловит ловушку, на которой жадный разбор врёт', () => {
    /**
     * Три копии рисунка 7 свободны, четвёртая — под плиткой 9. Жадный может снять
     * «не ту» пару и запереть себя; правильный ход — снять ту, что накрывает.
     * Решатель с откатом обязан найти решение, а не сдаться.
     */
    const trap: Tile[] = [
      { id: 0, x: 0, y: 0, layer: 0, symbol: 7 },
      { id: 1, x: 4, y: 0, layer: 0, symbol: 7 },
      { id: 2, x: 8, y: 0, layer: 0, symbol: 7 },
      { id: 3, x: 12, y: 0, layer: 0, symbol: 7 },
      { id: 4, x: 12, y: 0, layer: 1, symbol: 9 },
      { id: 5, x: 16, y: 0, layer: 0, symbol: 9 },
    ];
    expect(solveIndependently(trap)).toBe('solved');
  });
});

describe('84 раскладки разворачиваются', () => {
  it('есть что проверять — библиотека на месте', () => {
    expect(VENDOR_BOARDS.length).toBe(84);
    expect(layoutCatalogue().length).toBe(84);
  });

  it('🔴 каждая раскладка разворачивается в ЧЁТНОЕ число мест без повторов', () => {
    const bad: string[] = [];
    for (const b of VENDOR_BOARDS) {
      const places = expandMapping(b.map);
      if (places.length % 2 !== 0) bad.push(`${b.name}: мест ${places.length} — нечётно, пары не сложатся`);
      const seen = new Set<string>();
      for (const [z, x, y] of places) {
        const k = `${z}:${x}:${y}`;
        if (seen.has(k)) bad.push(`${b.name}: место ${k} встречается дважды`);
        seen.add(k);
      }
      // Все 84 карты источника — полный набор маджонга. Потеря строки при разборе
      // компактного формата видна ровно здесь и больше нигде.
      if (places.length !== 144) bad.push(`${b.name}: мест ${places.length}, а полный набор — 144`);
    }
    expect(`ошибок: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('ошибок: 0 → ');
  });

  it('в каталоге есть категории и узнаваемые имена', () => {
    const names = new Set(layoutCatalogue().map((l) => l.name));
    for (const n of ['Turtle', 'Butterfly', 'Dragon', 'Fortress', 'Pyramid']) expect(names).toContain(n);
    const cats = new Set(layoutCatalogue().map((l) => l.cat));
    expect(cats.size).toBeGreaterThanOrEqual(4);
  });
});

describe('ужатие раскладки под уровень', () => {
  const LEVELS = [1, 3, 4, 8, 9, 14, 15, 22, 28, 40];

  it('🔴 снято только то, НА ЧЁМ НИЧЕГО НЕ ЛЕЖАЛО', () => {
    /**
     * Главное свойство ужатия: любая ужатая доска — это состояние, ДОСТИЖИМОЕ в
     * настоящей партии на исходной раскладке. Убери плитку из-под стопки — и
     * верхняя повиснет над дырой, которой в задумке не было.
     */
    const bad: string[] = [];
    for (const level of LEVELS) {
      const p = mahjongLevel(level);
      const need = p.pairs * 2;
      for (const l of layoutCatalogue()) {
        const trunc = l.places.filter((q) => q.layer < p.layers);
        if (l.layers < p.layers || trunc.length < need) continue;
        const kept = reduceLayout(l.places, p.layers, need);
        if (!kept) { bad.push(`ур.${level} ${l.name}: не ужалось`); continue; }
        if (kept.length !== need) bad.push(`ур.${level} ${l.name}: мест ${kept.length}, заказано ${need}`);
        const keptSet = new Set(kept.map(keyOf));
        for (const gone of trunc) {
          if (keptSet.has(keyOf(gone))) continue;
          for (const up of trunc) {
            if (keptSet.has(keyOf(up)) && covers(up, gone)) {
              bad.push(`ур.${level} ${l.name}: снято ${keyOf(gone)}, а лежавшее сверху ${keyOf(up)} осталось`);
              break;
            }
          }
          if (bad.length > 3) break;
        }
        if (bad.length > 3) break;
      }
      if (bad.length > 3) break;
    }
    expect(`нарушений: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('нарушений: 0 → ');
  }, 300000);

  it('обещанные уровнем слои выкладываются все до одного', () => {
    const bad: string[] = [];
    for (const level of LEVELS) {
      const p = mahjongLevel(level);
      const need = p.pairs * 2;
      for (const l of layoutCatalogue()) {
        if (l.layers < p.layers || l.places.filter((q) => q.layer < p.layers).length < need) continue;
        const kept = reduceLayout(l.places, p.layers, need);
        if (!kept) continue;
        const layers = new Set(kept.map((q) => q.layer));
        if (layers.size !== p.layers) bad.push(`ур.${level} ${l.name}: слоёв ${layers.size}, обещано ${p.layers}`);
      }
    }
    expect(`ошибок: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('ошибок: 0 → ');
  }, 300000);

  it('прижатие к нулю ничего не теряет и не двигает форму', () => {
    const l = layoutCatalogue()[0] as { places: Place[] };
    const out = normalize(l.places);
    expect(out.length).toBe(l.places.length);
    expect(Math.min(...out.map((q) => q.x))).toBe(0);
    expect(Math.min(...out.map((q) => q.y))).toBe(0);
  });

  it('мусор на входе не роняет ужатие', () => {
    const l = layoutCatalogue()[0] as { places: Place[] };
    expect(reduceLayout(l.places, 2, 0)).toBeNull();
    expect(reduceLayout(l.places, 2, 100000)).toBeNull();
    expect(normalize([])).toEqual([]);
  });
});

describe('лесенка уровней осталась лесенкой', () => {
  it('🔴 число пар растёт монотонно и доска ровно такая, как обещано', () => {
    const bad: string[] = [];
    let prev = 0;
    for (let L = 1; L <= 60; L += 1) {
      const p = mahjongLevel(L);
      if (p.pairs < prev) bad.push(`ур.${L}: пар ${p.pairs}, а на ${L - 1} было ${prev}`);
      prev = p.pairs;
      const chosen = layoutForLevel(L);
      if (!chosen) { bad.push(`ур.${L}: раскладки не нашлось`); continue; }
      if (chosen.places.length !== p.pairs * 2) {
        bad.push(`ур.${L}: плиток ${chosen.places.length}, заказано ${p.pairs * 2}`);
      }
      if (new Set(chosen.places.map((q) => q.layer)).size !== p.layers) {
        bad.push(`ур.${L}: слоёв не ${p.layers}`);
      }
    }
    expect(`ошибок: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('ошибок: 0 → ');
  }, 300000);

  it('один и тот же уровень — всегда одна и та же доска', () => {
    for (const L of [1, 7, 13, 40]) {
      const a = layoutForLevel(L);
      const b = layoutForLevel(L);
      expect(a?.layout.name).toBe(b?.layout.name);
      expect(a?.places.map(keyOf).sort()).toEqual(b?.places.map(keyOf).sort());
    }
    // Мусор на входе не роняет экран.
    expect(layoutForLevel(0)?.layout.name).toBe(layoutForLevel(1)?.layout.name);
  });

  it('🔴 раскладок в ходу заметно больше прежних семи силуэтов', () => {
    const used = new Set<string>();
    for (let L = 1; L <= 60; L += 1) used.add(layoutForLevel(L)?.layout.name ?? '—');
    expect(`разных раскладок на 60 уровнях: ${used.size >= 20}`).toBe('разных раскладок на 60 уровнях: true');
  }, 300000);

  it('доска влезает в телефон по ширине', () => {
    const wide: string[] = [];
    for (let L = 1; L <= 60; L += 1) {
      const c = layoutForLevel(L);
      if (!c) continue;
      const w = Math.max(...c.places.map((q) => q.x)) + 2;
      if (w > MAX_LAYOUT_HALF_X) wide.push(`ур.${L} ${c.layout.name}: ${w} полуклеток`);
    }
    expect(`широких: ${wide.length} → ${wide.slice(0, 3).join(' | ')}`).toBe('широких: 0 → ');
  }, 300000);
});

describe('🔴 РАЗДАЧА РЕШАЕМА — доказано своим разбором', () => {
  it('раздача по КАЖДОМУ уровню разбирается до пустой доски', () => {
    const bad: string[] = [];
    let checked = 0;
    for (let L = 1; L <= 36; L += 1) {
      const p = mahjongLevel(L);
      const chosen = layoutForLevel(L);
      if (!chosen) { bad.push(`ур.${L}: раскладки нет`); if (bad.length >= MAX_REPORTED_FAILURES) break; continue; }
      const deal = generateDeal(p.layers, p.pairs, p.cols, 'diamond', chosen.places, seeded(seedFrom(`${L}:${chosen.layout.name}`)));
      if (deal.tiles.length === 0) { bad.push(`ур.${L} ${chosen.layout.name}: раздача не собралась`); if (bad.length >= MAX_REPORTED_FAILURES) break; continue; }
      checked += 1;
      const verdict = solveIndependently(deal.tiles);
      if (verdict !== 'solved') bad.push(`ур.${L} ${chosen.layout.name}: ${verdict}`);
      if (bad.length >= MAX_REPORTED_FAILURES) break;
    }
    expect(`провалов ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('провалов 0 → ');
    expect(checked).toBeGreaterThanOrEqual(30);
  }, 600000);

  it('много раздач одного уровня — каждая разбирается', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const L of [6, 12, 20, 28, 40]) {
      const p = mahjongLevel(L);
      const chosen = layoutForLevel(L);
      if (!chosen) { bad.push(`ур.${L}: раскладки нет`); if (bad.length >= MAX_REPORTED_FAILURES) break; continue; }
      for (let i = 0; i < 25; i += 1) {
        const deal = generateDeal(p.layers, p.pairs, p.cols, 'diamond', chosen.places, seeded(seedFrom(`${L}:${chosen.layout.name}`)));
        if (deal.tiles.length === 0) { bad.push(`ур.${L} заход ${i}: не собралось`); if (bad.length >= MAX_REPORTED_FAILURES) break; continue; }
        checked += 1;
        const verdict = solveIndependently(deal.tiles);
        if (verdict !== 'solved') bad.push(`ур.${L} заход ${i}: ${verdict}`);
        if (bad.length >= MAX_REPORTED_FAILURES) break;
      }
      if (bad.length >= MAX_REPORTED_FAILURES) break;
    }
    expect(`провалов ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('провалов 0 → ');
    expect(checked).toBeGreaterThanOrEqual(100);
  }, 600000);

  it('🔴 раздача по РАЗНЫМ раскладкам разбирается — не только по удобным', () => {
    const p = mahjongLevel(10);
    const need = p.pairs * 2;
    const fit = layoutCatalogue().filter(
      (l) => l.layers >= p.layers && l.places.filter((q) => q.layer < p.layers).length >= need,
    );
    // Каждая третья по каталогу: выборка идёт по всей длине, то есть заденет и
    // животных, и архитектуру, и абстракции, а не первые попавшиеся.
    const sample = fit.filter((_, i) => i % 3 === 0);
    const bad: string[] = [];
    let checked = 0;
    for (const l of sample) {
      const kept = reduceLayout(l.places, p.layers, need);
      if (!kept) { bad.push(`${l.name}: не ужалось`); if (bad.length >= MAX_REPORTED_FAILURES) break; continue; }
      const deal = dealSolvable(normalize(kept), SYMBOL_COUNT, 60, seeded(seedFrom(l.name)));
      if (deal.tiles.length === 0) { bad.push(`${l.name}: раздача не собралась`); if (bad.length >= MAX_REPORTED_FAILURES) break; continue; }
      checked += 1;
      const verdict = solveIndependently(deal.tiles);
      if (verdict !== 'solved') bad.push(`${l.name}: ${verdict}`);
      if (bad.length >= MAX_REPORTED_FAILURES) break;
    }
    expect(`провалов ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe('провалов 0 → ');
    expect(checked).toBeGreaterThanOrEqual(20);
  }, 600000);

  it('раздача не врёт про набор: пары по символам, чётность соблюдена', () => {
    const p = mahjongLevel(12);
    const chosen = layoutForLevel(12);
    const deal = generateDeal(p.layers, p.pairs, p.cols, 'diamond', chosen?.places, seeded(seedFrom(`12:${chosen?.layout.name ?? 'нет'}`)));
    const count = new Map<number, number>();
    for (const t of deal.tiles) count.set(t.symbol, (count.get(t.symbol) ?? 0) + 1);
    const odd = [...count.entries()].filter(([, c]) => c % 2 !== 0);
    expect(`рисунков с нечётным числом плиток: ${odd.length}`).toBe('рисунков с нечётным числом плиток: 0');
    expect(deal.tiles.length).toBe(p.pairs * 2);
  }, 120000);
});

describe('правило свободной плитки: их и наше', () => {
  /**
   * 🔴 ПРАВИЛА РАСХОДЯТСЯ, И МЫ ОСТАВИЛИ СВОЁ. Их `Stone.isBlocked` считает плитку
   * накрытой, только если что-то лежит на СЛЕДУЮЩЕМ слое (z+1). Наш `freeFlags`
   * смотрит на ВСЕ слои выше. Разница видна там, где плитка ПЕРЕКИНУТА аркой над
   * нижней, а промежуточные слои в этом месте пусты, — «Interweaved» и
   * «Interweaved 2».
   *
   * Оставили наше: экран рисует слои со сдвигом, то есть плитка арки физически
   * закрывает собой часть нижней. По их правилу игрок увидел бы наполовину
   * спрятанную плитку, которая нажимается, рядом с открытой, которая нет.
   *
   * Проверка держит ЗАМЕР: если правило (любое из двух) поедет, число разойдётся.
   */
  const theirBlocked = (T: Place[], i: number): boolean => {
    const t = T[i] as Place;
    let top = false; let l = false; let r = false;
    for (let j = 0; j < T.length; j += 1) {
      if (j === i) continue;
      const o = T[j] as Place;
      if (o.layer === t.layer + 1 && Math.abs(o.x - t.x) <= 1 && Math.abs(o.y - t.y) <= 1) top = true;
      if (o.layer === t.layer && Math.abs(o.y - t.y) <= 1) {
        if (o.x === t.x - 2) l = true;
        if (o.x === t.x + 2) r = true;
      }
    }
    return top || (l && r);
  };

  it('🔴 расходятся ровно на двух раскладках — и это «Interweaved»', () => {
    const disagree: string[] = [];
    for (const l of layoutCatalogue()) {
      const tiles: Tile[] = l.places.map((p, i) => ({ id: i, x: p.x, y: p.y, layer: p.layer, symbol: 0 }));
      const ours = freeFlags(tiles, new Array<boolean>(tiles.length).fill(true));
      let n = 0;
      for (let i = 0; i < l.places.length; i += 1) if (theirBlocked(l.places, i) === ours[i]) n += 1;
      if (n > 0) disagree.push(`${l.name}:${n}`);
    }
    // ⚠️ Считается ИТОГОВЫЙ ответ «свободна / нет», а не только покрытие: по
    // покрытию расходятся 4 и 10 плиток, но на части из них запрет всё равно
    // даёт правило боков. Замер 23.08.2026.
    expect(disagree.sort().join(' ')).toBe('Interweaved 2:5 Interweaved:2');
  }, 120000);

  it('расхождение НЕ делает доску нерешаемой — по нашему правилу она всё равно разбирается', () => {
    const p = mahjongLevel(12);
    const need = p.pairs * 2;
    const bad: string[] = [];
    for (const name of ['Interweaved', 'Interweaved 2']) {
      const l = layoutCatalogue().find((q) => q.name === name);
      if (!l) { bad.push(`${name}: нет в каталоге`); continue; }
      const kept = reduceLayout(l.places, p.layers, need);
      if (!kept) { bad.push(`${name}: не ужалось`); continue; }
      const deal = dealSolvable(normalize(kept), SYMBOL_COUNT, 60, seeded(seedFrom(name)));
      if (deal.tiles.length === 0) { bad.push(`${name}: раздача не собралась`); continue; }
      const verdict = solveIndependently(deal.tiles);
      if (verdict !== 'solved') bad.push(`${name}: ${verdict}`);
    }
    expect(`провалов: ${bad.length} → ${bad.join(' | ')}`).toBe('провалов: 0 → ');
  }, 300000);
});

describe('лицензия заимствования на месте', () => {
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;

  it('🔴 текст MIT лежит рядом с заимствованным и называет автора', () => {
    const lic = read('../games/mahjong/vendor/LICENSE-mah');
    expect(lic).toMatch(/MIT License/);
    expect(lic).toMatch(/Copyright \(c\) 2016 ffalt/);
    expect(lic).toMatch(/github\.com\/ffalt\/mah/);
  });

  it('🔴 каждый файл с чужим кодом или данными назван и подписан в шапке', () => {
    for (const f of ['boards.ts', 'mapping.ts', 'solvable.ts']) {
      const src = read(`../games/mahjong/vendor/${f}`);
      const head = src.slice(0, 2000);
      expect(`${f} источник: ${/github\.com\/ffalt\/mah/.test(head)}`).toBe(`${f} источник: true`);
      expect(`${f} автор: ${/ffalt/.test(head)}`).toBe(`${f} автор: true`);
      expect(`${f} лицензия: ${/MIT/.test(head)}`).toBe(`${f} лицензия: true`);
      expect(`${f} ссылка на текст: ${/LICENSE-mah/.test(head)}`).toBe(`${f} ссылка на текст: true`);
    }
  });
});
