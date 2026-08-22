/* psygames-level-stars-best · VER 1 · 22.08.2026 */
/**
 * ЗВЁЗДЫ ЗА УРОВЕНЬ ХРАНЯТ ЛУЧШЕЕ, А НЕ ПОСЛЕДНЕЕ.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026. Обещание «хранится ЛУЧШИЙ результат» записано в
 * ТРЁХ местах — в шапке `usePersistentLevel`, в подсказке `LanguageContext` и в
 * вызове из `LevelCleared` — и на нём держится весь смысл переигровки: вернуться
 * на пройденный уровень и добрать звёзды. Проверял его при этом НИКТО: мутация
 * «писать всегда, а не только при улучшении» оставалась зелёной.
 *
 * ⚠️ ЧЕМ ЭТО ПАХНЕТ ДЛЯ ЧЕЛОВЕКА. Три звезды за уровень, потом ленивая
 * переигровка того же уровня на одну — и три превращаются в одну. Наказание за
 * то, что игра сама предлагает сделать. Причём молча: ошибки нет, экран
 * нормальный, замечает только тот, кто помнит, сколько у него было.
 *
 * ⚠️ И ПОЧЕМУ ГЕЙТ ГОНЯЕТ ФУНКЦИЮ, А НЕ ИЩЕТ СТРОЧКУ. Обещание уже живёт
 * комментарием в трёх местах — четвёртый комментарий ничего не сторожит.
 * Сторожит только вызов.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveLevelStars, getLevelStars } from '@/src/services/levelStars';

const G = 'schulte_table';

describe('лучшие звёзды за уровень', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('переигровка хуже не портит уже заработанное', async () => {
    await saveLevelStars(G, 'p1', 5, 3);
    await saveLevelStars(G, 'p1', 5, 1);          // вернулся и сыграл спустя рукава
    expect((await getLevelStars(G, 'p1'))[5]).toBe(3);
  });

  it('переигровка лучше — засчитывается, иначе добирать нечего', async () => {
    await saveLevelStars(G, 'p1', 5, 1);
    await saveLevelStars(G, 'p1', 5, 3);
    expect((await getLevelStars(G, 'p1'))[5]).toBe(3);
  });

  it('тот же результат ничего не ломает', async () => {
    await saveLevelStars(G, 'p1', 5, 2);
    await saveLevelStars(G, 'p1', 5, 2);
    expect((await getLevelStars(G, 'p1'))[5]).toBe(2);
  });

  it('уровни живут порознь — лучшее на пятом не подменяет шестой', async () => {
    await saveLevelStars(G, 'p1', 5, 3);
    await saveLevelStars(G, 'p1', 6, 1);
    const map = await getLevelStars(G, 'p1');
    expect([map[5], map[6]]).toEqual([3, 1]);
  });

  /**
   * Семейное устройство: у каждого профиля свои звёзды. Иначе Алекс, переиграв
   * уровень отца на одну звезду, стёр бы его три.
   */
  it('профили не делят звёзды', async () => {
    await saveLevelStars(G, 'p1', 5, 3);
    await saveLevelStars(G, 'p2', 5, 1);
    expect((await getLevelStars(G, 'p1'))[5]).toBe(3);
    expect((await getLevelStars(G, 'p2'))[5]).toBe(1);
  });

  it('игры не делят звёзды', async () => {
    await saveLevelStars(G, 'p1', 5, 3);
    await saveLevelStars('corsi', 'p1', 5, 1);
    expect((await getLevelStars(G, 'p1'))[5]).toBe(3);
    expect((await getLevelStars('corsi', 'p1'))[5]).toBe(1);
  });

  it('ничего не играно — карта пуста, а не полна нулей', async () => {
    expect(await getLevelStars(G, 'p1')).toEqual({});
  });
});
