/**
 * ЛИМИТ ХОДОВ ОБЯЗАН ЗАКАНЧИВАТЬ ПАРТИЮ.
 *
 * 🔴 ЗАЧЕМ. Справка обещает лимит ходов с девятого уровня, и уровни с целью
 * «ходы» действительно генерируются с `moveLimit > 0`. А механики не было:
 * `advanceLevel` — единственное место, где решается «уровень кончился» —
 * звался ровно из одной точки, по достижении цели. Значит лимит проверялся
 * ТОЛЬКО у того, кто доску уже собрал, а исчерпавший ходы играл дальше без
 * конца. Замер 30.08.2026: 160 ходов при лимите 23, партия шла.
 *
 * ⚠️ Гейт зовёт `movesExhausted` — ту же функцию, что стоит в игре
 * (`outOfMoves` — четыре строки поверх неё). Своей копии условия здесь нет:
 * копия зеленела бы, даже если игру снова отвяжут от проверки.
 */
import { movesExhausted, goalMet, levelCfg, type Goal } from '@/app/games/goods-sort';

const MOVES: Goal = { kind: 'moves', limit: 23 };
const ALL: Goal = { kind: 'all' };
const FULL = [[1, 1], [2], []];      // на доске остался товар
const EMPTY = [[], [], []];          // доска собрана

describe('исчерпание лимита ходов', () => {
  it('есть что проверять: без лимита цель «ходы» не отличить от «собери всё»', () => {
    // Страховка от зелени вслепую: goalMet для 'moves' смотрит на пустоту доски,
    // то есть САМ по себе провал по ходам поймать не может — ради этого и функция.
    expect(goalMet(FULL, MOVES)).toBe(false);
    expect(goalMet(EMPTY, MOVES)).toBe(true);
  });

  it('ходы кончились, доска не собрана → партия проиграна', () => {
    expect(movesExhausted(23, 23, FULL, MOVES)).toBe(true);
    expect(movesExhausted(24, 23, FULL, MOVES)).toBe(true);
    expect(movesExhausted(160, 23, FULL, MOVES)).toBe(true);   // замер из репорта
  });

  it('ходы ещё есть → партия продолжается', () => {
    expect(movesExhausted(22, 23, FULL, MOVES)).toBe(false);
    expect(movesExhausted(0, 23, FULL, MOVES)).toBe(false);
  });

  it('собрал ровно на последнем ходу → это победа, а не провал', () => {
    expect(movesExhausted(23, 23, EMPTY, MOVES)).toBe(false);
  });

  it('уровень без лимита не заканчивается никогда по ходам', () => {
    expect(movesExhausted(999, 0, FULL, ALL)).toBe(false);
  });

  it('лимит и правда ставится — иначе проверять было бы нечего', () => {
    // Цель «ходы» появляется с 9-го уровня (clampGoalToLevel), лимит идёт с ней.
    const withLimit: number[] = [];
    for (let L = 1; L <= 60; L++) {
      const cfg = levelCfg(L, 8);
      if (cfg.moveLimit > 0) withLimit.push(L);
    }
    expect(withLimit.length).toBeGreaterThan(0);
    expect(Math.min(...withLimit)).toBeGreaterThanOrEqual(9);
    // И на каждом таком уровне лимит конечен: бесконечный лимит — это его отсутствие.
    for (const L of withLimit) expect(levelCfg(L, 8).moveLimit).toBeLessThan(1000);
  });
});
