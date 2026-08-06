/**
 * Контракт запуска «вызова дня».
 *
 * Он ДОЛЖЕН стартовать сам (auto=1), но НЕ должен притворяться шагом зарядки (wu=1):
 * в зарядке уровни намеренно не растут — `passed = !isPreset && …` стоит в 36 экранах.
 * Раньше challengeToParams звал stepToParams, а тот всегда ставит wu, и вызов дня молча
 * не засчитывался. Два репорта Вали на v1.185.0 в один вечер:
 *   «Я не сделала ни одной ошибки, почему не открывается следующий уровень?»
 *   «А уровней 15, но дальше первого я не ухожу»
 * Вызовом дня в тот день был как раз Choice RT.
 */
import { challengeToParams, getTodayChallenge } from '@/src/services/daily-challenge';
import { stepToParams } from '@/src/services/warmup';

describe('параметры запуска вызова дня', () => {
  const params = challengeToParams(getTodayChallenge());

  it('НЕ помечен как шаг зарядки — иначе уровень не засчитается', () => {
    expect(params.wu).toBeUndefined();
  });

  it('стартует сам, без экрана «Начать»', () => {
    expect(params.auto).toBe('1');
  });

  it('передаёт сложность', () => {
    expect(['easy', 'medium', 'hard']).toContain(params.diff);
  });

  it('шаг зарядки, наоборот, обязан нести wu=1 — это его признак', () => {
    const step = stepToParams({ game_id: 'schulte_table', game_route: '/games/schulte', difficulty: 'easy', est_duration_sec: 60 });
    expect(step.wu).toBe('1');
  });
});
