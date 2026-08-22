/* psygames-warmup-entries · VER 1 · 23.08.2026 */
/**
 * ЧТО ЛЕЖИТ В «ЗАРЯДКЕ» — одним списком, а не тремя входами по экранам.
 *
 * 🔴 ЗАЧЕМ (решение Дениса 23.08.2026: «перенести в зарядку всё, что идёт
 * сериями»). До этого «Оценка» и FIN BRAIN висели отдельными карточками на
 * главной, хотя запускались тем же движком плейлистов (`WarmupContext`), что и
 * зарядка. Человеку это подавалось как три разные вещи, а разницы не было —
 * все три суть «прогнать заданный набор игр подряд и показать один итог».
 *
 * ⚠️ ЧЕМ СЕРИЯ ОТЛИЧАЕТСЯ ОТ СЛОТА ЗАРЯДКИ, И ЭТО НЕ ОФОРМЛЕНИЕ. Слот (утро,
 * день, вечер, ночь) — разминка: состав в нём плавает по дню недели, профилю и
 * тому, что уже сыграно. Серия — ЗАМЕР: состав фиксирован жёстко, и менять его
 * нельзя, иначе замеры разных дней несравнимы и кривая прогресса превращается в
 * шум. Ровно то же условие лежит в основе серии блоков (`services/series.ts`).
 *
 * ⚠️ ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ КОНСТАНТА В ЭКРАНЕ. Проверка, живущая на
 * чтении исходника экрана, зелена ровно до первой перестановки букв. Здесь
 * список и его набор — значения, и гейт `series-live-in-warmup` держится за них.
 */
import { buildAssessmentPlaylist, buildFinancialBatteryPlaylist, PlaylistMeta } from '@/src/services/warmup';

export const SERIES_KEYS = ['assessment', 'financial'] as const;
export type SeriesKey = typeof SERIES_KEYS[number];

/** Набор серии. Фиксирован — см. шапку. */
export function seriesPlaylist(key: SeriesKey): PlaylistMeta {
  return key === 'assessment' ? buildAssessmentPlaylist() : buildFinancialBatteryPlaylist();
}

/**
 * Какой пускатель `WarmupContext` отвечает за серию. Имя, а не сама функция:
 * контекст живёт в React, а этот модуль обязан оставаться чистым, чтобы его
 * можно было проверить без экрана.
 */
export function seriesStarter(key: SeriesKey): 'startAssessment' | 'startFinancialBattery' {
  return key === 'assessment' ? 'startAssessment' : 'startFinancialBattery';
}

/** Какая настройка профиля открывает серию. Гейт тот же, что был на главной. */
export function seriesProfileFlag(key: SeriesKey): 'assessment_enabled' | 'financial_brain_day_enabled' {
  return key === 'assessment' ? 'assessment_enabled' : 'financial_brain_day_enabled';
}
