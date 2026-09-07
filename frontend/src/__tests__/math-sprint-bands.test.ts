/* __tests__/math-sprint-bands · VER 1 · 07.09.2026 */
/**
 * СЛЕПОК ПОЛОС лестницы v2 «Спринта» (школьная ось Дениса, 07.09.2026) —
 * страж от молчаливого сдвига. Приёмка симом (counting-chat/sim-sprint.mjs VER 2):
 * в зоне L1–28 клонов 0, обрывов 0. Полосы: +− → × → ÷ → цепочки → n² → √ →
 * уравнения → микс высших (L29+). При сознательной переделке слепок обновляется
 * В ТОМ ЖЕ коммите. Проверяется поведением (генерация задач), не исходником.
 */
import {
  generateSprintProblem, migrateSprintLevelV1toV2, sprintBandFor, SPRINT_MAX_LEVEL,
} from '@/src/games/counting/mathSprintCore';

function seededRnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('полосы math-sprint v2 (школьная ось, слепок 07.09.2026)', () => {
  test('8 полос стоят там, где замерено', () => {
    const snapshot = Array.from({ length: 32 }, (_, i) => sprintBandFor(i + 1));
    expect(snapshot).toEqual([
      'plus-minus', 'plus-minus', 'plus-minus', 'plus-minus',
      'mult', 'mult', 'mult', 'mult',
      'div', 'div', 'div', 'div',
      'chain', 'chain', 'chain', 'chain',
      'square', 'square', 'square', 'square',
      'root', 'root', 'root', 'root',
      'equation', 'equation', 'equation', 'equation',
      'mix', 'mix', 'mix', 'mix',
    ]);
    expect(sprintBandFor(100)).toBe('mix');
  });

  test('каждая задача честная: ответ сходится с display, всегда целый и без минуса', () => {
    for (const L of [1, 3, 6, 10, 14, 18, 22, 26, 30, 40]) {
      const rnd = seededRnd(7 + L);
      for (let i = 0; i < 200; i++) {
        const p = generateSprintProblem(L, rnd);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        const d = p.display;
        let m: RegExpMatchArray | null;
        if ((m = d.match(/^(\d+) \+ (\d+) \+ (\d+) = \?$/))) expect(p.answer).toBe(+m[1] + +m[2] + +m[3]);
        else if ((m = d.match(/^(\d+) − (\d+) \+ (\d+) = \?$/))) expect(p.answer).toBe(+m[1] - +m[2] + +m[3]);
        else if ((m = d.match(/^(\d+) ([+-]) (\d+) = \?$/))) expect(p.answer).toBe(m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]);
        else if ((m = d.match(/^(\d+) × (\d+) = \?$/))) expect(p.answer).toBe(+m[1] * +m[2]);
        else if ((m = d.match(/^(\d+) ÷ (\d+) = \?$/))) expect(p.answer * +m[2]).toBe(+m[1]);
        else if ((m = d.match(/^(\d+) × (\d+) ([+−]) (\d+) = \?$/))) expect(p.answer).toBe(m[3] === '+' ? +m[1] * +m[2] + +m[4] : +m[1] * +m[2] - +m[4]);
        else if ((m = d.match(/^(\d+)² = \?$/))) expect(p.answer).toBe(+m[1] * +m[1]);
        else if ((m = d.match(/^√(\d+) = \?$/))) expect(p.answer * p.answer).toBe(+m[1]);
        else if ((m = d.match(/^(\d+)x ([+−]) (\d+) = (\d+),\s+x = \?$/))) {
          const a = +m[1], b = +m[3], c = +m[4];
          expect(m[2] === '+' ? a * p.answer + b : a * p.answer - b).toBe(c);
        } else throw new Error(`нераспознанный display: ${d}`);
      }
    }
  });

  test('сид детерминирован: та же последовательность задач', () => {
    const a = Array.from({ length: 10 }, () => generateSprintProblem(15, seededRnd(3)).display);
    const b = Array.from({ length: 10 }, () => generateSprintProblem(15, seededRnd(3)).display);
    expect(a).toEqual(b);
  });

  test('потолка НЕТ (§R, 07.09): за L36 числа микса продолжают расти (кламп bandT снят)', () => {
    const meanAnswer = (L: number): number => {
      const rnd = seededRnd(99 + L);
      let sum = 0;
      for (let i = 0; i < 500; i++) sum += Math.abs(generateSprintProblem(L, rnd).answer);
      return sum / 500;
    };
    const a36 = meanAnswer(36);
    const a44 = meanAnswer(44);
    const a56 = meanAnswer(56);
    expect(a44).toBeGreaterThan(a36 * 1.15);
    expect(a56).toBeGreaterThan(a44 * 1.15);
  });

  test('миграция v1→v2: по семейству, прогресс не сгорает, в границах', () => {
    expect(migrateSprintLevelV1toV2(1)).toBe(1);
    expect(migrateSprintLevelV1toV2(2)).toBe(2);
    expect(migrateSprintLevelV1toV2(3)).toBe(5);    // +−× → умножение
    expect(migrateSprintLevelV1toV2(5)).toBe(9);    // по явлению ÷ → деление
    expect(migrateSprintLevelV1toV2(8)).toBe(12);
    expect(migrateSprintLevelV1toV2(9)).toBe(13);   // замеренные клоны v1 → цепочки
    expect(migrateSprintLevelV1toV2(30)).toBe(13);
    for (let old = 2; old <= 30; old++) {
      const nu = migrateSprintLevelV1toV2(old);
      expect(nu).toBeGreaterThanOrEqual(migrateSprintLevelV1toV2(old - 1));
      expect(nu).toBeLessThanOrEqual(SPRINT_MAX_LEVEL);
    }
  });
});
