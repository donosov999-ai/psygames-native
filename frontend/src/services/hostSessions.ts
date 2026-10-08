/* psygames-host-sessions · VER 1 · 07.10.2026 */
/**
 * 🔴 ЧЬЯ ПАРТИЯ: ОТ НАТИВНОЙ ПОЛОВИНЫ ГИБРИДА ИЛИ ОТ ВЕБ-КОПИИ ПОД НЕЙ (задача 5f9d4ea0).
 *
 * Отдельным модулем, без зависимостей: его читают и приёмник партий оболочки
 * (`nativeSessionBridge.ts`, который сам зовёт `saveSession`), и `saveSession` (`api.ts`) —
 * через общий модуль круга импорта нет.
 *
 * Под нативным экраном в WebView живёт веб-копия той же игры. Часть игр стартует сама, идёт по
 * своим часам и сохраняет партию, которую человек не играл: SDMT при `wu=1` (отчёт 02d98918,
 * «SDMT — партий: 2»). Фантом засчитывался целиком: журнал, токены, серия, статистика, вызов дня.
 * В зарядке это закрыл PR #232 (засчитывать на нативном шаге только партию оболочки); вне зарядки
 * правило то же, и одна точка на все игры — здесь.
 *
 * Сигнал ставит оболочка (`flutter/lib/shell/hybrid_app.dart`, `_openNative`): `window.__psyNativeOver`
 * — пока поверх страницы открыт нативный экран, и ещё 1,5 с после закрытия: веб-копия, размонтируясь
 * на «назад», может сохранить недоигранное, и это тоже фантом. Список адресов
 * (`__psyHostNativeRoutes`) для этого не годится: у адреса бывают варианты, которые играет сама
 * страница (`/games/proofreading?series=1`), — решает оболочка в момент открытия, а не адрес.
 */

/** Партии, которые принесла оболочка, — по `id` (`saveSession` копирует объект, `id` переносит). */
const fromHost = new Set<string>();

/** Партию принесла оболочка. */
export function markHostSession(id: string): void {
  fromHost.add(id);
}

/** Партия сохранена нативной половиной гибрида (не веб-копией игры под ней). */
export function isHostSession(s: { id?: string } | null | undefined): boolean {
  return !!s?.id && fromHost.has(s.id);
}

/** Поверх страницы открыт нативный экран оболочки (или закрылся меньше 1,5 с назад). */
export function nativeScreenOver(): boolean {
  if (typeof window === 'undefined') return false;
  const v = (window as unknown as { __psyNativeOver?: unknown }).__psyNativeOver;
  return typeof v === 'string' && v.length > 0;
}

/** Партия веб-копии под нативным экраном: человек её не играл — не засчитывать. */
export function phantomSession(s: { id?: string } | null | undefined): boolean {
  return nativeScreenOver() && !isHostSession(s);
}

/** Только для проб. */
export const __hostSessionsTest = { reset: () => fromHost.clear() };
