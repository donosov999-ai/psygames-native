/**
 * ЧАСЫ ИГРЫ СТОЯТ, ПОКА ЧЕЛОВЕК ПИШЕТ ОТЗЫВ.
 *
 * 🔴 ЗАЧЕМ. Репорт тестировщицы 18.08.2026 дословно: «И пока я писала отзыв,
 * игра моя закончилась оказывается, когда пишешь отзыв таймер продолжает
 * работать. Несправедливость».
 *
 * Отзывы — единственный канал, по которому мы вообще узнаём о проблемах, и мы
 * сделали так, что пожаловаться стоит человеку партии.
 *
 * 🔴 ЧТО ИМЕННО ЗДЕСЬ СТЕРЕЖЁТСЯ. Первая попытка починки (19.08 утром) написала
 * механику и НЕ подключила её: `GameShell` рисовал затемнение «Пауза», а
 * `setInterval` в 37 играх считали от `Date.now()` и тикали дальше. Оверлей был
 * косметикой поверх работающего таймера — то есть репорт выглядел закрытым,
 * оставаясь открытым. Поэтому проверяем не наличие модуля, а ПОВЕДЕНИЕ часов.
 */
import { holdGame, isGameHeld, gameNow, heldTotalMs, __resetGameClock, onGameHold } from '@/src/services/gamePause';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(__resetGameClock);

describe('игровые часы', () => {
  it('без паузы идут вровень с настенными', async () => {
    const a = gameNow(); const w = Date.now();
    await sleep(40);
    expect(Math.abs((gameNow() - a) - (Date.now() - w))).toBeLessThan(8);
  });

  it('🔴 во время паузы стоят', async () => {
    const started = gameNow();
    const release = holdGame();
    await sleep(60);
    const duringPause = gameNow() - started;
    release();
    expect(duringPause).toBeLessThan(20);        // почти ноль игрового времени
    expect(heldTotalMs()).toBeGreaterThanOrEqual(50);
  });

  it('после снятия идут дальше, а простой не возвращается', async () => {
    const started = gameNow();
    const release = holdGame();
    await sleep(50);
    release();
    await sleep(40);
    const played = gameNow() - started;
    expect(played).toBeGreaterThanOrEqual(30);
    expect(played).toBeLessThan(75);             // 50 мс простоя не засчитаны
  });

  /** Поверх отзыва может открыться ещё окно; снятие одного не отпускает все. */
  it('вложенные паузы: часы идут только после последнего снятия', async () => {
    const started = gameNow();
    const r1 = holdGame();
    const r2 = holdGame();
    r1();
    expect(isGameHeld()).toBe(true);
    await sleep(50);
    r2();
    expect(isGameHeld()).toBe(false);
    expect(gameNow() - started).toBeLessThan(25);
  });

  it('двойное снятие не уводит счётчик в минус', () => {
    const r = holdGame();
    r(); r(); r();
    expect(isGameHeld()).toBe(false);
    const r2 = holdGame();
    expect(isGameHeld()).toBe(true);
    r2();
  });

  it('подписчики узнают об обоих краях паузы', () => {
    const seen: boolean[] = [];
    const off = onGameHold((p) => seen.push(p));
    const r = holdGame(); r();
    off();
    expect(seen).toEqual([true, false]);
  });
});
