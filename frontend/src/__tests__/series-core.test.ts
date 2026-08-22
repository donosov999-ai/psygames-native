/* psygames-series-core-gate · VER 1 · 23.08.2026 */
/**
 * СЕРИЯ БЛОКОВ ОБЯЗАНА ДАВАТЬ РАЗНОСТЬ, А НЕ ТРИ ОТДЕЛЬНЫХ ОЧКА.
 *
 * Что здесь стережётся — по пунктам из шапки `src/services/series.ts`:
 *   · три блока дают ОДНУ сессию, и все три лежат внутри неё;
 *   · разность считается от ПЕРВОГО блока и равна именно разнице времён;
 *   · прерванная серия не даёт разностей ВООБЩЕ (ключа нет, а не нули);
 *   · переставленный порядок блоков — это не та же серия;
 *   · уровень растёт только когда взяты ВСЕ блоки, и ограничитель — слабейший.
 *
 * ⚠️ ПРОВЕРЯЕМ ЗНАЧЕНИЯ, А НЕ ФАКТ ВЫЗОВА. Проверка вида «функция вернула
 * объект» зелена и при полностью сломанном расчёте — в этом проекте такое уже
 * ловилось дважды.
 */
import {
  startSeries, recordBlock, seriesComplete, seriesDiffs, seriesSession,
  seriesLevelMove, seriesStartLevel, bumpStreak, STABLE_RUNS,
} from '@/src/services/series';

const PLAN = ['order', 'alternate', 'sum'] as const;
const blk = (key: string, timeMs: number, errors = 0, done = true) => ({ key, timeMs, errors, done });

function fullRun() {
  let run = startSeries('schulte', 5, PLAN, 0);
  run = recordBlock(run, blk('order', 40_000));
  run = recordBlock(run, blk('alternate', 65_000, 2));
  run = recordBlock(run, blk('sum', 90_000, 1));
  return run;
}

describe('серия блоков — одна сессия и честная разность', () => {
  it('три блока дают ОДНУ сессию, и внутри неё все три', () => {
    const s = seriesSession(fullRun());
    const blocks = (s.details.blocks as any[]);
    expect(`блоков в сессии: ${blocks.length} — ${blocks.map((b) => b.key).join(',')}`)
      .toBe('блоков в сессии: 3 — order,alternate,sum');
  });

  it('разность считается от первого блока и равна разнице времён', () => {
    const d = seriesDiffs(fullRun())!;
    expect(d).toEqual({ alternate_minus_order: 25_000, sum_minus_order: 50_000 });
  });

  it('прерванная серия: блоки записаны, разностей НЕТ ВООБЩЕ', () => {
    let run = startSeries('schulte', 5, PLAN, 0);
    run = recordBlock(run, blk('order', 40_000));
    run = recordBlock(run, blk('alternate', 65_000));
    const s = seriesSession(run);
    expect({
      complete: s.details.series_complete,
      blocks: (s.details.blocks as any[]).length,
      diffsKey: Object.prototype.hasOwnProperty.call(s.details, 'diffs'),
      diffs: seriesDiffs(run),
    }).toEqual({ complete: false, blocks: 2, diffsKey: false, diffs: null });
  });

  it('оборванный последний блок — серия неполна, даже если блоков три', () => {
    let run = startSeries('schulte', 5, PLAN, 0);
    run = recordBlock(run, blk('order', 40_000));
    run = recordBlock(run, blk('alternate', 65_000));
    run = recordBlock(run, blk('sum', 12_000, 0, false));
    expect(`полна: ${seriesComplete(run)} · разности: ${seriesDiffs(run)}`)
      .toBe('полна: false · разности: null');
  });

  it('переставленный порядок блоков — это НЕ та же серия', () => {
    let run = startSeries('schulte', 5, PLAN, 0);
    run = recordBlock(run, blk('order', 40_000));
    run = recordBlock(run, blk('sum', 90_000));
    run = recordBlock(run, blk('alternate', 65_000));
    expect(seriesComplete(run)).toBe(false);
  });

  it('уровень лежит в замере: без него разность несравнима', () => {
    expect(seriesSession(fullRun()).details.level).toBe(5);
  });

  it('время сессии — сумма блоков, ошибки — сумма ошибок', () => {
    const s = seriesSession(fullRun());
    expect(`${s.time_seconds}с · ${s.errors} ошибки`).toBe('195с · 3 ошибки');
  });
});

describe('уровень серии — модель C: по слабейшему звену', () => {
  it('уровень НЕ растёт, пока хоть один блок не устойчив', () => {
    const move = seriesLevelMove({ order: 5, alternate: 5, sum: 1 }, PLAN);
    expect(`растёт: ${move.raise} · слабейший: ${move.weakest}`).toBe('растёт: false · слабейший: sum');
  });

  it('уровень растёт, когда КАЖДЫЙ блок взят дважды подряд', () => {
    expect(seriesLevelMove({ order: STABLE_RUNS, alternate: STABLE_RUNS, sum: STABLE_RUNS }, PLAN).raise).toBe(true);
  });

  it('одного раза мало — нужна устойчивость, а не везение', () => {
    expect(seriesLevelMove({ order: 1, alternate: 1, sum: 1 }, PLAN).raise).toBe(false);
  });

  it('незнакомый блок считается невзятым, а не пропускается', () => {
    const move = seriesLevelMove({ order: 9, alternate: 9 }, PLAN);
    expect(`растёт: ${move.raise} · слабейший: ${move.weakest}`).toBe('растёт: false · слабейший: sum');
  });

  it('серия обрывает счётчик устойчивости, а не уменьшает его на единицу', () => {
    expect(`${bumpStreak(7, false)} · ${bumpStreak(0, true)}`).toBe('0 · 1');
  });

  it('старт мультиигры — с минимального уровня, прежние показываются рядом', () => {
    const s = seriesStartLevel({ order: 9, alternate: 4, sum: 6 }, PLAN);
    expect(`старт ${s.level} · было ${s.perBlock.order}/${s.perBlock.alternate}/${s.perBlock.sum}`)
      .toBe('старт 4 · было 9/4/6');
  });

  it('серия из одного блока запрещена — разность считать не из чего', () => {
    expect(() => startSeries('schulte', 5, ['order'], 0)).toThrow();
  });
});
