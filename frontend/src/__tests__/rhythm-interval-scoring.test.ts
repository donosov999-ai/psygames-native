/* psygames-rhythm-interval-scoring · VER 1 · 30.09.2026 */
/**
 * РИТМ СЧИТАЕТСЯ ПО РИСУНКУ, А НЕ ПО МОМЕНТУ СТАРТА (решение Дениса 30.09.2026).
 *
 * До правки такт ждали ровно в «конец звучания + доля»: безупречный ритм, начатый
 * через 300 мс после тишины, не засчитывался ни на одном из 16 ритмических уровней
 * (`scripts/rhythm-pitch-pass-rate.measure.test.ts`). Здесь — что сдвиг старта не
 * стоит ничего, а темп и пропуски по-прежнему стоят.
 */
import { generateRhythmPitchRound, scoreRhythmTiming, type RhythmEchoRound } from '@/src/games/rhythm-pitch/core';

const START = 50_000;
const CASES: [number, string][] = [[1, 'инт-a'], [9, 'инт-b'], [21, 'инт-c'], [31, 'инт-d']];

function round(level: number, seed: string): RhythmEchoRound {
  return generateRhythmPitchRound(seed, level, 'rhythm-echo') as RhythmEchoRound;
}

describe('ритм по интервалам', () => {
  it('🔴 безупречный рисунок с опозданием старта 300 и 800 мс — точность 1', () => {
    for (const [level, seed] of CASES) {
      const r = round(level, seed);
      for (const late of [300, 800]) {
        const taps = r.beats.map((b) => START + late + b.onsetMs);
        expect(`ур.${level} +${late}: ${scoreRhythmTiming(r, taps, START, 0).accuracy}`).toBe(`ур.${level} +${late}: 1`);
      }
    }
  });

  it('пропуск удара стоит одинаково при любом сдвиге старта', () => {
    for (const [level, seed] of CASES) {
      const r = round(level, seed);
      const skip = Math.floor(r.beats.length / 2);
      const play = (late: number) => r.beats.filter((_, i) => i !== skip).map((b) => START + late + b.onsetMs);
      const onTime = scoreRhythmTiming(r, play(0), START, 0);
      const late = scoreRhythmTiming(r, play(700), START, 0);
      expect([late.accuracy, late.missingTaps]).toEqual([onTime.accuracy, onTime.missingTaps]);
      expect(late.missingTaps).toBe(1);
    }
  });

  it('темп по-прежнему важен: рисунок, растянутый на треть, не засчитан', () => {
    for (const [level, seed] of CASES) {
      const r = round(level, seed);
      const taps = r.beats.map((b) => START + 400 + b.onsetMs * 1.33);
      expect(scoreRhythmTiming(r, taps, START, 0).accuracy).toBeLessThan(0.7);
    }
  });

  it('новая оценка никогда не ниже прежней: привязка к концу звучания — один из кандидатов', () => {
    const r = round(9, 'инт-b');
    const taps = r.beats.map((b, i) => START + b.onsetMs + (i % 2 ? 35 : -20));
    expect(scoreRhythmTiming(r, taps, START, 0).accuracy).toBeGreaterThan(0.8);
  });

  it('общий сдвиг всех нажатий поглощается — поправка задержки на счёт не влияет', () => {
    const r = round(21, 'инт-c');
    const taps = r.beats.map((b, i) => START + 250 + b.onsetMs + (i % 3) * 15);
    expect(scoreRhythmTiming(r, taps, START, 120).accuracy).toBeCloseTo(scoreRhythmTiming(r, taps, START, 0).accuracy, 12);
  });
});
