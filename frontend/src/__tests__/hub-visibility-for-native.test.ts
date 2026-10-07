/**
 * 🔴 НАТИВНАЯ РАЗВИЛКА ПОЛУЧАЕТ ТОТ ЖЕ СОСТАВ, ЧТО ОБЕЩАЕТ ЗНАЧОК (задача c86ddae6).
 *
 * Замер 01.10.2026: значок «Мнемоники» — «1», нативная развилка — 5 строк. Состав для
 * натива считает `hubVisibility` (кладётся в `psygames_hub_visible`); проба сверяет его
 * со значком по КАЖДОМУ профилю и КАЖДОЙ развилке.
 */
import { GAMES, visibleInCatalog } from '@/src/constants/games';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
import { hubBadgeCount, HUB_CONTENTS } from '@/src/constants/hubContents';
import { hubVisibility, HUB_VISIBLE_KEY } from '@/src/services/hubVisibility';

const hubs = GAMES.filter((g) => g.hub).map((g) => g.route);

describe('состав развилок для нативной половины', () => {
  it('ключ под префиксом моста — доедет до Flutter без правки моста', () => {
    expect(HUB_VISIBLE_KEY.startsWith('psygames_')).toBe(true);
  });

  it.each(PROFILES.map((p) => [p.id, p] as const))('%s: длина списка каждой развилки = число на значке', (_id, p) => {
    const v = hubVisibility(p);
    expect(v.profile).toBe(p.id);
    const можно = new Set(filterAllowedGames(p).map((g) => g.route));
    for (const route of hubs) expect([route, v.hubs[route]?.length]).toEqual([route, hubBadgeCount(route, можно)]);
  });

  it.each(PROFILES.map((p) => [p.id, p] as const))('%s: каталог для натива = список вкладки «Игры»', (_id, p) => {
    expect(hubVisibility(p).catalog).toEqual(visibleInCatalog(filterAllowedGames(p), p.id).map((g) => g.id));
  });

  it('каталог тоже режется профилем: хоть у одного профиля он короче соседнего', () => {
    const lens = new Set(PROFILES.map((p) => hubVisibility(p).catalog.length));
    expect(lens.size).toBeGreaterThan(1);
  });

  it('правило профиля РЕАЛЬНО режет: хоть у одного профиля развилка короче заводской', () => {
    const cut = PROFILES.some((p) => {
      const v = hubVisibility(p);
      return hubs.some((r) => (v.hubs[r]?.length ?? 0) < (HUB_CONTENTS[r]?.length ?? 0));
    });
    expect(cut).toBe(true);
  });
});
