/* psygames-rhythm-pitch-pass-rate · VER 1 · 30.09.2026 */
/**
 * ЗАМЕР ПРОХОДИМОСТИ «ЭХА РИТМА» — исполнением живого ядра, а не формулой.
 *
 * Игрок-автомат повторяет образец КАЖДОГО ритмического уровня (нечётные 1…31)
 * на 24 зёрнах: удар = начало ответа + сдвиг старта + доля образца + разброс.
 *   · сдвиг старта 0 / 300 / 800 мс — человек начинает эхо не в тот же миг, когда
 *     стих звук: реакция на конец звучания у живого человека ~200–400 мс;
 *   · разброс ±0 / ±40 / ±80 мс — равномерный, свой на каждый удар.
 * Печатает долю зачтённых партий (`isPassed`, точность ≥ 0,70) по верхним и нижним
 * ступеням. Задача a57a2b44 (решение Дениса 30.09.2026: счёт по интервалам).
 *
 * Запуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/rhythm-pitch-pass-rate.measure.test.ts'
 */
import {
  generateRhythmPitchRound, scoreRhythmCompletion, isPassed, createRng, LEVELS,
  type RhythmEchoRound,
} from '@/src/games/rhythm-pitch/core';

const SEEDS = Array.from({ length: 24 }, (_, i) => `measure-${i}`);
const SHIFTS = [0, 300, 800];
const NOISE = [0, 40, 80];
const START = 10_000;

function passRate(levels: number[], shift: number, noise: number): number {
  let passed = 0;
  let total = 0;
  for (const level of levels) {
    for (const seed of SEEDS) {
      const round = generateRhythmPitchRound(seed, level, 'rhythm-echo') as RhythmEchoRound;
      const rnd = createRng(`${seed}:${shift}:${noise}`);
      const taps = round.beats.map((b) => START + shift + b.onsetMs + (rnd() * 2 - 1) * noise);
      const m = scoreRhythmCompletion(round, taps, START, {
        durationMs: 10_000, calibrationOffsetMs: 0, calibrationSamples: 4, replayCount: 0,
      });
      total += 1;
      if (isPassed(m)) passed += 1;
    }
  }
  return passed / total;
}

describe('проходимость «Эха ритма»', () => {
  it('печатает долю зачтённых партий', () => {
    const rhythm = Array.from({ length: LEVELS }, (_, i) => i + 1).filter((l) => l % 2 === 1);
    const low = rhythm.filter((l) => l <= 11);
    const high = rhythm.filter((l) => l >= 21);
    const rows: string[] = ['сдвиг | разброс | уровни 1–11 | уровни 21–31 | все 16'];
    for (const shift of SHIFTS) {
      for (const noise of NOISE) {
        const pct = (v: number) => `${Math.round(v * 100)}%`;
        rows.push(`${shift} мс | ±${noise} мс | ${pct(passRate(low, shift, noise))} | ${pct(passRate(high, shift, noise))} | ${pct(passRate(rhythm, shift, noise))}`);
      }
    }
    console.log(rows.join('\n'));
    expect(rows.length).toBe(1 + SHIFTS.length * NOISE.length);
  });
});
