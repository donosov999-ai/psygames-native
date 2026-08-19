/* psygames-object-tracker-loop · VER 1 · 19.08.2026 */
/**
 * ЕДИНСТВЕННЫЙ КАДРОВЫЙ ЦИКЛ «Трекера объектов».
 *
 * ПРОИСХОЖДЕНИЕ. Пришёл из лаборатории (`~/dev/psygames-game-lab`, ветка
 * `codex/game-object-tracker`, `src/ui/useTrackerLoop.ts`). Он там один на весь
 * модуль, держит РОВНО ОДИН кадр в полёте и отменяется при смене фазы. Второй
 * планировщик вокруг него заводить нельзя — на этом держится вся детерминированность.
 *
 * 🔴 ЧТО ДОБАВЛЕНО ПРИ ПРИЁМКЕ И ЗАЧЕМ — ОБЩАЯ ПАУЗА.
 *
 * В лаборатории цикл знал только про фазу. В приложении этого мало: поверх игры
 * открываются окно отзыва (`FeedbackWidget`) и справка «Правила» (`GameHelpOverlay`),
 * и оба зовут `holdGame()`. Репорт тестировщицы 18.08.2026 дословно: «пока я писала
 * отзыв, игра моя закончилась». Для игры про движение это ещё злее, чем для игры
 * про таймер: человек открывает правила ИМЕННО ТОГДА, когда не понял, за чем следить,
 * — и, читая, теряет все цели, потому что объекты за это время разлетелись.
 *
 * ⚠️ ОДНИХ ИГРОВЫХ ЧАСОВ ЗДЕСЬ НЕ ХВАТАЕТ, И ЭТО ГЛАВНАЯ ЛОВУШКА ЭТОГО ФАЙЛА.
 * `gameNow()` замирает на паузе сам, но мир двигают НЕ часы, а дельты кадров
 * `requestAnimationFrame` — они тикают независимо от того, держит кто-то паузу или
 * нет. Экран, который аккуратно заменил `Date.now()` на `gameNow()` и на этом
 * успокоился, выглядел бы починенным и продолжал бы гонять объекты под окном
 * отзыва. Поэтому пауза гасит САМ ЦИКЛ.
 *
 * ПОЧЕМУ ОТМЕНЯЕМ КАДР, А НЕ «КРУТИМ ВХОЛОСТУЮ». Холостой кадр пришлось бы каждый
 * раз обнулять `previousTimestamp`, иначе первый кадр после паузы принёс бы дельту
 * во всю длину паузы и швырнул объекты через поле. Отмена эффекта делает это
 * бесплатно: снятие паузы перезапускает эффект с чистым `previousTimestamp`.
 */
import React from 'react';
import { isGameHeld, onGameHold } from '@/src/services/gamePause';
import {
  advanceTrackerMovement,
  type ObjectTrackerSession,
} from './core/index';

/** Держит ли кто-то сейчас общую паузу приложения. */
export function useGameHeld(): boolean {
  // Стартуем с реального состояния, а не с false: справку можно открыть ДО того,
  // как игра смонтируется (кнопка «?» живёт в корне приложения и переживает экраны).
  const [held, setHeld] = React.useState<boolean>(isGameHeld);
  React.useEffect(() => onGameHold(setHeld), []);
  return held;
}

export function useTrackerLoop(
  session: ObjectTrackerSession,
  setSession: React.Dispatch<React.SetStateAction<ObjectTrackerSession>>,
): boolean {
  const held = useGameHeld();
  const frameIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    // Щадящий режим кадрового цикла не заводит вовсе — там шаг делает человек.
    if (session.phase !== 'moving' || session.config.reducedMotion || held) return undefined;
    let active = true;
    let previousTimestamp: number | null = null;

    function schedule(): void {
      frameIdRef.current = requestAnimationFrame(tick);
    }

    function tick(timestamp: number): void {
      if (!active) return;
      // Потолок 64 мс: вкладку свернули, поток встал — дельта не должна превратиться
      // в телепорт. Пол 0 — часы браузера иногда отдают убывающий timestamp.
      const deltaMs = previousTimestamp === null
        ? 16
        : Math.min(64, Math.max(0, timestamp - previousTimestamp));
      previousTimestamp = timestamp;
      setSession((current) => advanceTrackerMovement(current, deltaMs));
      schedule();
    }

    schedule();
    return () => {
      active = false;
      if (frameIdRef.current !== null) cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    };
  }, [held, session.config.reducedMotion, session.phase, setSession]);

  return held;
}
