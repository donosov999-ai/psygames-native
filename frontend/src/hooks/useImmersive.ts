/* psygames-use-immersive · VER 1 · 16.09.2026 */
/**
 * ПОЛНОЭКРАННЫЙ РЕЖИМ НА ВРЕМЯ ПАРТИИ — одна строка в экране игры:
 *
 *     useImmersive(фаза === 'playing');
 *
 * Правила и их причины — в `src/services/immersive.ts`. Здесь только проводка:
 *   · экран объявляет, что умеет играть на весь экран (пункт в меню паузы);
 *   · полосы прячутся, пока партия идёт, настройка включена и игру никто не держит
 *     (`gamePause`: меню паузы, отзыв поверх партии);
 *   · уход с экрана возвращает полосы, даже если партия не кончилась;
 *   · возврат из свёрнутого состояния прячет их заново: ОС показала их сама.
 *
 * ⚠️ ХУК ЗОВЁТСЯ ДО ЛЮБОГО РАННЕГО return экрана. Хук после раннего выхода проходит
 * tsc и пробы, а на смене фазы роняет React #310.
 */
import { useEffect, useState } from 'react';
import { isGameHeld, onGameHold } from '@/src/services/gamePause';
import {
  applyImmersive, declareImmersiveCapable, immersiveEnabled, loadImmersivePref, onImmersivePref,
} from '@/src/services/immersive';

export function useImmersive(идётПартия: boolean): void {
  const [держат, setДержат] = useState(isGameHeld());
  const [включено, setВключено] = useState(immersiveEnabled());

  useEffect(() => declareImmersiveCapable(), []);
  useEffect(() => onGameHold(setДержат), []);
  useEffect(() => {
    const отписка = onImmersivePref(() => setВключено(immersiveEnabled()));
    void loadImmersivePref();
    return отписка;
  }, []);

  const спрятать = идётПартия && включено && !держат;

  useEffect(() => { applyImmersive(спрятать); }, [спрятать]);

  // Уход с экрана посреди партии: полосы обязаны вернуться — следующий экран не игра.
  useEffect(() => () => { applyImmersive(false); }, []);

  useEffect(() => {
    if (!спрятать || typeof document === 'undefined') return undefined;
    const вернулись = () => {
      if (document.visibilityState === 'visible') applyImmersive(true, true);
    };
    document.addEventListener('visibilitychange', вернулись);
    return () => document.removeEventListener('visibilitychange', вернулись);
  }, [спрятать]);
}
