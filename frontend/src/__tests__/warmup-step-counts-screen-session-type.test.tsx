/* psygames-warmup-step-counts-screen-session-type · VER 1 · 17.09.2026 */
/**
 * ШАГ ЗАРЯДКИ ЗАСЧИТЫВАЕТ ПАРТИЮ, КОТОРУЮ ЭКРАН ПИШЕТ В СВОЮ КОРЗИНУ, — НА НАСТОЯЩЕМ ПРОВАЙДЕРЕ.
 *
 * 📍 Живой проход серий 17.09.2026 (экспорт-сборка 1101b52b). Шаг набора называет игру `id`
 * каталога, экран пишет партию под `game_type`. У «Судоку: фрактал» и «Самурая» это разные
 * строки, и каталог это объявляет (`sessionType`). Слушатель зарядки сверял строки напрямую:
 * партия `sudoku_fractal` на шаге `sudoku-fractal` давала ноль результатов и ноль переходов,
 * а серия «Все игры · Судоку» кончалась «ЗАРЯДКА ОСТАНОВЛЕНА».
 *
 * Монтируется WarmupProvider, подменены только навигация, профиль, звук и приёмник сессий:
 *   · каждый шаг заводского состава, чья игра пишет не под своим `id`, засчитывает партию
 *     из объявленной корзины — результат есть, переход есть, результат назван именем шага;
 *   · контроль: партия ЧУЖОЙ игры на том же шаге не засчитывается;
 *   · охват: каждая игра из файла состава засчитывает партию из корзины, которую ей
 *     объявляет каталог (`sessionTypeOf`).
 *
 * ⚠️ Проба сторожит МЕХАНИЗМ, а не экраны: какую корзину экран пишет на самом деле, знает
 * каталог (`sessionType`). Экран, пишущий в необъявленную корзину, этой пробе не виден —
 * так было с «Торможением» (go_no_go / stop_signal / inhibition_mixed, задача c1dac288).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { WarmupProvider, useWarmup } from '@/src/contexts/WarmupContext';
import { GAMES, sessionTypeOf } from '@/src/constants/games';

const mockReplace = jest.fn();
let mockListener: ((s: any) => Promise<void> | void) | null = null;

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('@/src/services/feedback', () => ({ fbCorrect: () => {}, fbComplete: () => {} }));
jest.mock('@/src/services/api', () => ({ setSessionListener: (fn: any) => { mockListener = fn; } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const состав = require('../constants/defaultPlaylists.json') as {
  профили: Record<string, { сетка?: Record<string, Record<string, Record<string, { game_id: string; game_route: string }[]>>> }>;
  наборы: { id: string; шаги: { game_id: string; game_route: string }[] }[];
};

/** Все шаги файла: сетки всех профилей и все наборы. */
function шагиФайла(): { game_id: string; game_route: string }[] {
  const out: { game_id: string; game_route: string }[] = [];
  for (const п of Object.values(состав.профили)) {
    for (const слоты of Object.values(п.сетка ?? {})) for (const длины of Object.values(слоты)) for (const шаги of Object.values(длины)) out.push(...шаги);
  }
  for (const н of состав.наборы) out.push(...н.шаги);
  return out;
}

let ctx: any = null;
/** Контекст наружу отдаётся из эффекта: присваивать внешней переменной в теле компонента линт хуков не даёт. */
function Probe({ onCtx }: { onCtx: (c: any) => void }) {
  const c = useWarmup();
  React.useEffect(() => { onCtx(c); });
  return null;
}

beforeEach(() => { jest.useFakeTimers(); mockReplace.mockClear(); mockListener = null; ctx = null; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

/** Серия из двух шагов: проверяемый первым, второй — чтобы переход шёл на мост. */
async function партияНаШаге(шаг: { game_id: string; game_route: string }, gameType: string) {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupProvider><Probe onCtx={(c) => { ctx = c; }} /></WarmupProvider>); });
  const набор = {
    duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'day',
    steps: [{ ...шаг, est_duration_sec: 60 }, { game_id: 'mahjong', game_route: '/games/mahjong', est_duration_sec: 60 }],
    est_total_sec: 120,
  };
  await act(async () => { ctx.startPlaylist(набор); });
  mockReplace.mockClear();
  await act(async () => { await mockListener!({ game_type: gameType, score: 7, time_seconds: 30, errors: 0, details: {} }); });
  await act(async () => { jest.advanceTimersByTime(2000); });
  await act(async () => { jest.advanceTimersByTime(10); });   // advanceToNext уходит через setTimeout 0
  const итог = {
    результатов: ctx.results.length,
    имя: ctx.results[0]?.game_type ?? null,
    наМост: mockReplace.mock.calls.filter((c) => c[0] === '/warmup-bridge').length,
  };
  await act(async () => { tr.unmount(); });
  return итог;
}

describe('шаг зарядки засчитывает партию из корзины экрана', () => {
  const вФайле = new Map<string, { game_id: string; game_route: string }>();
  for (const ш of шагиФайла()) if (!вФайле.has(ш.game_id)) вФайле.set(ш.game_id, ш);
  const сДругойКорзиной = GAMES.filter((g) => sessionTypeOf(g) !== g.id && вФайле.has(g.id));

  it('в файле состава есть игры, пишущие не под своим id (иначе проба ничего не сторожит)', () => {
    expect(сДругойКорзиной.map((g) => g.id).sort()).toEqual(expect.arrayContaining(['sudoku-fractal', 'sudoku-samurai']));
  });

  it('🔴 партия из объявленной корзины засчитана: результат, переход на мост, имя шага', async () => {
    const строки: string[] = [];
    for (const g of сДругойКорзиной) {
      const р = await партияНаШаге(вФайле.get(g.id)!, sessionTypeOf(g));
      строки.push(`${g.id} ← ${sessionTypeOf(g)}: результатов ${р.результатов}, на мост ${р.наМост}, имя ${р.имя}`);
    }
    expect(строки).toEqual(сДругойКорзиной.map((g) => `${g.id} ← ${sessionTypeOf(g)}: результатов 1, на мост 1, имя ${g.id}`));
  });

  it('контроль: партия чужой игры на том же шаге не засчитана', async () => {
    const р = await партияНаШаге(вФайле.get('sudoku-fractal')!, 'sudoku');
    expect(`результатов ${р.результатов}, на мост ${р.наМост}`).toBe('результатов 0, на мост 0');
  });

  it('охват: каждая игра файла состава засчитывает партию из корзины, объявленной каталогом', async () => {
    const мимо: string[] = [];
    for (const [id, шаг] of вФайле) {
      const g = GAMES.find((x) => x.id === id);
      if (!g) continue;   // игры нет в каталоге — это другой гейт (default-playlists-ship)
      const р = await партияНаШаге(шаг, sessionTypeOf(g));
      if (р.результатов !== 1 || р.наМост !== 1) мимо.push(`${id} ← ${sessionTypeOf(g)}`);
    }
    expect(мимо).toEqual([]);
  });
});
