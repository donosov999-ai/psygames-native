import { hudTime } from '@/src/services/hudTime';

/**
 * Отчёт 03.09.2026 (судоку): в шапке шесть счётчиков, время писалось как «295.3с» —
 * шесть знаков там, где хватает трёх, и крайний счётчик переставал помещаться.
 */
describe('время в шапке короткое', () => {
  it('до минуты — целые секунды', () => {
    expect(hudTime(0)).toBe('0с');
    expect(hudTime(47.9)).toBe('47с');
    expect(hudTime(59.99)).toBe('59с');
  });

  it('🔴 после минуты — минуты и секунды, а не сотни секунд', () => {
    expect(hudTime(60)).toBe('1:00');
    expect(hudTime(295.3)).toBe('4:55');
    expect(hudTime(3599)).toBe('59:59');
  });

  it('после часа — часы', () => {
    expect(hudTime(3600)).toBe('1:00:00');
    expect(hudTime(3895)).toBe('1:04:55');
  });

  it('🔴 строка не растёт со временем партии дольше шести знаков', () => {
    const длины = [0, 9, 59, 60, 599, 3599, 3600, 35999].map((s) => hudTime(s).length);
    expect(Math.max(...длины)).toBeLessThanOrEqual(7);
  });

  it('отрицательное и мусор не ломают', () => {
    expect(hudTime(-5)).toBe('0с');
    expect(hudTime(Number.NaN)).toBe('0с');
  });

  it('суффикс секунд берётся из языка', () => {
    expect(hudTime(30, 's')).toBe('30s');
  });
});
