/**
 * Якоря аксессуаров питомца обязаны совпадать с реальной геометрией спрайтов.
 *
 * ЗАЧЕМ. Валя писала дважды: «колпак всё ещё ужасный», «ГДЕ новый колпак». Оба раза
 * это читалось как претензия к рисунку, а дело было в раскладке: колпак висел НАД
 * головой с зазором в четверть роста питомца.
 *
 * Причина — якорь макушки у кота стоял на 6.35%, то есть на кончиках АНТЕНН
 * (первый непрозрачный пиксель спрайта — 6.8%), а голова начинается на 10.9%.
 * У робота и созвездия антенн нет, их якоря совпали с макушкой и были верны —
 * поэтому ошибку было видно только на коте, а кот облик по умолчанию.
 *
 * Числа ниже сняты замером альфа-канала спрайтов idle0 (профиль ширины по строкам,
 * макушка = первая строка шире 55% максимальной). Пересняты 12.08.2026.
 * Если спрайты перерисуют — тест упадёт, и это правильно: якоря надо пересчитать.
 */
import { SKIN_ANCHORS } from '../components/pet/PetSprite';

/** Где у каждого облика НАЧИНАЕТСЯ ГОЛОВА, % высоты кадра (замер альфы). */
const MEASURED_CROWN: Record<string, number> = {
  cat: 10.9,
  robot: 26.2,
  constellation: 10.9,
};

/**
 * Допуск. Якорь может быть чуть НИЖЕ макушки — предмет тогда садится в голову,
 * а не балансирует на ней. Выше макушки якорь быть не должен вовсе: это и есть
 * та ошибка, из-за которой колпак висел в воздухе.
 */
const SINK_MAX = 4.0;   // насколько глубже макушки допустимо
const ABOVE_MAX = 0.5;  // насколько выше макушки — почти нисколько

describe('якоря аксессуаров питомца', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(Object.keys(SKIN_ANCHORS).sort()).toEqual(['cat', 'constellation', 'robot']);
  });

  it.each(Object.keys(MEASURED_CROWN))('%s: якорь макушки не выше головы', (skin) => {
    const y = SKIN_ANCHORS[skin as keyof typeof SKIN_ANCHORS].head_top.y;
    const crown = MEASURED_CROWN[skin];
    expect(`${skin}: якорь ${y}, макушка ${crown}, выше на ${(crown - y).toFixed(1)}`)
      .toBe(`${skin}: якорь ${y}, макушка ${crown}, выше на ${Math.min(crown - y, ABOVE_MAX).toFixed(1)}`);
  });

  it.each(Object.keys(MEASURED_CROWN))('%s: якорь не утоплен слишком глубоко', (skin) => {
    const y = SKIN_ANCHORS[skin as keyof typeof SKIN_ANCHORS].head_top.y;
    expect(`${skin}: посадка ${(y - MEASURED_CROWN[skin]).toFixed(1)}`)
      .toBe(`${skin}: посадка ${Math.min(y - MEASURED_CROWN[skin], SINK_MAX).toFixed(1)}`);
  });

  it('глаза ниже макушки, шея ниже глаз — порядок точек крепления', () => {
    const wrong: string[] = [];
    for (const [skin, a] of Object.entries(SKIN_ANCHORS)) {
      if (!(a.head_top.y < a.eyes.y && a.eyes.y < a.neck.y)) {
        wrong.push(`${skin}: макушка ${a.head_top.y}, глаза ${a.eyes.y}, шея ${a.neck.y}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
