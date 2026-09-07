/* psygames-favourite-categories · VER 1 · 07.09.2026 */
/**
 * КАКИЕ ТРИ РАЗДЕЛА ОСТАЮТСЯ НА ГЛАВНОЙ, КОГДА КАТАЛОГ УЕХАЛ ВО ВКЛАДКУ.
 *
 * 🔴 ЗАЧЕМ. Решение Дениса 07.09.2026: каталог целиком уходит во вкладку «Игры»,
 * но три ЛЮБИМЫХ раздела остаются на главной. «Любимый» здесь не мнение и не
 * фиксированный список — это его собственные партии: сколько раз он заходил в
 * каждый раздел. Тот же приём, что у цели и встречи питомца: говорим числом,
 * которое у нас есть, а не догадкой.
 *
 * 🔴 НЕТ ПАРТИЙ — НЕТ РАЗДЕЛОВ, и это не пустой экран. У новичка на главной уже
 * стоит «Рекомендуем сегодня» — три упражнения с причиной под каждым. Выдумать
 * ему «любимое» значит соврать в первый же заход; каталог целиком лежит во
 * вкладке в одном нажатии.
 *
 * ⚠️ СВЯЗЬ ПАРТИИ С ИГРОЙ — ЧЕРЕЗ `sessionTypeOf`, А НЕ ЧЕРЕЗ `id`. У трёх судоку
 * `id` и `game_type` расходятся (дефис против подчёркивания), и разбор при поле
 * `sessionType` в games.ts стоил ровно этой ошибки: партии фрактальной судоку не
 * попадали в нагрузку логики ВООБЩЕ — человек играл её каждый день, а раздел для
 * него числился нетронутым.
 */
import { CATEGORY_ORDER, sessionTypeOf, type GameCategory, type GameConfig } from '@/src/constants/games';

/** Сколько разделов остаётся на главной. Решение Дениса 07.09.2026. */
export const FAVOURITE_SECTIONS = 3;

export interface CategoryPlay {
  category: GameCategory;
  /** Сколько партий сыграно в этом разделе. */
  plays: number;
}

/**
 * Разделы по числу сыгранных партий, от частого к редкому.
 *
 * ⚠️ Разделы БЕЗ партий в список не попадают вовсе — иначе «любимым» стал бы
 * раздел, в который человек не заходил ни разу, просто потому что он третий по
 * порядку каталога.
 */
export function categoryPlays(
  sessions: readonly { game_type?: string }[],
  catalog: readonly GameConfig[],
): CategoryPlay[] {
  const разделПоТипу = new Map<string, GameCategory>();
  for (const g of catalog) разделПоТипу.set(sessionTypeOf(g), g.category);

  const счёт = new Map<GameCategory, number>();
  for (const s of sessions) {
    const тип = s.game_type;
    if (!тип) continue;
    const раздел = разделПоТипу.get(тип);
    if (!раздел) continue;
    счёт.set(раздел, (счёт.get(раздел) ?? 0) + 1);
  }

  return [...счёт.entries()]
    .map(([category, plays]) => ({ category, plays }))
    /*
     * Ничья разрешается ПОРЯДКОМ КАТАЛОГА, а не как выйдет. Без этого два
     * раздела с равным числом партий менялись бы местами от захода к заходу —
     * человек видел бы, что главная «переставляется сама», и это читалось бы
     * как случайность, а не как его история.
     */
    .sort((a, b) => (b.plays - a.plays)
      || (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)));
}

/** Три любимых раздела (или меньше, если сыграно меньше). Пусто — партий нет. */
export function favouriteCategories(
  sessions: readonly { game_type?: string }[],
  catalog: readonly GameConfig[],
  limit: number = FAVOURITE_SECTIONS,
): GameCategory[] {
  return categoryPlays(sessions, catalog).slice(0, limit).map((c) => c.category);
}
