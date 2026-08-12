import {
  clearGameContextHelp,
  getGameContextHelp,
  publishGameContextHelp,
  subscribeGameContextHelp,
} from '@/src/services/gameContextHelp';

describe('gameContextHelp — правило текущего раунда в глобальной справке', () => {
  afterEach(() => {
    clearGameContextHelp('sudoku');
    clearGameContextHelp('other-game');
  });

  it('возвращает справку только экрану, который её опубликовал', () => {
    const help = { gameId: 'sudoku', title: '⟍ диагональ', body: 'Текущее правило' };
    publishGameContextHelp(help);

    expect(getGameContextHelp('sudoku')).toEqual(help);
    expect(getGameContextHelp('other-game')).toBeNull();
  });

  it('обновляет подписчика и очищает запись при уходе из игры', () => {
    const seen: unknown[] = [];
    const sub = subscribeGameContextHelp((help) => seen.push(help));
    const help = { gameId: 'sudoku', title: 'Правила', body: 'Базовое правило' };

    publishGameContextHelp(help);
    clearGameContextHelp('sudoku');
    sub.remove();

    expect(seen).toEqual([help, null]);
    expect(getGameContextHelp('sudoku')).toBeNull();
  });
});
