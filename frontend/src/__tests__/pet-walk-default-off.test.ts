/* psygames-pet-walk-default-off · VER 1 · 07.10.2026 */
/**
 * 🔴 ГУЛЯЮЩИЙ ПИТОМЕЦ ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН (решение Дениса 07.10.2026, задача ed85e191).
 *
 * Питомец ходил поверх текста карточек («Сегодня» на Главной). Прогулку включает только явное
 * «да» в настройках. Одно правило на веб и нативную оболочку: оболочка (после #231) берёт `visible`
 * из `petHostAnswer('config')`, который зовёт тот же `getPetVisible`; нативные Настройки читают '1'.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPetVisible, setPetVisible } from '@/src/services/pet';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('гуляющий питомец — по умолчанию выкл.', () => {
  it('🔴 нет записи — не гуляет; «да» в настройках — гуляет; «нет» — не гуляет', async () => {
    expect(await getPetVisible()).toBe(false);
    await setPetVisible(true);
    expect(await getPetVisible()).toBe(true);
    await setPetVisible(false);
    expect(await getPetVisible()).toBe(false);
  });
});
