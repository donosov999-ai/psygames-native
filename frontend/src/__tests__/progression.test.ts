/**
 * Лиги и ранги: лестница обязана быть монотонной и без дыр.
 *
 * ЗАЧЕМ ТЕСТ. Пороги — самая уязвимая часть любой лестницы прогресса: одна опечатка в
 * числе, и человек «падает» из лиги при росте очков либо застревает в ранге навсегда.
 * Глазами это не ловится: пороги выглядят правдоподобно в любом порядке.
 *
 * ⚠️ Лига считается от очков за ПОСЛЕДНИЕ 30 ДНЕЙ, а не за всё время. Это не придирка:
 * общий уровень (`services/tokens`, levelInfo) уже есть и считается от всех накопленных
 * очков. Если бы лига бралась оттуда же, получились бы две одинаковые лестницы под
 * разными именами. Уровень — «сколько я всего прошёл», лига — «в какой я форме сейчас».
 */
import { LEAGUES, RANKS_PER_LEAGUE, standingFor, isLeagueReached, earnedFrames, FRAMES, seasonPointsFrom } from '@/src/services/progression';

describe('лиги', () => {
  it('пороги строго растут — иначе человек падает из лиги при росте очков', () => {
    const froms = LEAGUES.map((l) => l.from);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
    expect(new Set(froms).size).toBe(froms.length);
    expect(froms[0]).toBe(0);   // с нуля обязан быть кто-то, иначе новичок вне лиг
  });

  it('у каждой лиги свой ключ названия и своя рамка', () => {
    expect(new Set(LEAGUES.map((l) => l.nameKey)).size).toBe(LEAGUES.length);
    expect(new Set(FRAMES.map((f) => f.league)).size).toBe(LEAGUES.length);
  });

  it('на нуле — первая лига, первый ранг', () => {
    const s = standingFor(0);
    expect(s.league.id).toBe(LEAGUES[0].id);
    expect(s.rank).toBe(1);
  });

  it('ровно на пороге человек уже В лиге, а не под ней', () => {
    for (const l of LEAGUES) {
      expect(`${l.id}@${l.from}: ${standingFor(l.from).league.id}`).toBe(`${l.id}@${l.from}: ${l.id}`);
    }
  });

  it('за шаг до порога — ещё предыдущая лига', () => {
    for (let i = 1; i < LEAGUES.length; i++) {
      expect(standingFor(LEAGUES[i].from - 1).league.id).toBe(LEAGUES[i - 1].id);
    }
  });

  it('лестница монотонна: больше очков — не ниже положение', () => {
    let prev = -1;
    for (let pts = 0; pts <= 12000; pts += 37) {
      const s = standingFor(pts);
      const idx = LEAGUES.findIndex((l) => l.id === s.league.id);
      const abs = idx * RANKS_PER_LEAGUE + s.rank;   // сквозная ступень
      expect(`${pts}: ${abs >= prev}`).toBe(`${pts}: true`);
      prev = abs;
    }
  });

  it('ранг не выходит за границы и не пропускается', () => {
    for (let pts = 0; pts <= 12000; pts += 13) {
      const r = standingFor(pts).rank;
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(RANKS_PER_LEAGUE);
    }
  });

  it('на верхней лиге расти некуда, и это сказано честно', () => {
    const s = standingFor(999999);
    expect(s.league.id).toBe(LEAGUES[LEAGUES.length - 1].id);
    expect(s.toNext).toBeNull();
    expect(s.progress).toBe(1);
  });

  it('до следующего ранга всегда положительное число, а не ноль-навсегда', () => {
    for (let pts = 0; pts < LEAGUES[LEAGUES.length - 1].from; pts += 101) {
      const s = standingFor(pts);
      expect(`${pts}: toNext=${s.toNext !== null && s.toNext > 0}`).toBe(`${pts}: toNext=true`);
    }
  });

  it('отрицательные и дробные очки не ломают расчёт', () => {
    expect(standingFor(-500).league.id).toBe(LEAGUES[0].id);
    expect(standingFor(1200.9).league.id).toBe(standingFor(1200).league.id);
  });
});

describe('рамки-трофеи', () => {
  it('на нуле заработана только первая', () => {
    expect(earnedFrames(0).map((f) => f.id)).toEqual(['sprout']);
  });

  it('копятся, а не заменяют друг друга — трофей нельзя отобрать', () => {
    const mid = earnedFrames(2600);
    const top = earnedFrames(9000);
    expect(mid.length).toBeGreaterThan(1);
    expect(top.length).toBe(FRAMES.length);
    for (const f of mid) expect(top.map((x) => x.id)).toContain(f.id);
  });

  it('isLeagueReached согласован с расчётом положения', () => {
    for (const l of LEAGUES) {
      expect(isLeagueReached(l.id, l.from)).toBe(true);
      if (l.from > 0) expect(isLeagueReached(l.id, l.from - 1)).toBe(false);
    }
  });
});

describe('очки сезона', () => {
  const NOW = Date.parse('2026-08-12T12:00:00Z');
  const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();

  it('берёт только последние 30 дней', () => {
    const s = [
      { score: 100, timestamp: ago(1) },
      { score: 200, timestamp: ago(29) },
      { score: 999, timestamp: ago(31) },   // старее сезона — мимо
    ];
    expect(seasonPointsFrom(s, NOW)).toBe(300);
  });

  it('записи без времени не идут в зачёт — иначе лига накручивается', () => {
    expect(seasonPointsFrom([{ score: 500 }], NOW)).toBe(0);
  });

  it('будущее не идёт в зачёт: часы на устройстве врут', () => {
    expect(seasonPointsFrom([{ score: 500, timestamp: new Date(NOW + 86400000).toISOString() }], NOW)).toBe(0);
  });

  it('битое время и отрицательные очки не ломают сумму', () => {
    const s = [
      { score: 100, timestamp: ago(2) },
      { score: 50, timestamp: 'не дата' },
      { score: -70, timestamp: ago(3) },
      { score: NaN as any, timestamp: ago(4) },
    ];
    expect(seasonPointsFrom(s, NOW)).toBe(100);
  });

  it('пустой список — ноль, а не падение', () => {
    expect(seasonPointsFrom([], NOW)).toBe(0);
  });
});
