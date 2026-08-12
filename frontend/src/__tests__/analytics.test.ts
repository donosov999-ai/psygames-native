/**
 * Разбивка по когнитивным областям.
 *
 * ЗАЧЕМ ТЕСТ. Здесь два места, где легко соврать человеку и не заметить:
 *  • доли должны давать сто процентов — иначе полосы на экране не сходятся с числами;
 *  • сдвиг результата должен МОЛЧАТЬ, когда данных мало. Показать «0%» вместо «нет
 *    данных» — значит сообщить о застое там, где просто нечего сравнивать.
 *
 * ⚠️ Процент здесь — ДОЛЯ ТРЕНИРОВОК, а не оценка способности. Честно сказать «ваше
 * внимание на 59%» мы не можем: для этого нужны нормы по возрасту, которых у нас нет,
 * а выдумывать их — то же самое, что обещать рост IQ, чего мы прямо не обещаем в карточке.
 */
import { areaBreakdown, weakestArea, MIN_FOR_TREND } from '@/src/services/analytics';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();

/** Крошечный реестр: две игры памяти, одна внимания, одна неизвестная. */
const AREA: Record<string, string> = { nback: 'memory', corsi: 'memory', schulte: 'attention' };
const areaOf = (g: string) => AREA[g];

describe('разбивка по областям', () => {
  it('считает партии и доли, доли дают единицу', () => {
    const s = [
      { game_type: 'nback', score: 10, timestamp: ago(1) },
      { game_type: 'corsi', score: 10, timestamp: ago(2) },
      { game_type: 'schulte', score: 10, timestamp: ago(3) },
    ];
    const r = areaBreakdown(s, areaOf, NOW);
    expect(r.map((x) => x.area)).toEqual(['memory', 'attention']);
    expect(r.find((x) => x.area === 'memory')!.sessions).toBe(2);
    expect(Math.round(r.reduce((a, x) => a + x.share, 0) * 1000) / 1000).toBe(1);
  });

  it('игра не из реестра не приписывается ни к какой области', () => {
    const r = areaBreakdown([{ game_type: 'неизвестная', score: 5, timestamp: ago(1) }], areaOf, NOW);
    expect(r).toEqual([]);
  });

  it('сверху область, где занимаются больше всего', () => {
    const s = [
      { game_type: 'schulte', score: 1, timestamp: ago(1) },
      { game_type: 'schulte', score: 1, timestamp: ago(2) },
      { game_type: 'schulte', score: 1, timestamp: ago(3) },
      { game_type: 'nback', score: 1, timestamp: ago(4) },
    ];
    expect(areaBreakdown(s, areaOf, NOW)[0].area).toBe('attention');
  });

  it('пустой список — пустая разбивка, а не падение', () => {
    expect(areaBreakdown([], areaOf, NOW)).toEqual([]);
  });
});

describe('сдвиг результата', () => {
  const many = (game: string, score: number, days: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ game_type: game, score, timestamp: ago(days + i * 0.1) }));

  it('молчит, когда партий меньше порога — «нет данных» это не «нет роста»', () => {
    const s = [...many('nback', 100, 1, MIN_FOR_TREND - 1), ...many('nback', 50, 20, MIN_FOR_TREND)];
    expect(areaBreakdown(s, areaOf, NOW)[0].trend).toBeNull();
  });

  it('видит рост: свежие две недели против предыдущих двух', () => {
    const s = [...many('nback', 150, 1, MIN_FOR_TREND), ...many('nback', 100, 20, MIN_FOR_TREND)];
    const t = areaBreakdown(s, areaOf, NOW)[0].trend;
    expect(t).not.toBeNull();
    expect(Math.round(t! * 100)).toBe(50);
  });

  it('видит спад', () => {
    const s = [...many('nback', 50, 1, MIN_FOR_TREND), ...many('nback', 100, 20, MIN_FOR_TREND)];
    expect(Math.round(areaBreakdown(s, areaOf, NOW)[0].trend! * 100)).toBe(-50);
  });

  it('рост от нуля не считается ростом — базы нет', () => {
    const s = [...many('nback', 80, 1, MIN_FOR_TREND), ...many('nback', 0, 20, MIN_FOR_TREND)];
    expect(areaBreakdown(s, areaOf, NOW)[0].trend).toBeNull();
  });

  it('партии старше месяца в сравнение не идут', () => {
    const s = [...many('nback', 150, 1, MIN_FOR_TREND), ...many('nback', 100, 60, MIN_FOR_TREND)];
    expect(areaBreakdown(s, areaOf, NOW)[0].trend).toBeNull();
  });

  it('будущее не ломает расчёт: часы устройства врут', () => {
    const future = [{ game_type: 'nback', score: 999, timestamp: new Date(NOW + 86400000).toISOString() }];
    const r = areaBreakdown([...future, ...many('nback', 100, 1, MIN_FOR_TREND)], areaOf, NOW);
    expect(r[0].sessions).toBe(MIN_FOR_TREND + 1);   // в счёт партий идёт
    expect(r[0].trend).toBeNull();                    // в сравнение — нет
  });
});

describe('слабое место', () => {
  it('молчит, если область одна — сравнивать не с чем', () => {
    expect(weakestArea([{ area: 'memory', sessions: 9, share: 1, trend: null }])).toBeNull();
  });

  it('молчит при обычном разбросе — это не перекос', () => {
    expect(weakestArea([
      { area: 'memory', sessions: 6, share: 0.6, trend: null },
      { area: 'attention', sessions: 4, share: 0.4, trend: null },
    ])).toBeNull();
  });

  it('называет область, если разрыв вдвое и больше', () => {
    expect(weakestArea([
      { area: 'memory', sessions: 10, share: 0.83, trend: null },
      { area: 'attention', sessions: 2, share: 0.17, trend: null },
    ])).toBe('attention');
  });
});
