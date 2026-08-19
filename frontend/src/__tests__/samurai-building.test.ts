/**
 * ЭКРАН НЕ МОЛЧИТ, ПОКА СОБИРАЕТСЯ ДОСКА.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Самурай на верхних уровнях собирает доску секундами (замер
 * 20.08.2026: уровень 12 — 2.5–6 с в node, уровень 8 — 2.5–5 с), и всё это время
 * экран был пуст. Человек нажал «играть» и не мог отличить «думает» от «зависло».
 * Хуже: молчание держало сложность внизу — пол верхней ступени оставили тройкой
 * ровно потому, что четвёрка гоняла бы генератор дольше.
 *
 * ⚠️ ПОЧЕМУ ЭТОТ ГЕЙТ ЖМЁТ КНОПКУ, А НЕ ЧИТАЕТ ИСХОДНИК. Ровно этот баг-класс
 * незаметен в тексте программы: `setPhase('building')` рядом с тяжёлым циклом
 * ВЫГЛЯДИТ как починка, а работает как прежде — состояние, поменянное перед
 * синхронной работой в том же обработчике, не доезжает до экрана и гаснет в том
 * же кадре. Поиск слова «building» по файлу зелёный и на таком коде. Поэтому
 * экран здесь монтируется по-настоящему, кнопка нажимается по-настоящему, и
 * вопрос задаётся один: что видно СРАЗУ ПОСЛЕ нажатия.
 *
 * ⚠️ ЧАСЫ ПАРТИИ. Второй вопрос того же нажатия: секундомер не имеет права
 * считать время сборки. Проверяется не чтением строки `const start = gameNow()`,
 * а подменой настенных часов: пока экран собирает доску, часы уводятся на
 * полминуты вперёд — и если отсчёт был заведён до сборки, секундомер это покажет.
 */
declare function require(m: string): any;

const React = require('react');
const TestRenderer = require('react-test-renderer');
import BoardBuilding, { runSteps, nextFrame, SLOW_MS, type BuildStatus } from '@/src/components/BoardBuilding';
import {
  BUILD_ATTEMPTS, DIG_PASSES, samuraiBuilder, betterAttempt, attemptEnough, levelBand,
  buildSolutionCanvas, digByLogic, generateSamuraiLevel, levelParams, CELLS,
} from '@/app/games/sudoku-samurai';

jest.setTimeout(120000);

// ─────────────────────────────────────────────────────────────────────────────
// ПРОГОН ШАГОВ: кадр отдаётся ДО работы, «долго» — по часам
// ─────────────────────────────────────────────────────────────────────────────

/** Прогон с журналом: кто за кем на самом деле вызвался. */
function journal(o: { steps: number; enoughAt?: number; costMs?: number }) {
  const log: string[] = [];
  const shown: BuildStatus[] = [];
  let clock = 0;
  const done = runSteps<number>({
    steps: o.steps,
    step: (n: number) => { log.push(`шаг ${n}`); clock += o.costMs ?? 0; return n; },
    enough: (best: number) => best >= (o.enoughAt ?? o.steps + 1),
    show: (s: BuildStatus) => { log.push(`показ ${s.step}${s.slow ? ' долго' : ''}`); shown.push(s); },
    frame: () => { log.push('кадр'); return Promise.resolve(); },
    now: () => clock,
  });
  return { log, shown, done };
}

describe('прогон шагов генератора', () => {
  it('🔴 кадр отдаётся ПЕРЕД шагом, а не после: иначе строку никто не увидит', async () => {
    const j = journal({ steps: 2 });
    await j.done;
    expect(j.log).toEqual(['показ 1', 'кадр', 'шаг 1', 'показ 2', 'кадр', 'шаг 2']);
  });

  it('🔴 «долго» ставится по ЗАМЕРУ часов, а не по номеру шага', async () => {
    // Часы стоят: сколько бы шагов ни прошло, сборка не «долгая».
    const fast = journal({ steps: 4, costMs: 0 });
    await fast.done;
    expect(fast.shown.map((s) => s.slow)).toEqual([false, false, false, false]);
    // Часы идут: после первого же шага порог пройден.
    const slow = journal({ steps: 3, costMs: SLOW_MS });
    await slow.done;
    expect(slow.shown.map((s) => s.slow)).toEqual([false, true, true]);
  });

  it('порог «долго» — именно порог: ровно на нём уже долго, чуть ниже ещё нет', async () => {
    const below = journal({ steps: 2, costMs: SLOW_MS - 1 });
    await below.done;
    expect(below.shown[1].slow).toBe(false);
    const at = journal({ steps: 2, costMs: SLOW_MS });
    await at.done;
    expect(at.shown[1].slow).toBe(true);
  });

  it('хватило — лишних шагов не гоняем', async () => {
    const j = journal({ steps: 5, enoughAt: 2 });
    expect(await j.done).toBe(2);
    expect(j.log.filter((l) => l.startsWith('шаг'))).toEqual(['шаг 1', 'шаг 2']);
  });

  it('число показов равно числу шагов — счётчик на экране настоящий', async () => {
    const j = journal({ steps: 3 });
    await j.done;
    expect(j.shown.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(j.shown.every((s) => s.steps === 3)).toBe(true);
  });

  /**
   * 🔴 КАДР — ЭТО ЗАДАЧА, А НЕ МИКРОЗАДАЧА. Разница здесь и есть весь баг.
   * `await Promise.resolve()` выглядит как «отпустили поток», но микрозадачи
   * доигрываются ДО того, как браузер нарисует кадр: индикатор так и не покажется.
   * Проверяем в лоб: микрозадача, поставленная ПОСЛЕ nextFrame, обязана успеть
   * раньше него.
   */
  it('🔴 nextFrame уходит в ЗАДАЧУ, а не в микрозадачу', async () => {
    const order: string[] = [];
    const p = nextFrame().then(() => order.push('кадр'));
    Promise.resolve().then(() => order.push('микрозадача'));
    order.push('сразу');
    await p;
    expect(order).toEqual(['сразу', 'микрозадача', 'кадр']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ВИД: строка для человека, БЕЗ выдуманной шкалы
// ─────────────────────────────────────────────────────────────────────────────

/** Весь текст поддерева и все стили — чтобы спросить у РИСУНКА, а не у исходника. */
function drawn(status: BuildStatus) {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(ProfileProvider, null,
        React.createElement(ThemeProvider, null,
          React.createElement(LanguageProvider, null,
            React.createElement(BoardBuilding, { status })))),
    );
  });
  const texts: string[] = [];
  const styles: any[] = [];
  const walk = (n: any) => {
    if (typeof n === 'string') { texts.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n) return;
    if (n.props?.style) styles.push(n.props.style);
    (n.children || []).forEach(walk);
  };
  walk(r.toJSON());
  TestRenderer.act(() => r.unmount());
  return { texts, styles, joined: texts.join(' ') };
}

describe('вид индикатора', () => {
  it('это строка для человека, а не голый спиннер', () => {
    const d = drawn({ step: 1, steps: 1, slow: false });
    // Хоть одна связная строка длиннее слова — иначе показывать нечего.
    expect(d.texts.filter((s) => s.trim().length > 6).length).toBeGreaterThan(0);
  });

  it('🔴 процентов и шкалы нет НИГДЕ: считать их нечем, значит это было бы враньё', () => {
    for (const status of [
      { step: 1, steps: 4, slow: false },
      { step: 3, steps: 4, slow: true },
    ] as BuildStatus[]) {
      const d = drawn(status);
      expect(`текст «${d.joined}»`).not.toMatch(/%/);
      // Шкала — это ширина в долях. Никакой узел не имеет права её задавать.
      const flat = JSON.stringify(d.styles);
      expect(`стили ${flat}`).not.toMatch(/"width":"\d+(\.\d+)?%"/);
    }
  });

  it('«уровень сложный» появляется ТОЛЬКО когда сборка правда затянулась', () => {
    const quick = drawn({ step: 2, steps: 4, slow: false });
    const long = drawn({ step: 2, steps: 4, slow: true });
    expect(long.texts.length).toBeGreaterThan(quick.texts.length);
    // Ровно одна строка добавилась — та самая, и её не видно в быстром случае.
    const extra = long.texts.filter((s) => !quick.texts.includes(s));
    expect(extra.length).toBeGreaterThan(0);
    for (const s of extra) expect(quick.joined).not.toContain(s);
  });

  it('счётчик шагов показывает НАСТОЯЩИЕ числа', () => {
    const d = drawn({ step: 2, steps: 3, slow: false });
    expect(d.joined).toContain('2');
    expect(d.joined).toContain('3');
    // Одинокий шаг считать незачем — числа быть не должно.
    const alone = drawn({ step: 1, steps: 1, slow: false });
    expect(alone.joined).not.toMatch(/\d/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЭКРАН: нажали «играть» — что видно СРАЗУ
// ─────────────────────────────────────────────────────────────────────────────

function mountSamurai() {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/sudoku-samurai').default;
  // Игровая фаза живёт в GameShell, а он спрашивает безопасные поля экрана. Без
  // метрик каркас падает на монтаже, и гейт краснел бы не на том, что проверяет.
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: metrics },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  const has = (id: string) => r.root.findAll((n: any) => n.props?.testID === id).length > 0;
  const press = (id: string) => {
    const node = r.root.findAll((n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function')[0];
    if (!node) throw new Error(`нет кнопки ${id}`);
    TestRenderer.act(() => { node.props.onPress(); });
  };
  const wait = async (ms = 25) => { await TestRenderer.act(async () => { await new Promise((res) => setTimeout(res, ms)); }); };
  const seconds = () => {
    const out: string[] = [];
    const walk = (n: any) => {
      if (typeof n === 'string') { out.push(n); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n) (n.children || []).forEach(walk);
    };
    walk(r.toJSON());
    const m = out.join(' ').match(/(\d+\.\d+)/g);
    return m ? Math.max(...m.map(Number)) : 0;
  };
  return { r, has, press, wait, seconds, unmount: () => TestRenderer.act(() => r.unmount()) };
}

describe('нажали «играть» — экран говорит, что идёт работа', () => {
  it('🔴 индикатор виден СРАЗУ после нажатия, а доски ещё нет', async () => {
    const s = mountSamurai();
    try {
      expect(s.has('board-building')).toBe(false);
      s.press('samurai-start');
      // Ни одного кадра ещё не прошло — и уже видно, что идёт работа.
      expect(`индикатор виден: ${s.has('board-building')}`).toBe('индикатор виден: true');
      expect(`доска уже тут: ${s.has('samurai-pencil')}`).toBe('доска уже тут: false');
      // 🔴 И это не «доигралось в микрозадачах». Микрозадачи браузеру рисовать не
      // дают: сколько их ни прогони, кадра не будет, а значит и доски быть не должно.
      await TestRenderer.act(async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); });
      expect(`доска после микрозадач: ${s.has('samurai-pencil')}`).toBe('доска после микрозадач: false');
      expect(`индикатор всё ещё тут: ${s.has('board-building')}`).toBe('индикатор всё ещё тут: true');
      // Дожидаемся доски — ожидание конечное, а не вечное.
      for (let i = 0; i < 200 && !s.has('samurai-pencil'); i++) await s.wait();
      expect(`доска собралась: ${s.has('samurai-pencil')}`).toBe('доска собралась: true');
      expect(`индикатор убран: ${!s.has('board-building')}`).toBe('индикатор убран: true');
    } finally { s.unmount(); }
  });

  it('🔴 часы партии не считают время сборки', async () => {
    const real = Date.now;
    let fake = real.call(Date);
    (Date as any).now = () => fake;
    const s = mountSamurai();
    try {
      s.press('samurai-start');
      const atPress = fake;
      // Пока экран собирает доску, часы уводим вперёд на пять секунд за кадр.
      // ⚠️ Сдвиг идёт ПЕРЕД ожиданием: доска появляется внутри ожидания, и сдвиг
      // после него приписал бы партии время, которого при сборке ещё не было.
      for (let i = 0; i < 200 && !s.has('samurai-pencil'); i++) { fake += 5000; await s.wait(); }
      expect(`доска собралась: ${s.has('samurai-pencil')}`).toBe('доска собралась: true');
      expect(`часы ушли на ${(fake - atPress) / 1000} с`).not.toBe('часы ушли на 0 с');
      // Даём секундомеру тикнуть: он обязан считать от КОНЦА сборки, а не от нажатия.
      fake += 200;
      await s.wait(160);
      expect(s.seconds()).toBeGreaterThan(0);      // секундомер вообще идёт
      expect(s.seconds()).toBeLessThan(1);         // но времени сборки в нём нет
    } finally { s.unmount(); (Date as any).now = real; }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ГЕНЕРАТОР РАЗОБРАН НА ЗАХОДЫ — И ЭТО ТЕ ЖЕ ЗАХОДЫ
// ─────────────────────────────────────────────────────────────────────────────

describe('кирпичи генератора', () => {
  it('каждый шаг отдаёт ГОТОВУЮ доску: партию можно взять с любого места', () => {
    const b = samuraiBuilder(1);
    let done = false, made = 0;
    for (let i = 0; i < b.steps && !done; i++) {
      const tick = b.step();
      made++;
      done = tick.done;
      expect(tick.best.puzzle.length).toBe(21);
      expect(tick.best.solution.length).toBe(21);
      expect(tick.best.blanks).toBeGreaterThan(0);
    }
    expect(`первая ступень взята за шагов: ${made} (потолок ${b.steps})`).toBe(`первая ступень взята за шагов: ${made} (потолок 4)`);
    expect(done).toBe(true);
    expect(made).toBeLessThanOrEqual(b.steps);
  });

  /**
   * 🔴 «ХВАТИТ» СПРАШИВАЕТСЯ НА КОНЦЕ ЗАХОДА, А НЕ ПОСРЕДИ НЕГО.
   *
   * Дробление придумано, чтобы отдавать кадр, — оно НЕ имеет права менять сборку.
   * Спросить «хватит» после первого же прохода значит бросить заход недоделанным:
   * второй проход снимает клетку, отвергнутую в начале первого, — доска вокруг неё
   * уже другая (см. digByLogic). На уровне 12 первый проход всегда что-то снимает,
   * значит после него заход НЕ окончен и ответа «хватит» быть не может.
   *
   * ⚠️ Проверяем тремя досками, а не одной: первый проход дотягивает до потолка
   * техник не всегда, и на одной доске сломанный код проскочил бы зелёным.
   */
  it('🔴 после первого прохода заход ещё не окончен — «хватит» не отвечаем', () => {
    const early = [0, 1, 2].filter(() => samuraiBuilder(12).step().done);
    expect(`досок, брошенных на первом проходе: ${early.length} из 3`).toBe('досок, брошенных на первом проходе: 0 из 3');
  });

  /**
   * 🔴 РАДИ ЧЕГО ДРОБЛЕНИЕ ВООБЩЕ ЕСТЬ. Замер живьём (уровень 12, тротлинг ×6):
   * вся сборка укладывалась в ОДИН заход на 4.5 с, и строка «уровень сложный» была
   * недостижима — сказать её было негде. Точка отпустить поток обязана быть ВНУТРИ
   * захода, а не только между заходами.
   */
  it('🔴 шагов больше, чем заходов: точка отпустить поток есть и ВНУТРИ захода', () => {
    expect(samuraiBuilder(12).steps).toBe(BUILD_ATTEMPTS * DIG_PASSES);
    expect(DIG_PASSES).toBeGreaterThan(1);
    expect(samuraiBuilder(12).steps).toBeGreaterThan(BUILD_ATTEMPTS);
  });

  it('второй шаг того же захода продолжает ТУ ЖЕ доску, а не начинает новую', () => {
    const sol = buildSolutionCanvas();
    const one = digByLogic(sol, 3, CELLS.length, 1);
    const two = digByLogic(sol, 3, CELLS.length, 1, one);
    expect(two.puzzle).toBe(one.puzzle);              // доска та же самая, не копия
    expect(two.blanks).toBeGreaterThanOrEqual(one.blanks);
    expect(two.tier).toBeGreaterThanOrEqual(one.tier);
  });

  it('сплошная сборка отдаёт доску, годную для уровня — как и пошаговая', () => {
    const whole = generateSamuraiLevel(3);
    expect(whole.puzzle.length).toBe(21);
    expect(whole.tier).toBeGreaterThanOrEqual(levelBand(3).min);
  });

  it('из двух заходов остаётся тот, что потребовал техники посложнее', () => {
    const a = { puzzle: [], solution: [], tier: 2, blanks: 1 } as any;
    const b = { puzzle: [], solution: [], tier: 3, blanks: 1 } as any;
    expect(betterAttempt(a, b)).toBe(b);
    expect(betterAttempt(b, a)).toBe(b);
    expect(betterAttempt(null, a)).toBe(a);
  });

  it('«хватит» сверяется с потолком полосы уровня, а не с числом наугад', () => {
    for (const L of [1, 5, 12]) {
      const { max } = levelBand(L);
      expect(attemptEnough(L, { tier: max } as any)).toBe(true);
      expect(attemptEnough(L, { tier: max - 1 } as any)).toBe(false);
    }
  });

  it('заходов больше одного — иначе ступень уровня была бы лотереей', () => {
    expect(BUILD_ATTEMPTS).toBeGreaterThan(1);
  });
});
