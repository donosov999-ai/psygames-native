/**
 * Границы времени суток для кнопки «Зарядка».
 *
 * Согласованы с Денисом 02.08.2026: 5-12 утро · 12-18 день · 18-00 вечер ·
 * 00-05 «Не спится». Это продуктовое решение, а не деталь реализации: сдвиг
 * границы меняет то, что человек видит на главной, поэтому фиксируем тестом.
 *
 * Отдельно проверяем, что ночь НЕ считается тренировкой — на этом держится
 * обещание «очки не начисляются и стрик не растёт»: если `isTrainingSlot`
 * однажды вернёт для неё true, ночной сеанс молча начнёт двигать стрик.
 */
import { slotForHour, isTrainingSlot } from '../services/warmup';

describe('время суток для зарядки', () => {
  it('границы ровно те, что согласованы', () => {
    const byHour = Array.from({ length: 24 }, (_, h) => slotForHour(h));
    expect(byHour).toEqual([
      'night', 'night', 'night', 'night', 'night',              // 00-04
      'morning', 'morning', 'morning', 'morning', 'morning', 'morning', 'morning', // 05-11
      'day', 'day', 'day', 'day', 'day', 'day',                 // 12-17
      'evening', 'evening', 'evening', 'evening', 'evening', 'evening',            // 18-23
    ]);
  });

  it('крайние часы не съезжают на соседний слот', () => {
    expect(slotForHour(4)).toBe('night');
    expect(slotForHour(5)).toBe('morning');
    expect(slotForHour(11)).toBe('morning');
    expect(slotForHour(12)).toBe('day');
    expect(slotForHour(17)).toBe('day');
    expect(slotForHour(18)).toBe('evening');
    expect(slotForHour(23)).toBe('evening');
    expect(slotForHour(0)).toBe('night');
  });

  it('ночь — не тренировка, остальные три — да', () => {
    expect(isTrainingSlot('night')).toBe(false);
    expect(isTrainingSlot('morning')).toBe(true);
    expect(isTrainingSlot('day')).toBe(true);
    expect(isTrainingSlot('evening')).toBe(true);
  });
});
