/* psygames-feedback-game-state · VER 2 · 17.09.2026 */
/**
 * ЖИВОЕ СОСТОЯНИЕ ЭКРАНА — В РЕПОРТ. Денис 28.08 по багу «небоскрёбы · Ур.45/8»:
 * репорт Валентины нёс уровень-ПРОГРЕСС (45 из хранилища) и редакцию файла, но не
 * РЕЖИМ партии — а вся бага была именно в режиме (towers вместо levels). Виджет
 * отзыва глобален и не знает внутренностей экрана; экран сам публикует сюда то,
 * что важно для разбора: режим, живой уровень, размер, вариант, фазу.
 *
 * Модульный синглтон, а не контекст: писать надо из эффектов игры, читать — в
 * момент отправки отзыва, и никакой перерисовки от этого не требуется.
 */

import { pushCrumb } from '@/src/services/crumbs';

let state: Record<string, unknown> | null = null;

/** Экран публикует своё состояние; null — при уходе с экрана. */
export function publishFeedbackGameState(next: Record<string, unknown> | null): void {
  // Каждая публикация — шаг траектории для репорта (крошки, контракт §3.1):
  // компактный ярлык из говорящих полей, без дампа всего состояния.
  if (next) {
    const label = ['mode', 'level', 'road', 'variant', 'phase']
      .map((k) => (next[k] !== undefined && next[k] !== null ? `${k}:${next[k]}` : null))
      .filter(Boolean).join(' ');
    if (label) pushCrumb(label);
  }

  state = next;
}

/** Снимок для отправляемого репорта (копия — репорт не должен видеть поздние правки). */
export function readFeedbackGameState(): Record<string, unknown> | null {
  return state ? { ...state } : null;
}

/**
 * 🔴 ПАРАМЕТРЫ ЭКРАНА — В ОТЧЁТ, ДАЖЕ ЕСЛИ ЭКРАН НИЧЕГО НЕ ПУБЛИКУЕТ (задача 75348e44, 17.09.2026).
 *
 * 📍 Замер 14.09.2026: `publishFeedbackGameState` зовут 2 экрана из 95. За одним адресом
 * `/games/puzzles` стоят сорок два режима, за `/games/anagrams` — четыре игры, а в отчёте
 * лежал только `screen`. Режим, с которым экран ОТКРЫТ (`?mode=Singles`, `wu=1` из зарядки,
 * `diff`, `seed`), знает маршрут, и снять его можно одним местом — виджетом отзыва, для всех
 * экранов сразу. Режим, который человек переключил ВНУТРИ экрана, маршрут не знает: это
 * по-прежнему `publishFeedbackGameState` экрана.
 *
 * Чистка: служебные ключи роутера (`__…`) не берём, массив склеиваем через запятую, значение
 * режем до 120 знаков, ключей не больше 12. Пусто — `undefined`, чтобы в отчёте не было `{}`.
 */
export function параметрыЭкранаДляОтзыва(
  p: Record<string, string | string[] | undefined> | null | undefined,
): Record<string, string> | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const итог: Record<string, string> = {};
  for (const [ключ, значение] of Object.entries(p)) {
    if (Object.keys(итог).length >= 12) break;
    if (!ключ || ключ.startsWith('__')) continue;
    const строка = Array.isArray(значение) ? значение.join(',') : значение;
    if (typeof строка !== 'string' || строка === '') continue;
    итог[ключ] = строка.slice(0, 120);
  }
  return Object.keys(итог).length > 0 ? итог : undefined;
}
