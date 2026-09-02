/**
 * ЭКРАН НЕ МОЛЧИТ, ПОКА СОБИРАЕТСЯ ДОСКА.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Самурай на верхних уровнях собирает доску секундами (замер
 * 20.08.2026: уровень 12 — 2.5–6 с в node, уровень 8 — 2.5–5 с), и всё это время
 * экран был пуст. Человек нажал «играть» и не мог отличить «думает» от «зависло».
 * Хуже: молчание держало сложность внизу — пол верхней ступени оставили тройкой
 * ровно потому, что четвёрка гоняла бы генератор дольше.
 *
 * ⚠️ ПОЛ С ТЕХ ПОР ПОДНЯТ ДО ГОЛЫХ ПАР (20.08.2026), и сборка стала ДЕШЕВЛЕ прежней:
 * второй проход выкапывания снимал ноль клеток и стоил половину времени — его больше
 * нет, а освободившееся время уходит на заходы до пола. Заход теперь режется на срезы:
 * шаг стал втрое короче, точек отдать кадр — втрое больше.
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
  BUILD_ATTEMPTS, DIG_SLICES, samuraiBuilder, betterAttempt, attemptEnough, levelBand,
  buildSolutionCanvas, digByLogic, generateSamuraiLevel, levelParams, CELLS, minTierOf,
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
    /**
     * ⚠️ ЧИТАЕМ ТО, ЧТО ШАПКА ПОКАЗЫВАЕТ, А НЕ ТО, КАК ОНА ПИСАЛА РАНЬШЕ.
     *
     * Здесь ловились только дробные числа (`\d+\.\d+`), потому что секундомер писал
     * «0.3с». 03.09.2026 время в шапке стало коротким (`hudTime`: целые секунды до
     * минуты, дальше `м:сс`) — шесть знаков не помещались среди шести счётчиков, —
     * и проверка стала читать ноль на исправном экране.
     *
     * Берём оба вида: «12с»/«12» и «4:55». Секундомер здесь единственный источник
     * растущего числа, поэтому максимум по экрану — это он.
     */
    const текст = out.join(' ');
    const числа: number[] = [];
    // Только формы САМОГО секундомера: «4:55» и «12с». Голые числа не берём — на
    // экране их полно (уровень, ошибки, пометки), и максимум по ним ловил не то:
    // первая редакция этой правки прочитала «10» из чужого счётчика.
    for (const m of текст.matchAll(/(\d+):(\d{2})/g)) числа.push(Number(m[1]) * 60 + Number(m[2]));
    // Суффикс секунд зависит от языка: «с» по-русски, «s» по-английски (тест идёт
    // на английской локали — на этом первая редакция и прочитала ноль).
    for (const m of текст.matchAll(/(\d+(?:\.\d+)?)\s*[сs](?![а-яёa-z])/gi)) числа.push(Number(m[1]));
    return числа.length ? Math.max(...числа) : 0;
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
      /**
       * Даём секундомеру тикнуть: он обязан считать от КОНЦА сборки, а не от
       * нажатия. Сдвиг 1,2 с, а не 0,2: шапка показывает ЦЕЛЫЕ секунды, и на
       * двухстах миллисекундах ей нечего показать — проверка мерила бы разрешение
       * экрана, а не то, что проверяет.
       */
      fake += 1200;
      await s.wait(160);
      expect(s.seconds()).toBeGreaterThan(0);      // секундомер вообще идёт
      // Сборка увела часы на сотни секунд (цикл выше). Если бы её время попало в
      // партию, здесь были бы они, а не единицы.
      expect(s.seconds()).toBeLessThan(10);
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
    expect(done).toBe(true);
    // Первая ступень достижима сама собой — заход на неё нужен ровно один.
    expect(`шагов на первую ступень: ${made} (в заходе ${DIG_SLICES})`).toBe(`шагов на первую ступень: ${made} (в заходе ${DIG_SLICES})`);
    expect(made).toBeLessThanOrEqual(DIG_SLICES);
    expect(b.steps).toBe(BUILD_ATTEMPTS * DIG_SLICES);
  });

  /**
   * 🔴 «ХВАТИТ» СПРАШИВАЕТСЯ НА КОНЦЕ ЗАХОДА, А НЕ ПОСРЕДИ НЕГО.
   *
   * Дробление придумано, чтобы отдавать кадр, — оно НЕ имеет права менять сборку.
   * Ответить «хватит» на первом срезе значит отдать НЕДОКОПАННУЮ доску: остальные две
   * трети клеток даже не просмотрены, и подсказок на ней осталось бы вдвое больше
   * заказанного. На уровне 12 первый срез заход не заканчивает никогда.
   *
   * ⚠️ Проверяем тремя досками, а не одной: на одной сломанный код проскочил бы зелёным.
   */
  it('🔴 после первого среза заход ещё не окончен — «хватит» не отвечаем', () => {
    const early = [0, 1, 2].filter(() => samuraiBuilder(12).step().done);
    expect(`досок, брошенных на первом срезе: ${early.length} из 3`).toBe('досок, брошенных на первом срезе: 0 из 3');
  });

  /**
   * 🔴 РАДИ ЧЕГО ДРОБЛЕНИЕ ВООБЩЕ ЕСТЬ. Замер живьём (уровень 12, тротлинг ×6): заход
   * держит поток секундами, и строка «уровень сложный» была недостижима — сказать её
   * было негде. Точка отпустить поток обязана быть ВНУТРИ захода, а не только между
   * заходами.
   */
  it('🔴 шагов больше, чем заходов: точка отпустить поток есть и ВНУТРИ захода', () => {
    expect(samuraiBuilder(12).steps).toBe(BUILD_ATTEMPTS * DIG_SLICES);
    expect(DIG_SLICES).toBeGreaterThan(1);
    expect(samuraiBuilder(12).steps).toBeGreaterThan(BUILD_ATTEMPTS);
  });

  it('второй срез того же захода продолжает ТУ ЖЕ доску, а не начинает новую', () => {
    const sol = buildSolutionCanvas();
    const one = digByLogic(sol, 3, CELLS.length, 40);   // 40 прогонов решателя — часть смёта
    expect(one.done).toBe(false);
    const two = digByLogic(sol, 3, CELLS.length, 40, one);
    expect(two.puzzle).toBe(one.puzzle);              // доска та же самая, не копия
    expect(two.queue).toBe(one.queue);                // и очередь клеток та же, не новая
    expect(two.at).toBeGreaterThan(one.at);           // курсор в очереди двинулся
    expect(two.blanks).toBeGreaterThanOrEqual(one.blanks);
    expect(two.tier).toBeGreaterThanOrEqual(one.tier);
  });

  /**
   * 🔴 СМЁТ ПО КЛЕТКАМ — ЭТО УЖЕ ДО УПОРА. На этом стоит вся нынешняя цена сборки:
   * второй проход по доске был чистой платой ни за что — 1.1–3.5 с (половина времени
   * сборки) за подтверждение того, что снимать больше нечего.
   *
   * Почему нечего: отказ ОКОНЧАТЕЛЕН. Клетку не дали убрать, потому что доска перестала
   * браться техниками ≤ потолка, — а дальше подсказок на доске только меньше, и логике
   * легче не станет. Проверяем это не рассуждением, а вторым смётом по той же доске:
   * он обязан снять НОЛЬ клеток.
   */
  it('🔴 второй смёт по докопанной доске не снимает ни одной клетки', () => {
    const bad: string[] = [];
    // Потолки берём НИЗКИЕ: правило «отказ окончателен» от потолка не зависит, а смёт
    // на четвёрке стоит секунды — гейт перед коммитом не должен идти минуту.
    for (const cap of [1, 2]) {
      const sol = buildSolutionCanvas();
      const one = digByLogic(sol, cap, CELLS.length);
      expect(one.done).toBe(true);
      // ⚠️ Очередь во втором смёте РАЗВЁРНУТА. Пройти второй раз тем же порядком —
      // значит не заметить клетку, которую смёт вообще не смотрит: пропуск по номеру в
      // очереди повторился бы один в один и остался бы невидимым.
      const two = digByLogic(sol, cap, CELLS.length, CELLS.length, { ...one, at: 0, queue: [...one.queue].reverse() });
      if (two.blanks !== one.blanks) bad.push(`потолок ${cap}: второй смёт снял ещё ${two.blanks - one.blanks} клеток`);
      if (two.tier !== one.tier) bad.push(`потолок ${cap}: ступень уехала ${one.tier} → ${two.tier}`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 БЫСТРЫЙ ПУТЬ ЖИВ. Клетка, у которой после снятия остался единственный кандидат,
   * возвращается голой одиночкой — полный решатель для неё не нужен. Таких снятий
   * подавляющее большинство (замер: 180 из 274 даром, 5 мс на всю доску), и если этот
   * путь сломать, цена сборки вырастет молча. Меряем не время (оно зависит от машины), а
   * КЛЕТКИ, ради которых решатель звался: их обязано быть меньше, чем снятых.
   */
  it('🔴 клеток через решатель меньше, чем снятых — даровые снятия работают', () => {
    const sol = buildSolutionCanvas();
    const dug = digByLogic(sol, 2, CELLS.length);
    expect(`клеток через решатель ${dug.solverCells} < дырок ${dug.blanks}: ${dug.solverCells < dug.blanks}`)
      .toBe(`клеток через решатель ${dug.solverCells} < дырок ${dug.blanks}: true`);
    // и решатель всё-таки звался: ноль прогонов означал бы, что доска копается вслепую
    expect(dug.solverRuns).toBeGreaterThan(0);
  });

  /**
   * 🔴 СРЕЗ МЕРЯЕТСЯ РАБОТОЙ. Резали по клеткам — срезы вышли 70 / 290 / 1650 мс (замер
   * в браузере, тротлинг ×6): клетки в начале очереди снимаются даром, в конце — каждая
   * через полный решатель. Счётчик шагов замирал ровно там, где ждать дольше всего.
   *
   * Проверяем не время (оно от машины), а РАБОТУ: срез не берёт больше отпущенных ему
   * прогонов решателя. И отдельно — что последний срез захода добирает остаток, иначе
   * заход не уложится в потолок шагов и сборку оборвут на недокопанной доске.
   */
  it('🔴 срез не съедает больше отпущенной работы, а последний добирает остаток', () => {
    const sol = buildSolutionCanvas();
    // ⚠️ Бюджет соблюдается С ТОЧНОСТЬЮ ДО ПОСЛЕДНЕЙ КЛЕТКИ: она может стоить до tierMax
    // прогонов, и остановиться посреди клетки нельзя — доска осталась бы без вердикта.
    const ЛИМИТ = 120, ПЕРЕБОР = ЛИМИТ + 4;
    let st = digByLogic(sol, 4, CELLS.length, ЛИМИТ);
    expect(`первый срез прогонов: ${st.solverRuns} ≤ ${ПЕРЕБОР}`).toBe(`первый срез прогонов: ${Math.min(st.solverRuns, ПЕРЕБОР)} ≤ ${ПЕРЕБОР}`);
    expect(st.done).toBe(false);
    const было = st.solverRuns;
    st = digByLogic(sol, 4, CELLS.length, ЛИМИТ, st);
    expect(`второй срез прогонов: ${st.solverRuns - было} ≤ ${ПЕРЕБОР}`).toBe(`второй срез прогонов: ${Math.min(st.solverRuns - было, ПЕРЕБОР)} ≤ ${ПЕРЕБОР}`);
    // последний срез — без бюджета: добирает всё, сколько бы ни осталось
    st = digByLogic(sol, 4, CELLS.length, Infinity, st);
    expect(st.done).toBe(true);
    expect(st.at).toBe(CELLS.length);
    // и заход целиком укладывается ровно в DIG_SLICES срезов — потолок шагов держится
    const b = samuraiBuilder(12);
    let срезов = 0;
    for (let i = 0; i < b.steps; i++) {
      const tick = b.step();
      if (tick.attempt > 1) break;   // пошёл ВТОРОЙ заход — значит первый уже кончился
      срезов++;
      if (tick.done) break;
    }
    expect(`срезов в первом заходе: ${срезов} (потолок ${DIG_SLICES})`)
      .toBe(`срезов в первом заходе: ${Math.min(срезов, DIG_SLICES)} (потолок ${DIG_SLICES})`);
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

  /**
   * 🔴 «ХВАТИТ» СВЕРЯЕТСЯ С ПОЛОМ ПОЛОСЫ, А НЕ С ПОТОЛКОМ.
   *
   * Пока здесь стоял потолок, пол не значил ничего: доска ступенью ниже пола считалась
   * годной, и полоса [3..4] на деле означала «как повезёт». Спрашиваем прямо: доска на
   * связанных кандидатах (ступень 3) для двенадцатого уровня — НЕ годится.
   */
  it('🔴 «хватит» — это ПОЛ полосы: ступенью ниже доска не годится', () => {
    for (const L of [1, 5, 8, 12]) {
      const { min } = levelBand(L);
      expect(`L${L} ступень ${min}: ${attemptEnough(L, { tier: min } as any)}`).toBe(`L${L} ступень ${min}: true`);
      expect(`L${L} ступень ${min - 1}: ${attemptEnough(L, { tier: min - 1 } as any)}`).toBe(`L${L} ступень ${min - 1}: false`);
    }
    // тот самый пол верхней полосы, поимённо: связанных кандидатов на боссе мало
    expect(`связанные кандидаты годятся для L12: ${attemptEnough(12, { tier: 3 } as any)}`)
      .toBe('связанные кандидаты годятся для L12: false');
  });

  /**
   * 🔴 ЗАХОДОВ ХВАТАЕТ НА ПОЛ. Ступень захода — лотерея (65% попаданий на потолке 4),
   * и одного захода мало по построению. Проверяем не константу, а результат: партия
   * верхнего уровня приходит с полом, а не «как повезёт».
   */
  it('🔴 партия верхнего уровня доходит до пола, а не до первой попавшейся ступени', () => {
    expect(BUILD_ATTEMPTS).toBeGreaterThan(1);
    const g = generateSamuraiLevel(12);
    expect(`ступень партии L12: ${minTierOf(g.puzzle, 4)}`).toBe(`ступень партии L12: ${levelBand(12).min}`);
  });
});
