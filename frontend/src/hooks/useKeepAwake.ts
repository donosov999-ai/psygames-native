/**
 * Не давать экрану гаснуть, пока идёт упражнение.
 *
 * ЗАЧЕМ. Дыхательная сессия длится 3-5 минут и НИ РАЗУ не требует касания —
 * человек сидит с закрытыми или полуприкрытыми глазами и следит за ритмом.
 * Системный таймер сна экрана на телефоне обычно 30 секунд, поэтому телефон
 * гас ровно посреди упражнения, и продолжать было нечем. Это же касается любой
 * игры без частых тапов: гимнастики для глаз, длинных задержек Вим Хофа.
 *
 * ПОЧЕМУ БЕЗ expo-keep-awake. Android-сборка у нас — Tauri, то есть WebView, и
 * для React Native она `web`; нативный модуль там всё равно не работает. В
 * Chromium есть штатный Screen Wake Lock API — он и нужен, а лишняя зависимость
 * в сборке не нужна.
 *
 * ГРАБЛИ, УЧТЁННЫЕ ЗДЕСЬ. Браузер сам отпускает блокировку, когда вкладка
 * уходит в фон (свернули приложение, позвонили). При возврате её надо запросить
 * заново — иначе экран продолжит гаснуть, а код будет считать, что всё в силе.
 */
import { useEffect } from 'react';

type SentinelLike = { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void };

export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const wl = (navigator as any).wakeLock;
    if (!wl?.request) return;                       // старый WebView / десктоп без API

    let sentinel: SentinelLike | null = null;
    let alive = true;

    const acquire = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      try { sentinel = await wl.request('screen'); } catch { /* отказано политикой — молча живём дальше */ }
    };
    // Вкладка вернулась из фона → блокировка уже снята системой, берём заново.
    const onVisible = () => { if (document.visibilityState === 'visible' && !sentinel) acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      try { sentinel?.release?.(); } catch { /* уже отпущена */ }
      sentinel = null;
    };
  }, [active]);
}
