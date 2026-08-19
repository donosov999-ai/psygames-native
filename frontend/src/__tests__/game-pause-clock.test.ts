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

/**
 * ⚠️ СРАВНИВАЕМ С НАСТЕННЫМ ВРЕМЕНЕМ, А НЕ С ЧИСЛОМ ИЗ `sleep`.
 *
 * Первая редакция ставила жёсткие границы («меньше 75 мс») в расчёте на то, что
 * `sleep(40)` спит ровно сорок. Под параллельной нагрузкой — а тесты гоняются
 * вместе с чужими наборами — таймер просыпается позже, и тест краснел на
 * ИСПРАВНОМ коде. Замечено соседним агентом 19.08.2026.
 *
 * Проверяем то, что и должны: сколько НАСТЕННОГО времени прошло, столько же
 * должно набежать игрового — минус ровно время простоя. Допуск считается от
 * измеренного, а не от ожидаемого.
 */
const TOL = 25;   // запас на дрожание планировщика под нагрузкой

describe('игровые часы', () => {
  it('без паузы идут вровень с настенными', async () => {
    const g0 = gameNow(); const w0 = Date.now();
    await sleep(40);
    const game = gameNow() - g0, wall = Date.now() - w0;
    expect(Math.abs(game - wall)).toBeLessThan(TOL);
  });

  it('🔴 во время паузы стоят', async () => {
    const g0 = gameNow(); const w0 = Date.now();
    const release = holdGame();
    await sleep(60);
    const game = gameNow() - g0, wall = Date.now() - w0;
    release();
    // Настенных прошло не меньше 60, игровых — почти ноль.
    expect(wall).toBeGreaterThanOrEqual(50);
    expect(game).toBeLessThan(TOL);
    expect(heldTotalMs()).toBeGreaterThanOrEqual(wall - TOL);
  });

  it('после снятия идут дальше, а простой не возвращается', async () => {
    const g0 = gameNow(); const w0 = Date.now();
    const release = holdGame();
    await sleep(50);
    const wallPaused = Date.now() - w0;
    release();
    await sleep(40);
    const game = gameNow() - g0, wall = Date.now() - w0;
    // Игрового набежало ровно столько, сколько настенного ВНЕ паузы.
    expect(Math.abs(game - (wall - wallPaused))).toBeLessThan(TOL);
    expect(game).toBeLessThan(wall - 20);        // простой точно не засчитан
  });

  /** Поверх отзыва может открыться ещё окно; снятие одного не отпускает все. */
  it('вложенные паузы: часы идут только после последнего снятия', async () => {
    const g0 = gameNow();
    const r1 = holdGame();
    const r2 = holdGame();
    r1();
    expect(isGameHeld()).toBe(true);
    await sleep(50);
    r2();
    expect(isGameHeld()).toBe(false);
    expect(gameNow() - g0).toBeLessThan(TOL);
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
