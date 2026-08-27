/* psygames-assessment-task-key · VER 1 · 22.08.2026 */
/**
 * БАТАРЕЯ ОЦЕНКИ БЕРЁТ ПАРТИЮ, СЫГРАННУЮ В ТЕХ ЖЕ НАСТРОЙКАХ.
 *
 * 🔴 ЧТО НАШЛОСЬ. Партия выбиралась по одному `game_type`. А батарея предписывает
 * ТОЧНЫЕ настройки: «Спан цифр» — medium и forward, n-back — 2-back, тест внимания —
 * 4min, SDMT — 60s; нормы (`norm_mean`, `norm_std`) собраны именно под них. Человек
 * играл «Спан цифр» НАЗАД на трудной настройке — и эта партия шла в оценку как
 * результат прямого спана на средней, то есть сравнивалась с чужой нормой. На экране
 * это выглядит как измерение: число, процентиль, «слабо / средне / сильно».
 *
 * История ту же задачу давно различает: `taskKey` склеивает упражнение + уровень +
 * дорогу + настройки, и там прямо написано — «5×5 и 6×6 это разные задачи, а не
 * прогресс». Здесь тот же принцип и та же причина.
 *
 * ⚠️ ВСТРЕЧНАЯ СТОРОНА ОБЯЗАТЕЛЬНА. Ужесточить отбор можно и до пустоты: если
 * требовать больше, чем батарея предписала, все домены станут «нет данных» и отчёт
 * превратится в двенадцать средних значений. Это хуже неточности — там хотя бы было
 * что-то настоящее.
 */
import { ASSESSMENT_PLAYLIST, DOMAINS, scoreSessions, sessionFitsStep } from '@/src/services/assessment';
import type { GameSession } from '@/src/services/api';

const round = (over: Partial<GameSession> & { details?: Record<string, unknown> }): GameSession => ({
  game_type: 'digit_span',
  score: 100,
  errors: 0,
  time_seconds: 60,
  difficulty: 'medium',
  mode: 'forward',
  details: { maxSpan: 9 },
  ...over,
} as unknown as GameSession);

const step = (gameId: string) => ASSESSMENT_PLAYLIST.find((s) => s.game_id === gameId);

describe('отбор партии под шаг батареи', () => {
  it('есть что проверять — шаги действительно задают настройки', () => {
    const withSetup = ASSESSMENT_PLAYLIST.filter((s) => s.difficulty || s.mode);
    expect(withSetup.length).toBeGreaterThan(5);
  });

  it('🔴 партия в предписанных настройках подходит', () => {
    expect(sessionFitsStep(round({}), step('digit_span'))).toBe(true);
  });

  it('🔴 партия в ДРУГОМ режиме не подходит', () => {
    expect(sessionFitsStep(round({ mode: 'backward' }), step('digit_span'))).toBe(false);
  });

  it('🔴 партия на другой настройке сложности не подходит', () => {
    expect(sessionFitsStep(round({ difficulty: 'hard' }), step('digit_span'))).toBe(false);
  });

  /** Шаг без настройки ничего и не требует — иначе домен вечно «нет данных». */
  it('🔴 шаг без предписания принимает любую партию', () => {
    expect(sessionFitsStep(round({ mode: 'что угодно', difficulty: 'любая' }), undefined)).toBe(true);
  });

  it('🔴 чужая партия в оценку не попадает, а своя попадает', () => {
    const dom = DOMAINS.find((d) => d.game_id === 'digit_span');
    if (!dom) throw new Error('домен «Спан цифр» пропал — проверять нечего');

    const alien = scoreSessions([round({ mode: 'backward', details: { maxSpan: 12 } })]);
    const own = scoreSessions([round({ details: { maxSpan: 12 } })]);
    const pick = (r: ReturnType<typeof scoreSessions>) => r.scores.find((x) => x.domain === dom.id);

    // чужая настройка → домен считается «нет данных», то есть норма
    expect(`чужая: ${pick(alien)?.raw_value}`).toBe(`чужая: ${dom.norm_mean}`);
    // своя → берётся настоящее значение
    expect(`своя: ${pick(own)?.raw_value}`).toBe('своя: 12');
  });

  /**
   * ⚠️ ОТЧЁТ НЕ ДОЛЖЕН ОПУСТЕТЬ. Полный набор партий в предписанных настройках
   * обязан закрыть все домены, у которых такой шаг вообще есть.
   */
  it('🔴 полный набор партий в своих настройках закрывает домены', () => {
    const sessions = ASSESSMENT_PLAYLIST.map((s) => round({
      game_type: s.game_id,
      difficulty: s.difficulty ?? 'medium',
      mode: s.mode ?? undefined,
      // hit_rate вместо сырых hits и adj_avg_pumps под шар 1..32 — метрики батареи
      // починены 27.08.2026 (см. assessment-metrics.test.ts: доля не зависит от числа
      // проб, норма BART = EV-оптимум запускаемого диапазона).
      details: { maxSpan: 9, span: 6, d_prime: 2, validity_effect_ms: 40, rt_variability: 0.15,
        rate_per_min: 60, flanker_effect_ms: 50, switch_cost_ms: 120, hit_rate: 0.9,
        angle_response_slope: 6, word_count: 18, adj_avg_pumps: 20 },
    }));
    const res = scoreSessions(sessions);
    const withStep = DOMAINS.filter((d) => ASSESSMENT_PLAYLIST.some((s) => s.game_id === d.game_id));
    const atNorm = withStep.filter((d) => {
      const sc = res.scores.find((x) => x.domain === d.id);
      return sc && sc.raw_value === d.norm_mean && sc.percentile === 50;
    });
    expect(`доменов без данных: ${atNorm.length}`).toBe('доменов без данных: 0');
  });
});
