/**
 * 🔴 ГЛАВНЫЕ ЭКРАНЫ РИСУЕТ ОБОЛОЧКА, А СЧИТАЕТ ПО-ПРЕЖНЕМУ ВЕБ (задачи 7c88c0b8 и соседние).
 *
 * Тот же приём, что у экранов зарядки (`services/warmupUi.ts`), только по адресу экрана, а не по
 * трём именам: Главная, Прогресс, Питомец, Магазин и остальные главные экраны переезжают на Flutter
 * по одному. За каждым — тяжёлые и общие расчёты (рекомендации, заработок дня, серия, цель, лестница
 * фич, коллекция, достижения), и вторая их копия на Dart разошлась бы с первой молча.
 *
 * Поэтому веб-экран остаётся смонтированным под оболочкой и считает всё сам, но не виден: каждый раз,
 * когда меняется то, что он показал бы, он отдаёт оболочке готовую МОДЕЛЬ — тексты уже на языке
 * человека, числа посчитаны, цвета — hex, картинки — адреса сборки (`postScreenModel`). Оболочка
 * рисует её (`flutter/lib/shell/screen_ui.dart`), а нажатия возвращает сюда:
 * `window.__psyScreenUi['<адрес>'].<действие>(…)` (`registerScreenActions`).
 *
 * Какие адреса рисует оболочка, говорит она сама (`window.__psyHostScreens`). Вне оболочки (браузер,
 * пробы без моста) ничего не шлётся и не регистрируется — экран работает как раньше.
 */
import { postToHost } from '@/src/services/hostWarmup';

type HostWindow = {
  PsyBridge?: { postMessage?: (s: string) => void };
  __psyHostScreens?: string[];
  __psyScreenUi?: Record<string, Actions>;
};

type Actions = Record<string, (...args: never[]) => unknown>;

function hostWindow(): HostWindow | null {
  return typeof window === 'undefined' ? null : (window as unknown as HostWindow);
}

/** Оболочка рядом и рисует экран этого адреса сама. */
export function hostDrawsScreen(route: string): boolean {
  const w = hostWindow();
  if (!w || typeof w.PsyBridge?.postMessage !== 'function') return false;
  return Array.isArray(w.__psyHostScreens) && w.__psyHostScreens.includes(route);
}

/** Отдать оболочке модель экрана. false — оболочки нет или экран не её. */
export function postScreenModel(route: string, model: object): boolean {
  if (!hostDrawsScreen(route)) return false;
  return postToHost({ op: 'screenUi', route, model });
}

/**
 * Действия экрана для оболочки. Возвращает снятие — звать при размонтировании: снимается только
 * своё, если экран уже сменился следующим.
 */
export function registerScreenActions(route: string, actions: Actions): () => void {
  const w = hostWindow();
  if (!w || !hostDrawsScreen(route)) return () => {};
  const all = (w.__psyScreenUi ??= {});
  all[route] = actions;
  return () => {
    if (w.__psyScreenUi?.[route] === actions) delete w.__psyScreenUi[route];
  };
}

/**
 * Адрес картинки сборки для оболочки: на вебе `require()` отдаёт `{ uri }` (замер бандла 07.10.2026:
 * `/assets/assets/images/…/<имя>.<хеш>.webp`), строка — уже адрес; `testUri` — то же в пробах jest.
 */
export function assetUri(src: unknown): string | null {
  if (typeof src === 'string') return src;
  const o = src as { uri?: unknown; testUri?: unknown } | null | undefined;
  if (o && typeof o.uri === 'string') return o.uri;
  if (o && typeof o.testUri === 'string') return o.testUri;
  return null;
}
