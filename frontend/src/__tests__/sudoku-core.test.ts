/**
 * Судоку-ядро: единственность решения (v1.111.0, баг-репорт Вали 2026-07-05) +
 * реальный кейс с её скриншота как регресс-фикстура.
 */
import { generatePuzzle, countSolutions, levelConfig } from '@/src/services/sudoku-core';

describe('levelConfig — варианты по лесенке', () => {
  it('Ур.15 — анти-конь, Ур.9-13 — диагональ', () => {
    expect(levelConfig(15).variant).toBe('antiknight');
    expect(levelConfig(9).variant).toBe('diagonal');
    expect(levelConfig(5).variant).toBe('none');
  });
});

describe('generatePuzzle — решение единственно (dig-with-uniqueness)', () => {
  const check = (lv: number) => {
    const cfg = levelConfig(lv);
    const g = generatePuzzle(cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant);
    return countSolutions(g.puzzle.map(r => [...r]), cfg.N, cfg.BR, cfg.BC, cfg.variant, g.regions, 2, { steps: 200000 }, g.thermo, g.arrow);
  };
  it('Ур.15 (анти-конь, кейс Вали)', () => { expect(check(15)).toBe(1); });
  it('Ур.13 (диагональ, 58 дырок — раньше самый рискованный)', () => { expect(check(13)).toBe(1); });
  it('Ур.8 (классика 9×9)', () => { expect(check(8)).toBe(1); });
});

describe('фикстура со скриншота Вали (Ур.15): прямоугольник 2/7', () => {
  // Позиция в момент спора: без правила коня 2 решения (пары 2/7 взаимозаменяемы),
  // правило коня оставляет одно — в её клетке (r1c9) обязана быть 7.
  const G = [
    [5,0,9, 8,4,3, 1,6,0],
    [6,4,1, 9,2,7, 3,8,5],
    [8,0,3, 1,5,6, 9,4,0],
    [7,3,6, 5,8,9, 4,2,1],
    [1,9,2, 6,3,4, 7,5,8],
    [4,5,8, 7,1,2, 6,9,3],
    [2,6,5, 4,7,1, 8,3,9],
    [3,1,4, 2,9,8, 5,7,6],
    [9,8,7, 3,6,5, 2,1,4],
  ];
  it('без правила коня — двусмысленно (2 решения)', () => {
    expect(countSolutions(G.map(r => [...r]), 9, 3, 3, 'none')).toBe(2);
  });
  it('с правилом коня — единственно', () => {
    expect(countSolutions(G.map(r => [...r]), 9, 3, 3, 'antiknight')).toBe(1);
  });
});
