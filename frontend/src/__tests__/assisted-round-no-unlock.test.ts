/* psygames-assisted-round-no-unlock · VER 1 · 22.08.2026 */
/**
 * КУПЛЕННАЯ ПОМОЩЬ НЕ ПОКУПАЕТ ПРОГРЕСС.
 *
 * 🔴 ЧТО НАШЛОСЬ. Правило замерных игр записано рядом со «Спаном по клеткам»:
 * «здесь лимит ошибок И ЕСТЬ измерение… второй жизни тут нет и не будет; продаётся
 * ОБРАТНОЕ — право сыграть так, чтобы партия не записалась никуда». Правило есть в
 * одном экране; в «Мишенях» — замерной игре, где в партию пишутся среднее время
 * реакции и его разброс, — продаётся вторая жизнь.
 *
 * Уровень в самой игре при покупке уже замораживался (`ladderFrozenRef`). А
 * РАЗБЛОКИРОВКА содержимого — нет: она смотрит на `mean_rt` из партии. Человек
 * умирал на тридцатом раунде, докупал жизнь, доигрывал до шестидесятого — и
 * открывал уровень, которого не взял. Замер продлённой партии это не его замер.
 *
 * ⚠️ ЧТО ЗДЕСЬ НЕ ДЕЛАЕТСЯ. Счёт за партию у человека не отнимается: он заплатил,
 * чтобы доиграть, и отнятый счёт был бы подменой сделки. Гасится ровно одно —
 * покупка прогресса.
 */
import { assistedRound } from '@/src/services/level-unlocks';
import type { GameSession } from '@/src/services/api';

const round = (extra: Record<string, unknown>): GameSession => ({
  game_type: 'targets',
  score: 500,
  errors: 0,
  time_seconds: 0.42,
  difficulty: 'Level 9',
  details: { level: 9, hits: 60, mean_rt: 420, std_rt: 80, n_targets: 60, ...extra },
} as unknown as GameSession);

describe('партия с купленной помощью', () => {
  it('🔴 помеченная партия распознаётся как вспомогательная', () => {
    expect(assistedRound(round({ assisted: true }))).toBe(true);
  });

  it('🔴 обычная партия вспомогательной не считается', () => {
    expect(assistedRound(round({ assisted: false }))).toBe(false);
    expect(assistedRound(round({}))).toBe(false);
  });

  /** ⚠️ Метка — булева. Строка «true» или единица не должны сходить за неё. */
  it('🔴 меткой считается только настоящий признак, а не что-то похожее', () => {
    for (const v of ['true', 1, 'yes', {}]) {
      expect(`${JSON.stringify(v)}: ${assistedRound(round({ assisted: v }))}`).toBe(`${JSON.stringify(v)}: false`);
    }
  });

  it('🔴 «Мишени» ставят метку в партию, а разблокировка её читает', () => {
    const fs = require('fs');
    const path = require('path');
    const screen: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/targets.tsx'), 'utf8');
    expect(screen).toMatch(/assisted: usedLifeRef\.current/);
    const unlocks: string = fs.readFileSync(path.resolve(__dirname, '../services/level-unlocks.ts'), 'utf8');
    expect(unlocks).toMatch(/if \(assistedRound\(session\)\) return null;/);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Погасить разблокировку можно и жульничеством — вернув
   * null всегда. Тогда никто ничего не откроет, и проверка выше останется зелёной.
   */
  it('🔴 обычная партия по-прежнему отдаёт свой замер', () => {
    const { assistedRound: fn } = require('@/src/services/level-unlocks');
    expect(fn(round({}))).toBe(false);
    const unlocks: string = require('fs').readFileSync(
      require('path').resolve(__dirname, '../services/level-unlocks.ts'), 'utf8');
    // метрика достаётся, если партия не помечена
    expect(unlocks).toMatch(/case 'mean_rt_max': \{[\s\S]{0,120}mean_rt/);
  });
});

declare const __dirname: string;
declare function require(id: string): any;
