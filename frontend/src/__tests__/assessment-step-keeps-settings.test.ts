/**
 * 🔴 РЕЗУЛЬТАТ ШАГА ОЦЕНКИ НЕСЁТ НАСТРОЙКИ ПАРТИИ — ИНАЧЕ ОЦЕНКА НЕ УЗНАЁТ СВОЮ ПАРТИЮ.
 *
 * Экран итогов оценки считает домены по результатам шагов, а `sessionFitsStep` требует от
 * партии того, что шаг батареи предписал (`difficulty: 'medium'`, `mode: 'forward'`…).
 * Результат шага этих полей не нёс, и 7 доменов из 12 — digit_span, corsi, n_back, cpt,
 * sdmt, phonemic_fluency, bart — у ЛЮБОГО человека выходили «средними», z = 0: радар
 * получался у всех одинаковым. Замер 30.09.2026 по коду main.
 *
 * Проба идёт путём настоящей партии: партия, сыгранная ровно по шагу, → результат шага
 * (`stepResultOf`, тот же, что пишет зарядка) → партия для подсчёта
 * (`sessionsFromStepResults`, тот же, что зовёт экран) → `sessionFitsStep`.
 */
import { ASSESSMENT_PLAYLIST, sessionFitsStep, sessionsFromStepResults } from '@/src/services/assessment';
import { stepResultOf } from '@/src/contexts/WarmupContext';

describe('оценка узнаёт партию шага после записи результата', () => {
  const сНастройками = ASSESSMENT_PLAYLIST.filter((s) => s.difficulty || s.mode);

  it('проба не пустая: у шагов батареи есть настройки — иначе мерить нечего', () => {
    expect(сНастройками.length).toBeGreaterThanOrEqual(7);
  });

  it.each(сНастройками.map((s) => [s.game_id, s] as const))('%s: партия по шагу узнаётся', (_id, step) => {
    const партия = {
      game_type: step.game_id, score: 7, time_seconds: 60, errors: 0,
      difficulty: step.difficulty, mode: step.mode, details: {},
    } as any;
    expect(sessionFitsStep(партия, step)).toBe(true);   // партия действительно сыграна по шагу

    const [посчитанная] = sessionsFromStepResults([stepResultOf(step.game_id, партия)]);
    expect(sessionFitsStep(посчитанная, step)).toBe(true);
  });
});
