/**
 * 🔴 СОСТАВ КАЖДОЙ РАЗВИЛКИ ДЛЯ НАТИВНОЙ ПОЛОВИНЫ — СЧИТАЕТ ВЕБ, ОДНОЙ ФУНКЦИЕЙ СО ЗНАЧКОМ.
 *
 * 📍 Задача c86ddae6, замер 01.10.2026 (эмулятор, Play 2.56.2, профиль «Standard»):
 * значок «Мнемоники» в каталоге показывал «1», а нативная развилка внутри — все 5 игр.
 * Значок считает `hubBadgeCount` = `visibleHubCards(маршрут, filterAllowedGames(профиль))`,
 * а нативный `HubScreen` правила профиля не знал вовсе: дети и «Микро-релакс» видели
 * за развилкой взрослые игры, закрытые их профилем.
 *
 * Правило профиля НЕ переписывается на Dart: в нём всегда разрешённые игры, подъём
 * к родительским развилкам, отсев сырых и наложение файла состава — вторая копия
 * разошлась бы с первой при первой же правке. Веб считает видимое той же функцией,
 * что и значок, и кладёт в общую память (`psygames_hub_visible`); мост везёт ключ сам,
 * нативная развилка показывает ровно этот список.
 */
import { GAMES, visibleInCatalog } from '@/src/constants/games';
import { filterAllowedGames, type ProfileDef } from '@/src/constants/profiles';
import { visibleHubCards } from '@/src/constants/hubContents';

export const HUB_VISIBLE_KEY = 'psygames_hub_visible';

export interface HubVisibility {
  /** Профиль, для которого посчитано: нативная сторона применяет список только к нему. */
  profile: string;
  /** Маршрут развилки → маршруты видимых карточек (порядок веба). */
  hubs: Record<string, string[]>;
  /**
   * Игры вкладки «Игры» для этого профиля — `id` в порядке `GAMES`, ровно тот список, что
   * рисует `CategorySections` (`visibleInCatalog(filterAllowedGames(профиль))`). Нативный
   * каталог (задача f5025027) раскладывает его по разделам и правила профиля не пересчитывает.
   */
  catalog: string[];
}

export function hubVisibility(profile: ProfileDef): HubVisibility {
  const можно = new Set(filterAllowedGames(profile).map((g) => g.route));
  const hubs: Record<string, string[]> = {};
  for (const g of GAMES) {
    if (g.hub) hubs[g.route] = visibleHubCards(g.route, можно, (k) => k).map((c) => c.route);
  }
  const catalog = visibleInCatalog(filterAllowedGames(profile), profile.id).map((g) => g.id);
  return { profile: profile.id, hubs, catalog };
}
