import { FIGURES, chestState, figureUnlocked } from '@/src/services/collection';

/**
 * СУНДУК — долгая цель (задача 6e564484, шаг 3). Проверяется не «есть ли файл», а
 * поведение цели: она обязана расти, не откатываться и не показывать недостижимое.
 */
describe('сундук и коллекция', () => {
  it('двенадцать ступеней, пороги строго растут', () => {
    expect(FIGURES.length).toBe(12);
    for (let i = 1; i < FIGURES.length; i += 1) {
      expect(FIGURES[i].at).toBeGreaterThan(FIGURES[i - 1].at);
    }
  });

  it('🔴 первая фигурка — на один вечер, а не на месяц', () => {
    // Партия даёт до 50 звёзд, с множителем до 100; заход из пяти партий 150–250.
    expect(FIGURES[0].at).toBeLessThanOrEqual(250);
    expect(FIGURES[0].at).toBeGreaterThan(0);
  });

  it('🔴 шаг растёт, но не круче чем в полтора раза — витрина не встаёт к середине', () => {
    const крутые: string[] = [];
    for (let i = 1; i < FIGURES.length; i += 1) {
      const пред = i === 1 ? FIGURES[0].at : FIGURES[i - 1].at - FIGURES[i - 2].at;
      const этот = FIGURES[i].at - FIGURES[i - 1].at;
      if (этот > пред * 1.5 + 1) крутые.push(`${FIGURES[i].key}: ${пред} → ${этот}`);
    }
    expect(крутые).toEqual([]);
  });

  it('пустой счёт: ничего не собрано, цель — первая фигурка', () => {
    const s = chestState(0);
    expect(s.have).toBe(0);
    expect(s.next?.key).toBe(FIGURES[0].key);
    expect(s.left).toBe(FIGURES[0].at);
    expect(s.ratio).toBe(0);
  });

  it('🔴 полоска показывает ТЕКУЩУЮ ступень, а не весь путь', () => {
    // Ровно посередине между первой и второй фигуркой полоска обязана быть ~половиной,
    // а не долей от 17000: «120 из 17000» отговаривает начинать.
    const середина = (FIGURES[0].at + FIGURES[1].at) / 2;
    const s = chestState(середина);
    expect(s.have).toBe(1);
    expect(Math.abs(s.ratio - 0.5)).toBeLessThan(0.02);
  });

  it('ровно на пороге фигурка уже собрана', () => {
    expect(chestState(FIGURES[0].at).have).toBe(1);
    expect(chestState(FIGURES[0].at - 1).have).toBe(0);
  });

  it('всё собрано: следующей нет, остаток ноль, полоска полная', () => {
    const s = chestState(FIGURES[FIGURES.length - 1].at + 5000);
    expect(s.have).toBe(12);
    expect(s.next).toBeNull();
    expect(s.left).toBe(0);
    expect(s.ratio).toBe(1);
  });

  it('🔴 цель никогда не идёт назад: собранное не убывает с ростом заработанного', () => {
    let было = -1;
    for (let e = 0; e <= 18000; e += 137) {
      const h = chestState(e).have;
      expect(h).toBeGreaterThanOrEqual(было);
      было = h;
    }
  });

  it('открытие фигурки замечается ровно один раз', () => {
    expect(figureUnlocked(0, FIGURES[0].at - 1)).toBeNull();
    expect(figureUnlocked(0, FIGURES[0].at)?.key).toBe(FIGURES[0].key);
    expect(figureUnlocked(FIGURES[0].at, FIGURES[0].at + 1)).toBeNull();
    expect(figureUnlocked(0, FIGURES[2].at)?.key).toBe(FIGURES[2].key);   // перепрыгнули — берём верхнюю
  });

  it('мусор на входе не ломает', () => {
    expect(chestState(Number.NaN).have).toBe(0);
    expect(chestState(-500).have).toBe(0);
    expect(chestState(-500).left).toBe(FIGURES[0].at);
  });
});
