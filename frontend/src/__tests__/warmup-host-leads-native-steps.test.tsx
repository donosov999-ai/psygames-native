/* psygames-warmup-host-leads-native-steps · VER 2 · 07.10.2026 */
/**
 * МЕЖДУ ДВУМЯ НАТИВНЫМИ ШАГАМИ ПЕРЕХОД ВЕДЁТ ОБОЛОЧКА, А НЕ ВЕБ-МОСТ.
 *
 * Решение Дениса 01.10.2026: «зачем вебом скреплять переходы между двумя упражнениями?
 * это лишний глюк». До этого после нативной партии страница ждала 2 с, уходила на
 * `/warmup-bridge`, отсчитывала 5 с и только потом просила оболочку открыть следующую
 * нативную игру. См. `services/hostWarmup.ts`.
 *
 * Монтируется настоящий WarmupProvider, подменены навигация, профиль, звук, приёмник
 * сессий и сама оболочка (`window.PsyBridge`, `window.__psyHostNativeRoutes`):
 *   · оба шага нативные → веб шлёт `warmupStepDone` с адресом и именем следующего шага
 *     и НЕ уходит на свой мост;
 *   · оболочка ответила `goTo(1)` → учёт на шаге 1, адрес страницы — на нём же;
 *   · следующий шаг — веб-игра → прежний путь через мост, оболочке ничего;
 *   · оболочки нет → прежний путь;
 *   · время зарядки вышло → прежний путь: спросить человека умеет пока только веб-мост.
 *
 * VER 2 (07.10.2026, отчёт 02d98918, 2.56.12): «зарядка не дала перейти от третьего к
 * следующему». Под нативным SDMT веб-копия игры стартовала сама и через 60 с сохранила
 * свою партию — ушли ДВА «шаг готов», оболочка поставила два моста, первый снялся
 * пустым и остановил зарядку. Теперь на шаге оболочки засчитывается только её партия
 * (метит `nativeSessionBridge`), и «готов» за шаг — один.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { WarmupProvider, useWarmup } from '@/src/contexts/WarmupContext';

const mockReplace = jest.fn();
let mockListener: ((s: any) => Promise<void> | void) | null = null;

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('@/src/services/feedback', () => ({ fbCorrect: () => {}, fbComplete: () => {} }));
jest.mock('@/src/services/api', () => ({ setSessionListener: (fn: any) => { mockListener = fn; } }));
const mockHostIds = new Set<string>();
jest.mock('@/src/services/nativeSessionBridge', () => ({
  isHostSession: (s: any) => !!s?.id && mockHostIds.has(s.id),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

let ctx: any = null;
function Probe({ onCtx }: { onCtx: (c: any) => void }) {
  const c = useWarmup();
  React.useEffect(() => { onCtx(c); });
  return null;
}

const posted: any[] = [];
let нативных = 0;
/** Партия, сыгранная нативно: её `id` помнит приёмник оболочки. */
function нативная(game_type = 'digit_span') {
  const id = `host-${++нативных}`;
  mockHostIds.add(id);
  return { id, game_type, score: 5, time_seconds: 20, errors: 0, details: {} };
}
/** Фантом веб-копии игры под нативным экраном: та же игра, но не от оболочки. */
const фантом = (game_type = 'digit_span') => ({ id: `web-${++нативных}`, game_type, score: 0, time_seconds: 60, errors: 0, details: {} });
const w = window as any;

function оболочка(native: string[]) {
  w.PsyBridge = { postMessage: (s: string) => posted.push(JSON.parse(s)) };
  w.__psyHostNativeRoutes = native;
  w.__psyHostLang = 'ru';
}

beforeEach(() => {
  jest.useFakeTimers();
  mockReplace.mockClear();
  mockListener = null;
  ctx = null;
  posted.length = 0;
  delete w.PsyBridge;
  delete w.__psyHostNativeRoutes;
  delete w.__psyHostLang;
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const ЦИФРЫ = { game_id: 'digit_span', game_route: '/games/digit-span', est_duration_sec: 60 };
const ШУЛЬТЕ = { game_id: 'schulte_table', game_route: '/games/schulte', est_duration_sec: 60 };
const ВЕБ = { game_id: 'tetris', game_route: '/games/tetris', est_duration_sec: 60 };

async function партия(steps: object[], durationMin = 5) {
  await act(async () => { TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  const набор = {
    duration_min: durationMin, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning',
    steps, est_total_sec: 120,
  };
  await act(async () => { ctx.startPlaylist(набор); });
  mockReplace.mockClear();
  await act(async () => { await mockListener!(нативная()); });
  await act(async () => { jest.advanceTimersByTime(4000); });
  await act(async () => { jest.advanceTimersByTime(10); });
}

const наМост = () => mockReplace.mock.calls.some((c) => c[0] === '/warmup-bridge');

it('🔴 оба шага нативные — веб шлёт оболочке warmupStepDone и НЕ уходит на свой мост', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  await партия([ЦИФРЫ, ШУЛЬТЕ]);

  expect(наМост()).toBe(false);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ op: 'warmupStepDone', fromIdx: 0, total: 2, evening: false, afterNext: null });
  expect(posted[0].next.url).toMatch(/^\/games\/schulte\?.*wu=1/);
  expect(posted[0].next.title).toBeTruthy();
  expect(posted[0].next.title).not.toBe('schulte_table');   // имя, а не id
  expect(ctx.results).toHaveLength(1);                  // партия засчитана
  expect(ctx.currentIdx).toBe(0);                        // шаг двигает оболочка, не веб
});

it('оболочка ответила goTo(1) — учёт на шаге 1, страница на том же шаге', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  await партия([ЦИФРЫ, ШУЛЬТЕ]);
  await act(async () => { w.__psyWarmupHost.goTo(1); });
  await act(async () => { jest.advanceTimersByTime(10); });

  expect(ctx.currentIdx).toBe(1);
  expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/games/schulte' }));
  expect(наМост()).toBe(false);
});

it('оболочка не взялась — advance ведёт прежним веб-путём', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  await партия([ЦИФРЫ, ШУЛЬТЕ]);
  await act(async () => { w.__psyWarmupHost.advance(0); });
  await act(async () => { jest.advanceTimersByTime(10); });
  expect(наМост()).toBe(true);
});

it('следующий шаг — веб-игра: прежний путь через мост, оболочке ничего', async () => {
  оболочка(['/games/digit-span']);
  await партия([ЦИФРЫ, ВЕБ]);
  expect(posted).toHaveLength(0);
  expect(наМост()).toBe(true);
});

it('оболочки нет — прежний путь через мост', async () => {
  await партия([ЦИФРЫ, ШУЛЬТЕ]);
  expect(posted).toHaveLength(0);
  expect(наМост()).toBe(true);
});

it('время зарядки вышло — прежний путь: спросить человека умеет пока веб-мост', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  const now = Date.now();
  const spy = jest.spyOn(Date, 'now');
  spy.mockReturnValue(now);
  await act(async () => { TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  await act(async () => {
    ctx.startPlaylist({ duration_min: 1, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning', steps: [ЦИФРЫ, ШУЛЬТЕ], est_total_sec: 120 });
  });
  mockReplace.mockClear();
  spy.mockReturnValue(now + 2 * 60_000);   // прошло две минуты при обещанной одной
  await act(async () => { await mockListener!(нативная()); });
  await act(async () => { jest.advanceTimersByTime(4000); });
  await act(async () => { jest.advanceTimersByTime(10); });
  spy.mockRestore();
  expect(posted).toHaveLength(0);
  expect(наМост()).toBe(true);
});

it('🔴 полоска нативного шага: info() — номер, всего, имя; skip() — как веб-⏭', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  await act(async () => { TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  await act(async () => {
    ctx.startPlaylist({ duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning', steps: [ЦИФРЫ, ШУЛЬТЕ], est_total_sec: 120 });
  });
  const i = w.__psyWarmupHost.info();
  expect(i).toMatchObject({ active: true, idx: 0, total: 2, evening: false });
  expect(i.title).toBeTruthy();
  expect(i.title).not.toBe('digit_span');
  mockReplace.mockClear();
  await act(async () => { w.__psyWarmupHost.skip(); });
  await act(async () => { jest.advanceTimersByTime(10); });
  expect(ctx.currentIdx).toBe(1);
  expect(наМост()).toBe(true);   // веб-⏭ ведёт на мост с «Пропущено» — нативный ⏭ туда же
});

it('🔴 веб-копия игры под нативным экраном сохранилась сама — шаг не засчитан, «готов» не ушёл', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  await act(async () => { TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  await act(async () => {
    ctx.startPlaylist({ duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning', steps: [ЦИФРЫ, ШУЛЬТЕ], est_total_sec: 120 });
  });
  await act(async () => { await mockListener!(фантом()); });
  await act(async () => { jest.advanceTimersByTime(4000); });
  expect(posted).toHaveLength(0);
  expect(ctx.results).toHaveLength(0);
  expect(наМост()).toBe(false);
  // А нативная партия того же шага — засчитана, переход ведёт оболочка.
  await act(async () => { await mockListener!(нативная()); });
  await act(async () => { jest.advanceTimersByTime(4000); });
  expect(posted).toHaveLength(1);
  expect(ctx.results).toHaveLength(1);
});

it('🔴 отчёт 02d98918: фантом и нативная партия одного шага (плюс повтор) — «готов» ровно один, на главную не уходим', async () => {
  оболочка(['/games/digit-span', '/games/schulte']);
  await act(async () => { TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  await act(async () => {
    ctx.startPlaylist({ duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning', steps: [ЦИФРЫ, ШУЛЬТЕ], est_total_sec: 120 });
  });
  mockReplace.mockClear();
  await act(async () => {
    await mockListener!(нативная());
    await mockListener!(фантом());
    await mockListener!(нативная());
  });
  await act(async () => { jest.advanceTimersByTime(4000); });
  expect(posted.filter((m) => m.op === 'warmupStepDone')).toHaveLength(1);
  expect(posted[0]).toMatchObject({ op: 'warmupStepDone', fromIdx: 0 });
  expect(mockReplace).not.toHaveBeenCalledWith('/');
  expect(наМост()).toBe(false);
  // Оболочка ответила goTo(1) — зарядка идёт дальше, а не стоит.
  await act(async () => { w.__psyWarmupHost.goTo(1); });
  await act(async () => { jest.advanceTimersByTime(10); });
  expect(ctx.currentIdx).toBe(1);
  expect(ctx.active).toBe(true);
});

