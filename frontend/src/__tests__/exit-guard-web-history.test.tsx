/**
 * Сторож выхода на вебе: запись в history — НАША, только если мы её положили.
 *
 * Замер 09.09.2026 (Metro 8103, судоку, возобновлённая партия): страница перезагружена с
 * нашей меткой `__psygamesExitGuard` наверху — браузер сохраняет history.state при
 * перезагрузке. Новый экран взводил сторож, видел метку и НЕ клал свою запись, а при
 * размонтировании (стрелка → «Заново» → экран сборки) делал history.back() на настоящую
 * предыдущую страницу. Expo Router отвечал перемонтированием: в консоли UNMOUNT→MOUNT,
 * человек оказывался на экране настройки вместо новой доски.
 *
 * Здесь история — ручная модель (записи + указатель), popstate раздаётся синхронно.
 * Что сторожим поведением:
 *   1. чужая метка при взводе снимается, своя запись кладётся — размонтирование
 *      возвращает указатель на ТУ ЖЕ страницу, а не на предыдущую;
 *   2. обычный случай: положили — сняли, указатель где был;
 *   3. уход без взвода при чужой метке: back() НЕ зовётся, уходим сразу;
 *   4. уход после взвода: своя запись снимается, уход один раз.
 * Мутации, на которых проба краснеет (замер 09.09.2026): pushGuard молчит при любой метке
 * → п. 1 (указатель уезжает на предыдущую страницу); leaveWeb верит метке без памяти → п. 3.
 * ⚠️ Проверка `pushed.current` в cleanup отдельно НЕ различима: после взвода чужая метка
 * уже снята и наверху всегда своя запись — это страховка на случай вложенных сторожей,
 * а не самостоятельное поведение. Честно записано, чтобы не искать несуществующую пробу.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';
import { useExitGuard, type UseExitGuardResult } from '@/src/hooks/useExitGuard';

const MARK = '__psygamesExitGuard';

type Entry = { state: Record<string, unknown> | null };
function историяМодель(начальная: Entry[], index: number) {
  const entries = начальная.map((e) => ({ state: e.state }));
  const listeners = new Set<() => void>();
  let i = index;
  let backCalls = 0;
  const win = {
    history: {
      get state() { return entries[i].state; },
      get length() { return entries.length; },
      pushState(st: Record<string, unknown>) { entries.splice(i + 1); entries.push({ state: st }); i = entries.length - 1; },
      replaceState(st: Record<string, unknown>) { entries[i] = { state: st }; },
      back() { backCalls += 1; if (i > 0) i -= 1; listeners.forEach((l) => l()); },
    },
    addEventListener(type: string, l: () => void) { if (type === 'popstate') listeners.add(l); },
    removeEventListener(type: string, l: () => void) { if (type === 'popstate') listeners.delete(l); },
  };
  return { win, entries, index: () => i, backCalls: () => backCalls };
}

/** Держатель для хука: наружу через эффект, а не присваиванием при рендере (rules-of-hooks). */
const держатель: { guard: UseExitGuardResult | null } = { guard: null };
function ProbeGuard({ armed, onExit }: { armed: boolean; onExit: () => void }) {
  const guard = useExitGuard({ armed, onExit });
  React.useEffect(() => { держатель.guard = guard; });
  return null;
}

const savedOS = Platform.OS;
const g = globalThis as any;
let savedWindow: unknown;
beforeAll(() => { (Platform as any).OS = 'web'; savedWindow = g.window; });
afterAll(() => { (Platform as any).OS = savedOS; g.window = savedWindow; });
afterEach(() => { держатель.guard = null; });

function смонтировать(h: ReturnType<typeof историяМодель>, armed: boolean, onExit = jest.fn()) {
  g.window = h.win;
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => { tr = TestRenderer.create(<ProbeGuard armed={armed} onExit={onExit} />); });
  return { tr, onExit };
}

describe('сторож выхода на вебе — своя запись в истории против чужой метки', () => {
  it('1. 🔴 чужая метка после перезагрузки: своя запись кладётся, чужая снимается, размонтирование НЕ уводит со страницы', () => {
    const h = историяМодель([{ state: { id: 'prev' } }, { state: { id: 'cur', [MARK]: true } }], 1);
    const { tr } = смонтировать(h, true);
    expect(`записей ${h.entries.length}, указатель ${h.index()}, метка на своей: ${h.entries[2]?.state?.[MARK] === true}, метка на текущей странице снята: ${h.entries[1].state?.[MARK] === undefined}`)
      .toBe('записей 3, указатель 2, метка на своей: true, метка на текущей странице снята: true');
    act(() => { tr.unmount(); });
    expect(`указатель ${h.index()} (та же страница), back() ${h.backCalls()}`).toBe('указатель 1 (та же страница), back() 1');
  });

  it('2. обычный случай: взвод кладёт запись, размонтирование снимает её — указатель где был', () => {
    const h = историяМодель([{ state: { id: 'prev' } }, { state: { id: 'cur' } }], 1);
    const { tr } = смонтировать(h, true);
    expect(`${h.entries.length}/${h.index()}`).toBe('3/2');
    act(() => { tr.unmount(); });
    expect(`${h.index()}/${h.backCalls()}`).toBe('1/1');
  });

  it('3. 🔴 терять нечего, а чужая метка стоит: уходим сразу, back() не зовём', () => {
    const h = историяМодель([{ state: { id: 'prev' } }, { state: { id: 'cur', [MARK]: true } }], 1);
    const { onExit } = смонтировать(h, false);
    act(() => { держатель.guard!.requestExit(); });
    expect(`onExit ${onExit.mock.calls.length}, back() ${h.backCalls()}, указатель ${h.index()}`).toBe('onExit 1, back() 0, указатель 1');
  });

  it('4. взведён → «выйти»: своя запись снимается ровно одним back(), уход один раз', () => {
    const h = историяМодель([{ state: { id: 'prev' } }, { state: { id: 'cur' } }], 1);
    const { onExit, tr } = смонтировать(h, true);
    act(() => { держатель.guard!.requestExit(); });
    expect(держатель.guard!.asking).toBe(true);
    act(() => { держатель.guard!.confirmExit(); });
    expect(`onExit ${onExit.mock.calls.length}, back() ${h.backCalls()}, указатель ${h.index()}`).toBe('onExit 1, back() 1, указатель 1');
    act(() => { tr.unmount(); });
    expect(`после размонтирования back() ${h.backCalls()}`).toBe('после размонтирования back() 1');
  });

  it('5. аппаратная «назад» на вебе (popstate снаружи): сторож возвращается на место и спрашивает', () => {
    const h = историяМодель([{ state: { id: 'prev' } }, { state: { id: 'cur' } }], 1);
    смонтировать(h, true);
    // человек нажал «назад» в браузере: указатель ушёл на нашу страницу, popstate
    act(() => { (h.win.history as any).back(); });
    expect(`указатель ${h.index()}, записей ${h.entries.length}, спрашивает ${держатель.guard!.asking}`).toBe('указатель 2, записей 3, спрашивает true');
  });
});
