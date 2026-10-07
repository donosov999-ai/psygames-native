import { feedbackSource } from '../services/feedbackSource';

describe('native feedback screen context', () => {
  it('keeps the game and selected puzzle mode', () => {
    expect(feedbackSource('/feedback', '/games/puzzles?mode=Light%20Up&wu=1'))
      .toEqual({ screen: '/games/puzzles', params: { mode: 'Light Up', wu: '1' } });
  });
  it('does not override ordinary web screens or trust external sources', () => {
    expect(feedbackSource('/games/sudoku', '/games/puzzles')).toEqual({ screen: '/games/sudoku', params: {} });
    expect(feedbackSource('/feedback', 'https://example.com/games/sudoku')).toEqual({ screen: '/feedback', params: {} });
  });
});
