/* psygames-schulte-series-gate · VER 1 · 23.08.2026 */
/**
 * СЕРИЯ БЛОКОВ ШУЛЬТЕ: ТРИ ПРАВИЛА ПО ОДНОМУ ПОЛЮ — И ЭТО ДОКАЗЫВАЕТСЯ, А НЕ
 * ОБЕЩАЕТСЯ В КОММЕНТАРИИ.
 *
 * Замер держится на аддитивном методе (Стернберг): каждый следующий блок
 * добавляет РОВНО ОДНО требование, и тогда разность времён — цена добавленного
 * звена. Всё это разваливается от трёх поломок, каждая из которых выглядит на
 * экране совершенно нормально:
 *
 *   1. поле пересобралось между блоками — в T₂−T₁ поехала разница ПОЛЕЙ;
 *   2. серия записалась тремя сессиями — разность не посчитать уже никогда,
 *      потому что нечем доказать, что блоки из одного прогона;
 *   3. правило блока выродилось: «чередование» стало прямым порядком, «пара на
 *      сумму» — простым тыком. Экран при этом играется как ни в чём не бывало.
 *
 * ⚠️ ПОЭТОМУ ПРОВЕРЯЕМ ПОВЕДЕНИЕ И ЗНАЧЕНИЯ, А НЕ ТЕКСТ ИСХОДНИКА. Раскладка
 * сверяется ПОЭЛЕМЕНТНО (совпадение размеров ничего не значит), партия ведётся
 * по тому, что НАПИСАНО В ШАПКЕ экрана, а сессия читается из перехваченного
 * `saveSession`. Каждая проба сначала доказывает, что есть на что смотреть: поле
 * непустое, блоков три, нажатия доходят.
 *
 * ⚠️ ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО. «Раскладки совпали» — правда и для
 * двух пустых списков; «сессия одна» — правда и когда не записалось ничего.
 * Обе дыры закрыты встречными пробами: сравнение умеет краснеть (перемешанная
 * копия того же поля не равна оригиналу), а сессия проверяется по содержимому.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_SERIES_PROGRESS,
  SCHULTE_SERIES_LOCALES,
  SCHULTE_SERIES_PLAN,
  SERIES_MIN_SIZE,
  afterSeriesRun,
  alternateTargets,
  blockDone,
  blockKeyAt,
  blockStepsTotal,
  blockTarget,
  buildSchulteField,
  getSchulteSeriesStrings,
  nextBlock,
  openBlock,
  orderTargets,
  pairSum,
  pressSeriesCell,
  seriesEntry,
  sumPairsTotal,
  type SchulteSeriesState,
} from '@/src/games/schulte/core';
import {
  STABLE_RUNS, recordBlock, seriesDiffs, seriesSession, startSeries,
} from '@/src/services/series';

declare const __dirname: string;
declare function require(m: string): any;

const TestRenderer = require('react-test-renderer');
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');
const SCREEN_PATH = join(ROOT, 'app/games/schulte.tsx');

jest.setTimeout(120000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

/** Что игра записала в журнал. Единственная подмена — сама запись, не её содержимое. */
const mockSaved: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { mockSaved.push(s); return s; },
}));

// ─────────────────────────────────────────────────────────────────────────────
// ЯДРО: правила блоков на живом поле
// ─────────────────────────────────────────────────────────────────────────────

/** Клетка с этим значением. Играем по тому, что видно, а не по индексам. */
const cellOf = (state: SchulteSeriesState, value: number): number => state.field.cells.indexOf(value);

/** Нажать клетку с данным значением. */
function tapValue(state: SchulteSeriesState, value: number) {
  return pressSeriesCell(state, cellOf(state, value));
}

/** Пройти блок целиком по его правилу. Возвращает конечное состояние. */
function playBlock(start: SchulteSeriesState): SchulteSeriesState {
  let s = start;
  const total = s.field.cells.length;
  const key = blockKeyAt(s.blockIndex);
  if (key === 'sum') {
    const sum = pairSum(total);
    for (let v = 1; v <= sumPairsTotal(total); v += 1) {
      s = tapValue(s, v).state;
      s = tapValue(s, sum - v).state;
    }
    return s;
  }
  for (const target of (key === 'alternate' ? alternateTargets(total) : orderTargets(total))) {
    s = tapValue(s, target).state;
  }
  return s;
}

describe('поле у трёх блоков ОДНО И ТО ЖЕ', () => {
  const field = buildSchulteField(SERIES_MIN_SIZE);
  const first = openBlock(field, 0);
  const second = nextBlock(first);
  const third = nextBlock(second);

  it('есть что сравнивать: поле непустое и заполнено числами 1…N²', () => {
    expect(field.cells.length).toBe(SERIES_MIN_SIZE * SERIES_MIN_SIZE);
    expect([...field.cells].sort((a, b) => a - b)).toEqual(orderTargets(field.cells.length));
  });

  it('🔴 раскладка второго и третьего блока совпадает с первой ПОЭЛЕМЕНТНО', () => {
    expect(second.field.cells).toEqual(first.field.cells);
    expect(third.field.cells).toEqual(first.field.cells);
    // и это не «совпал размер»: сверяется каждая клетка по своему месту
    const mismatch = first.field.cells.findIndex((v, i) => third.field.cells[i] !== v);
    expect(`первое расхождение раскладок: ${mismatch}`).toBe('первое расхождение раскладок: -1');
  });

  it('🔴 и сравнение умеет краснеть: перемешанная копия того же поля не равна', () => {
    const shuffled = [...first.field.cells];
    shuffled.reverse();
    expect(shuffled).not.toEqual(first.field.cells);
  });

  it('🔴 порядок блоков жёсткий: поиск → чередование → счёт', () => {
    expect([0, 1, 2].map(blockKeyAt)).toEqual(['order', 'alternate', 'sum']);
    expect([...SCHULTE_SERIES_PLAN]).toEqual(['order', 'alternate', 'sum']);
  });

  it('переход к следующему блоку обнуляет закрытые клетки, но не поле', () => {
    const played = tapValue(first, 1).state;
    expect(played.taken.filter(Boolean).length).toBe(1);
    const after = nextBlock(played);
    expect(after.taken.filter(Boolean).length).toBe(0);
    expect(after.field.cells).toEqual(played.field.cells);
  });
});

describe('блок «чередование» и правда требует чередования', () => {
  const total = 25;

  it('🔴 цепочка целей НЕ равна прямому порядку', () => {
    const alt = alternateTargets(total);
    expect(alt).not.toEqual(orderTargets(total));
    expect(alt.slice(0, 6)).toEqual([1, 25, 2, 24, 3, 23]);
    expect(alt.length).toBe(total);
    // и это перестановка того же набора, а не другой материал
    expect([...alt].sort((a, b) => a - b)).toEqual(orderTargets(total));
  });

  it('🔴 второй тап по прямому порядку — ОШИБКА, а не ход', () => {
    const state = openBlock(buildSchulteField(5), 1);
    const first = tapValue(state, 1);
    expect(`${first.result} · шаг ${first.state.step}`).toBe('hit · шаг 1');
    const wrong = tapValue(first.state, 2);          // по прямому порядку было бы верно
    expect(`${wrong.result} · шаг ${wrong.state.step} · ошибок ${wrong.state.errors}`)
      .toBe('miss · шаг 1 · ошибок 1');
    const right = tapValue(first.state, 25);         // а по чередованию — старшее число
    expect(`${right.result} · шаг ${right.state.step}`).toBe('hit · шаг 2');
  });

  it('блок проходится до конца по своему правилу', () => {
    const done = playBlock(openBlock(buildSchulteField(5), 1));
    expect(`доигран: ${blockDone(done)} · ошибок ${done.errors}`).toBe('доигран: true · ошибок 0');
  });
});

describe('блок «пара на сумму» и правда требует пары с заданной суммой', () => {
  const field = buildSchulteField(5);
  const total = field.cells.length;
  const sum = pairSum(total);

  it('🔴 шапка просит СУММУ, а не число на поле', () => {
    const state = openBlock(field, 2);
    expect(blockTarget(state)).toBe(sum);
    expect(`сумма ${sum} есть на поле: ${field.cells.includes(sum)}`).toBe(`сумма ${sum} есть на поле: false`);
  });

  it('🔴 одна клетка ответом не считается — шаг не двигается', () => {
    const one = pressSeriesCell(openBlock(field, 2), cellOf(openBlock(field, 2), 7));
    expect(`${one.result} · шаг ${one.state.step} · ошибок ${one.state.errors}`)
      .toBe('pair-open · шаг 0 · ошибок 0');
  });

  it('🔴 пара с неверной суммой — ошибка, с верной — ход', () => {
    const state = openBlock(field, 2);
    const wrong = tapValue(tapValue(state, 7).state, 8);       // 7 + 8 = 15 ≠ 26
    expect(`${wrong.result} · шаг ${wrong.state.step} · ошибок ${wrong.state.errors}`)
      .toBe('miss · шаг 0 · ошибок 1');
    const right = tapValue(tapValue(state, 7).state, sum - 7); // 7 + 19 = 26
    expect(`${right.result} · шаг ${right.state.step} · ошибок ${right.state.errors}`)
      .toBe('hit · шаг 1 · ошибок 0');
    expect(right.state.taken.filter(Boolean).length).toBe(2);   // закрылись ОБЕ клетки пары
  });

  it('🔴 прямой порядок 1,2 здесь не работает — это не тот же блок под другим именем', () => {
    const state = openBlock(field, 2);
    const naive = tapValue(tapValue(state, 1).state, 2);
    expect(`${naive.result} · ошибок ${naive.state.errors}`).toBe('miss · ошибок 1');
  });

  it('блок собирается целиком: 12 пар на поле 5×5, серединное число без пары', () => {
    const done = playBlock(openBlock(field, 2));
    expect(`пар ${done.step} из ${blockStepsTotal(field, 'sum')} · доигран ${blockDone(done)}`)
      .toBe(`пар 12 из 12 · доигран true`);
    expect(done.taken.filter(Boolean).length).toBe(24);
  });
});

describe('серия ядром: одна сессия, три блока, две разности', () => {
  it('🔴 три блока по одному полю дают ОДНУ сессию и обе разности', () => {
    const field = buildSchulteField(5);
    let run = startSeries('schulte_series', field.size, SCHULTE_SERIES_PLAN, 0);
    let state = openBlock(field, 0);
    const times = [40_000, 65_000, 90_000];
    for (let i = 0; i < SCHULTE_SERIES_PLAN.length; i += 1) {
      const played = playBlock(state);
      expect(`блок ${i} доигран: ${blockDone(played)}`).toBe(`блок ${i} доигран: true`);
      run = recordBlock(run, {
        key: blockKeyAt(i), timeMs: times[i], errors: played.errors, done: true,
      });
      state = nextBlock(played);
      expect(state.field.cells).toEqual(field.cells);   // поле не менялось ни разу
    }
    const session = seriesSession(run);
    expect((session.details.blocks as any[]).map((b) => b.key)).toEqual(['order', 'alternate', 'sum']);
    expect(seriesDiffs(run)).toEqual({ alternate_minus_order: 25_000, sum_minus_order: 50_000 });
    expect(session.game_type).toBe('schulte_series');
  });
});

describe('уровень серии — модель C поверх блоков Шульте', () => {
  const full = (level: number, errors: [number, number, number]) => {
    let run = startSeries('schulte_series', level, SCHULTE_SERIES_PLAN, 0);
    SCHULTE_SERIES_PLAN.forEach((key, i) => {
      run = recordBlock(run, { key, timeMs: 30_000, errors: errors[i], done: true });
    });
    return run;
  };

  it('🔴 старт — с минимального поля по блокам, прежние поля остаются видны', () => {
    const progress = { sizes: { order: 5, alternate: 5, sum: 5 }, streaks: { order: 0, alternate: 0, sum: 0 } };
    const entry = seriesEntry(progress, 7);   // обычный Шульте уже на поле 7×7
    expect(`старт ${entry.level} · поиск ${entry.perBlock.order} · счёт ${entry.perBlock.sum}`)
      .toBe('старт 5 · поиск 7 · счёт 5');
  });

  it('🔴 одного чистого прогона мало — нужна устойчивость', () => {
    const once = afterSeriesRun(EMPTY_SERIES_PROGRESS, full(5, [0, 0, 0]), 5);
    expect(`выросло: ${once.raised} · держит: ${once.weakest} · осталось ${once.runsLeft}`)
      .toBe(`выросло: false · держит: order · осталось ${STABLE_RUNS - 1}`);
    const twice = afterSeriesRun(once.progress, full(5, [0, 0, 0]), 5);
    expect(`выросло: ${twice.raised} · поле ${twice.nextLevel}`).toBe('выросло: true · поле 6');
    expect(twice.progress.sizes).toEqual({ order: 6, alternate: 6, sum: 6 });
    // новый размер — новый отсчёт устойчивости
    expect(twice.progress.streaks).toEqual({ order: 0, alternate: 0, sum: 0 });
  });

  it('🔴 грязный блок держит поле, даже если два других безупречны', () => {
    let p = EMPTY_SERIES_PROGRESS;
    for (let i = 0; i < STABLE_RUNS + 1; i += 1) p = afterSeriesRun(p, full(5, [0, 0, 5]), 5).progress;
    const out = afterSeriesRun(p, full(5, [0, 0, 5]), 5);
    expect(`выросло: ${out.raised} · держит: ${out.weakest} · поле ${out.nextLevel}`)
      .toBe('выросло: false · держит: sum · поле 5');
  });

  it('🔴 прерванная серия не двигает уровень ни вверх, ни вниз', () => {
    let p = afterSeriesRun(EMPTY_SERIES_PROGRESS, full(5, [0, 0, 0]), 5).progress;
    let broken = startSeries('schulte_series', 5, SCHULTE_SERIES_PLAN, 0);
    broken = recordBlock(broken, { key: 'order', timeMs: 30_000, errors: 0, done: true });
    broken = recordBlock(broken, { key: 'alternate', timeMs: 30_000, errors: 0, done: false });
    const out = afterSeriesRun(p, broken, 5);
    expect(`выросло: ${out.raised}`).toBe('выросло: false');
    expect(out.progress.streaks).toEqual(p.streaks);   // устойчивость не сбита и не начислена
    expect(seriesDiffs(broken)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЭКРАН: играем по-настоящему — монтаж, нажатия, чтение того, что видно
// ─────────────────────────────────────────────────────────────────────────────

/** Каркас GameShell спрашивает безопасные поля — без метрик он падает на монтаже. */
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
/** ⚠️ Только внешние совпадения: TouchableOpacity отдаёт второй узел с теми же пропами. */
const OUTER = { deep: false };
/** Язык теста — база приложения ('en' в LanguageContext). */
const EN = getSchulteSeriesStrings('en');
/**
 * Длительность врезки — ровно как в экране. Часы двигаем на неё ТОЧНО, и это не
 * педантизм: если врезка попадёт в замер блока, разности разъедутся ровно на эти
 * 2500 мс, и проба «разности равны тому, на сколько двигали часы В БЛОКЕ»
 * покраснеет. То есть исключение врезки из времени блока проверяется числом.
 */
const INTERLUDE = 2500;

function textsIn(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string') { out.push(n); return; }
    if (typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) (n.children as any[]).forEach(walk);
  };
  walk(node);
  return out;
}
const joined = (node: any): string => textsIn(node).join('');

async function mountSchulte() {
  await AsyncStorage.clear();
  mockSaved.length = 0;
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/schulte').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await settle();
  return r;
}

async function settle() {
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
}

/** Прокрутить игровые часы: они же и часы блока (gameNow ← Date.now под фейк-таймерами). */
async function advance(ms: number) {
  await TestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

/**
 * КЛЕТКА ПОЛЯ — нажимаемый КВАДРАТНЫЙ узел с числом внутри. Опознаём по признаку
 * самой клетки, а не по testID: его можно повесить куда угодно, и проверка
 * перестанет отличать поле от чего угодно другого.
 */
function cells(r: any): any[] {
  return r.root.findAll((n: any) => {
    if (typeof n.props?.onPress !== 'function') return false;
    const st = StyleSheet.flatten(n.props.style) as any;
    if (!st || typeof st.width !== 'number' || st.width !== st.height) return false;
    return /^\d+$/.test(joined(n).trim());
  }, OUTER);
}

/** Раскладка так, как её видит человек: значения клеток по порядку отрисовки. */
const layout = (r: any): string[] => cells(r).map((n: any) => joined(n).trim());

function tapCell(r: any, value: number) {
  const node = cells(r).find((n: any) => joined(n).trim() === String(value));
  if (!node) throw new Error(`клетки «${value}» на поле нет`);
  TestRenderer.act(() => { node.props.onPress(); });
}

/** Что просит шапка: подпись из словаря приложения и число рядом с ней. */
function hudTarget(r: any): number {
  const boxes = r.root.findAll((n: any) => /^(Find|FIND SUM)\s*\d+$/.test(joined(n).trim()), OUTER);
  if (boxes.length !== 1) throw new Error(`искомое в шапке не опознать: найдено ${boxes.length}`);
  return Number(joined(boxes[0]).replace(/\D+/g, ''));
}

function pressLabel(r: any, label: string) {
  const btns = r.root.findAll((n: any) => (
    typeof n.props?.onPress === 'function' && joined(n).includes(label)
  ), OUTER);
  if (btns.length !== 1) throw new Error(`кнопку «${label}» не опознать: найдено ${btns.length}`);
  TestRenderer.act(() => { btns[0].props.onPress(); });
}

/** Пройти блок 'order' / 'alternate', ведясь ПО ШАПКЕ. Возвращает показанные цели. */
function playVisibleBlock(r: any, steps: number): number[] {
  const seen: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    const target = hudTarget(r);
    seen.push(target);
    tapCell(r, target);
  }
  return seen;
}

/** Пройти блок 'sum': сумма читается с экрана, пары собираются от 1 вверх. */
function playSumBlock(r: any, pairs: number): number {
  const sum = hudTarget(r);
  for (let v = 1; v <= pairs; v += 1) {
    tapCell(r, v);
    tapCell(r, sum - v);
  }
  return sum;
}

describe('экран: серия идёт по одному полю и пишет одну сессию', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 все три блока сыграны по ОДНОЙ И ТОЙ ЖЕ раскладке, сверено поэлементно', async () => {
    const r = await mountSchulte();
    try {
      pressLabel(r, EN.entry);
      const side = SERIES_MIN_SIZE;
      const total = side * side;
      const first = layout(r);
      expect(first.length).toBe(total);                       // есть что сравнивать
      expect([...first].map(Number).sort((a, b) => a - b)).toEqual(orderTargets(total));

      playVisibleBlock(r, total);                             // блок 1 — по порядку
      await advance(INTERLUDE);                               // врезка ушла, блок 2 открылся
      const second = layout(r);
      playVisibleBlock(r, total);                             // блок 2 — чередование
      await advance(INTERLUDE);
      const third = layout(r);
      playSumBlock(r, sumPairsTotal(total));                  // блок 3 — пары на сумму
      await settle();

      expect(second).toEqual(first);
      expect(third).toEqual(first);
      const moved = first.findIndex((v, i) => third[i] !== v);
      expect(`первое расхождение раскладок: ${moved}`).toBe('первое расхождение раскладок: -1');
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 серия пишет ОДНУ сессию с тремя блоками внутри, а не три сессии', async () => {
    const r = await mountSchulte();
    try {
      pressLabel(r, EN.entry);
      const total = SERIES_MIN_SIZE * SERIES_MIN_SIZE;
      await advance(40_000);
      playVisibleBlock(r, total);
      expect(`сессий после первого блока: ${mockSaved.length}`).toBe('сессий после первого блока: 0');
      await advance(INTERLUDE);
      await advance(65_000);
      playVisibleBlock(r, total);
      await advance(INTERLUDE);
      await advance(90_000);
      playSumBlock(r, sumPairsTotal(total));
      await settle();

      expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
      const s = mockSaved[0];
      expect(s.game_type).toBe('schulte_series');
      expect((s.details.blocks as any[]).map((b) => b.key)).toEqual(['order', 'alternate', 'sum']);
      expect(s.details.series_complete).toBe(true);
      expect(s.details.level).toBe(SERIES_MIN_SIZE);
      // Разности — из времён блоков, а не из воздуха: часы двигали ровно на столько.
      expect(s.details.diffs).toEqual({ alternate_minus_order: 25_000, sum_minus_order: 50_000 });
      // И доигранная серия не получает ВТОРУЮ запись при уходе с экрана.
      await TestRenderer.act(async () => { r.unmount(); });
      await settle();
      expect(`сессий после ухода: ${mockSaved.length}`).toBe('сессий после ухода: 1');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже размонтирован */ } }); }
  });

  it('🔴 второй блок ведёт по ЧЕРЕДОВАНИЮ: шапка просит не прямой порядок', async () => {
    const r = await mountSchulte();
    try {
      pressLabel(r, EN.entry);
      const total = SERIES_MIN_SIZE * SERIES_MIN_SIZE;
      const firstBlock = playVisibleBlock(r, total);
      expect(firstBlock).toEqual(orderTargets(total));         // блок 1 — именно по порядку
      await advance(INTERLUDE);
      const secondBlock = playVisibleBlock(r, total);
      expect(secondBlock).not.toEqual(orderTargets(total));
      expect(secondBlock).toEqual(alternateTargets(total));
      await advance(INTERLUDE);
      // блок 3 просит сумму, которой на поле нет вовсе
      expect(hudTarget(r)).toBe(pairSum(total));
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 врезка называет новое правило и говорит, что поле прежнее', async () => {
    const r = await mountSchulte();
    try {
      pressLabel(r, EN.entry);
      playVisibleBlock(r, SERIES_MIN_SIZE * SERIES_MIN_SIZE);
      await advance(100);                                      // врезка на экране
      const shown = joined(r.root);
      expect(shown).toContain(EN.ruleChanges);
      expect(shown).toContain(EN.sameField);
      expect(shown).toContain(EN.blockAlternate);
      expect(cells(r)).toHaveLength(0);                        // поля во время врезки нет
      await advance(INTERLUDE - 100);
      expect(cells(r)).toHaveLength(SERIES_MIN_SIZE * SERIES_MIN_SIZE);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 выход на середине: блоки записаны, разностей НЕТ ВООБЩЕ', async () => {
    const r = await mountSchulte();
    try {
      pressLabel(r, EN.entry);
      const total = SERIES_MIN_SIZE * SERIES_MIN_SIZE;
      await advance(30_000);
      playVisibleBlock(r, total);                              // первый блок доигран
      await advance(INTERLUDE);
      await advance(10_000);
      playVisibleBlock(r, 3);                                  // второй начат и брошен
      const quit = r.root.findAll((n: any) => (
        typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === 'New table'
      ), OUTER);
      expect(`кнопок выхода: ${quit.length}`).toBe('кнопок выхода: 1');
      await TestRenderer.act(async () => { quit[0].props.onPress(); });
      await settle();

      expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
      const s = mockSaved[0];
      expect((s.details.blocks as any[]).map((b) => `${b.key}:${b.done}`)).toEqual(['order:true', 'alternate:false']);
      expect(s.details.series_complete).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(s.details, 'diffs')).toBe(false);
      expect(joined(r.root)).toContain(EN.notFinished);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 уход мимо кнопок (аппаратная «назад») серию не теряет', async () => {
    const r = await mountSchulte();
    pressLabel(r, EN.entry);
    await advance(30_000);
    playVisibleBlock(r, 5);                                  // блок начат и брошен
    await TestRenderer.act(async () => { r.unmount(); });
    await settle();

    expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
    const s = mockSaved[0];
    expect((s.details.blocks as any[]).map((b) => `${b.key}:${b.done}`)).toEqual(['order:false']);
    expect(s.details.series_complete).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(s.details, 'diffs')).toBe(false);
  });

  it('🔴 вход в серию назван, и с какого поля она начнётся — сказано ДО старта', async () => {
    const r = await mountSchulte();
    try {
      const shown = joined(r.root);
      expect(shown).toContain(EN.entry);
      expect(shown).toContain(`${SERIES_MIN_SIZE}×${SERIES_MIN_SIZE}`);
      expect(shown).toContain(EN.yourLevels.split('{')[0].trim());
    } finally { TestRenderer.act(() => r.unmount()); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// СЛОВАРЬ МОДУЛЯ: двенадцать языков, ни одной мёртвой строки
// ─────────────────────────────────────────────────────────────────────────────

/** Комментарии — не код: имя ключа в шапке файла не должно сходить за его вызов. */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); out += ' '; i = e < 0 ? s.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); out += ' '; i = e < 0 ? s.length : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === c) break; j += 1; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i += 1;
  }
  return out;
}

const APP_LOCALES: string[] = (() => {
  const dict = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;
  const decl = /type Language =([^;]+);/.exec(dict)!;
  return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m: any) => m[1]).sort();
})();

describe('словарь серии знает все двенадцать языков', () => {
  it('языки модуля и языки приложения — один список', () => {
    expect(APP_LOCALES.length).toBe(12);
    expect([...SCHULTE_SERIES_LOCALES].sort()).toEqual(APP_LOCALES);
  });

  it('🔴 в каждом языке те же ключи, что в русском, и ни одной пустой строки', () => {
    const ruKeys = Object.keys(getSchulteSeriesStrings('ru')).sort();
    expect(ruKeys.length).toBeGreaterThan(15);
    const holes: string[] = [];
    for (const locale of SCHULTE_SERIES_LOCALES) {
      const s = getSchulteSeriesStrings(locale) as unknown as Record<string, string>;
      const keys = Object.keys(s).sort();
      for (const k of ruKeys) if (!keys.includes(k)) holes.push(`${locale}: нет ключа ${k}`);
      for (const k of keys) if (!ruKeys.includes(k)) holes.push(`${locale}: лишний ключ ${k}`);
      for (const [k, v] of Object.entries(s)) {
        if (typeof v !== 'string' || !v.trim()) holes.push(`${locale}.${k}: пусто`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 ни одна строка не осталась английской копией', () => {
    const en = getSchulteSeriesStrings('en') as unknown as Record<string, string>;
    const stub: string[] = [];
    for (const locale of SCHULTE_SERIES_LOCALES) {
      if (locale === 'en') continue;
      const s = getSchulteSeriesStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(s)) {
        if (v === en[k]) stub.push(`${locale}.${k}: «${v}» — как по-английски`);
      }
    }
    expect(stub).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      const s = getSchulteSeriesStrings(locale as any) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(s)) {
        const bare = String(v).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        if (bare.length > 2 && !re.test(String(v))) bad.push(`${locale}.${k}: «${v}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 МЁРТВЫЙ КЛЮЧ — КРАСНОЕ. Строка, переведённая на двенадцать языков и не
   * выведенная ни разу, — не запас, а ложное «переведено».
   */
  it('🔴 каждый ключ словаря вызывается на экране', () => {
    const code = stripComments(readFileSync(SCREEN_PATH, 'utf8') as string);
    const used = new Set<string>();
    for (const m of code.matchAll(/\bseriesStrings\.(\w+)\b/g)) used.add((m as any)[1]);
    expect(used.size).toBeGreaterThan(10);            // проба и правда что-то нашла
    const dead = Object.keys(getSchulteSeriesStrings('ru')).filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });

  it('гейт отличает вызов от упоминания в комментарии', () => {
    const commented = stripComments('/* seriesStrings.entry живёт тут */\n// seriesStrings.leave\n');
    expect([...commented.matchAll(/\bseriesStrings\.(\w+)\b/g)]).toEqual([]);
  });
});
