/* ВРЕМЕННЫЙ ЗОНД: ОТКУДА РАЗБРОС В ЗАМЕРАХ — не гейт, удалить после ответа. 06.09.2026 */
/**
 * ПОЧЕМУ ОН ЕСТЬ. Два замера одной и той же вещи разошлись втрое:
 *   ТЗ 06.09.2026 (30 партий, случайная игра): L28 — 60 %, L40 — 53 %;
 *   `stuck.ts` 05.09.2026 (200 партий, случайная игра): L30 — 10 %, L40 — 26 %.
 * Мой прогон тем же порядком замера, что у `stuck.ts`, дал L28 17 %, L40 27 % — то
 * есть сошёлся со вторым и не сошёлся с первым.
 *
 * Прежде чем объявлять чью-то цифру неверной, надо найти схему замера, дающую
 * 60/53. Зонд перебирает правдоподобные различия по одному.
 */
import { generateDeal, SYMBOLS } from '@/app/games/mahjong';
import { availablePairs, freeFlags, type Tile } from '@/src/games/mahjong/board';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel, shufflesLeft } from '@/src/services/mahjongLevels';
import { dealSolvable } from '@/src/games/mahjong/vendor/solvable';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function movesOf(tiles: Tile[]): [number, number][] {
  const free = freeFlags(tiles, new Array(tiles.length).fill(true));
  const by = new Map<number, number[]>();
  for (let i = 0; i < tiles.length; i += 1) {
    if (!free[i]) continue;
    const a = by.get((tiles[i] as Tile).symbol);
    if (a) a.push(i); else by.set((tiles[i] as Tile).symbol, [i]);
  }
  const out: [number, number][] = [];
  for (const idx of by.values()) for (let a = 0; a < idx.length; a += 1) for (let b = a + 1; b < idx.length; b += 1) out.push([idx[a] as number, idx[b] as number]);
  return out;
}
const без = (t: Tile[], a: number, b: number) => t.filter((_, i) => i !== a && i !== b);
const pos = (t: Tile[]) => t.map((x) => ({ x: x.x, y: x.y, layer: x.layer }));

interface Опции { отмены: number; считатьЛюбойСтопор: boolean; тасовать: boolean; сеятьТасовку: boolean }

function партия(L: number, seed: number, o: Опции): boolean {
  const p = mahjongLevel(L);
  const places = layoutForLevel(L)?.places;
  const r = rng(seed * 7919 + L);
  let tiles: Tile[] = generateDeal(p.layers, p.pairs, p.cols, silhouetteForLevel(L), places, r).tiles;
  const лента: Tile[][] = [];
  let перетасовок = 0; let отмен = 0; let страж = 0;
  while (tiles.length > 0 && страж < 400) {
    страж += 1;
    const ходы = movesOf(tiles);
    if (ходы.length > 0) {
      const [a, b] = ходы[Math.floor(r() * ходы.length)] as [number, number];
      лента.push(tiles); if (лента.length > o.отмены + 1) лента.shift();
      tiles = без(tiles, a, b); continue;
    }
    // доска встала
    if (o.считатьЛюбойСтопор) return true;
    // 🔴 ВОТ ОНО. Четвёртый параметр `dealSolvable` по умолчанию — глобальный
    // Math.random, то есть КАЖДАЯ перетасовка невоспроизводима. Здесь его можно
    // подать сеятелем партии и увидеть разницу.
    const сеятель = o.сеятьТасовку ? r : undefined;
    const мочьТасовать = o.тасовать && shufflesLeft(p.shuffles, перетасовок) !== 0
      && dealSolvable(pos(tiles), SYMBOLS.length, 20, сеятель as never).tiles.length > 0;
    if (мочьТасовать) {
      const d = dealSolvable(pos(tiles), SYMBOLS.length, 20, сеятель as never);
      перетасовок += 1;
      tiles = pos(tiles).map((q, i) => ({ id: i, x: q.x, y: q.y, layer: q.layer, symbol: (d.tiles[i] as Tile).symbol }));
      лента.length = 0; continue;
    }
    if (лента.length > 0 && отмен < o.отмены) { отмен += 1; tiles = лента.pop() as Tile[]; continue; }
    return true;                       // насмерть
  }
  return false;
}

jest.setTimeout(600_000);
const N = 30;
const ПОВТОРОВ = 6;
const УР = [28, 40];
const БАЗА: Опции = { отмены: 3, считатьЛюбойСтопор: false, тасовать: true, сеятьТасовку: false };

/** Один прогон схемы: доля вставших насмерть из N партий. */
const прогон = (L: number, o: Опции, сдвиг: number) => {
  let c = 0;
  for (let s = 1; s <= N; s += 1) if (партия(L, s + сдвиг, o)) c += 1;
  return c;
};

/** По требованию: `MAHJONG_PROBE=1 npx jest src/__tests__/mahjong-protocol-probe.test.ts` */
const проба = process.env.MAHJONG_PROBE ? it : it.skip;

проба('🔴 разброс прогона: тасовка идёт по ГЛОБАЛЬНОМУ Math.random', () => {
  const строки: string[] = [];
  for (const [имя, o, сдвигать] of [
    ['тасовка от Math.random (как сейчас)', { ...БАЗА, сеятьТасовку: false }, false],
    ['тасовка от сеятеля партии', { ...БАЗА, сеятьТасовку: true }, false],
    ['тасовка от сеятеля, РАЗНЫЕ партии', { ...БАЗА, сеятьТасовку: true }, true],
  ] as [string, Опции, boolean][]) {
    for (const L of УР) {
      const р: number[] = [];
      for (let i = 0; i < ПОВТОРОВ; i += 1) р.push(прогон(L, o, сдвигать ? i * 1000 : 0));
      const проц = р.map((x) => Math.round((x / N) * 100));
      строки.push(`${имя.padEnd(36)} L${L}: ${проц.map((x) => `${x}%`.padStart(4)).join(' ')}  → разброс ${Math.min(...проц)}…${Math.max(...проц)}%`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n${ПОВТОРОВ} ПОВТОРОВ ОДНОГО И ТОГО ЖЕ ПРОГОНА (${N} партий, случайная игра):\n${строки.join('\n')}\n`);
  expect(строки.length).toBe(6);
});
