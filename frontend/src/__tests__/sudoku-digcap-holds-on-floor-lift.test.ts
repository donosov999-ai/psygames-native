/* psygames-sudoku-digcap-holds-on-floor-lift · VER 1 · 08.10.2026 · psygames-sudoku-claude-mac */
/**
 * ЛИМИТ КОПАНИЯ СТУПЕНИ ДЕРЖИТ И ПОДЪЁМ К ПОЛУ ПОЛОСЫ.
 *
 * `generateLogical` копает доску с лимитом ступени (`digCap`), а если лучшая доска ниже пола
 * полосы — докапывает её `digToFloor`. Подъём к полу лимита не знал и копал дальше: раздел уровней
 * 08.10 (выгрузка claude/release-2.56.20) — киллер 163 и 164 при digCap 70 дали 71, 73 и 78 пустых.
 * Теперь лимит — одна функция `digLimit` для всех, кто копает. Проба ставит недостижимый пол
 * (полоса 6–6), чтобы подъём к полу шёл всегда, и сверяет глубину доски с лимитом.
 */
import { digLimit, digToFloor, generateLogical } from '@/src/services/sudoku-grade';
import { generatePuzzle } from '@/src/services/sudoku-core';

jest.setTimeout(240000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const blanksOf = (p: number[][]) => p.flat().filter((v) => v === 0).length;

let spy: jest.SpyInstance;
beforeEach(() => { spy = jest.spyOn(Math, 'random').mockImplementation(seeded(163)); });
afterEach(() => spy.mockRestore());

describe('digToFloor', () => {
  it('🔴 доска уже на лимите — ни одной клетки сверх', () => {
    const gen = generatePuzzle(40, 9, 3, 3, 'none');
    const at = blanksOf(gen.puzzle);
    const r = digToFloor(gen, 9, 3, 3, 'none', 6, 6, undefined, at);
    expect(r.dug).toBe(0);
    expect(blanksOf(r.gen.puzzle)).toBe(at);
  });

  it('лимит на три клетки глубже — копает не больше трёх; без лимита копает дальше (контроль)', () => {
    const gen = generatePuzzle(40, 9, 3, 3, 'none');
    const at = blanksOf(gen.puzzle);
    expect(blanksOf(digToFloor(gen, 9, 3, 3, 'none', 6, 6, undefined, at + 3).gen.puzzle)).toBeLessThanOrEqual(at + 3);
    expect(blanksOf(digToFloor(gen, 9, 3, 3, 'none', 6, 6).gen.puzzle)).toBeGreaterThan(at + 3);
  });
});

describe('generateLogical: подъём к полу не глубже лимита ступени', () => {
  it('одна формула лимита: новички — blanksCap, 9×9 — digCap или общий, другие сетки — вся доска', () => {
    expect(digLimit(5, 34, 9, 70)).toBe(34);
    expect(digLimit(163, 58, 9, 70)).toBe(70);
    expect(digLimit(163, 58, 9)).toBe(64);
    expect(digLimit(20, 20, 6)).toBe(36);
  });

  // logic: false — запасной путь (генератор ядра → потолок → подъём к полу); он тоже копал мимо
  // лимита — и первым копанием (`generatePuzzle(blanksCap)`), и подъёмом. Мутация «запасной путь без
  // лимита» выжила на первой редакции пробы, пока этого случая не было.
  it.each([['killer', 60, true], ['none', 52, true], ['none', 52, false]] as const)('🔴 %s, digCap %d, логический путь %s, недостижимый пол 6–6', (variant, cap, logic) => {
    for (let i = 0; i < 4; i++) {
      const b = generateLogical(163, 58, 9, 3, 3, variant, { budgetMs: 3000, digCap: cap, tier: { min: 6, max: 6 }, logic });
      expect(`доска ${i}: пустых ${blanksOf(b.gen.puzzle)} ≤ ${cap}`).toBe(`доска ${i}: пустых ${Math.min(blanksOf(b.gen.puzzle), cap)} ≤ ${cap}`);
    }
  });
});
