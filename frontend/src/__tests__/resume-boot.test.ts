/* psygames-resume-boot · VER 1 · 20.08.2026 */
/**
 * НЕЗАКОНЧЕННАЯ ПАРТИЯ ПОДНИМАЕТСЯ ТОМУ, КТО ЕЁ ОСТАВИЛ.
 *
 * 🔴 ЧТО БЫЛО. Девять игр поднимали партию копипастом одного и того же эффекта,
 * и все девять — на первом рендере, когда `ProfileContext` ещё отдаёт профиль по
 * умолчанию (`free`), а настоящий читается из хранилища асинхронно. Ключ партии
 * содержит профиль, поэтому подъём читал `…_free`, взводил свой сторож и на
 * настоящем профиле уже не повторялся.
 *
 * Значит у всех, кто играет не на `free`, партия не поднималась НИКОГДА, а при
 * наличии записи на `free` — поднималась чужая.
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРКА РЕНДЕРОМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА. «В хуке есть слово ready»
 * не значит ничего: его можно прочитать и не использовать. Здесь профиль
 * ПОДМЕНЯЕТСЯ НА ЛЕТУ ровно так, как это делает контекст в бою, и от хука
 * требуется имя профиля, с которым он пошёл в хранилище. Соврать нечем.
 */
import React from 'react';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

/** Кто и с каким профилем ходил в хранилище за партией. */
const mockCalls: Array<{ gameId: string; pid: string; v: number }> = [];
let mockStored: unknown = { board: 'партия' };

jest.mock('@/src/services/resume', () => ({
  loadResume: jest.fn((gameId: string, pid: string, v: number) => {
    mockCalls.push({ gameId, pid, v });
    return Promise.resolve(mockStored);
  }),
}));

/** Живой дублёр контекста: профиль по умолчанию сразу, настоящий — потом. */
let mockCtx = { profile: { id: 'free' }, ready: false };
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => mockCtx,
}));

declare const __dirname: string;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

import { useResumeBoot } from '@/src/hooks/useResumeBoot';

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Рендерит хук и даёт ручку, чтобы перерисовать его после смены контекста —
 * точно как это делает React, когда профиль догрузился.
 */
function mount(skip = false) {
  const seen: Array<unknown> = [];
  const Probe = () => {
    useResumeBoot('goods_sort', 3, (saved) => { seen.push(saved); }, skip);
    return null;
  };
  let renderer: any;
  TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(Probe)); });
  return {
    seen,
    rerender: () => TestRenderer.act(() => { renderer.update(React.createElement(Probe)); }),
    unmount: () => TestRenderer.act(() => renderer.unmount()),
  };
}

beforeEach(() => {
  mockCalls.length = 0;
  mockStored = { board: 'партия' };
  mockCtx = { profile: { id: 'free' }, ready: false };
});

describe('подъём незаконченной партии', () => {
  it('🔴 пока профиль не прочитан — в хранилище не ходим вовсе', () => {
    const { unmount } = mount();
    expect(mockCalls).toEqual([]);
    unmount();
  });

  it('🔴 профиль догрузился «Релакс» — партию ищем по НЁМ, а не по free', async () => {
    const m = mount();
    // Так делает контекст в бою: настоящий профиль и готовность в одном обновлении.
    mockCtx = { profile: { id: 'relax' }, ready: true };
    m.rerender();
    await flush();
    expect(mockCalls.map((c) => c.pid)).toEqual(['relax']);
    m.unmount();
  });

  it('🔴 партия доезжает до игры, а не теряется по дороге', async () => {
    const m = mount();
    mockCtx = { profile: { id: 'relax' }, ready: true };
    m.rerender();
    await flush();
    expect(m.seen).toEqual([{ board: 'партия' }]);
    m.unmount();
  });

  it('человек и правда на free — поднимаем free, а не молчим', async () => {
    const m = mount();
    mockCtx = { profile: { id: 'free' }, ready: true };
    m.rerender();
    await flush();
    expect(mockCalls.map((c) => c.pid)).toEqual(['free']);
    m.unmount();
  });

  /**
   * ⚠️ ЭТА ПРОВЕРКА БЫЛА ПУСТОЙ. Сначала она дёргала лишние рендеры — но они не
   * меняют зависимостей эффекта, и второго подъёма не случилось бы даже без
   * сторожа: поломка «убрать bootRef» оставалась зелёной. Настоящая защита нужна
   * там, где зависимости МЕНЯЮТСЯ, — человек переключил профиль, не выходя из
   * игры. Поднять чужую партию поверх доски, на которой он сидит, нельзя.
   */
  it('🔴 профиль сменили посреди партии — вторую доску не подсовываем', async () => {
    const m = mount();
    mockCtx = { profile: { id: 'relax' }, ready: true };
    m.rerender();
    await flush();
    mockCtx = { profile: { id: 'pro' }, ready: true };
    m.rerender();
    await flush();
    expect(mockCalls.map((c) => c.pid)).toEqual(['relax']);
    m.unmount();
  });

  it('🔴 в зарядке партию не поднимаем — она подменила бы заданный шаг', async () => {
    const m = mount(true);
    mockCtx = { profile: { id: 'relax' }, ready: true };
    m.rerender();
    await flush();
    expect(mockCalls).toEqual([]);
    expect(m.seen).toEqual([]);
    m.unmount();
  });

  it('игру и версию записи передаём как есть', async () => {
    const m = mount();
    mockCtx = { profile: { id: 'relax' }, ready: true };
    m.rerender();
    await flush();
    expect(mockCalls[0]).toEqual({ gameId: 'goods_sort', pid: 'relax', v: 3 });
    m.unmount();
  });

  it('партии нет — игра узнаёт об этом, а не остаётся в неведении', async () => {
    mockStored = null;
    const m = mount();
    mockCtx = { profile: { id: 'relax' }, ready: true };
    m.rerender();
    await flush();
    expect(m.seen).toEqual([null]);
    m.unmount();
  });
});

/**
 * 🔴 ЧТОБЫ ДЕСЯТАЯ ИГРА НЕ ЗАВЕЛА ТУ ЖЕ ОШИБКУ КОПИПАСТОМ.
 *
 * Девять игр подняли партию одинаково неверно не потому, что автор не подумал, а
 * потому, что скопировал соседа. Починка в девяти местах оставляет десятому
 * экрану ровно ту же возможность — значит чинить надо возможность.
 *
 * ⚠️ КОММЕНТАРИИ СРЕЗАЕМ. В этих файлах много объяснений, и в них дословно
 * встречаются искомые имена: гейт, ищущий по всему тексту, зеленеет от
 * собственного комментария и перестаёт что-либо проверять.
 */
describe('подъём партии — только через общий хук', () => {
  const dir = join(__dirname, '../../app/games');
  const games = readdirSync(dir).filter((f: string) => f.endsWith('.tsx'));

  const code = (f: string): string => (readFileSync(join(dir, f), 'utf8') as string)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(games.length).toBeGreaterThanOrEqual(60);
  });

  it('🔴 ни один экран не зовёт loadResume сам', () => {
    const guilty = games.filter((f: string) => /\bloadResume\s*[<(]/.test(code(f)));
    expect(guilty).toEqual([]);
  });

  it('🔴 кто сохраняет партию — обязан её и поднимать', () => {
    const forgetful = games.filter((f: string) => {
      const c = code(f);
      return /\bsaveResume\s*\(/.test(c) && !/\buseResumeBoot\s*[<(]/.test(c);
    });
    expect(forgetful).toEqual([]);
  });

  it('и таких экранов девять — счёт держим, чтобы гейт не опустел молча', () => {
    const withBoot = games.filter((f: string) => /\buseResumeBoot\s*[<(]/.test(code(f)));
    expect(withBoot.length).toBe(9);
  });
});
