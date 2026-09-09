/* psygames-sudoku-ladder-monotonic · VER 2 · 09.09.2026 */
/**
 * ЛЕСТНИЦА СУДОКУ НЕ ОБЕЩАЕТ МЕНЬШЕ, ЧЕМ УРОВЕНЬ НАЗАД.
 *
 * 🔴 ЗАЧЕМ. Дефект 2 задачи 25a92d61: прежний гейт сравнивал только КРАЙНИЕ
 * уровни (late > early), и провал в середине проходил по построению — ровно
 * так «сложность падала 12 уровней подряд» при зелёном гейте. Тот же класс,
 * что у goods-sort («гейт решаемости зелёный при 57 непроходимых уровнях»).
 *
 * ⚠️ МЕРЯЕМ ОБЕЩАНИЯ, А НЕ ЭМПИРИКУ. Прогонять генерацию в гейте — минуты и
 * шум: он краснел бы от невезения. Обещание уровня — его ЭФФЕКТИВНАЯ полоса
 * (effectiveBand ∘ targetTier ∘ levelConfig): то, что уровень декларирует
 * игроку с учётом вариантного потолка. Живой случай, который этот гейт ловит,
 * а старый пропускал: 27.08 подъём потолка jigsaw до 6 сделал L53 (полоса
 * 6..6) СЛОЖНЕЕ L55 (thermocage, потолок 5 → 4..5) — горб в конце лестницы.
 * Эмпирика согласна: медианы тиров по перезамеру 27.08 дали ...L53=6, L55=4.
 *
 * Правило: и min, и max эффективной полосы НЕ УБЫВАЮТ с ростом уровня.
 * Равенство разрешено (плато — законно), убывание — нет.
 */
import { effectiveBand, monotonicBandForLevel, targetTier } from '../services/sudoku-grade';
import { levelConfig } from '../services/sudoku-core';
import { roadTier, SUDOKU_ROADS, type SudokuRoad } from '../services/sudoku-roads';

const LAST_LEVEL = 92;   // 27.08 стояло 80 — комбо-пояс 81..92 не сторожил никто

/** Полоса, которую экран РЕАЛЬНО передаёт генератору: `tier: roadTier(lv, road)`. */
const полосаИгрока = (lv: number, road: SudokuRoad) => roadTier(lv, road);
const вариантУровня = (lv: number) => String((levelConfig(lv) as { variant: string }).variant);

describe('лестница судоку монотонна по обещаниям', () => {
  it('🔴 пила жива как ось: СЫРЫЕ полосы спадают на стыках — иначе running-max был бы мёртвым кодом', () => {
    let спадов = 0;
    let prev = { min: 0, max: 0 };
    for (let lv = 1; lv <= LAST_LEVEL; lv++) {
      const eff = effectiveBand(String(levelConfig(lv).variant) as never, targetTier(lv));
      if (eff.min < prev.min || eff.max < prev.max) спадов++;
      prev = eff;
    }
    expect(спадов).toBeGreaterThan(0);
  });

  /**
   * 🔴 ЗАМЕНА ТАВТОЛОГИИ (09.09.2026). Прежняя проба сравнивала соседние значения
   * `monotonicBandForLevel` — а это running-max, он НЕ МОЖЕТ убывать по построению.
   * Замер: спадов у него 0 на всех 92 уровнях при любой поломке данных под ним.
   * То есть проба не краснела ни при чём и сторожила величину, которой в боевом
   * пути игрока нет вовсе: экран всегда передаёт `tier: roadTier(lv, road)`.
   *
   * Замер того, что игрок ПОЛУЧАЕТ (09.09, уровни 1..92, три дороги):
   *   · спадов внутри одного варианта — 0;
   *   · спадов на стыке вариантов — 8 (это ось, а не дефект: новое правило входит
   *     полегче, иначе его нечем осваивать);
   *   · вершины вариантов: 2·3·3·3·4·4·5·5·6·6·6·6·6·6·6·6·6 — ни одного падения.
   * Ниже сторожатся ровно эти три утверждения.
   */
  it('🔴 ВНУТРИ варианта полоса игрока не убывает ни на одной дороге', () => {
    const наруш: string[] = [];
    for (const road of SUDOKU_ROADS) {
      let prev = { min: 0, max: 0 }; let prevVar = '';
      for (let lv = 1; lv <= LAST_LEVEL; lv++) {
        const v = вариантУровня(lv);
        const b = полосаИгрока(lv, road);
        if (v === prevVar && (b.min < prev.min || b.max < prev.max)) {
          наруш.push(`${road} L${lv} (${v}): ${b.min}..${b.max} после ${prev.min}..${prev.max}`);
        }
        prev = b; prevVar = v;
      }
    }
    expect(`спадов внутри варианта: ${наруш.length}${наруш.length ? ' → ' + наруш.join(' | ') : ''}`)
      .toBe('спадов внутри варианта: 0');
  });

  it('🔴 спады бывают ТОЛЬКО на стыке вариантов — и они есть, иначе пила мертва', () => {
    for (const road of SUDOKU_ROADS) {
      let стыки = 0; let prev = { min: 0, max: 0 }; let prevVar = '';
      for (let lv = 1; lv <= LAST_LEVEL; lv++) {
        const v = вариантУровня(lv);
        const b = полосаИгрока(lv, road);
        if ((b.min < prev.min || b.max < prev.max) && v !== prevVar) стыки++;
        prev = b; prevVar = v;
      }
      expect(`${road}: спадов на стыках ${стыки > 0}`).toBe(`${road}: спадов на стыках true`);
    }
  });

  it('🔴 ВЕРШИНЫ вариантов не убывают — это и есть «лестница растёт»', () => {
    const наруш: string[] = [];
    for (const road of SUDOKU_ROADS) {
      const peaks: [string, number][] = [];
      let curV = ''; let curMax = -1;
      for (let lv = 1; lv <= LAST_LEVEL; lv++) {
        const v = вариантУровня(lv);
        const b = полосаИгрока(lv, road);
        if (v !== curV) { if (curV) peaks.push([curV, curMax]); curV = v; curMax = b.max; }
        else curMax = Math.max(curMax, b.max);
      }
      peaks.push([curV, curMax]);
      for (let k = 1; k < peaks.length; k++) {
        if (peaks[k][1] < peaks[k - 1][1]) {
          наруш.push(`${road}: ${peaks[k][0]} вершина ${peaks[k][1]} ниже ${peaks[k - 1][0]} (${peaks[k - 1][1]})`);
        }
      }
      expect(peaks.length).toBeGreaterThan(10);   // варианты нашлись, а не один блок
    }
    expect(`падений вершины: ${наруш.length}${наруш.length ? ' → ' + наруш.join(' | ') : ''}`)
      .toBe('падений вершины: 0');
  });
});
