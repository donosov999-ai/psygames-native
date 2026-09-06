/**
 * ДОСКА ПОКАЗАНА СО СТОРОНЫ ТОГО, КТО ХОДИТ — ПРОВЕРКА РИСОВАНИЕМ.
 *
 * 🔴 ОТЧЁТ ДЕНИСА 05.09.2026 (`8eab6183`, помечен fixed в 2.43.0, НО ЖИВ):
 * «говорил уже, писал, что надо переворачивать доску, если я за чёрных играю…
 * ну нихуя ж непонятно, доска меняется, ты пытаешься ходить за белых, теряешь
 * время». Просил не в первый раз.
 *
 * 📍 ЧЕМ БЫЛ НЕВИДИМ. Починка 2.43.0 ЗАФИКСИРОВАЛА ориентацию на первой позиции
 * набора — и на лестнице это выглядит верно, потому что обычная колода
 * однородна по цвету: замер 06.09 по 50 колодам — 460 позиций, ни одной чужой
 * стороны. А в РЕЖИМЕ ПОТОКА колода склеивается из нескольких наборов с
 * разными семенами, и цвет в ней меняется: 2803 позиции, **1414 (50,4%) со
 * стороны соперника**, испорчены все 15 колод из 15. Поток — это десять минут
 * подряд, то есть ровно тот режим, где Денис и сидит.
 *
 * ⚠️ Ориентация берётся у ЗАДАЧИ, а не у текущего `fen`: внутри позиции в
 * несколько ходов сторона хода чередуется, и доска дёргалась бы на каждом ходу.
 */
import React from 'react';

import ScholarsMateGame from '@/src/games/scholars-mate/ScholarsMateGame';
import { buildDeck, levelParams } from '@/src/games/scholars-mate/core/deck';
import { sideToMove } from '@/src/games/scholars-mate/core/check';
import type { ScholarsAttempt } from '@/src/games/scholars-mate/core/types';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

const THEME = {
  surface: '#1C1C1E', text: '#FFF', textSecondary: '#8E8E93',
  border: '#38383A', primary: '#8e5b2f', success: '#12a594', danger: '#e24b4a',
};
const LABELS = {
  mate: 'мат', defend: 'защита', threat: 'угроза', sacrifice: 'жертва',
  yes: 'да', no: 'нет', best: 'верно', timeUp: 'время', sec: 'с',
};

const FLOW_MS = 10 * 60 * 1000;

/** Колода потока — ровно так её собирает экран `app/games/scholars-mate.tsx`. */
function колодаПотока(level: number, seed: number): ScholarsAttempt['puzzle'][] {
  const наборов = Math.max(4, Math.ceil(FLOW_MS / 1000 / 3 / levelParams(level).count));
  const всё: ScholarsAttempt['puzzle'][] = [];
  const видели = new Set<string>();
  for (let n = 0; n < наборов; n++) {
    for (const p of buildDeck(level, seed + n * 101)) {
      const к = `${p.fen}|${p.pre ?? ''}`;
      if (видели.has(к)) continue;
      видели.add(к); всё.push(p);
    }
  }
  return всё;
}

let mounted: any[] = [];
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = [];
});
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

/**
 * Верхняя левая клетка доски. Клетки рисуются подряд, поэтому первая в дереве —
 * та, что человек видит слева сверху: `a8` при белых снизу, `h1` при чёрных.
 */
function верхняяЛевая(tree: any): string {
  const клетки = tree.root.findAll(
    (n: any) => /^[a-h][1-8](,|$)/.test(String(n.props?.accessibilityLabel ?? '')),
    { deep: true },
  );
  const имена = клетки.map((n: any) => String(n.props.accessibilityLabel).split(',')[0]);
  // Композит и хостовый узел дают одну клетку дважды — берём первое вхождение.
  return имена[0]!;
}

function смонтировать(level: number, seed: number, flow: boolean) {
  let часы = 1_000_000;
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(ScholarsMateGame as any, {
      level, seed, size: 320, theme: THEME, labels: LABELS,
      now: () => часы, onComplete: () => {},
      ...(flow ? { flowMs: FLOW_MS } : {}),
    }));
    mounted.push(tree);
  });
  return {
    tree: () => tree,
    /** Прозевать позицию по времени и дождаться следующей — не зная решения. */
    следующая: (сек: number) => {
      часы += сек * 1000 + 200;
      TestRenderer.act(() => { jest.advanceTimersByTime(сек * 1000 + 200); });
      часы += 1500;
      TestRenderer.act(() => { jest.advanceTimersByTime(1500); });
    },
  };
}

describe('ориентация доски', () => {
  /**
   * 🔴 ГЛАВНАЯ ПРОБА. Идём по позициям потока и на КАЖДОЙ сверяем нарисованную
   * доску со стороной хода. Нужны позиции обоих цветов — иначе проба зелена
   * вслепую, поэтому набор проверяется на смешанность отдельным утверждением.
   */
  it('🔴 в потоке каждая позиция показана со стороны того, кто ходит', () => {
    const УРОВЕНЬ = 8;
    const колода = колодаПотока(УРОВЕНЬ, 1);
    /**
     * ⚠️ ДЛИНА ОКНА СЧИТАЕТСЯ ИЗ ДАННЫХ, А НЕ БЕРЁТСЯ НА ГЛАЗ. Подколоды потока
     * однородны по цвету и длиной с уровень (здесь 10), поэтому первый смена
     * цвета — на стыке. Возьми окно короче стыка — и проба зеленела бы, ничего
     * не проверив: первые двенадцать позиций одного цвета я так и получил.
     */
    const смена = колода.findIndex((p) => sideToMove(p) !== sideToMove(колода[0]!));
    expect(`смена цвета в потоке найдена: ${смена > 0}`).toBe('смена цвета в потоке найдена: true');
    const ПОЗИЦИЙ = смена + 2;
    const цвета = new Set(колода.slice(0, ПОЗИЦИЙ).map((p) => sideToMove(p)));
    expect(`цветов в окне ${ПОЗИЦИЙ}: ${цвета.size}`).toBe(`цветов в окне ${ПОЗИЦИЙ}: 2`);

    const с = смонтировать(УРОВЕНЬ, 1, true);
    const п = levelParams(УРОВЕНЬ);
    const промахи: string[] = [];
    for (let i = 0; i < ПОЗИЦИЙ; i++) {
      const ждём = sideToMove(колода[i]!) === 'w' ? 'a8' : 'h1';
      const есть = верхняяЛевая(с.tree());
      if (есть !== ждём) промахи.push(`#${i + 1} ходят ${sideToMove(колода[i]!)}: сверху слева ${есть}, ждали ${ждём}`);
      с.следующая(п.seconds);
    }
    expect(`позиций не со своей стороны: ${промахи.length} → ${промахи.slice(0, 3).join(' | ')}`)
      .toBe('позиций не со своей стороны: 0 → ');
  });

  /**
   * 🔴 ВНУТРИ ПОЗИЦИИ ДОСКА НЕ ДЁРГАЕТСЯ. Задача с жертвой доигрывается до мата:
   * после верного хода играется ответ соперника, и сторона хода в `fen`
   * возвращается к нашей, но между этими двумя полуходами она чужая. Возьми
   * ориентацию у `fen` вместо задачи — и доска перевернётся посреди комбинации.
   * Проба на старте позиции этого не видит, поэтому ход здесь делается настоящий.
   */
  it('🔴 ход внутри позиции не переворачивает доску', () => {
    const колода = buildDeck(30, 3, 'sacrifice' as any);
    const многоходовая = колода.findIndex((p: any) => (p.line?.length ?? 0) > 1);
    expect(`многоходовая задача в наборе: ${многоходовая >= 0}`).toBe('многоходовая задача в наборе: true');

    let часы = 1_000_000;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(ScholarsMateGame as any, {
        level: 30, seed: 3, size: 320, theme: THEME, labels: LABELS,
        onlyKind: 'sacrifice', now: () => часы, onComplete: () => {},
      }));
      mounted.push(tree);
    });
    // Работаем с ПЕРВОЙ позицией набора — её и рисует модуль на старте.
    const задача: any = колода[0]!;
    expect(`первая позиция многоходовая: ${(задача.line?.length ?? 0) > 1}`)
      .toBe('первая позиция многоходовая: true');

    const до = верхняяЛевая(tree);
    const uci: string = задача.line[0];
    for (const клетка of [uci.slice(0, 2), uci.slice(2, 4)]) {
      часы += 250;
      const узел = tree.root.findAll(
        (n: any) => typeof n.props?.onPress === 'function'
          && String(n.props.accessibilityLabel ?? '').split(',')[0] === клетка,
        { deep: true },
      )[0];
      expect(`клетка ${клетка} найдена: ${!!узел}`).toBe(`клетка ${клетка} найдена: true`);
      TestRenderer.act(() => { узел.props.onPress(); });
    }
    expect(`сверху слева до хода ${до}, после ${верхняяЛевая(tree)}`)
      .toBe(`сверху слева до хода ${до}, после ${до}`);
  });

  /** На обычной лестнице колода однородна — там ориентация и раньше была верной. */
  it('на лестнице доска тоже со стороны хода (не сломали работавшее)', () => {
    for (const [L, s] of [[1, 1], [15, 3], [25, 5], [40, 7]] as const) {
      const первая = buildDeck(L, s)[0]!;
      const с = смонтировать(L, s, false);
      const ждём = sideToMove(первая) === 'w' ? 'a8' : 'h1';
      expect(`ур.${L}: ${верхняяЛевая(с.tree())}`).toBe(`ур.${L}: ${ждём}`);
    }
  });
});
