/**
 * moveStack — чистое ядро отмены и возврата ходов. Без React, поэтому тестируется прямо.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ ХУКА. Тест-библиотеки для хуков в проекте нет (в зависимостях только
 * jest и jest-expo, ни testing-library, ни react-test-renderer), а поведение стека — ровно
 * то место, где ошибка тихо съедает ход игрока. Логика вынесена в чистую функцию, хук
 * `hooks/useMoveHistory` остаётся тонкой обёрткой поверх неё и добавляет только флаги для
 * кнопок.
 *
 * Стек НЕ знает, что такое ход. Он ведёт ленту значений; отыгрывает ход назад сама игра.
 * Отсюда один стек годится и доске судоку, и стопке дисков Ханойской башни.
 */

/** Потолок ленты. 200 ходов заведомо больше самой длинной судоку, а память не ест. */
export const MAX_HISTORY = 200;

export interface MoveStackData<T> {
  past: T[];
  future: T[];
}

export interface MoveStack<T> {
  push: (move: T) => void;
  /** Снять последний ход. Возвращает его же — применить обратно должна игра. null, если нечего. */
  undo: () => T | null;
  /** Вернуть снятое. null, если нечего. */
  redo: () => T | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
  /** Слепок для укладки в незаконченную партию (см. `services/resume`). */
  serialize: () => MoveStackData<T>;
  restore: (data: Partial<MoveStackData<T>> | null | undefined) => void;
}

export function createMoveStack<T>(limit: number = MAX_HISTORY): MoveStack<T> {
  let past: T[] = [];
  let future: T[] = [];

  return {
    push(move: T) {
      past.push(move);
      // Переполнение срезаем с ХВОСТА ленты (самые старые ходы), а не с конца — иначе
      // отмена перестала бы работать ровно там, где она нужнее всего, на длинной партии.
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];   // новый ход обрывает ветку возврата
    },
    undo(): T | null {
      const m = past.pop();
      if (m === undefined) return null;
      future.push(m);
      return m;
    },
    redo(): T | null {
      const m = future.pop();
      if (m === undefined) return null;
      past.push(m);
      return m;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    reset() { past = []; future = []; },
    serialize: () => ({ past: [...past], future: [...future] }),
    restore(data) {
      past = Array.isArray(data?.past) ? [...data!.past!] : [];
      future = Array.isArray(data?.future) ? [...data!.future!] : [];
    },
  };
}
