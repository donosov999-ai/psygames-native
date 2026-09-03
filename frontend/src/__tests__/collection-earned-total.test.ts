import AsyncStorage from '@react-native-async-storage/async-storage';
import { earnedTotal, addEarned, chestState } from '@/src/services/collection';
import { addTokens, getTokens } from '@/src/services/tokens';

/**
 * 🔴 ГЛАВНОЕ РЕШЕНИЕ СУНДУКА: он считает ЗАРАБОТАННОЕ за всё время, а не остаток
 * на счету. Если бы он смотрел на баланс, покупка в магазине двигала бы долгую
 * цель НАЗАД — игрок наказан за то, что пользуется валютой. Проверяется тратой.
 */
describe('заработано за всё время', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('🔴 трата НЕ откатывает цель: потратил всё — коллекция на месте', async () => {
    const p = 'p1';
    await addEarned(p, 1000);
    const доТраты = chestState(await earnedTotal(p)).have;
    expect(доТраты).toBeGreaterThan(0);

    await addTokens(p, 1000);
    await addTokens(p, -1000);                 // всё спустили в магазине
    expect(await getTokens(p)).toBe(0);

    expect(await earnedTotal(p)).toBe(1000);   // заработанное не тронуто
    expect(chestState(await earnedTotal(p)).have).toBe(доТраты);
  });

  it('🔴 у игрока со стажем счётчик не начинается с нуля', async () => {
    const p = 'p2';
    await addTokens(p, 900);                   // звёзды есть, счётчика ещё нет
    expect(await earnedTotal(p)).toBe(900);    // поднялся до баланса, а не 0
    expect(chestState(900).have).toBeGreaterThan(0);
  });

  it('величина только растёт: отрицательное и мусор не проходят', async () => {
    const p = 'p3';
    await addEarned(p, 500);
    await addEarned(p, -300);
    await addEarned(p, Number.NaN);
    await addEarned(p, 0);
    expect(await earnedTotal(p)).toBe(500);
  });

  it('копится между заходами, профили не смешиваются', async () => {
    await addEarned('a', 120);
    await addEarned('b', 70);
    await addEarned('a', 80);
    expect(await earnedTotal('a')).toBe(200);
    expect(await earnedTotal('b')).toBe(70);
  });

  it('пустой профиль не роняет', async () => {
    expect(await earnedTotal('')).toBe(0);
    expect(await addEarned('', 50)).toBe(0);
  });
});
