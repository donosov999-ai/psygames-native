/**
 * 🔴 У КАЖДОГО ПРЕДМЕТА БИБЛИОТЕКИ ЕСТЬ КАРТИНКА.
 *
 * ОТКУДА. Приём «дворец памяти» держится на ярком образе: лампу можно
 * представить большой, движущейся и звучащей на фонтане — ровно об этом просит
 * экран «Оживите ассоциации», — а «оранжевый ромб» представить нечем. До
 * 07.09.2026 предметы были цветными фигурами, и это была вторая половина
 * жалобы «нихуя не понятно по смыслу игры».
 *
 * 📍 Замер: 56 предметов нарисованы одним листом 7×8 (kie, 18 кредитов), фон
 * снят скиллом bg-cutout методом colorkey — 56 из 56 без потерь, проверено
 * контактным листом. Вес всех ассетов 472 КБ.
 *
 * ЧТО СТОРОЖИТ ЭТА ПРОБА. Карта картинок собирается скриптом
 * scripts/build-palace-items.mjs, а библиотека предметов живёт в
 * core/content.ts, и они могут разъехаться молча: добавили предмет — картинки
 * нет, игрок видит запасную фигуру и снова «не понимает смысла». Проба ловит
 * расхождение сразу.
 */
import { PALACE_ITEM_LIBRARY } from '@/src/games/memory-palace/core/content';
import { palaceItemImage, PALACE_ITEM_IMAGES } from '@/src/games/memory-palace/palaceItems.generated';

describe('Дворец памяти · картинки предметов', () => {
  it('есть что проверять: библиотека и карта непусты', () => {
    expect(PALACE_ITEM_LIBRARY.length).toBeGreaterThan(0);
    expect(Object.keys(PALACE_ITEM_IMAGES).length).toBeGreaterThanOrEqual(PALACE_ITEM_LIBRARY.length);
  });

  it('🔴 у каждого предмета библиотеки есть своя картинка', () => {
    const без = PALACE_ITEM_LIBRARY.filter((item) => palaceItemImage(item.id) === null).map((i) => i.id);
    expect({ без_картинки: без, всего: PALACE_ITEM_LIBRARY.length })
      .toEqual({ без_картинки: [], всего: PALACE_ITEM_LIBRARY.length });
  });

  it('🔴 запас картинок больше библиотеки — есть куда расширять набор предметов', () => {
    expect(Object.keys(PALACE_ITEM_IMAGES).length).toBeGreaterThan(PALACE_ITEM_LIBRARY.length);
  });
});
