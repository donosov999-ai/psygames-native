/* psygames-sudoku-lives · VER 1 · 01.10.2026 */
/**
 * 🔴 ЦЕНА ОШИБКИ — ОСЬ СТУПЕНИ (задача 1fa57de3, решение Дениса 30.09 «Берём»).
 *
 * До 01.10 лимит был 3 ошибки на всех 92 ступенях и почти не стрелял (замер 09.09: сработал
 * 1 раз из 46 партий, только на ступенях 1–10). Теперь лимит — поле ступени и убывает к
 * верху; веб читает его из roadLevelConfig, натив — из выгрузки лестницы
 * (flutter/assets/levels/sudoku-ladder.json, сверяет sudoku-native-boards-drift.test.ts).
 */
import { levelConfig, livesFor } from '@/src/services/sudoku-core';
import { roadLevelConfig } from '@/src/services/sudoku-roads';

const LAST = 92;
// Ступени, где лимит поднят решением Дениса поверх оси, — каждая с причиной. 76: 08.10, Валя застряла
// (04.10 четыре проигрыша, три из них за ~70 с — ошибки пальцем на самой трудной доске банка).
const RAISED: Record<number, number> = { 76: 3 };

describe('цена ошибки по ступеням', () => {
  it('не растёт к верху лестницы и не бывает меньше одной', () => {
    // Ось без поднятых ступеней: поднятая читается как соседняя снизу.
    const axis = (lv: number): number => (lv in RAISED ? axis(lv - 1) : livesFor(lv));
    for (let lv = 2; lv <= LAST; lv++) {
      expect(axis(lv)).toBeLessThanOrEqual(axis(lv - 1));
      expect(livesFor(lv)).toBeGreaterThanOrEqual(1);
    }
    for (const [lv, n] of Object.entries(RAISED)) expect(livesFor(Number(lv))).toBe(n);
  });

  it('ось действительно есть: на входе прощает больше, чем наверху', () => {
    expect(livesFor(1)).toBeGreaterThan(livesFor(LAST));
    expect(new Set(Array.from({ length: LAST }, (_, i) => livesFor(i + 1))).size).toBeGreaterThanOrEqual(4);
  });

  it('levelConfig несёт лимит ступени', () => {
    for (let lv = 1; lv <= LAST; lv++) expect(levelConfig(lv).lives).toBe(livesFor(lv));
  });

  it('дорога сдвигает лимит как подсказку: полегче +1, пожёстче −1, но не ниже одной', () => {
    for (let lv = 1; lv <= LAST; lv++) {
      const base = levelConfig(lv).lives;
      expect(roadLevelConfig(lv, 'easy').lives).toBe(base + 1);
      expect(roadLevelConfig(lv, 'hard').lives).toBe(Math.max(1, base - 1));
      expect(roadLevelConfig(lv, 'normal').lives).toBe(base);
    }
  });
});
