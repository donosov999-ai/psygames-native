/* psygames-warmup-night-not-in-streak · VER 1 · 17.09.2026 */
/**
 * «НЕ СПИТСЯ» НЕ ДВИГАЕТ СТРИК — КАК ОБЕЩАЕТ КАРТОЧКА НОЧИ.
 *
 * 📍 Карточка ночи на экране выбора: «Это не тренировка: очки не начисляются и стрик не
 * растёт» (решение Дениса 02.08). Пройденная ночь пишет в историю `{ track: 'rest',
 * completed: true }`, а стрик, календарь и достижения считали любую завершённую запись.
 * До правки одна ночная запись за сегодня давала стрик 1.
 */
import {
  computeStreak, computeLongestStreak, completedWarmupDateKeys, todayDateKey, localDateKey,
  type WarmupHistoryEntry,
} from '@/src/services/warmup';

const запись = (date: string, track: WarmupHistoryEntry['track'], completed = true): WarmupHistoryEntry => ({
  date, weekday: 4, duration_min: 5, track, total_score: 10, completed, steps_done: 5, steps_total: 5,
});
const вчера = (): string => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateKey(d); };

describe('ночь «не спится» и стрик', () => {
  it('контроль: пройденная тренировка за сегодня даёт стрик 1', () => {
    expect(computeStreak([запись(todayDateKey(), 'training')])).toBe(1);
  });

  it('🔴 пройденная ночь за сегодня стрик не двигает', () => {
    expect(`стрик ${computeStreak([запись(todayDateKey(), 'rest')])}`).toBe('стрик 0');
  });

  it('🔴 ночь не держит серию, если тренировки вчера не было', () => {
    const h = [запись(вчера(), 'rest'), запись(todayDateKey(), 'training')];
    expect(computeStreak(h)).toBe(1);
  });

  it('🔴 календарь и рекорд серии ночь не отмечают', () => {
    expect(completedWarmupDateKeys([запись(todayDateKey(), 'rest')])).toEqual([]);
    expect(computeLongestStreak([запись(вчера(), 'rest'), запись(todayDateKey(), 'rest')])).toBe(0);
    expect(completedWarmupDateKeys([запись(todayDateKey(), 'training')])).toEqual([todayDateKey()]);
  });
});
