/**
 * Чистые функции геймификации: tokenDelta, comboBonus, levelInfo (tokens.ts)
 * и cleanRunBonus (cleanRun.ts). Формулы завязаны на экономику приложения —
 * регресс здесь меняет начисления всем игрокам молча.
 */
import { tokenDelta, comboBonus, levelInfo } from '@/src/services/tokens';
import { cleanRunBonus, CLEAN_RUN_MIN } from '@/src/services/cleanRun';

describe('tokenDelta', () => {
  it('счёт добавляет (score/20, округление), ошибки вычитают', () => {
    expect(tokenDelta(100, 0)).toBe(5);
    expect(tokenDelta(100, 3)).toBe(2);
    expect(tokenDelta(90, 0)).toBe(5);    // 4.5 → round → 5 (банковское НЕ используется)
    expect(tokenDelta(0, 0)).toBe(0);
  });
  it('может быть отрицательным и терпит мусор на входе', () => {
    expect(tokenDelta(0, 4)).toBe(-4);
    expect(tokenDelta(undefined as any, undefined as any)).toBe(0);
  });
});

describe('comboBonus (комбо зарядки ×1.5)', () => {
  const clean = (score: number) => ({ score, errors: 0 });
  const dirty = (score: number) => ({ score, errors: 2 });

  it('меньше 3 чистых подряд — бонуса нет', () => {
    expect(comboBonus([clean(100), clean(100)])).toEqual({ bonus: 0, streakLen: 2 });
    expect(comboBonus([clean(100), dirty(100), clean(100)])).toEqual({ bonus: 0, streakLen: 1 });
    expect(comboBonus([])).toEqual({ bonus: 0, streakLen: 0 });
  });

  it('3+ чистых подряд — бонус = 0.5 × сумма tokenDelta серии', () => {
    // 3 × tokenDelta(100,0)=5 → серия 15 → бонус 8 (round 7.5)
    expect(comboBonus([clean(100), clean(100), clean(100)])).toEqual({ bonus: 8, streakLen: 3 });
  });

  it('берётся самая длинная серия, а не первая', () => {
    const r = comboBonus([clean(100), dirty(50), clean(200), clean(200), clean(200), clean(200)]);
    expect(r.streakLen).toBe(4);
    expect(r.bonus).toBe(20);   // 4 × 10 = 40 → ×0.5
  });
});

describe('levelInfo', () => {
  it('пороги уровней и прогресс внутри уровня', () => {
    expect(levelInfo(0).level).toBe(0);
    expect(levelInfo(79).level).toBe(0);
    expect(levelInfo(80).level).toBe(1);
    expect(levelInfo(200).level).toBe(2);
    const li = levelInfo(140);   // уровень 1 (80..200), внутрь 60 из 120
    expect(li.level).toBe(1);
    expect(li.intoLevel).toBe(60);
    expect(li.progress).toBeCloseTo(0.5);
  });
  it('максимальный уровень: span=null, progress=1', () => {
    const top = levelInfo(999999);
    expect(top.level).toBe(10);
    expect(top.span).toBeNull();
    expect(top.progress).toBe(1);
  });
});

describe('cleanRunBonus (серия чистых раундов)', () => {
  it(`до ${CLEAN_RUN_MIN} подряд — ноль`, () => {
    expect(cleanRunBonus(0)).toBe(0);
    expect(cleanRunBonus(CLEAN_RUN_MIN - 1)).toBe(0);
  });
  it('с порога растёт и капится на +15', () => {
    expect(cleanRunBonus(3)).toBe(8);     // 5 + 3
    expect(cleanRunBonus(10)).toBe(15);   // 5 + 10 (кап)
    expect(cleanRunBonus(50)).toBe(15);
  });
});
