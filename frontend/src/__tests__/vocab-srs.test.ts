/**
 * SRS-алгоритм (SM-2 упрощённый) — gradeCard: интервалы повторения слов.
 * Регресс здесь ломает график повторений для всех языковых профилей.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gradeCard } from '@/src/services/vocab-srs';

const LANG = ['ru', 'en'] as const;

describe('gradeCard (SM-2)', () => {
  beforeEach(async () => AsyncStorage.clear());

  it('первый good → 1 день, первый easy → 3 дня', async () => {
    expect(await gradeCard(LANG[0], LANG[1], 'w1', 'good')).toBe(1);
    expect(await gradeCard(LANG[0], LANG[1], 'w2', 'easy')).toBe(3);
  });

  it('again возвращает карточку в сессию (0) и не двигает график', async () => {
    expect(await gradeCard(LANG[0], LANG[1], 'w1', 'again')).toBe(0);
  });

  it('повторные good растят интервал по ease (~2.5×)', async () => {
    await gradeCard(LANG[0], LANG[1], 'w1', 'good');            // 1 день
    const second = await gradeCard(LANG[0], LANG[1], 'w1', 'good');
    expect(second).toBeGreaterThanOrEqual(2);                    // 1 × ease(2.5) → 3 (round)
    const third = await gradeCard(LANG[0], LANG[1], 'w1', 'good');
    expect(third).toBeGreaterThan(second);
  });

  it('again после прогресса сбрасывает reps: следующий good снова 1 день', async () => {
    await gradeCard(LANG[0], LANG[1], 'w1', 'good');
    await gradeCard(LANG[0], LANG[1], 'w1', 'good');
    await gradeCard(LANG[0], LANG[1], 'w1', 'again');
    expect(await gradeCard(LANG[0], LANG[1], 'w1', 'good')).toBe(1);
  });
});
