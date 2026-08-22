/**
 * Чистые функции геймификации: tokenDelta, comboBonus, levelInfo (tokens.ts).
 * Формулы завязаны на экономику приложения — регресс здесь меняет начисления
 * всем игрокам молча.
 *
 * ⚠️ Аддитивная надбавка за серию чистых (`cleanRunBonus`) отсюда УБРАНА вместе с
 * самой надбавкой: за чистоту теперь платит множитель ×2, и проверяется он в
 * `earn-multiplier.test.ts`. Оставить здесь проверку удалённой формулы значило бы
 * держать зелёным гейт на механику, которой в приложении нет.
 */
import { tokenDelta, comboBonus, levelInfo, checkInAward, checkInStreakMaxLoss } from '@/src/services/tokens';
import { abilityById } from '@/src/services/abilities';

describe('tokenDelta', () => {
  it('счёт добавляет (score/20, округление), ошибки вычитают', () => {
    expect(tokenDelta(100, 0)).toBe(5);
    expect(tokenDelta(100, 3)).toBe(2);
    expect(tokenDelta(90, 0)).toBe(5);    // 4.5 → round → 5 (банковское НЕ используется)
    expect(tokenDelta(0, 0)).toBe(0);
  });
  it('v1.154: НЕ уходит в минус (пол 0), капится на 50, терпит мусор', () => {
    expect(tokenDelta(0, 4)).toBe(0);        // раньше −4 → скрытое списание; теперь пол 0
    expect(tokenDelta(60, 5)).toBe(0);       // 3−5=−2 → 0
    expect(tokenDelta(2000, 0)).toBe(50);    // 100 → кап 50 (анти-фарм)
    expect(tokenDelta(1000, 0)).toBe(50);    // ровно на потолке
    expect(tokenDelta(undefined as any, undefined as any)).toBe(0);
  });
});

describe('comboBonus (комбо зарядки ×1.5)', () => {
  const clean = (score: number) => ({ score, errors: 0 });
  const dirty = (score: number) => ({ score, errors: 2 });

  it('меньше 3 чистых подряд — бонуса нет', () => {
    expect(comboBonus([clean(100), clean(100)])).toEqual({ bonus: 0, streakLen: 2 });
    expect(comboBonus([clean(100), dirty(100), clean(100)])).toEqual({ bonus: 0, streakLen: 1 });
    expect(comboBonus([])).toEqual({ bonus: 0, streakLen: 0 });
  });

  it('3+ чистых подряд — бонус = 0.5 × сумма tokenDelta серии', () => {
    // 3 × tokenDelta(100,0)=5 → серия 15 → бонус 8 (round 7.5)
    expect(comboBonus([clean(100), clean(100), clean(100)])).toEqual({ bonus: 8, streakLen: 3 });
  });

  it('берётся самая длинная серия, а не первая', () => {
    const r = comboBonus([clean(100), dirty(50), clean(200), clean(200), clean(200), clean(200)]);
    expect(r.streakLen).toBe(4);
    expect(r.bonus).toBe(20);   // 4 × 10 = 40 → ×0.5
  });
});

describe('levelInfo', () => {
  it('пороги уровней и прогресс внутри уровня', () => {
    expect(levelInfo(0).level).toBe(0);
    expect(levelInfo(79).level).toBe(0);
    expect(levelInfo(80).level).toBe(1);
    expect(levelInfo(200).level).toBe(2);
    const li = levelInfo(140);   // уровень 1 (80..200), внутрь 60 из 120
    expect(li.level).toBe(1);
    expect(li.intoLevel).toBe(60);
    expect(li.progress).toBeCloseTo(0.5);
  });
  it('максимальный уровень: span=null, progress=1', () => {
    const top = levelInfo(999999);
    expect(top.level).toBe(10);
    expect(top.span).toBeNull();
    expect(top.progress).toBe(1);
  });
});

/**
 * НАГРАДА ЗА ОТМЕТКУ ДНЯ — И ЦЕНА ЩИТА, КОТОРАЯ ИЗ НЕЁ СЧИТАЕТСЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026. Формулу `checkInAward` не проверял никто: мутации
 * «бонус не растёт со стриком» и «потолок седьмого дня снят» обе оставались
 * зелёными. Опасно это не само по себе, а СВЯЗКОЙ: из этой формулы выводится
 * `checkInStreakMaxLoss()`, а из неё — `maxReturn` «Щита серии», на котором
 * стоит запрет «способность не должна окупаться». Сплющи формулу до `return 10`
 * — и потеря станет нулём, а проверка «цена больше отдачи» продолжит зеленеть,
 * потому что обе её стороны уехали вместе. Поэтому здесь закреплена САМА
 * формула, а не только связь с ней.
 */
describe('награда за отметку дня', () => {
  it('первый день платит меньше, чем седьмой — иначе серию нет смысла держать', () => {
    expect(checkInAward(1)).toBeLessThan(checkInAward(7));
  });

  it('растёт монотонно до седьмого дня, без плато посередине', () => {
    for (let d = 1; d <= 7; d++) expect(checkInAward(d)).toBeGreaterThan(checkInAward(d - 1));
  });

  it('после седьмого дня — потолок, а не бесконечный рост', () => {
    expect(checkInAward(8)).toBe(checkInAward(7));
    expect(checkInAward(365)).toBe(checkInAward(7));
  });

  it('отрицательный и нулевой стрик не уводят награду в минус', () => {
    expect(checkInAward(0)).toBeGreaterThan(0);
    expect(checkInAward(-5)).toBe(checkInAward(0));
  });

  /**
   * Потеря от обрыва — это ровно разница между тем, что платила серия на потолке,
   * и тем, что платит отрастающая заново. Число здесь не вписано: сплющенная
   * формула обязана уронить потерю в ноль, и это будет видно.
   */
  /**
   * 🔴 ПЕРЕСЧИТАТЬ ТУ ЖЕ СУММУ В ТЕСТЕ — НЕ ДОКАЗАТЕЛЬСТВО. Первая редакция этой
   * проверки складывала ровно ту же сумму рядом и сверяла с ответом сервиса: на
   * вписанном `return 105` обе стороны совпадали, и мутация проходила зелёной.
   * Связь доказывается только подстановкой ДРУГОЙ формулы.
   */
  it('потеря от обрыва выведена из формулы, а не вписана числом', () => {
    const top = checkInAward(7);
    let expected = 0;
    for (let d = 1; d <= 7; d++) expected += top - checkInAward(d);
    expect(checkInStreakMaxLoss()).toBe(expected);
    expect(checkInStreakMaxLoss()).toBeGreaterThan(0);   // ноль означал бы, что щит нечего возвращать

    // Плоская награда — терять нечего: серия на потолке платит столько же, сколько новая.
    expect(checkInStreakMaxLoss(() => 10)).toBe(0);
    // Круче формула — больше потеря. Число здесь считается по той же подставленной формуле.
    const steep = (s: number) => Math.min(Math.max(s, 0), 7) * 10;
    let steepLoss = 0;
    for (let d = 1; d <= 7; d++) steepLoss += steep(7) - steep(d);
    expect(checkInStreakMaxLoss(steep)).toBe(steepLoss);
    expect(checkInStreakMaxLoss(steep)).toBeGreaterThan(checkInStreakMaxLoss());
  });

  it('щит серии возвращает ровно эту потерю и стоит дороже неё', () => {
    const shield = abilityById('streak_shield')!;
    expect(shield.maxReturn).toBe(checkInStreakMaxLoss());
    expect(shield.cost).toBeGreaterThan(shield.maxReturn);
  });
});
