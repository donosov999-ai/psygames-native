/**
 * brainTodayVerdict — был единственным текстом на экране зарядки, зашитым
 * только на русском (не смотрел на language), в отличие от всего остального UI.
 */
import { brainTodayVerdict, WarmupHistoryEntry, todayDateKey } from '@/src/services/warmup';

// З3 (29.08.2026): вердикт сравнивает ядро с ядром (core_score), и только когда
// СЕГОДНЯ ядро сыграно, — записи фикстуры несут core_score, последняя датирована
// сегодняшним днём.
const mkEntry = (score: number, today = false): WarmupHistoryEntry => ({
  date: today ? todayDateKey() : '2026-01-01', weekday: 0, duration_min: 5, track: 'training',
  total_score: score, core_score: score, completed: true, steps_done: 3, steps_total: 3,
});

describe('brainTodayVerdict — язык сообщения', () => {
  // медиана прошлых 100, последний 150 → +50%, выше порога >10%
  const history = [...[100, 100, 100, 100, 100, 100].map((n) => mkEntry(n)), mkEntry(150, true)];

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
