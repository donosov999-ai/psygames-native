/**
 * 🔴 БАЛАНС ТРЕНИРОВОК ИЩЕТ РАЗДЕЛ ПО ТИПУ ПАРТИИ, А НЕ ПО ID КАРТОЧКИ.
 *
 * У самурая, фрактала и глубокого фрактала id карточки через дефис, а партия пишется
 * через подчёркивание (`sessionType`). Экран статистики искал раздел по id, и все их
 * партии выпадали из баланса молча — замер 30.09.2026: 17 из 612 партий профиля NZT-48.
 *
 * Проба идёт по ВСЕМУ каталогу, а не по трём известным судоку: следующая игра со своим
 * `sessionType` выпала бы точно так же.
 */
import { GAMES, sessionTypeOf, categoryOfSessionType } from '@/src/constants/games';

describe('раздел по типу партии', () => {
  it('каждая игра каталога находит свой раздел по тому типу, под которым пишет партии', () => {
    const потерянные = GAMES.filter((g) => categoryOfSessionType(sessionTypeOf(g)) !== g.category)
      .map((g) => `${g.id} (пишет ${sessionTypeOf(g)})`);
    expect(потерянные).toEqual([]);
  });

  it('три судоку с отдельным типом партии попадают в логику', () => {
    for (const t of ['sudoku_samurai', 'sudoku_fractal', 'sudoku_fractal_deep']) {
      expect(categoryOfSessionType(t)).toBe('logic');
    }
  });

  it('проба не пустая: у кого-то тип партии отличается от id — иначе мерить нечего', () => {
    expect(GAMES.filter((g) => sessionTypeOf(g) !== g.id).length).toBeGreaterThanOrEqual(3);
  });
});
