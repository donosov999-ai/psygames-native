import { catalogSearchRoute } from '../services/catalogSearchRoute';

describe('home catalog search route', () => {
  test('empty query opens the ordinary catalog', () => {
    expect(catalogSearchRoute('   ')).toBe('/games');
  });
  test('RU, spaces and query syntax remain one search parameter', () => {
    const uri = new URL(catalogSearchRoute('  Мосты & mode=Bridges  '), 'https://local.invalid');
    expect(uri.pathname).toBe('/games');
    expect([...uri.searchParams]).toEqual([['search', 'Мосты & mode=Bridges']]);
  });
});
