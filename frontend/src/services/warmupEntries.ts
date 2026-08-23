/* psygames-warmup-entries · VER 2 · 23.08.2026 */
/**
 * ЧТО ЛЕЖИТ В «ЗАРЯДКЕ» — одним списком, а не тремя входами по экранам.
 *
 * 🔴 ЗАЧЕМ (решение Дениса 23.08.2026: «перенести в зарядку всё, что идёт
 * сериями»). До этого «Оценка» и FIN BRAIN висели отдельными карточками на
 * главной, хотя запускались тем же движком плейлистов (`WarmupContext`), что и
 * зарядка. Человеку это подавалось как три разные вещи, а разницы не было.
 *
 * 🔴 VER 2 — ИСПРАВЛЕНА МОЯ ЖЕ НЕДОДЕЛКА. В VER 1 сюда попали только серии-
 * ПЛЕЙЛИСТЫ (оценка, финансовая батарея), а серии БЛОКОВ — три таблицы Шульте и
 * три режима корректурки — остались доступны только с экрана своей игры. Я развёл
 * два вида серий у себя в голове и не сказал об этом вслух; Денис искал серию
 * блоков в «Зарядке» и не нашёл. Разделения он не просил — теперь здесь оба вида.
 *
 * ⚠️ ЧЕМ СЕРИЯ ОТЛИЧАЕТСЯ ОТ СЛОТА ЗАРЯДКИ, И ЭТО НЕ ОФОРМЛЕНИЕ. Слот (утро,
 * день, вечер, ночь) — разминка: состав в нём плавает по дню недели, профилю и
 * тому, что уже сыграно. Серия — ЗАМЕР: состав фиксирован жёстко, и менять его
 * нельзя, иначе замеры разных дней несравнимы и кривая прогресса превращается в
 * шум. Ровно то же условие лежит в основе серии блоков (`services/series.ts`).
 *
 * ⚠️ ДВА ВИДА СЕРИЙ ЗАПУСКАЮТСЯ ПО-РАЗНОМУ, И ЭТО ВАЖНО ДЛЯ ЭКРАНА.
 *   · СЕРИЯ-ПЛЕЙЛИСТ — цепочка РАЗНЫХ игр, её ведёт `WarmupContext`.
 *   · СЕРИЯ БЛОКОВ — одна игра, внутри которой три правила на одном поле. Её
 *     ведёт сам экран игры, поэтому запуск — переход на маршрут с параметрами.
 *     `auto=1` (а НЕ `wu=1`): шаг зарядки не двигает уровень, а серия блоков
 *     обязана вести свой уровень по модели C, иначе прогресс в ней стоит.
 *
 * ⚠️ ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ КОНСТАНТА В ЭКРАНЕ. Проверка, живущая на
 * чтении исходника экрана, зелена ровно до первой перестановки букв. Здесь
 * список и его набор — значения, и гейт `series-live-in-warmup` держится за них.
 */
import { buildAssessmentPlaylist, buildFinancialBatteryPlaylist, PlaylistMeta } from '@/src/services/warmup';

export const SERIES_KEYS = ['assessment', 'financial', 'schulte-blocks', 'proofreading-blocks', 'chess-blocks'] as const;
export type SeriesKey = typeof SERIES_KEYS[number];

/** Серии-плейлисты — цепочка разных игр под управлением `WarmupContext`. */
export const PLAYLIST_SERIES = ['assessment', 'financial'] as const;
/** Серии блоков — одна игра, три правила на одном поле. */
export const BLOCK_SERIES = ['schulte-blocks', 'proofreading-blocks', 'chess-blocks'] as const;

export type SeriesKind = 'playlist' | 'blocks';

export function seriesKind(key: SeriesKey): SeriesKind {
  return (PLAYLIST_SERIES as readonly string[]).includes(key) ? 'playlist' : 'blocks';
}

/** Набор серии-плейлиста. Фиксирован — см. шапку. Для серии блоков плейлиста нет. */
export function seriesPlaylist(key: SeriesKey): PlaylistMeta | null {
  if (key === 'assessment') return buildAssessmentPlaylist();
  if (key === 'financial') return buildFinancialBatteryPlaylist();
  return null;
}

/**
 * Какой пускатель `WarmupContext` отвечает за серию-плейлист. Имя, а не сама
 * функция: контекст живёт в React, а этот модуль обязан оставаться чистым.
 * У серии блоков пускателя нет — она уходит на маршрут (см. `seriesRoute`).
 */
export function seriesStarter(key: SeriesKey): 'startAssessment' | 'startFinancialBattery' | null {
  if (key === 'assessment') return 'startAssessment';
  if (key === 'financial') return 'startFinancialBattery';
  return null;
}

/**
 * Куда вести серию блоков. `auto=1` — автостарт БЕЗ признака шага зарядки:
 * шаг зарядки (`wu=1`) уровень не двигает, а серия блоков ведёт свой уровень
 * сама и обязана его двигать, иначе прогресс в ней стоит намертво.
 */
export function seriesRoute(key: SeriesKey): { pathname: string; params: Record<string, string> } | null {
  if (key === 'schulte-blocks') return { pathname: '/games/schulte', params: { auto: '1', series: '1' } };
  if (key === 'proofreading-blocks') return { pathname: '/games/proofreading', params: { auto: '1', series: '1' } };
  if (key === 'chess-blocks') return { pathname: '/games/chess-blind', params: { auto: '1', series: '1' } };
  return null;
}

/** Из скольких блоков состоит серия. У серии-плейлиста блоков нет. */
export function seriesBlockCount(key: SeriesKey): number | null {
  return seriesKind(key) === 'blocks' ? 3 : null;
}

/**
 * Какой игрой серия блоков числится в каталоге.
 *
 * 🔴 ЗДЕСЬ БЫЛА МОЯ ОШИБКА. Первая редакция выводила игру из ключа обрезкой
 * суффикса: `'schulte-blocks'.replace('-blocks','')` → `'schulte'`. А в каталоге
 * игра зовётся `schulte_table`, и `isGameAllowed` на неё отвечала «нет». На полном
 * профиле проверка возвращает «да» всем подряд, поэтому наружу это не вылезло —
 * но на профиле с ограниченным набором карточка серии пряталась бы при
 * разрешённой игре. Соответствие теперь ЯВНОЕ, а гейт проверяет, что каждый
 * названный здесь идентификатор ЕСТЬ в каталоге.
 */
export function seriesGameId(key: SeriesKey): string | null {
  if (key === 'schulte-blocks') return 'schulte_table';
  if (key === 'proofreading-blocks') return 'proofreading';
  if (key === 'chess-blocks') return 'chess_blind';
  return null;   // серия-плейлист игрой каталога не является
}

/** Какая настройка профиля открывает серию. Гейт тот же, что был на главной. */
export function seriesProfileFlag(key: SeriesKey): 'assessment_enabled' | 'financial_brain_day_enabled' | null {
  if (key === 'assessment') return 'assessment_enabled';
  if (key === 'financial') return 'financial_brain_day_enabled';
  return null;   // серии блоков — обычные игры, отдельного флага у них нет
}
