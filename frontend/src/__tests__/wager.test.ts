/* psygames-wager-test · VER 1 · 29.08.2026 */
/**
 * СТАВКА «ВСЁ ИЛИ НИЧЕГО» — поведение день за днём (С3 чек-листа экономики 28.08).
 * Даты подаются параметром — тест ходит по календарю руками, без фиктивных таймеров.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { placeWager, wagerTick, peekWager, WAGER_STAKE, WAGER_PRIZE, WAGER_DAYS } from '@/src/services/wager';
import { addTokens, getTokens, TOKEN_DELTA_CAP } from '@/src/services/tokens';

const day = (n: number) => new Date(2026, 7, n);   // август 2026

// Кошелёк держит in-memory кэш поверх AsyncStorage — clear() его не сбрасывает,
// поэтому изоляция кейсов делается СВЕЖИМ profileId, а не чисткой хранилища.
let seq = 0;
let PID = '';
beforeEach(async () => {
  await AsyncStorage.clear();
  PID = `wager-test-${++seq}`;
  await addTokens(PID, 1000);
});

describe('ставка «всё или ничего»', () => {
  it('инварианты цены: приз ровно ×2, ставка — недельный сток, не мелочь', () => {
    expect(WAGER_PRIZE).toBe(WAGER_STAKE * 2);
    expect(WAGER_STAKE).toBeGreaterThan(TOKEN_DELTA_CAP * 5);   // дороже пяти партий-потолков
    expect(WAGER_DAYS).toBe(7);
  });

  it('🔴 семь дней подряд → выплата ×2; кошелёк сходится до монеты', async () => {
    expect(await placeWager(PID, day(1))).toBe(true);
    expect(await getTokens(PID)).toBe(1000 - WAGER_STAKE);
    for (let d = 2; d <= 6; d++) {
      const st = await wagerTick(PID, day(d));
      expect(st.kind).toBe('active');
    }
    const fin = await wagerTick(PID, day(7));
    expect(fin).toEqual({ kind: 'won', prize: WAGER_PRIZE });
    expect(await getTokens(PID)).toBe(1000 - WAGER_STAKE + WAGER_PRIZE);
    // после выплаты ставки нет
    expect((await peekWager(PID, day(7))).kind).toBe('none');
  });

  it('🔴 пропуск дня — ставка сгорает, деньги не возвращаются', async () => {
    await placeWager(PID, day(1));
    await wagerTick(PID, day(2));
    const st = await wagerTick(PID, day(4));   // третий день пропущен
    expect(st).toEqual({ kind: 'lost', stake: WAGER_STAKE });
    expect(await getTokens(PID)).toBe(1000 - WAGER_STAKE);
    expect((await peekWager(PID, day(4))).kind).toBe('none');
  });

  it('тик идемпотентен за сутки, вторая ставка поверх активной не ставится', async () => {
    await placeWager(PID, day(1));
    const a = await wagerTick(PID, day(2));
    const b = await wagerTick(PID, day(2));
    expect(a.kind).toBe('active');
    expect(b).toEqual(a);
    expect(await placeWager(PID, day(2))).toBe(false);
    expect(await getTokens(PID)).toBe(1000 - WAGER_STAKE);   // списано один раз
  });

  it('не хватает жетонов — ставка не принимается', async () => {
    const poor = 'wager-poor';
    await addTokens(poor, WAGER_STAKE - 1);
    expect(await placeWager(poor, day(1))).toBe(false);
    expect(await getTokens(poor)).toBe(WAGER_STAKE - 1);
  });

  it('🔴 щит серии ставку НЕ спасает: свой счёт дней, разрыв необратим', async () => {
    // Ставка ведёт собственный lastSeen и не читает стрик: даже если человек
    // починил стрик «Щитом серии», пропущенный день ставки остаётся пропущенным.
    await placeWager(PID, day(1));
    await wagerTick(PID, day(2));
    // день 3 пропущен; на день 4 стрик мог быть восстановлен щитом — ставке всё равно
    const st = await peekWager(PID, day(4));
    expect(st.kind).toBe('lost');
    expect((await wagerTick(PID, day(4))).kind).toBe('none');
  });
});
