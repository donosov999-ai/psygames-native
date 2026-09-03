import {
  FEATURE_LADDER, playerLevel, isUnlocked, nextLock, levelsToNextLock,
} from '@/src/services/featureLadder';

/**
 * Задача b96bfc4b. Замер эталона: девять замков на первых 60 уровнях, между 5 и 10 —
 * четыре, то есть ближайшая дверь всегда в 1–5 уровнях впереди. У нас лестница была
 * одна и открывалась деньгами: бесплатному игроку впереди не заперто ничего.
 */
describe('вторая лестница: замки по уровню игрока', () => {
  it('есть что проверять и порядок не сломан', () => {
    expect(FEATURE_LADDER.length).toBeGreaterThanOrEqual(5);
    const уровни = FEATURE_LADDER.map((l) => l.level);
    expect(уровни).toEqual([...уровни].sort((a, b) => a - b));
    expect(new Set(FEATURE_LADDER.map((l) => l.key)).size).toBe(FEATURE_LADDER.length);
  });

  it('🔴 первый замок НЕ на первом уровне: там он читается как поломка', () => {
    expect(FEATURE_LADDER[0].level).toBeGreaterThanOrEqual(2);
  });

  it('🔴 впереди всегда видна дверь: до 25 уровня разрыв не больше семи', () => {
    const плохие: string[] = [];
    for (let L = 0; L < 25; L++) {
      const до = levelsToNextLock(L);
      if (до !== null && до > 7) плохие.push(`ур.${L} → ждать ${до}`);
    }
    expect(плохие).toEqual([]);
  });

  it('уровень складывается по всем играм, а не берётся максимумом', () => {
    expect(playerLevel({ a: { completed: 3 }, b: { completed: 4 } })).toBe(7);
    expect(playerLevel({})).toBe(0);
    expect(playerLevel({ a: { completed: -5 } } as never)).toBe(0);
  });

  it('🔴 замок закрыт до своего уровня и открыт с него', () => {
    const l = FEATURE_LADDER[0];
    expect(isUnlocked(l.key, l.level - 1)).toBe(false);
    expect(isUnlocked(l.key, l.level)).toBe(true);
  });

  it('незнакомый ключ считается открытым: замок обязан быть явным', () => {
    expect(isUnlocked('такого-приёма-нет', 0)).toBe(true);
  });

  it('когда открыто всё — ближайшего замка нет, а не «ноль»', () => {
    const max = Math.max(...FEATURE_LADDER.map((l) => l.level));
    expect(nextLock(max)).toBeNull();
    expect(levelsToNextLock(max)).toBeNull();
  });
});
