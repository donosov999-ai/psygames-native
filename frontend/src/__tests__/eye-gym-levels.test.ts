/**
 * Уровни гимнастики для глаз обязаны реально усложняться и не выходить за
 * границы ручных настроек.
 *
 * ЗАЧЕМ. Денис прямо сказал: уровень, который ничего не меняет, — украшение.
 * Здесь уровень поднимает ДВА параметра нагрузки, и легко незаметно сломать
 * ровно то, ради чего он заведён: перепутать знак, упереться в потолок на
 * середине лесенки, выехать за «5 минут» и «быстро».
 *
 * ⚠️ ПОТОЛОК ВАЖЕН НЕ МЕНЬШЕ РОСТА. Это упражнение для ГЛАЗ: нагрузка выше
 * верхней ручной настройки не тренирует, а утомляет. Тест стережёт обе стороны —
 * и что растёт, и что не перерастает.
 */
import {
  EYE_GYM_MAX_LEVEL,
  clampEyeGymLevel,
  eyeGymLevel,
  eyeGymLevelMinutes,
} from '../services/eyeGymLevels';

const ALL = Array.from({ length: EYE_GYM_MAX_LEVEL }, (_, i) => i + 1);

describe('уровни гимнастики для глаз', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(EYE_GYM_MAX_LEVEL).toBeGreaterThanOrEqual(10);
  });

  it('нагрузка растёт СТРОГО от уровня к уровню — оба параметра', () => {
    const flat: string[] = [];
    for (let n = 2; n <= EYE_GYM_MAX_LEVEL; n++) {
      const prev = eyeGymLevel(n - 1), cur = eyeGymLevel(n);
      if (!(cur.scale > prev.scale)) flat.push(`уровень ${n}: длительность ${prev.scale} → ${cur.scale}`);
      if (!(cur.speed > prev.speed)) flat.push(`уровень ${n}: скорость ${prev.speed} → ${cur.speed}`);
    }
    expect(flat).toEqual([]);
  });

  it('первый уровень — нижняя ручная настройка, последний — верхняя', () => {
    expect(eyeGymLevel(1)).toEqual({ scale: 0.4, speed: 0.7 });
    expect(eyeGymLevel(EYE_GYM_MAX_LEVEL)).toEqual({ scale: 1.7, speed: 1.4 });
  });

  it('за пределы ручных настроек не выходим ни на одном уровне', () => {
    const over = ALL
      .map((n) => ({ n, ...eyeGymLevel(n) }))
      .filter((c) => c.scale > 1.7 || c.speed > 1.4 || c.scale < 0.4 || c.speed < 0.7)
      .map((c) => `уровень ${c.n}: ${c.scale} / ${c.speed}`);
    expect(over).toEqual([]);
  });

  it('нет рывков: соседние уровни не отличаются больше чем на пятую часть диапазона', () => {
    const jumps: string[] = [];
    for (let n = 2; n <= EYE_GYM_MAX_LEVEL; n++) {
      const prev = eyeGymLevel(n - 1), cur = eyeGymLevel(n);
      if (cur.scale - prev.scale > (1.7 - 0.4) / 5) jumps.push(`длительность на ${n}`);
      if (cur.speed - prev.speed > (1.4 - 0.7) / 5) jumps.push(`скорость на ${n}`);
    }
    expect(jumps).toEqual([]);
  });

  it('мусор на входе не роняет и не выкидывает за лесенку', () => {
    expect(clampEyeGymLevel(0)).toBe(1);
    expect(clampEyeGymLevel(-7)).toBe(1);
    expect(clampEyeGymLevel(999)).toBe(EYE_GYM_MAX_LEVEL);
    expect(clampEyeGymLevel(NaN)).toBe(1);
    expect(clampEyeGymLevel(4.8)).toBe(4);
    expect(eyeGymLevel(999)).toEqual(eyeGymLevel(EYE_GYM_MAX_LEVEL));
  });

  it('числа круглые — иначе в сессии оседает 0.9928571428571429', () => {
    // ⚠️ Сравнивать `v * 100 === Math.round(v * 100)` НЕЛЬЗЯ: 1.14 * 100 в двоичной
    // плавающей точке даёт 114.00000000000001, и верное значение объявляется кривым.
    // Первая версия теста ровно так и падала на исправном коде. Сверяем с допуском.
    const ugly = ALL
      .flatMap((n) => [eyeGymLevel(n).scale, eyeGymLevel(n).speed])
      .filter((v) => Math.abs(v * 100 - Math.round(v * 100)) > 1e-9);
    expect(ugly).toEqual([]);
  });

  it('подпись — целое число минут, не ноль и не дробь', () => {
    const BASE = 174;   // полная последовательность в базовых секундах
    const bad = ALL
      .map((n) => ({ n, m: eyeGymLevelMinutes(n, BASE) }))
      .filter((x) => !Number.isInteger(x.m) || x.m < 1)
      .map((x) => `уровень ${x.n}: ${x.m}`);
    expect(bad).toEqual([]);
    // и подпись тоже обязана расти, иначе на тропинке все узлы подписаны одинаково
    expect(eyeGymLevelMinutes(EYE_GYM_MAX_LEVEL, BASE)).toBeGreaterThan(eyeGymLevelMinutes(1, BASE));
  });
});
