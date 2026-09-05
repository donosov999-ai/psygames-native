/**
 * 🔴 ШАХМАТНАЯ ЗАРЯДКА — ПРОВЕРЯЕМ ТРИ ТРЕБОВАНИЯ ОТЧЁТА, А НЕ «СОБРАЛОСЬ».
 *
 * Отчёт Дениса 05.09.2026: «Надо стерео типа зарядки собрать и с обоих этих
 * штук и чтобы они типа потекли по уровням и желательно чтобы можно было
 * задавать время типа как в режиме потока». Каждое из трёх — отдельная проба.
 */
import { chessWarmupSteps, buildChessWarmup, ШАГ_МАТ_СЕК, ШАГ_ДОСКА_СЕК } from '@/src/services/chessWarmup';

const ДЛИТЕЛЬНОСТИ = [5, 10, 15] as const;

describe('шахматная зарядка', () => {
  it('🔴 «с обоих этих штук»: в наборе есть и «Доска в уме», и «Детский мат»', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const игры = new Set(chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 }).map((s) => s.game_id));
      if (!игры.has('scholars_mate')) плохо.push(`${m} мин: нет «Детского мата»`);
      if (!игры.has('chess_blind')) плохо.push(`${m} мин: нет «Доски в уме»`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 упражнения ЧЕРЕДУЮТСЯ — два подряд одинаковых это не зарядка', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const s = chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 });
      for (let i = 1; i < s.length; i++) {
        if (s[i]!.game_id === s[i - 1]!.game_id) плохо.push(`${m} мин: шаги ${i}–${i + 1} оба ${s[i]!.game_id}`);
      }
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 «потекли по уровням»: у каждого шага уровень СВОЕЙ игры, а не общий', () => {
    const s = chessWarmupSteps({ minutes: 15, blindLevel: 4, mateLevel: 31 });
    const плохо = s.filter((x) => {
      const ждём = x.game_id === 'scholars_mate' ? 31 : 4;
      return Number(x.settings?.level) !== ждём;
    }).map((x) => `${x.game_id}: уровень ${x.settings?.level}`);
    expect(плохо).toEqual([]);
  });

  it('🔴 «задавать время»: набор укладывается в выбранную длительность', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const total = chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 })
        .reduce((a, x) => a + x.est_duration_sec, 0);
      // Ровно в секунду не попасть — шаги неделимы. Но перебор больше чем на
      // половину самого длинного шага означал бы, что заданное время не значит ничего.
      if (total > m * 60 + ШАГ_ДОСКА_СЕК / 2) плохо.push(`${m} мин: набралось ${total} с`);
      if (total < m * 60 * 0.5) плохо.push(`${m} мин: набралось всего ${total} с`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 длиннее время — БОЛЬШЕ шагов, иначе выбор ничего не меняет', () => {
    const n = ДЛИТЕЛЬНОСТИ.map((m) => chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 }).length);
    for (let i = 1; i < n.length; i++) expect(`${ДЛИТЕЛЬНОСТИ[i]}: ${n[i]!} > ${n[i - 1]!}`).toBe(`${ДЛИТЕЛЬНОСТИ[i]}: ${n[i]!} > ${n[i - 1]!}`);
    expect(n[0]!).toBeLessThan(n[1]!);
    expect(n[1]!).toBeLessThan(n[2]!);
  });

  it('пустого набора не бывает даже на пяти минутах', () => {
    for (const m of ДЛИТЕЛЬНОСТИ) expect(chessWarmupSteps({ minutes: m, blindLevel: 1, mateLevel: 1 }).length).toBeGreaterThan(0);
  });

  it('уровень ниже первого не выдаётся', () => {
    const s = chessWarmupSteps({ minutes: 10, blindLevel: 0, mateLevel: -3 });
    expect(s.every((x) => Number(x.settings?.level) >= 1)).toBe(true);
  });

  it('сборка отдаёт готовый набор с подсчитанным временем', () => {
    const meta = buildChessWarmup({ minutes: 10, blindLevel: 5, mateLevel: 12 });
    expect(meta.steps.length).toBeGreaterThan(0);
    expect(meta.est_total_sec).toBe(meta.steps.reduce((a, x) => a + x.est_duration_sec, 0));
    expect(meta.duration_min).toBeGreaterThanOrEqual(5);
    // Оценки длительности берутся из самих упражнений, а не с потолка.
    expect(ШАГ_МАТ_СЕК).toBeLessThan(ШАГ_ДОСКА_СЕК);
  });
});
