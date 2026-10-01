/**
 * 🔴 ЭКРАНЫ ЗАРЯДКИ РИСУЕТ ОБОЛОЧКА, А СЧИТАЕТ ПО-ПРЕЖНЕМУ ВЕБ.
 *
 * Задача 748c3f5f, решение Дениса 01.10.2026: «всё, что не на Flutter, —
 * переводить», «зачем вебом скреплять переходы — это лишний глюк». Выбор зарядки
 * (`/warmup-picker`), итог (`/warmup-complete`) и веб-мост (`/warmup-bridge` —
 * перед веб-игрой и когда вышло время) были последними веб-экранами зарядки.
 *
 * Расчёты за этими экранами тяжёлые и общие с остальным приложением: составы
 * (`services/warmup.ts`, 1690 строк), профиль, история, серия дней, разбор по
 * навыкам, токены, напоминания. Переписать их в Dart — значит завести вторую
 * копию, которая разойдётся с первой молча. Поэтому экран остаётся веб-компонентом
 * и считает всё сам, но под нативной оболочкой он невидим: каждый раз, когда
 * меняется то, что он показал бы, он отдаёт оболочке готовую МОДЕЛЬ — тексты уже
 * на языке человека, числа уже посчитаны (`postUiModel`). Оболочка рисует её
 * (`flutter/lib/shell/warmup_screens.dart`), а нажатия возвращает сюда через
 * `window.__psyWarmupUi.<экран>.<действие>()` (`registerUiActions`).
 *
 * Вне оболочки (веб, пробы без моста) ничего не шлётся и не регистрируется —
 * экран работает как раньше.
 */
import { hostRendersNatively, postToHost } from '@/src/services/hostWarmup';

export type WarmupUiScreen = 'picker' | 'complete' | 'bridge';

const ROUTE: Record<WarmupUiScreen, string> = {
  picker: '/warmup-picker',
  complete: '/warmup-complete',
  bridge: '/warmup-bridge',
};

/** Оболочка рядом и рисует этот экран сама. */
export function hostDrawsScreen(screen: WarmupUiScreen): boolean {
  return hostRendersNatively(ROUTE[screen]);
}

/** Отдать оболочке модель экрана. false — оболочки нет или экран не её. */
export function postUiModel(screen: WarmupUiScreen, model: object): boolean {
  if (!hostDrawsScreen(screen)) return false;
  return postToHost({ op: 'warmupUi', screen, model });
}

type Actions = Record<string, (...args: never[]) => unknown>;
type UiWindow = { __psyWarmupUi?: Partial<Record<WarmupUiScreen, Actions>> };

/**
 * Действия экрана для оболочки. Возвращает снятие — звать при размонтировании:
 * снимается только своё, если экран уже сменился следующим.
 */
export function registerUiActions(screen: WarmupUiScreen, actions: Actions): () => void {
  if (typeof window === 'undefined' || !hostDrawsScreen(screen)) return () => {};
  const w = window as unknown as UiWindow;
  const all = (w.__psyWarmupUi ??= {});
  all[screen] = actions;
  return () => {
    if (w.__psyWarmupUi?.[screen] === actions) delete w.__psyWarmupUi[screen];
  };
}
