/* psygames-step-name · VER 1 · 17.09.2026 */
/**
 * 🔴 ИМЯ ШАГА СЕРИИ — ПО РЕЖИМУ, А НЕ ПО ОБЩЕЙ КАРТОЧКЕ ЭКРАНА.
 *
 * 📍 17.09.2026, раздел «Зарядки» (psygames-warmup-claude-mac), серия «Не спится» живьём:
 * головоломка «Трубы» (`mode: "Net"`) подписана «Чёт-нечет» на карточке, на мосту, в
 * «Пропущено» и в вопросе пропуска каркаса. Причина одна на все четыре места: 42 режима
 * живут на одном маршруте `/games/puzzles`, у него одна запись в `GAMES` — `puzzles` с ключом
 * `puzzlesUnruly`, и поиск по `game_id` находит её для любого режима.
 *
 * Имя режима уже лежит в `HELP_MAP` под ключом `маршрут?mode=Режим` — так его берёт справка
 * (`GameHelpOverlay`, задача 2b774e8b: «кнопка была — за ней лежала чужая игра»). Здесь то же
 * правило для шага серии, одно на всех, кто называет шаг.
 * ⚠️ Склеивать ключ из режима (`puzzles${mode}`) нельзя: у «Train Tracks» ключ `puzzlesTracks`.
 */
import { GAMES } from '@/src/constants/games';
import { HELP_MAP } from '@/src/constants/helpMap';

export interface ШагСИменем {
  game_id: string;
  game_route?: string | null;
  mode?: string | null;
}

/** Ключ словаря с именем шага: своя запись режима → карточка игры → null (шаг старой сборки). */
export function ключИмениШага(шаг: ШагСИменем): string | null {
  const игра = GAMES.find((g) => g.id === шаг.game_id);
  const режим = (шаг.mode ?? '').trim();
  const маршрут = шаг.game_route || игра?.route;
  // У остальных игр `mode` — настройка партии («5x5», «60s»): своей записи нет, имя — игры.
  const запись = режим && маршрут ? HELP_MAP[`${маршрут}?mode=${режим}`] : undefined;
  return запись?.nameKey ?? игра?.nameKey ?? null;
}

/** Имя шага на языке человека; незнакомый шаг называется своим `game_id`, как было. */
export function имяШага(шаг: ШагСИменем, t: (ключ: string) => string): string {
  const ключ = ключИмениШага(шаг);
  return ключ ? t(ключ) : шаг.game_id;
}
