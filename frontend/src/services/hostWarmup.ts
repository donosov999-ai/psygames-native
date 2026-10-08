/**
 * 🔴 ПЕРЕХОД МЕЖДУ ДВУМЯ НАТИВНЫМИ ШАГАМИ ВЕДЁТ ОБОЛОЧКА, А НЕ ВЕБ.
 *
 * Решение Дениса 01.10.2026 («зачем вебом скреплять переходы между двумя
 * упражнениями? это лишний глюк»), координатор согласен. До этого после нативной
 * партии страница ждала 2 с, уходила на свой мост `/warmup-bridge`, отсчитывала
 * ещё 5 с и только потом просила оболочку открыть следующую нативную игру: три
 * перехода и пара «закрыть старый / открыть новый» экран, на которой уже теряли
 * настройки шага (PR #58). 72 из 81 адреса в составах зарядок — нативные.
 *
 * Теперь веб остаётся УЧЁТОМ зарядки (состав, номер шага, итоги, история,
 * статистика), а показ «дальше: …» и открытие следующей нативной игры — у
 * оболочки (`flutter/lib/shell/warmup_step_bridge.dart`). Когда следующий шаг —
 * ещё не перенесённая веб-игра, или время зарядки вышло и надо спросить
 * человека, всё идёт прежним веб-путём.
 *
 * Оболочка вбрасывает в страницу `window.__psyHostNativeRoutes` (адреса своих
 * экранов) и `window.__psyHostLang`; веб шлёт ей `warmupStepDone` через тот же
 * канал `PsyBridge`, которым уже сообщает о смене маршрута.
 */
import { translateFor } from '@/src/contexts/LanguageContext';
import type { PlaylistMeta, PlaylistStep, WarmupSlot } from '@/src/services/warmup';
import { stepToParams } from '@/src/services/warmup';
import { ключИмениШага } from '@/src/services/stepName';

type HostWindow = {
  __psyHostNativeRoutes?: unknown;
  __psyHostLang?: unknown;
  PsyBridge?: { postMessage?: (s: string) => void };
};

function hostWindow(): HostWindow | null {
  return typeof window === 'undefined' ? null : (window as unknown as HostWindow);
}

/** Адрес без запроса: `/games/digit-span?wu=1` → `/games/digit-span`. */
function pathOf(route: string): string {
  return route.split('?')[0];
}

/** Оболочка гибрида рядом и сама рисует этот адрес. */
export function hostRendersNatively(route: string): boolean {
  const w = hostWindow();
  if (!w || typeof w.PsyBridge?.postMessage !== 'function') return false;
  const routes = w.__psyHostNativeRoutes;
  return Array.isArray(routes) && routes.includes(pathOf(route));
}

/** Оболочка ведёт переход, только если ОБА шага её. */
export function hostLeadsBetween(cur: PlaylistStep, next: PlaylistStep | undefined): next is PlaylistStep {
  return !!next && hostRendersNatively(cur.game_route) && hostRendersNatively(next.game_route);
}

/**
 * 🔴 ПОСЛЕДНИЙ ШАГ НАТИВНЫЙ — КОНЕЦ ЗАРЯДКИ ТОЖЕ ВЕДЁТ ОБОЛОЧКА (08.10.2026, Денис, iPhone:
 * «зарядка закончилась, а окно продолжает висеть, не закрывается автоматом», кадр «6/6», N-back).
 *
 * Между шагами веб отдаёт «готов» оболочке СРАЗУ, в момент сохранения партии, — и шаги 1–5
 * проходят. А после последнего он ставил СВОЙ таймер на 2 с и только потом уходил на итог.
 * Под нативной игрой WebView не виден, и невидимому WebView iOS придерживает таймеры страницы:
 * 2 с не наступали, игра висела. Пробы этого не ловят — в них таймеры честные.
 * Теперь веб шлёт `warmupLastStepDone`, оболочка ждёт своим таймером, сама снимает игру
 * (страница становится видна) и только потом зовёт `advance` — переход на итог.
 */
export function hostLeadsFinish(cur: PlaylistStep, next: PlaylistStep | undefined): boolean {
  return !next && hostRendersNatively(cur.game_route);
}

export interface WarmupLastStepDone {
  op: 'warmupLastStepDone';
  /** Номер сыгранного шага (с нуля) — последнего. */
  fromIdx: number;
  total: number;
  evening: boolean;
}

export function lastStepMessage(meta: PlaylistMeta, fromIdx: number): WarmupLastStepDone {
  return {
    op: 'warmupLastStepDone',
    fromIdx,
    total: meta.steps.length,
    evening: meta.slot === 'evening' || meta.slot === 'night',
  };
}

/** Тот же адрес шага, что строит веб-мост (`router.replace({ pathname, params })`). */
export function stepUrl(step: PlaylistStep, slot?: WarmupSlot, track?: PlaylistMeta['track']): string {
  const q = new URLSearchParams(stepToParams(step, slot, track)).toString();
  return q ? `${pathOf(step.game_route)}?${q}` : pathOf(step.game_route);
}

/** Имя шага на языке оболочки — как его пишет веб-мост (`имяШага`). */
function stepTitle(step: PlaylistStep, lang: string): string {
  const key = ключИмениШага(step);
  return key ? translateFor(lang, key) : step.game_id;
}

function hostLang(): string {
  const w = hostWindow();
  return typeof w?.__psyHostLang === 'string' ? (w.__psyHostLang as string) : 'ru';
}

/**
 * Где человек в серии — для полоски «N/M · ⏭» в НАТИВНОМ шаге (задача 63bccf96):
 * веб рисует её в своём каркасе (`GameShell`: `warmup-position`, `warmup-skip-step`),
 * а нативный экран лежит поверх страницы, и полоски там не было.
 */
export interface WarmupHostInfo {
  active: boolean;
  idx: number;
  total: number;
  title: string;
  evening: boolean;
}

export function hostInfo(active: boolean, meta: PlaylistMeta | null, idx: number): WarmupHostInfo {
  const step = meta?.steps[idx];
  return {
    active: active && !!meta && !!step,
    idx,
    total: meta?.steps.length ?? 0,
    title: step ? stepTitle(step, hostLang()) : '',
    evening: meta?.slot === 'evening' || meta?.slot === 'night',
  };
}

export interface WarmupStepDone {
  op: 'warmupStepDone';
  /** Номер сыгранного шага (с нуля). */
  fromIdx: number;
  total: number;
  evening: boolean;
  next: { url: string; title: string };
  /** Шаг через один — для «Пропустить»: что откроется вместо следующего. */
  afterNext: { url: string; title: string } | null;
  /** Что сыграно — как на карточке веб-моста: очки и время. */
  played: { score: number; time_seconds: number; errors: number };
}

export function stepDoneMessage(
  meta: PlaylistMeta,
  fromIdx: number,
  played: { score?: number; time_seconds?: number; errors?: number } = {},
): WarmupStepDone | null {
  const next = meta.steps[fromIdx + 1];
  if (!next) return null;
  const lang = hostLang();
  const after = meta.steps[fromIdx + 2];
  return {
    op: 'warmupStepDone',
    fromIdx,
    total: meta.steps.length,
    evening: meta.slot === 'evening' || meta.slot === 'night',
    next: { url: stepUrl(next, meta.slot, meta.track), title: stepTitle(next, lang) },
    afterNext: after ? { url: stepUrl(after, meta.slot, meta.track), title: stepTitle(after, lang) } : null,
    played: { score: played.score ?? 0, time_seconds: played.time_seconds ?? 0, errors: played.errors ?? 0 },
  };
}

/**
 * Отправить оболочке. false — канала нет, оболочка не услышит.
 *
 * 🔴 МЕТОД ЗОВЁТСЯ НА САМОМ МОСТЕ, А НЕ ВЫНУТЫМ (01.10.2026, Play 2.56.3 на эмуляторе).
 * Было `const post = PsyBridge.postMessage; post(...)`. На iOS мост — обычная JS-функция,
 * и такой вызов проходит; на Android мост — Java-объект (`addJavascriptInterface`), и его
 * метод без своего объекта бросает «Java bridge method can't be invoked on a non-injected
 * object». Исключение глоталось ниже, функция возвращала false — и ни одно сообщение веба
 * не доходило: экран выбора зарядки (нативный, #108) ждал модель вечно, переход между
 * нативными шагами (#98) молча уходил в веб. Сама оболочка шлёт через
 * `window.PsyBridge.postMessage(...)` — потому её сообщения (смена адреса) работали.
 * Проба: src/__tests__/host-bridge-bound-call.test.ts.
 */
export function postToHost(msg: object): boolean {
  const bridge = hostWindow()?.PsyBridge;
  if (!bridge || typeof bridge.postMessage !== 'function') return false;
  try {
    bridge.postMessage(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}
