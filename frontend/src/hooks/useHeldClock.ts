/* psygames-held-clock · VER 1 · 19.08.2026 */
/**
 * ЧАСЫ, КОТОРЫЕ ЗАМИРАЮТ ВМЕСТЕ С ИГРОЙ.
 *
 * 🔴 ЗАЧЕМ. Репорт 18.08.2026: «пока я писала отзыв, игра моя закончилась…
 * несправедливость». Обратный отсчёт считался от `Date.now()`, а настенное
 * время не останавливается, пока человек набирает текст. Итог: пожаловаться на
 * игру стоило партии — и это бьёт по единственному каналу, из которого мы
 * вообще узнаём о проблемах.
 *
 * ⚠️ БОЛЬШЕ НЕ ПРИМЕНЯЕТСЯ. Все игровые экраны перешли на `gameNow()` из
 * `src/services/gamePause.ts` — одни часы на приложение. Держать два механизма
 * опасно: `elapsed(from)` ждёт НАСТЕННУЮ точку старта и сам вычитает простой, а
 * `gameNow()` уже игровой. Смешать их — вычесть паузу дважды и получить отсчёт
 * быстрее реального. Хук оставлен на случай, когда компоненту нужен СВОЙ отсчёт
 * простоя с независимым сбросом; новым играм он не нужен.
 *
 * КАК ПОЛЬЗОВАТЬСЯ. Вместо `Date.now() - startRef.current` берём `elapsed()`:
 * он вычитает всё время, что игра стояла на паузе.
 *
 * ⚠️ ПОЧЕМУ НЕ ПРОСТО «ОСТАНОВИТЬ setInterval». Интервал можно и не трогать:
 * важно не то, тикает ли он, а какое время он насчитал. Игра, которая гасит
 * интервал, но считает от Date.now(), после снятия паузы мгновенно обнаружит,
 * что время вышло — то есть ровно та же несправедливость, только позже.
 */
import { useEffect, useRef } from 'react';
import { onGameHold, isGameHeld } from '@/src/services/gamePause';

export function useHeldClock() {
  const heldAt = useRef<number | null>(isGameHeld() ? Date.now() : null);
  const heldTotal = useRef(0);

  useEffect(() => onGameHold((paused) => {
    if (paused) { if (heldAt.current === null) heldAt.current = Date.now(); return; }
    if (heldAt.current !== null) { heldTotal.current += Date.now() - heldAt.current; heldAt.current = null; }
  }), []);

  /** Сколько секунд ИГРОВОГО времени прошло с момента `from`. */
  const elapsed = (from: number): number => {
    const paused = heldTotal.current + (heldAt.current !== null ? Date.now() - heldAt.current : 0);
    return (Date.now() - from - paused) / 1000;
  };

  /** Сбросить накопленную паузу — вызывать на старте нового раунда. */
  const reset = () => { heldTotal.current = 0; heldAt.current = isGameHeld() ? Date.now() : null; };

  return { elapsed, reset };
}
