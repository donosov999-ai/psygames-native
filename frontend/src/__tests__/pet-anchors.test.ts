/**
 * Якоря аксессуаров питомца обязаны совпадать с реальной геометрией спрайтов.
 *
 * ЗАЧЕМ. Валя писала «колпак всё ещё ужасный» и «ГДЕ новый колпак», Денис говорил
 * то же ТРИЖДЫ. Каждый раз это читалось как претензия к рисунку, а дело было в
 * раскладке: колпак висел НАД головой, не касаясь её.
 *
 * ⚠️ ПОЧЕМУ ПРОШЛЫЙ ГЕЙТ ЭТО ПРОПУСКАЛ — ГЛАВНЫЙ УРОК. Он сверял якоря с таблицей
 * «замеренных макушек», которую я написал сам, и в таблице была ТА ЖЕ ошибка: за
 * макушку кота принято 10.9% — это кончики антенн, а череп начинается на 27.2%.
 * Гейт сверял мои числа с моими же числами и был согласен. Тест, подтверждающий
 * собственное допущение, хуже отсутствия теста: он выдаёт ошибку за проверенную.
 *
 * ЧТО СВЕРЯЕМ ТЕПЕРЬ. Числа ниже сняты с ПИКСЕЛЕЙ кадров idle0 (canvas, порог
 * альфы 24) воспроизводимым правилом:
 *
 *   head_top — первая строка, где САМАЯ ДЛИННАЯ СПЛОШНАЯ полоса непрозрачных
 *     пикселей превышает 40% максимальной по кадру. Именно сплошная: уши и антенны
 *     дают в строке две отдельные полоски, череп — одну широкую. Порог по ОБЩЕЙ
 *     ширине строки принимал уши за макушку, на этом всё и сломалось;
 *   eyes — строка с максимумом тёмных непрозрачных пикселей в пределах головы;
 *   neck — eyes + 0.55 × (eyes − head_top): облик у всех трёх круглый, шеи нет,
 *     а самое узкое место силуэта приходится на НОГИ.
 *
 * Перерисуют спрайты — тест упадёт, и это правильно: якоря надо переснять тем же
 * правилом, а не подогнать числа под новый рисунок.
 */
import { SKIN_ANCHORS } from '../components/pet/PetSprite';

/** Где НАЧИНАЕТСЯ ГОЛОВА (не уши и не антенны), % высоты кадра. Замер 13.08.2026. */
const MEASURED_SKULL: Record<string, number> = {
  cat: 27.15,
  robot: 44.92,
  constellation: 25.39,
};

/** Где ГЛАЗА, % высоты кадра. Тот же замер. */
const MEASURED_EYES: Record<string, number> = {
  cat: 49.80,
  robot: 71.09,
  constellation: 53.71,
};

/**
 * Допуски. Предмет может сесть чуть НИЖЕ ориентира — тогда он лежит на голове,
 * а не балансирует на кромке. Выше ориентира быть не должен почти совсем: это и
 * есть «висит в воздухе».
 */
const SINK_MAX = 3.0;    // насколько глубже ориентира допустимо
const ABOVE_MAX = 0.5;   // насколько выше — практически нисколько
const EYES_TOL = 4.0;    // очки: попадание в глаза с обеих сторон

describe('якоря аксессуаров питомца', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(Object.keys(SKIN_ANCHORS).sort()).toEqual(['cat', 'constellation', 'robot']);
  });

  it.each(Object.keys(MEASURED_SKULL))('%s: колпак не висит над головой', (skin) => {
    const y = SKIN_ANCHORS[skin as keyof typeof SKIN_ANCHORS].head_top.y;
    const skull = MEASURED_SKULL[skin];
    expect(`${skin}: якорь ${y}, череп ${skull}, выше на ${(skull - y).toFixed(1)}`)
      .toBe(`${skin}: якорь ${y}, череп ${skull}, выше на ${Math.min(skull - y, ABOVE_MAX).toFixed(1)}`);
  });

  it.each(Object.keys(MEASURED_SKULL))('%s: колпак не утоплен в голову', (skin) => {
    const y = SKIN_ANCHORS[skin as keyof typeof SKIN_ANCHORS].head_top.y;
    expect(`${skin}: посадка ${(y - MEASURED_SKULL[skin]).toFixed(1)}`)
      .toBe(`${skin}: посадка ${Math.min(y - MEASURED_SKULL[skin], SINK_MAX).toFixed(1)}`);
  });

  it.each(Object.keys(MEASURED_EYES))('%s: очки попадают в глаза', (skin) => {
    const y = SKIN_ANCHORS[skin as keyof typeof SKIN_ANCHORS].eyes.y;
    const off = Math.abs(y - MEASURED_EYES[skin]);
    expect(`${skin}: промах ${off.toFixed(1)}`).toBe(`${skin}: промах ${Math.min(off, EYES_TOL).toFixed(1)}`);
  });

  it('бант ниже глаз, но не на ногах — точка шеи между подбородком и низом', () => {
    const wrong: string[] = [];
    for (const [skin, a] of Object.entries(SKIN_ANCHORS)) {
      if (a.neck.y <= a.eyes.y) wrong.push(`${skin}: шея ${a.neck.y} не ниже глаз ${a.eyes.y}`);
      if (a.neck.y > 90) wrong.push(`${skin}: шея ${a.neck.y} — это уже ноги`);
    }
    expect(wrong).toEqual([]);
  });

  it('порядок точек: макушка выше глаз, глаза выше шеи', () => {
    const wrong: string[] = [];
    for (const [skin, a] of Object.entries(SKIN_ANCHORS)) {
      if (!(a.head_top.y < a.eyes.y && a.eyes.y < a.neck.y)) {
        wrong.push(`${skin}: макушка ${a.head_top.y}, глаза ${a.eyes.y}, шея ${a.neck.y}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
