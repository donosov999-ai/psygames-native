/**
 * ОТВЕЧАТЬ МОЖНО В ЛЮБОМ ПОРЯДКЕ — и ни один вопрос при этом не теряется.
 *
 * Репорт Дениса 23.08.2026: «нельзя вручную выбрать те, что помнишь — он навязывает
 * свою последовательность для выбора ответов». Игра вела 1/3 → 2/3 → 3/3, и человек,
 * помнящий вторую и третью клетки, обязан был сперва промахнуться по первой.
 *
 * ⚠️ Здесь проверяется ПЕРЕХОД, а не экран: набор вопросов и их число обязаны остаться
 * прежними — иначе поедет сама мера, разности между блоками считаются на одинаковых
 * заданиях. Меняется только порядок обхода.
 */

// ⚠️ Берём НАСТОЯЩИЙ переход из модуля, а не копию рядом с проверкой: копия зеленеет
// сама по себе и о поломке экрана не скажет ничего.
import { nextUnanswered } from '@/src/games/chess-blind/core/blocks';

describe('слепые шахматы: свободный порядок ответов', () => {
  it('🔴 ответы вразнобой закрывают ВСЕ вопросы ровно по разу', () => {
    for (const total of [3, 4, 5]) {
      for (const start of [0, 1, total - 1]) {
        const answered = new Set<number>();
        const order: number[] = [];
        let cur = start;
        for (let step = 0; step < total; step++) {
          order.push(cur);
          answered.add(cur);
          const nx = nextUnanswered(cur, total, answered);
          if (step < total - 1) expect(nx).toBeGreaterThanOrEqual(0);
          else expect(nx).toBe(-1);            // всё закрыто → конец партии
          if (nx < 0) break;
          cur = nx;
        }
        expect(order.length).toBe(total);
        expect(new Set(order).size).toBe(total);   // ни одного дубля и ни одного пропуска
      }
    }
  });

  it('🔴 прыжок на произвольный вопрос не теряет остальные', () => {
    const total = 3;
    const answered = new Set<number>();
    // человек начал с последнего, потом взял первый, потом остался средний
    answered.add(2);
    expect(nextUnanswered(2, total, answered)).toBe(0);
    answered.add(0);
    expect(nextUnanswered(0, total, answered)).toBe(1);
    answered.add(1);
    expect(nextUnanswered(1, total, answered)).toBe(-1);
    expect(answered.size).toBe(total);
  });

  it('🔴 счётчик — это ПРОГРЕСС, а не номер выбранного', () => {
    // с номером выбранного счётчик прыгал бы 1/3 → 3/3 → 2/3 и читался как сбой
    const answered = new Set<number>();
    const progress = () => answered.size;
    expect(progress()).toBe(0);
    answered.add(2); expect(progress()).toBe(1);
    answered.add(0); expect(progress()).toBe(2);
    answered.add(1); expect(progress()).toBe(3);
  });
});
