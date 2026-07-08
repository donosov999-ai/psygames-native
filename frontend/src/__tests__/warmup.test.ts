/**
 * brainTodayVerdict — был единственным текстом на экране зарядки, зашитым
 * только на русском (не смотрел на language), в отличие от всего остального UI.
 */
import { brainTodayVerdict, WarmupHistoryEntry } from '@/src/services/warmup';

const mkEntry = (score: number): WarmupHistoryEntry => ({
  date: '2026-01-01', weekday: 0, duration_min: 5, track: 'training',
  total_score: score, completed: true, steps_done: 3, steps_total: 3,
});

describe('brainTodayVerdict — язык сообщения', () => {
  // медиана прошлых 100, последний 150 → +50%, выше порога >10%
  const history = [100, 100, 100, 100, 100, 100, 150].map(mkEntry);

  it('ru: сообщение на русском', () => {
    expect(brainTodayVerdict(history, 'ru')?.message).toMatch(/выше среднего/);
  });
  it('en: сообщение на английском (не должно быть русского текста)', () => {
    const msg = brainTodayVerdict(history, 'en')?.message ?? '';
    expect(msg).toMatch(/above your average/);
    expect(msg).not.toMatch(/среднего/);
  });
  it('дефолт без языка — ru (обратная совместимость)', () => {
    expect(brainTodayVerdict(history)?.message).toMatch(/выше среднего/);
  });
});
