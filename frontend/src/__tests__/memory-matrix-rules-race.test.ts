/**
 * 🔴 ПРАВИЛА УРОВНЯ НЕ СМЕЮТ ВСПЛЫТЬ ПОВЕРХ ИДУЩЕГО ЗАПОМИНАНИЯ.
 *
 * ОТЧЁТ. Валя, 05.09.2026, `memory-matrix`: «вначале вылезла сетка с теми
 * квадратами, которые нужно запомнить, и пока я их запоминала — сетка исчезла, а
 * вместо пустых квадратов появилась расшифровка правил… естественно, я забыла всю
 * сетку». Карточка правил в фазе удержания СТИРАЕТ то, что человек держит в
 * рабочей памяти, — ровно то, что упражнение и меряет.
 *
 * ЧТО УЖЕ ПОЧИНЕНО (v2.44.0, коммит f1eb95b3). В девяти играх аргумент `enabled`
 * переписан с `phase === 'recall'` на `phase === 'config'`: надёжный путь закрыт,
 * правила больше не открываются в фазе вспоминания.
 *
 * 🔴 ЧЕГО ТА ПОЧИНКА НЕ ТРОГАЛА — САМ ХУК. `useLevelRules` проверяет заслон ДО
 * чтения хранилища, а `setOpen(true)` зовёт ПОСЛЕ, и повторной проверки нет:
 *
 *     if (!enabled || !active) return;              // ← заслон здесь
 *     AsyncStorage.getItem(flag).then((seen) => {
 *       if (!seen) { setOpen(true); ... }           // ← а решение здесь
 *     });
 *
 * Между этими строками человек успевает нажать «Начать»: фаза уходит из `config`
 * в `showing`, сетка уже горит — и карточка ложится поверх неё. Заслон стоит на
 * входе в эффект, а не на выходе из него, поэтому он этот случай не видит.
 *
 * Проба держит чтение хранилища открытым, переводит игру в показ и только потом
 * отпускает промис — то есть воспроизводит ровно ту щель, а не её пересказ.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLevelRules, type LevelRule } from '@/src/components/LevelRules';
import { MEMORYMATRIX_RULES, levelParams } from '@/app/games/memory-matrix';

/** Рендер хука без JSX: набор — .ts, поэтому через createElement. */
function renderHook<T>(hook: () => T) {
  const box: { value: T | undefined } = { value: undefined };
  const Probe = ({ h }: { h: () => T }) => { box.value = h(); return null; };
  let renderer: any;
  TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(Probe, { h: hook })); });
  return {
    box,
    rerender: (h: () => T) => TestRenderer.act(() => renderer.update(React.createElement(Probe, { h }))),
    unmount: () => TestRenderer.act(() => renderer.unmount()),
  };
}

const RULE_LEVEL = 8;   // lr_memory_matrix_fast_* — первый уровень с правилом «быстрее»

describe('memory-matrix: правило уровня и фаза показа', () => {
  it('правило на L8 действительно есть — иначе проба меряет пустоту', () => {
    const active = MEMORYMATRIX_RULES.filter((r: LevelRule) => RULE_LEVEL >= r.fromLevel);
    expect(active.length).toBeGreaterThan(0);
    // и порог правила «fast» совпадает с первым уровнем, где показ быстрее секунды
    expect(levelParams(RULE_LEVEL).flashMs).toBeLessThan(1000);
    expect(levelParams(RULE_LEVEL - 1).flashMs).toBeGreaterThanOrEqual(1000);
  });

  it('в фазе настройки правило открывается — это норма, её не ломаем', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const { box, unmount } = renderHook(() =>
      useLevelRules('memory_matrix', RULE_LEVEL, MEMORYMATRIX_RULES, true));
    await TestRenderer.act(async () => { await Promise.resolve(); });
    expect((box.value as any).open).toBe(true);
    unmount();
  });

  /**
   * 🔴 ГЛАВНОЕ. Человек нажал «Начать», ПОКА читалось хранилище.
   *
   * ⚠️ ПОЧЕМУ `it.failing`, А НЕ ОБЫЧНЫЙ `it`. Замер 06.09.2026 показал: щель
   * открыта, `open === true` при горящей сетке. Но чинится она одной строкой в
   * `src/components/LevelRules.tsx` — а это ОБЩИЙ хук, им пользуются 25 игр
   * (моих из них 5). По ТЗ §1 общий слой правит координатор, поэтому я меряю и
   * передаю, а не чиню.
   *
   * `it.failing` держит набор зелёным, пока дефект жив, и САМ КРАСНЕЕТ в тот
   * день, когда хук починят: проба начнёт проходить, а `failing` этого не
   * простит. То есть это не заглушка — это будильник на приёмку.
   *
   * ПОЧИНКА, КОГДА ДОЙДУТ РУКИ (перепроверить заслон ПОСЛЕ чтения, а не только до):
   *     AsyncStorage.getItem(flag).then((seen) => {
   *       if (!enabledRef.current) return;          // ← вот эта строка
   *       if (!seen) { setOpen(true); ... }
   *     });
   * После починки заменить `it.failing` на `it` — проба станет обычным гейтом.
   */
  it.failing('🔴 нажал «Начать» во время чтения флага — правило НЕ всплывает поверх сетки', async () => {
    let отпустить!: (v: string | null) => void;
    (AsyncStorage.getItem as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { отпустить = resolve; }));

    // фаза config: эффект стартовал, чтение флага висит
    const { box, rerender, unmount } = renderHook(() =>
      useLevelRules('memory_matrix', RULE_LEVEL, MEMORYMATRIX_RULES, true));

    // человек жмёт «Начать» → фаза showing, сетка уже горит
    rerender(() => useLevelRules('memory_matrix', RULE_LEVEL, MEMORYMATRIX_RULES, false));

    // и только теперь хранилище ответило «правило не показывали»
    await TestRenderer.act(async () => { отпустить(null); await Promise.resolve(); });

    expect(`сетка горит, карточка правил открыта: ${(box.value as any).open}`)
      .toBe('сетка горит, карточка правил открыта: false');
    unmount();
  });
});
