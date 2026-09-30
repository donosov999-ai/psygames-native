/**
 * 🔴 ПРОИГРАЛ — НОВАЯ ДОСКА, А НЕ ТА ЖЕ САМАЯ (решение Дениса 23.09.2026).
 *
 * ЗАМЕР, ИЗ-ЗА КОТОРОГО ЭТО ПОЯВИЛОСЬ. На поясе банка (уровни 58–80) зерно доски
 * складывалось из профиля и уровня — и только. Значит проигранный уровень раздавал
 * ОДНУ И ТУ ЖЕ доску сколько угодно раз: в полосе 6.7 (уровни 64–65) лежит сорок
 * досок, а человек видел одну. Денис заметил это на 64–65 и сказал: новая доска на
 * каждую попытку.
 *
 * ⚠️ И ГЛАВНОЕ ОГРАНИЧЕНИЕ, без которого правка ломает живых людей: попытка 0 обязана
 * давать ПРЕЖНЮЮ доску. Незаконченная партия (`services/resume`) хранит ходы, а не саму
 * доску: смени зерно — и у всех, кто сейчас в середине уровня, доска поменяется под
 * рукой, а ходы лягут на чужие клетки.
 */
import { bankBoardForLevel, bankPickForLevel, bankRatingForLevel, bankPool } from '@/src/services/sudoku-bank';

const key = (b: number[][]): string => b.map((r) => r.join('')).join('');

describe('банк: номер попытки в зерне', () => {
  it('🔴 попытка 0 — доска ровно та же, что была до правки', () => {
    for (const lv of [58, 64, 65, 72, 80]) {
      const было = bankBoardForLevel(lv, 'профиль-вали');
      const стало = bankBoardForLevel(lv, 'профиль-вали', 0, 0);
      expect(key(стало.puzzle)).toBe(key(было.puzzle));
    }
  });

  it('🔴 вторая попытка того же уровня даёт ДРУГУЮ доску', () => {
    for (const lv of [64, 65]) {
      const первая = key(bankBoardForLevel(lv, 'профиль-вали', 0, 0).puzzle);
      const вторая = key(bankBoardForLevel(lv, 'профиль-вали', 0, 1).puzzle);
      expect(вторая).not.toBe(первая);
    }
  });

  it('🔴 трудность при этом НЕ меняется: та же полоса банка', () => {
    for (const lv of [64, 65, 72]) {
      const ожидаемая = bankRatingForLevel(lv);
      for (let a = 0; a < 10; a++) {
        expect(bankPickForLevel(lv, 'профиль-вали', 0, a).rating).toBeCloseTo(ожидаемая, 5);
      }
    }
  });

  it('🔴 сорок досок полосы начинают ходить, а не одна', () => {
    const lv = 64;
    const размерПолосы = bankPool(bankRatingForLevel(lv)).length;
    expect(размерПолосы).toBe(40);
    const видано = new Set<string>();
    for (let a = 0; a < 40; a++) видано.add(key(bankBoardForLevel(lv, 'профиль-вали', 0, a).puzzle));
    // Жребий не обязан обойти все сорок за сорок попыток (повторы неизбежны),
    // но одна доска на сорок попыток — это ровно тот дефект, что чинится.
    expect(видано.size).toBeGreaterThan(15);
  });

  it('попытка у каждого игрока своя: тот же номер попытки — разные доски', () => {
    const а = key(bankBoardForLevel(64, 'валя', 0, 3).puzzle);
    const б = key(bankBoardForLevel(64, 'денис', 0, 3).puzzle);
    expect(а).not.toBe(б);
  });

  it('дробный и отрицательный номер попытки не роняют раздачу', () => {
    expect(() => bankBoardForLevel(64, 'валя', 0, -5)).not.toThrow();
    expect(key(bankBoardForLevel(64, 'валя', 0, -5).puzzle))
      .toBe(key(bankBoardForLevel(64, 'валя', 0, 0).puzzle));
    expect(() => bankBoardForLevel(64, 'валя', 0, 2.7)).not.toThrow();
  });
});
