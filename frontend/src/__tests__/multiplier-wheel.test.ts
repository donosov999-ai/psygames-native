import { WHEEL, wheelMean, spinWheel, angleForSector, applyWheel } from '@/src/services/multiplierWheel';

/**
 * Задача ac44fc2d, пункт 5. У эталона колесо ×1.5·×2·×3·×2·×1.5 после уровня, и оно
 * же место для рекламы. У нас рекламы нет — берём механику без кассы.
 */
describe('колесо множителя', () => {
  it('доли складываются в целый круг', () => {
    const сумма = WHEEL.reduce((s, x) => s + x.weight, 0);
    expect(Math.abs(сумма - 1)).toBeLessThan(1e-9);
  });

  it('🔴 среднее около ×1.75 — колесо не удваивает экономику молча', () => {
    const m = wheelMean();
    expect(m).toBeGreaterThan(1.5);
    expect(m).toBeLessThan(2.0);
  });

  it('🔴 крупный сектор не соседствует с крупным: «почти выиграл» не возникает', () => {
    const max = Math.max(...WHEEL.map((x) => x.mult));
    const плохие: string[] = [];
    for (let i = 0; i < WHEEL.length; i += 1) {
      const сосед = WHEEL[(i + 1) % WHEEL.length];
      if (WHEEL[i].mult === max && сосед.mult === max) плохие.push(`${i} и ${i + 1}`);
    }
    expect(плохие).toEqual([]);
  });

  it('🔴 исход воспроизводим: одно зерно — один результат', () => {
    for (const r of [0, 0.1, 0.29, 0.31, 0.55, 0.6, 0.9, 0.999]) {
      expect(spinWheel(r)).toEqual(spinWheel(r));
    }
  });

  it('каждый сектор достижим, и распределение совпадает с весами', () => {
    const счёт = new Array(WHEEL.length).fill(0);
    const N = 20000;
    for (let i = 0; i < N; i += 1) счёт[spinWheel((i + 0.5) / N).index] += 1;
    счёт.forEach((n, i) => {
      expect(n).toBeGreaterThan(0);
      expect(Math.abs(n / N - WHEEL[i].weight)).toBeLessThan(0.01);
    });
  });

  it('мусор на входе не ломает', () => {
    expect(spinWheel(Number.NaN).index).toBe(0);
    expect(spinWheel(-1).index).toBe(0);
    expect(spinWheel(5).index).toBe(WHEEL.length - 1);
  });

  it('угол целится в середину сектора, а не в край', () => {
    for (let i = 0; i < WHEEL.length; i += 1) {
      const a = angleForSector(i);
      let before = 0;
      for (let k = 0; k < i; k += 1) before += WHEEL[k].weight;
      expect(a).toBeGreaterThan(before * 360);
      expect(a).toBeLessThan((before + WHEEL[i].weight) * 360);
    }
  });

  it('🔴 множитель не отнимает: округление вверх', () => {
    expect(applyWheel(7, 1.5)).toBe(11);
    expect(applyWheel(1, 1.5)).toBe(2);
    expect(applyWheel(0, 3)).toBe(0);
    expect(applyWheel(-5, 3)).toBe(0);
  });
});
