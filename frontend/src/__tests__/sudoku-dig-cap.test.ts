/* psygames-sudoku-dig-cap · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * ЛИМИТ КОПАНИЯ СТУПЕНИ (`digCap` в levelConfig) — ось трудности внутри блока у правил-подсказок
 * (X-суммы, малый киллер), по просьбе раздела уровней (журнал d2d7ebe8).
 *
 * Предложенный сперва рычаг «меньше подсказок правила» замер 07.10 ОПРОВЕРГ: X-суммы 12 → 6 сумм —
 * цена вывода 125 → 115, малый киллер 10 → 5 диагоналей — 145 → 127, ступень 4 везде (копание
 * добирает своё). Живой — лимит копания: все доски упирались в общие 64 пустых; 64 → 70 даёт цену
 * X-сумм 129 → 151, малого киллера 145 → 159 (8 досок; к 76 насыщается — 156 / 163).
 * Гейт держит механизм: лимит соблюдается, поднятый лимит копает глубже, без поля — прежние 64.
 */
import { levelConfig } from '@/src/services/sudoku-core';
import { generateLogical } from '@/src/services/sudoku-grade';

jest.setTimeout(120000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const blanksOf = (p: number[][]) => p.flat().filter((v) => v === 0).length;

function boards(digCap: number | undefined, seed: number) {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(seed));
  const out = Array.from({ length: 4 }, () => generateLogical(129, 81, 9, 3, 3, 'xsums', { budgetMs: 4000, tier: { min: 4, max: 6 }, digCap }));
  spy.mockRestore();
  return out;
}

describe('лимит копания ступени', () => {
  it('без поля на ступени — общий лимит 64', () => {
    // 07.10.2026: ступень «без поля» ищется, а не берётся номером — 129 была пустой, пока #256 не поставил
    // туда X-суммы с лимитом 70 (лестница 120 → 132).
    const безПоля = Array.from({ length: 132 }, (_, i) => i + 1).find((n) => levelConfig(n).digCap === undefined);
    expect(безПоля).toBeDefined();
    expect(levelConfig(безПоля!).digCap).toBeUndefined();
    for (const b of boards(undefined, 7)) expect(blanksOf(b.gen.puzzle)).toBeLessThanOrEqual(64);
  });

  it('🔴 лимит соблюдается, а поднятый копает глубже', () => {
    const low = boards(60, 11), high = boards(70, 11);
    for (const b of low) expect(blanksOf(b.gen.puzzle)).toBeLessThanOrEqual(60);
    for (const b of high) expect(blanksOf(b.gen.puzzle)).toBeLessThanOrEqual(70);
    const mean = (xs: typeof low) => xs.reduce((t, b) => t + blanksOf(b.gen.puzzle), 0) / xs.length;
    expect(mean(high)).toBeGreaterThan(mean(low));
  });
});
