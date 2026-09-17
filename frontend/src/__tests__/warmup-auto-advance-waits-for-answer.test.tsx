/* psygames-warmup-auto-advance-waits-for-answer · VER 1 · 17.09.2026 */
/**
 * АВТОПЕРЕХОД ЗАРЯДКИ ЖДЁТ ОТВЕТА НА ВОПРОС — ПРОВЕРКА НА НАСТОЯЩЕМ ПРОВАЙДЕРЕ.
 *
 * 📍 Задача 1436bcdd. После сохранения партии зарядка через 2 с сама уходит на мост. Карточка
 * итога теперь переспрашивает перед остановкой и на это время держит переход
 * (`holdAutoAdvance`). Иначе вопрос уезжал бы вместе с экраном, а ответ «Остановить»
 * приходил бы уже на мост — та самая хронология отчёта a0b6d77f.
 *
 * Монтируется WarmupProvider, подменены только навигация, профиль, звук и приёмник сессий:
 *   · без держания переход на мост случается через 2 с — контроль, что проба видит переход;
 *   · держание взято ДО прихода партии — перехода нет сколько угодно долго;
 *   · держание взято ПОСЛЕ, когда таймер уже стоит, — таймер срабатывает вхолостую;
 *   · отпускание переход не возобновляет, «Продолжить» (advanceToNext) — ведёт на мост.
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
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const шаги = [
  { game_id: 'find_differences', game_route: '/games/find-differences', est_duration_sec: 60 },
  { game_id: 'goods_sort', game_route: '/games/goods-sort', est_duration_sec: 60 },
  { game_id: 'mahjong', game_route: '/games/mahjong', est_duration_sec: 60 },
];
const набор = {
  duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '',
  steps: шаги, est_total_sec: 180, slot: 'morning',
};

let ctx: any = null;
/** Контекст наружу отдаётся из эффекта: присваивать внешней переменной в теле компонента линт хуков не даёт. */
function Probe({ onCtx }: { onCtx: (c: any) => void }) {
  const c = useWarmup();
  React.useEffect(() => { onCtx(c); });
  return null;
}

beforeEach(() => { jest.useFakeTimers(); mockReplace.mockClear(); mockListener = null; ctx = null; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

async function зарядка(): Promise<TestRenderer.ReactTestRenderer> {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  await act(async () => { ctx.startPlaylist(набор); });
  mockReplace.mockClear();
  return tr;
}
async function партияСохранена(): Promise<void> {
  await act(async () => { await mockListener!({ game_type: 'find_differences', score: 10, time_seconds: 30, errors: 0, details: {} }); });
}
async function прошло(мс: number): Promise<void> {
  await act(async () => { jest.advanceTimersByTime(мс); });
  await act(async () => { jest.advanceTimersByTime(10); });   // advanceToNext уходит через setTimeout 0
}
const наМост = () => mockReplace.mock.calls.filter((c) => c[0] === '/warmup-bridge').length;

describe('автопереход зарядки ждёт ответа на вопрос', () => {
  it('контроль: без держания через 2 с — на мост', async () => {
    const tr = await зарядка();
    await партияСохранена();
    await прошло(2000);
    expect(`переходов на мост: ${наМост()}`).toBe('переходов на мост: 1');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 держание взято до прихода партии — перехода нет', async () => {
    const tr = await зарядка();
    let отпустить!: () => void;
    await act(async () => { отпустить = ctx.holdAutoAdvance(); });
    await партияСохранена();
    await прошло(60_000);
    expect(`переходов на мост за минуту: ${наМост()}`).toBe('переходов на мост за минуту: 0');
    // Отпускание переход не возобновляет — решает ответ.
    await act(async () => { отпустить(); });
    await прошло(60_000);
    expect(наМост()).toBe(0);
    await act(async () => { ctx.advanceToNext(); });
    await прошло(0);
    expect(`после «Продолжить»: ${наМост()}`).toBe('после «Продолжить»: 1');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 держание взято, когда таймер уже стоит, — таймер срабатывает вхолостую', async () => {
    const tr = await зарядка();
    await партияСохранена();
    await прошло(1000);
    await act(async () => { ctx.holdAutoAdvance(); });
    await прошло(60_000);
    expect(`переходов на мост: ${наМост()}`).toBe('переходов на мост: 0');
    await act(async () => { tr.unmount(); });
  });
});
