/* psygames-game-timers-stand-on-pause · VER 1 · 16.09.2026 */
/**
 * ТАЙМЕРЫ ПАРТИИ СТОЯТ НА ПАУЗЕ — ПРОВЕРКА ПОВЕДЕНИЕМ.
 *
 * 📍 Повод — замер раздела «Внимание» 16.09.2026, Струп L1: меню паузы открыто, а
 * счётчик проб идёт 2/20 → 3/20 → 4/20 за 5 секунд. Пробы сменяет `setTimeout`, и
 * паузу он не видит. `gameTimeout` / `gameInterval` из `src/services/gamePause.ts`
 * обязаны на паузе стоять и после «Продолжить» дожидаться ровно остатка.
 *
 * Время двигают фальшивые таймеры jest: они же подменяют `Date.now`, на котором
 * стоят игровые часы, — значит часы и таймеры идут одним временем.
 */
import {
  __resetGameClock, clearGameTimer, gameInterval, gameTimeout, holdGame,
} from '@/src/services/gamePause';

beforeEach(() => {
  jest.useFakeTimers();
  __resetGameClock();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  __resetGameClock();
});

describe('gameTimeout — окно ответа не утекает на паузе', () => {
  it('без паузы срабатывает в срок, как setTimeout', () => {
    const fn = jest.fn();
    gameTimeout(fn, 1000);
    jest.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('🔴 пауза посреди окна: стоит сколько угодно, после «Продолжить» ждёт остаток', () => {
    const fn = jest.fn();
    gameTimeout(fn, 1000);
    jest.advanceTimersByTime(400);
    const снять = holdGame();
    jest.advanceTimersByTime(5000);
    expect(`на паузе сработал: ${fn.mock.calls.length} раз`).toBe('на паузе сработал: 0 раз');
    снять();
    jest.advanceTimersByTime(599);
    expect(`за 599 мс из остатка 600: ${fn.mock.calls.length}`).toBe('за 599 мс из остатка 600: 0');
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ НА ПАУЗЕ ТАЙМЕР СНЯТ, А НЕ КРУТИТСЯ ВХОЛОСТУЮ. Проверка срока при срабатывании
   * одна тоже не даст выстрелить раньше, но тогда таймер на паузе будит себя снова и
   * снова: пауза за миллисекунду до срока — это перезапуск каждую миллисекунду всё
   * время, пока человек пишет отзыв. Поэтому на паузе в очереди таймеров не должно
   * быть ничего.
   */
  it('🔴 на паузе в очереди нет ни одного таймера — холостых пробуждений нет', () => {
    const fn = jest.fn();
    gameTimeout(fn, 1000);
    jest.advanceTimersByTime(999);
    const снять = holdGame();
    expect(`таймеров на паузе: ${jest.getTimerCount()}`).toBe('таймеров на паузе: 0');
    jest.advanceTimersByTime(60_000);
    expect(fn).not.toHaveBeenCalled();
    снять();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('таймер, заведённый на паузе, начинает идти после неё', () => {
    const fn = jest.fn();
    const снять = holdGame();
    gameTimeout(fn, 300);
    jest.advanceTimersByTime(10_000);
    expect(fn).not.toHaveBeenCalled();
    снять();
    jest.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('вложенные паузы (меню, поверх отзыв): отпускает только последняя', () => {
    const fn = jest.fn();
    gameTimeout(fn, 500);
    const меню = holdGame();
    const отзыв = holdGame();
    меню();
    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    отзыв();
    jest.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('снятый таймер не срабатывает ни до, ни после паузы; снятие пустого ref — не ошибка', () => {
    const fn = jest.fn();
    const t = gameTimeout(fn, 200);
    const снять = holdGame();
    clearGameTimer(t);
    clearGameTimer(t);
    снять();
    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(() => { clearGameTimer(null); clearGameTimer(undefined); }).not.toThrow();
  });

  it('сработавший таймер больше не слушает паузу: новый цикл пауз его не будит', () => {
    const fn = jest.fn();
    gameTimeout(fn, 100);
    jest.advanceTimersByTime(100);
    for (let i = 0; i < 3; i += 1) { const снять = holdGame(); jest.advanceTimersByTime(50); снять(); }
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('gameInterval — тики партии стоят на паузе', () => {
  it('🔴 пауза между тиками: на паузе ни одного тика, после неё сетка продолжается с остатка', () => {
    const fn = jest.fn();
    const t = gameInterval(fn, 100);
    jest.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(2);
    const снять = holdGame();
    jest.advanceTimersByTime(1000);
    expect(`тиков на паузе: ${fn.mock.calls.length - 2}`).toBe('тиков на паузе: 0');
    снять();
    jest.advanceTimersByTime(49);
    expect(fn).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(4);
    clearGameTimer(t);
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('снятие изнутри тика останавливает интервал', () => {
    let тиков = 0;
    const t = gameInterval(() => { тиков += 1; if (тиков === 3) clearGameTimer(t); }, 10);
    jest.advanceTimersByTime(1000);
    expect(тиков).toBe(3);
  });
});
