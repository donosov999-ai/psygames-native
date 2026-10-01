/* psygames-water-sort-ladder-slope · VER 2 · 30.09.2026 */
/**
 * 🔴 ЛЕСТНИЦА СОСУДОВ РАСТЁТ ТРУДНОСТЬЮ, А НЕ СТОИТ ПЛАТО.
 *
 * 📍 ЧТО БЫЛО (замер 30.09.2026 по `flutter/assets/levels/sort_tubes.json`). С L33
 * по L60 — 28 ступеней с одной и той же настройкой доски, и трудность по ним
 * скакала СЛУЧАЙНО: развилок со смертью (положений, где любой ход не годится, а
 * ошибка стоит партии) L32 — 68, L35 — 30, L44 — 46, L56 — 38. Генератор брал
 * первую решаемую раздачу, а раздачи одной ступени различаются по этой мере
 * больше чем вдвое (у десяти раздач L47 — от 30 до 68).
 *
 * РЕШЕНИЕ ДЕНИСА 30.09.2026, путь D: отбор. На ступень раздаётся несколько
 * вариантов, берётся ближайший к цели лестницы (`export-levels.gen.ts`).
 *
 * ⚠️ ПРОБА СМОТРИТ ФАЙЛ, КОТОРЫЙ ЕДЕТ В СБОРКУ, И ПЕРЕСЧИТЫВАЕТ ВЫБОРОЧНО. Числа
 * развилок записаны выгрузкой — им нельзя верить на слово, поэтому на трёх
 * ступенях они считаются заново правилами игры и обязаны совпасть до единицы.
 */
import { levelMoveReference, levelParams, moveLimitFor, solve } from '@/src/games/water-sort/core/generate';
import { скрытоНаУровне, звёздыПоХодам } from '@/src/games/water-sort/core/hidden';
import { deathForks, solutionWithin } from '@/src/games/water-sort/core/difficulty';
import type { Field } from '@/src/games/water-sort/core/tubes';

declare function require(id: string): any;
declare const __dirname: string;

type LevelEntry = {
  level: number; field: Field; colors: number; empty: number; minMoves: number;
  moveLimit: number; reference: number; hiddenLevel: boolean; starsByMoves: boolean;
  forks: number; forksTarget: number; candidates: number; provenMoves: number | null;
};

const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../flutter/assets/levels/sort_tubes.json'), 'utf8',
)) as { difficulty?: { from: number; plateauFrom: number }; levels: LevelEntry[] };
const L = data.levels;
/** На сколько развилок следующая ступень вправе быть легче: отбор бьёт в цель ±2. */
const DIP_TOLERANCE = 3;

/** Ранговая корреляция Спирмена: растёт ли мера вместе с номером ступени. */
function spearman(xs: number[], ys: number[]): number {
  const ranks = (a: number[]) => {
    const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = Array(a.length).fill(0);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j += 1;
      for (let k = i; k <= j; k += 1) r[idx[k]![1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs), ry = ranks(ys);
  const mx = rx.reduce((s, v) => s + v, 0) / rx.length, my = ry.reduce((s, v) => s + v, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i += 1) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

describe('лестница сосудов: трудность растёт', () => {
  it('есть что проверять — выгрузка с мерой и все 60 ступеней', () => {
    expect(L.length).toBe(60);
    expect(data.difficulty).toBeDefined();
    const missing = L.filter((s) => typeof s.forks !== 'number');
    expect(missing.map((s) => s.level)).toEqual([]);
  });

  it('🔴 параметры ступеней — ровно те, что даёт ядро игры', () => {
    // Выгрузка обязана делать ТЕ ЖЕ уровни, отбирая только раздачу.
    const problems: string[] = [];
    for (const s of L) {
      const p = levelParams(s.level);
      const expected = {
        colors: p.colors, empty: p.empty, minMoves: p.minMoves, moveLimit: moveLimitFor(s.level),
        reference: levelMoveReference(s.level), hiddenLevel: скрытоНаУровне(s.level), starsByMoves: звёздыПоХодам(s.level),
      };
      for (const [k, v] of Object.entries(expected)) {
        if ((s as unknown as Record<string, unknown>)[k] !== v) problems.push(`L${s.level} ${k}: в файле ${(s as unknown as Record<string, unknown>)[k]}, у ядра ${v}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('🔴 мера растёт вместе с номером ступени', () => {
    const fromLevel = data.difficulty!.from;
    const inRange = L.filter((s) => s.level >= fromLevel);
    const r = spearman(inRange.map((s) => s.level), inRange.map((s) => s.forks));
    console.log(`РАЗВИЛКИ ПО ЛЕСТНИЦЕ: ${L.map((s) => s.forks).join(' ')} · Спирмен с L${fromLevel}: ${r.toFixed(3)}`);
    expect(r).toBeGreaterThanOrEqual(0.9);
  });

  /**
   * 🔴 ПРОВАЛОВ НЕТ: СЛЕДУЮЩАЯ СТУПЕНЬ НЕ ЛЕГЧЕ ПРЕДЫДУЩЕЙ БОЛЬШЕ ЧЕМ НА ДОПУСК.
   *
   * 📍 Заведено по первой выгрузке 30.09.2026: на верхних ступенях цели 62–65
   * оказались не по силам тридцати раздачам, и отбор взял «ближайшую к цели»,
   * не глядя на соседа: L58 — 68 развилок, L59 — 55. Ранговая корреляция при этом
   * была хорошей — она про тренд, а человек проходит ступени ПОДРЯД.
   */
  it('🔴 провалов нет: ступень не легче предыдущей больше чем на допуск', () => {
    const fromLevel = data.difficulty!.from;
    const dips: string[] = [];
    for (let i = 1; i < L.length; i += 1) {
      const a = L[i - 1]!, b = L[i]!;
      if (b.level > fromLevel && b.forks < a.forks - DIP_TOLERANCE) dips.push(`L${a.level}→L${b.level}: ${a.forks} → ${b.forks}`);
    }
    expect(dips).toEqual([]);
  });

  it('🔴 хвост L33–L60 больше не плато: верх заметно труднее низа', () => {
    const tail = L.filter((s) => s.level >= 33);
    const distinct = new Set(tail.map((s) => s.forks)).size;
    const bottom = tail.slice(0, 5).map((s) => s.forks), top = tail.slice(-5).map((s) => s.forks);
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
    console.log(`ХВОСТ: различных значений ${distinct} из ${tail.length} · медиана L33–37 ${med(bottom)} · L56–60 ${med(top)}`);
    expect(med(top) - med(bottom)).toBeGreaterThanOrEqual(15);
    expect(distinct).toBeGreaterThanOrEqual(15);
  });

  it('🔴 на уровнях с лимитом ходов решение под лимитом ДОКАЗАНО', () => {
    const problems = L.filter((s) => s.moveLimit > 0 && (s.provenMoves === null || s.provenMoves > s.moveLimit))
      .map((s) => `L${s.level}: лимит ${s.moveLimit}, найдено ${s.provenMoves}`);
    expect(problems).toEqual([]);
  });

  it('🔴 записанные числа — правда: пересчёт на трёх ступенях', () => {
    for (const n of [14, 33, 60]) {
      const s = L[n - 1]!;
      const r = solve(s.field, 300000);
      expect(`L${n}: ${r.outcome}`).toBe(`L${n}: solved`);
      expect(`L${n}: развилок ${deathForks(s.field, r.moves)}`).toBe(`L${n}: развилок ${s.forks}`);
      if (s.moveLimit > 0) {
        expect(`L${n}: луч ${solutionWithin(s.field, s.moveLimit)}`).toBe(`L${n}: луч ${s.provenMoves}`);
      }
    }
  }, 180000);
});
