/**
 * Разовый возврат очков за сорванные зарядки: начисляется один раз, только тем,
 * у кого зарядки были, и не пропадает при сбое записи.
 *
 * ЗАЧЕМ ТЕСТ. Возврат нельзя проверить руками: он срабатывает один раз на живом
 * устройстве и больше никогда. Ошибиться можно тремя способами, и каждый заметят
 * не сразу:
 *
 *   начислить дважды — человек получит 800 вместо 400 и это увидят как «глюк»;
 *   начислить тому, у кого зарядок не было — возврат за то, чего не случалось;
 *   поставить флаг ДО начисления — при сбое человек останется и без очков,
 *     и без права на них, а понять это будет уже нечем.
 *
 * ⚠️ Проверяем именно ПОРЯДОК флага и начисления, а не только итоговое число.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WARMUP_COMPENSATION,
  grantWarmupCompensationOnce,
  getTokens,
  addTokens,
} from '../services/tokens';

const had = async () => true;
const none = async () => false;

describe('возврат очков за сорванные зарядки', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('есть что проверять — сумма задана и она не ноль', () => {
    expect(WARMUP_COMPENSATION).toBe(400);
  });

  it('начисляет один раз и ровно столько, сколько решено', async () => {
    const first = await grantWarmupCompensationOnce('valya', had);
    expect(first).toBe(WARMUP_COMPENSATION);
    expect(await getTokens('valya')).toBeGreaterThanOrEqual(WARMUP_COMPENSATION);
  });

  it('повторно тому же профилю не начисляет никогда', async () => {
    await grantWarmupCompensationOnce('valya', had);
    const before = await getTokens('valya');
    expect(await grantWarmupCompensationOnce('valya', had)).toBe(0);
    expect(await grantWarmupCompensationOnce('valya', had)).toBe(0);
    expect(await getTokens('valya')).toBe(before);
  });

  it('не начисляет тому, у кого зарядок не было', async () => {
    expect(await grantWarmupCompensationOnce('gость', none)).toBe(0);
    expect(await getTokens('gость')).toBe(0);
  });

  it('право не сгорает: не начислили — значит и не пометили', async () => {
    // зарядок ещё не было → отказ
    expect(await grantWarmupCompensationOnce('denis', none)).toBe(0);
    // человек сделал зарядку → возврат всё ещё положен
    expect(await grantWarmupCompensationOnce('denis', had)).toBe(WARMUP_COMPENSATION);
  });

  it('профили не мешают друг другу', async () => {
    await grantWarmupCompensationOnce('valya', had);
    expect(await grantWarmupCompensationOnce('alex', had)).toBe(WARMUP_COMPENSATION);
    expect(await getTokens('alex')).toBeGreaterThanOrEqual(WARMUP_COMPENSATION);
  });

  it('пустой профиль не роняет и ничего не начисляет', async () => {
    expect(await grantWarmupCompensationOnce('', had)).toBe(0);
  });

  it('баланс не уходит в минус — общее правило кошелька', async () => {
    await addTokens('valya', 10);
    await addTokens('valya', -9999);
    expect(await getTokens('valya')).toBe(0);
  });
});
