/**
 * useMoveHistory — отмена и возврат ходов для любой пошаговой игры.
 *
 * ЗАЧЕМ. Отмена хода была ровно в ОДНОЙ игре из 61 — `spatial-span`, написанная там вручную.
 * В судоку её нет вовсе: промахнулся пальцем — живи с этим (замер 10.08.2026).
 *
 * Для длинных режимов (самурай, фрактальная судоку — партия на час) это не мелочь: час
 * работы не должен зависеть от одного неточного касания. И просит отмену не только судоку —
 * Ханойская башня, Башня Лондона и любая другая пошаговая игра просят того же, поэтому
 * механика вынесена сюда, а не дописана в один экран.
 *
 * Хук — тонкая обёртка над чистым ядром `services/moveStack`: ядро тестируется без React,
 * хук добавляет только флаги для кнопок отмены и возврата.
 *
 * Использование:
 *   const hist = useMoveHistory<Move>();
 *   hist.push({ r, c, from: prev, to: n });         // сделали ход
 *   const m = hist.undo(); if (m) applyBack(m);     // игра сама возвращает клетку
 *   hist.reset();                                    // новая партия
 *
 * Лента переживает перезапуск, только если игра положит `hist.serialize()` в незаконченную
 * партию (`services/resume`) и поднимет обратно через `hist.restore()`.
 */
import { useState, useRef, useCallback } from 'react';
import { createMoveStack, MAX_HISTORY, MoveStack, MoveStackData } from '@/src/services/moveStack';

export type { MoveStackData };
export { MAX_HISTORY };

export interface MoveHistory<T> {
  push: (move: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
  serialize: () => MoveStackData<T>;
  restore: (data: Partial<MoveStackData<T>> | null | undefined) => void;
}

export function useMoveHistory<T>(limit: number = MAX_HISTORY): MoveHistory<T> {
  // Стек живёт в ref: ход может прилететь несколько раз за кадр, а состояние React
  // обновляется асинхронно — на нём лента теряла бы ходы. В state только флаги кнопок.
  const stackRef = useRef<MoveStack<T> | null>(null);
  if (stackRef.current === null) stackRef.current = createMoveStack<T>(limit);
  const stack = stackRef.current;

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(stack.canUndo());
    setCanRedo(stack.canRedo());
  }, [stack]);

  const push = useCallback((move: T) => { stack.push(move); sync(); }, [stack, sync]);
  const undo = useCallback((): T | null => { const m = stack.undo(); sync(); return m; }, [stack, sync]);
  const redo = useCallback((): T | null => { const m = stack.redo(); sync(); return m; }, [stack, sync]);
  const reset = useCallback(() => { stack.reset(); sync(); }, [stack, sync]);
  const serialize = useCallback(() => stack.serialize(), [stack]);
  const restore = useCallback((data: Partial<MoveStackData<T>> | null | undefined) => { stack.restore(data); sync(); }, [stack, sync]);

  return { push, undo, redo, canUndo, canRedo, reset, serialize, restore };
}
