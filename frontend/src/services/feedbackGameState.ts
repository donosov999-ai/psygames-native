/* psygames-feedback-game-state · VER 1 · 28.08.2026 */
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
