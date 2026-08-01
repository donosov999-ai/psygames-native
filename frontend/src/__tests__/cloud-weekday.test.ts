/**
 * Регресс-гейт: колонка cognitive_sessions.weekday — ТЕКСТ с CHECK IN ('mon'…'sun'),
 * а в сессии лежит число 0-6. Пока слали число, КАЖДАЯ сессия зарядки отлетала с
 * 23514 в outbox, а outbox вешался на первой же такой строке и хоронил синк целиком —
 * включая исправные сессии за ней. В облаке за всё время не было ни одной сессии
 * комплекса: разбирать репорты вроде «где третья игра» было не по чему.
 */
import { weekdayName } from '@/src/services/api';

describe('weekdayName: число дня недели → имя, которого ждёт колонка', () => {
  it('0-6 (вс-сб, как Date.getDay) → sun…sat', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(weekdayName))
      .toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });

  it('готовое имя пропускает как есть', () => {
    expect(weekdayName('wed')).toBe('wed');
  });

  it('всё, что колонка не примет, превращает в null — строка не должна падать на CHECK', () => {
    for (const bad of [7, -1, 1.5, 'friday', 'ПН', '', null, undefined, {}]) {
      expect(weekdayName(bad)).toBeNull();
    }
  });
});
