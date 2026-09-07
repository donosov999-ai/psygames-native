/* __tests__/counter-ladder · VER 2 · 07.09.2026 */
/**
 * ГЕЙТ продления лестницы «Счётчика» (07.09.2026). Замер ДО: единственная
 * ЗДОРОВАЯ лестница раздела (рост ×1,09–1,38 на всех L1–15 без клонов), дефект
 * один — L16+ были клонами L15 (конец таблицы). v2: за таблицей ось скорости
 * продолжается формулой до пола 4 с (L20). Размер сетки — предел вёрстки:
 * 9 колонок на 360 px ≈ 34 px клетка при пороге нажатия 48 px.
 * Индекс трудности = size² / limitSec (модель замера ДО).
 */
import { levelParams, COUNTER_MAX_LEVEL } from '@/app/games/counter';

const work = (L: number) => {
  const p = levelParams(L);
  return (p.gridSize * p.gridSize) / (p.roundLimitMs / 1000);
};

describe('лестница counter v2 (продление за таблицей, 07.09.2026)', () => {
  test('[G1] скачки ≤ ×1,5 на всём пути 1..20', () => {
    const bad: string[] = [];
    for (let L = 2; L <= COUNTER_MAX_LEVEL; L++) {
      const jump = work(L) / work(L - 1);
      if (jump > 1.5) bad.push(`L${L - 1}→L${L}: ×${jump.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  test('[G2] клоны конца таблицы ушли: рост живой до L20, пол скорости на L20', () => {
    for (let L = 16; L <= 20; L++) expect(work(L)).toBeGreaterThan(work(L - 1) * 1.02);
    expect(levelParams(20).roundLimitMs).toBe(4000);
    expect(levelParams(21).roundLimitMs).toBe(4000);   // дальше пол — до оси «тройки» (реф, хвост)
  });

  test('[G3] слепок: таблица L1-15 не тронута, сетка за таблицей не растёт (вёрстка-предел)', () => {
    expect(levelParams(1)).toEqual({ gridSize: 3, roundLimitMs: 15000, rounds: 10, cellMax: 9 });
    expect(levelParams(15)).toEqual({ gridSize: 9, roundLimitMs: 6000, rounds: 10, cellMax: 9 });
    expect(levelParams(16)).toEqual({ gridSize: 9, roundLimitMs: 5600, rounds: 10, cellMax: 9 });
    for (let L = 16; L <= 30; L++) expect(levelParams(L).gridSize).toBe(9);
  });

  test('[G4] потолка НЕТ (§R, 07.09): за полом скорости рост несут ЧИСЛА клеток', () => {
    expect(levelParams(20).cellMax).toBe(9);
    expect(levelParams(21).cellMax).toBe(11);
    for (const L of [22, 25, 30, 40, 60]) {
      expect(levelParams(L).cellMax).toBeGreaterThan(levelParams(L - 1).cellMax);
    }
  });
});
