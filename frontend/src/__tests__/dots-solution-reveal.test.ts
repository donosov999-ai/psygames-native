/* psygames-dots-solution-reveal-gate · VER 1 · 23.08.2026 */
/**
 * ПОКАЗ РЕШЕНИЯ В «СОЕДИНИ ТОЧКИ» — НАСТОЯЩЕЕ РЕШЕНИЕ И ЧЕСТНАЯ ЦЕНА.
 *
 * 🔴 ЧТО БЫЛО. Генератор строит доску ОТ РЕШЕНИЯ: берёт гамильтонов путь (он по
 * построению проходит каждую клетку ровно один раз), режет его на куски и
 * отдаёт наружу только концы кусков. То есть полный путь каждой пары известен в
 * момент раздачи — и наружу не отдавался. Человек, который встал, мог только
 * бросить уровень и НЕ УЗНАТЬ, как было. У образца (SPAN, дуэли по Numberlink) в
 * тренировочном режиме ровно наоборот: «застряли? найдите решение и изучите
 * закономерность».
 *
 * ⚠️ ДВА ОБМАНА, РАДИ КОТОРЫХ ГЕЙТ УСТРОЕН ИМЕННО ТАК.
 *
 * 1. «ПОКАЗАЛИ ЧТО-ТО ПОХОЖЕЕ НА РЕШЕНИЕ». Подложку легко нарисовать красиво и
 *    неверно: путь обрывается за клетку до конца, две пары делят клетку, угол
 *    доски остаётся пустым. Глазами на 10×10 это не ловится, а «решение», по
 *    которому нельзя пройти, хуже отсутствия кнопки — человек будет думать, что
 *    не понимает игру. Поэтому показанное разбирается ПОКЛЕТОЧНО и своими
 *    руками: связность, непересечение и полное покрытие считаются здесь, а не
 *    спрашиваются у `validateDotsSolution`. Гейт, который зовёт тот же
 *    валидатор, что и игра, зелен на сломанном валидаторе.
 *
 * 2. «ПОСМОТРЕЛ И ЗАСЧИТАЛИ». Обвести показанный ответ — это покрытие 100% и
 *    точность 1.0, то есть по прежним условиям такая партия проходила ЛУЧШЕ
 *    честной. Значит уровень поднимался бы за нажатие кнопки. Проверяем
 *    поведением: гоняем ОДИН И ТОТ ЖЕ маршрут дважды — с показом и без — и
 *    требуем разного вердикта.
 *
 * ⚠️ И ТРЕТЬЕ, ЧЕГО НЕ ВИДНО В ЯДРЕ: НАРИСОВАНО ЛИ. В этом проекте разметка
 * бывает мёртвой (в SET бейдж отсчёта был написан, переведён на 12 языков,
 * покрыт гейтом — и не показывался ни разу). Поэтому подложка проверяется ещё и
 * на смонтированном модуле: нажатие настоящей кнопки, разбор нарисованного
 * дерева, сверка цвета каждой клетки с тем, чья это пара по решению.
 */
import React from 'react';
import {
  LEVELS,
  advanceFromTraining,
  beginPath,
  canRevealDotsSolution,
  createDotsSession,
  dotsRevealedSolution,
  extendPath,
  generateDotsPuzzle,
  getDotsStrings,
  isPassed,
  restartSession,
  startRound,
  startTraining,
  toggleDotsSolution,
  type Cell,
  type DotsPair,
  type DotsPaths,
  type DotsPuzzle,
  type DotsSession,
} from '@/src/games/dots-connect/core';
import DotsConnectGame, { type DotsAuxControls } from '@/src/games/dots-connect/DotsConnectGame';

declare function require(id: string): any;

const TestRenderer = require('react-test-renderer');

const key = (cell: Cell): string => `${cell.row},${cell.col}`;

// ─────────────────────────────────────────────────────────────────────────────
// РАЗБОР ПОКАЗАННОГО — СВОИМИ РУКАМИ, БЕЗ ВАЛИДАТОРА ИГРЫ.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Все претензии к показанному решению одной доски. Пустой список = показанное
 * действительно решает эту доску.
 *
 * Проверяются ровно четыре свойства, и все четыре — независимо от кода игры:
 *   1) у каждой пары есть путь, и он идёт МЕЖДУ ЕЁ СОБСТВЕННЫМИ концами;
 *   2) путь непрерывен (каждый шаг — соседняя клетка) и не топчется по себе;
 *   3) пути не делят клеток;
 *   4) вместе они занимают ВСЮ сетку.
 */
function complaints(puzzle: DotsPuzzle, shown: DotsPaths): string[] {
  const bad: string[] = [];
  const owner = new Map<string, string>();
  const ids = puzzle.pairs.map((pair) => pair.id).sort();

  const extra = Object.keys(shown).filter((id) => !ids.includes(id)).sort();
  if (extra.length) bad.push(`лишние пути: ${extra.join(', ')}`);

  for (const pair of puzzle.pairs as DotsPair[]) {
    const path = shown[pair.id];
    if (!path || path.length < 2) { bad.push(`${pair.id}: пути нет`); continue; }

    const first = path[0] as Cell;
    const last = path[path.length - 1] as Cell;
    const [a, b] = pair.endpoints;
    const joined = (key(first) === key(a) && key(last) === key(b))
      || (key(first) === key(b) && key(last) === key(a));
    if (!joined) {
      bad.push(`${pair.id}: путь идёт ${key(first)}→${key(last)}, а концы пары ${key(a)} и ${key(b)}`);
    }

    const own = new Set<string>();
    for (let i = 0; i < path.length; i += 1) {
      const cell = path[i] as Cell;
      const at = key(cell);
      if (cell.row < 0 || cell.col < 0 || cell.row >= puzzle.size || cell.col >= puzzle.size) {
        bad.push(`${pair.id}: клетка ${at} вне доски ${puzzle.size}×${puzzle.size}`);
      }
      if (own.has(at)) bad.push(`${pair.id}: путь дважды проходит ${at}`);
      own.add(at);
      if (i > 0) {
        const prev = path[i - 1] as Cell;
        const step = Math.abs(prev.row - cell.row) + Math.abs(prev.col - cell.col);
        if (step !== 1) bad.push(`${pair.id}: разрыв ${key(prev)}→${at} (шаг ${step})`);
      }
      const already = owner.get(at);
      if (already && already !== pair.id) bad.push(`клетка ${at} занята и ${already}, и ${pair.id}`);
      else owner.set(at, pair.id);
    }
  }

  // ⚠️ Стены не покрываются — их нет на доске (правка 06.09.2026).
  const стены = new Set((puzzle.walls ?? []).map((w) => `${w.row},${w.col}`));
  const total = puzzle.size * puzzle.size - стены.size;
  if (owner.size !== total) {
    const empty: string[] = [];
    for (let row = 0; row < puzzle.size; row += 1) {
      for (let col = 0; col < puzzle.size; col += 1) {
        if (стены.has(`${row},${col}`)) continue;
        if (!owner.has(`${row},${col}`)) empty.push(`${row},${col}`);
      }
    }
    bad.push(`покрыто ${owner.size}/${total}, пусто: ${empty.slice(0, 6).join(' ')}`);
  }
  return bad;
}

/** Проводит пути НАСТОЯЩИМИ ходами сессии — так же, как это делает палец. */
function draw(start: DotsSession, paths: DotsPaths, clock = 2_000): DotsSession {
  let session = start;
  for (const path of Object.values(paths)) {
    session = beginPath(session, path[0] as Cell);
    for (const cell of path.slice(1)) session = extendPath(session, cell, clock);
  }
  return session;
}

/** Партия уровня 4, сыгранная по решению генератора. `peek` — с показом ответа. */
function playLevel(seed: string, level: number, peek: boolean): DotsSession {
  let session = startRound(createDotsSession({ seed, level }), 1_000);
  if (peek) session = toggleDotsSolution(session);
  return draw(session, session.puzzle.solution);
}

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — показанное решение действительно решает доску', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(LEVELS).toBeGreaterThanOrEqual(40);
    const session = startRound(createDotsSession({ seed: 'blind', level: 1 }), 1_000);
    // До нажатия подложки нет вовсе: иначе «показали» было бы неотличимо от «всегда видно».
    expect(dotsRevealedSolution(session)).toEqual({});
    expect(Object.keys(dotsRevealedSolution(toggleDotsSolution(session))).length)
      .toBe(session.puzzle.pairCount);
  });

  /**
   * 🔴 ГЛАВНОЕ УТВЕРЖДЕНИЕ, НА ВСЕЙ ЛЕСЕНКЕ. Генератор детерминирован по зерну,
   * поэтому «проверено на одном уровне» ничего не значит про сороковой: там
   * другая доска, другое число пар и другая нижняя длина пути. Гоняем все сорок.
   */
  it('🔴 на всех 40 уровнях показанное решение связно, не пересекается и кроет доску', () => {
    const broken: string[] = [];
    for (let level = 1; level <= LEVELS; level += 1) {
      const started = startRound(createDotsSession({ seed: 'reveal-gate', level }), 1_000);
      const revealed = toggleDotsSolution(started);
      const shown = dotsRevealedSolution(revealed);
      const bad = complaints(revealed.puzzle, shown);
      if (bad.length) broken.push(`L${level}: ${bad.join(' | ')}`);
    }
    expect(broken).toEqual([]);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Разбор выше обязан УМЕТЬ КРАСНЕТЬ — иначе «пусто»
   * означало бы «проверка ничего не смотрит». Ломаем показанное четырьмя
   * способами, каждый из которых и есть беда, ради которой разбор написан.
   */
  it('🔴 разбор ловит подделку: обрыв, дырку, наложение, чужой конец', () => {
    const puzzle = generateDotsPuzzle('reveal-gate', 7);
    const honest = puzzle.solution;
    expect(complaints(puzzle, honest)).toEqual([]);

    const first = puzzle.pairs[0] as DotsPair;
    const path = honest[first.id] as Cell[];

    // 1. Путь не дошёл до своего конца — и доска осталась с дыркой.
    const cut = { ...honest, [first.id]: path.slice(0, -1) };
    expect(complaints(puzzle, cut).join(' ')).toMatch(/концы пары|покрыто/);

    // 2. Разрыв посередине: клетка выкинута, шаг стал прыжком.
    const jump = { ...honest, [first.id]: [...path.slice(0, 1), ...path.slice(2)] };
    expect(complaints(puzzle, jump).join(' ')).toMatch(/разрыв|покрыто/);

    // 3. Две пары делят клетку.
    const second = puzzle.pairs[1] as DotsPair;
    const other = honest[second.id] as Cell[];
    const overlap = { ...honest, [second.id]: [...other, { ...(path[1] as Cell) }] };
    expect(complaints(puzzle, overlap).join(' ')).toMatch(/занята и/);

    // 4. Пары нет вовсе.
    const missing = { ...honest };
    delete (missing as Record<string, Cell[]>)[first.id];
    expect(complaints(puzzle, missing).join(' ')).toMatch(/пути нет/);
  });

  /** Тренировочная доска живёт отдельно от лесенки — её показ тоже обязан быть верным. */
  it('🔴 на тренировочной доске показывают решение ИМЕННО ЭТОЙ доски', () => {
    const training = toggleDotsSolution(startTraining(createDotsSession({ seed: 'reveal-gate', level: 9 })));
    expect(training.phase).toBe('training');
    const shown = dotsRevealedSolution(training);
    expect(complaints(training.trainingPuzzle, shown)).toEqual([]);
    // И это не решение зачётной доски, подсунутое вместо тренировочной.
    expect(training.trainingPuzzle.size).not.toBe(training.puzzle.size);
    expect(complaints(training.puzzle, shown).length).toBeGreaterThan(0);
  });

  /** Показывать нечего там, где доски нет: правила, пауза, итог. */
  it('показ живёт только пока доску ведут', () => {
    const fresh = createDotsSession({ seed: 'reveal-gate', level: 2 });
    expect(canRevealDotsSolution(fresh)).toBe(false);          // экран правил
    expect(dotsRevealedSolution(toggleDotsSolution(fresh))).toEqual({});
    const playing = startRound(fresh, 1_000);
    expect(canRevealDotsSolution(playing)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — подложка решения НАРИСОВАНА на доске', () => {
  const THEME = {
    background: '#fff', surface: '#eee', card: '#fff', text: '#000', textSecondary: '#666',
    primary: '#2563eb', border: '#ccc', success: '#0a0', error: '#a00', warning: '#fa0',
  };

  /** Монтирует модуль и отдаёт то, чем пользуется экран: служебное действие и дерево. */
  function mount(level = 3) {
    let aux: DotsAuxControls | null = null;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(DotsConnectGame, {
        seed: 'render-reveal', level, locale: 'ru', theme: THEME, skipIntro: true,
        showOwnResults: false, gameGradient: ['#2563eb', '#0f766e'], gameGradientText: '#fff',
        now: () => 1_000, onAux: (next: DotsAuxControls) => { aux = next; },
      } as any));
    });
    /** Клетки подложки: `{row,col}` → цвет ленты, снятый с НАРИСОВАННЫХ стилей. */
    const underlay = (): Map<string, string> => {
      const found = new Map<string, string>();
      const walk = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        const id: string | undefined = node.props?.testID;
        const m = id ? /^dots-solution-(\d+)-(\d+)$/.exec(id) : null;
        if (m) {
          const colors = new Set<string>();
          const dig = (n: any): void => {
            if (!n || typeof n !== 'object') return;
            if (Array.isArray(n)) { n.forEach(dig); return; }
            const flat = [n.props?.style].flat(3).filter(Boolean) as Record<string, string>[];
            for (const style of flat) if (style.backgroundColor) colors.add(style.backgroundColor);
            dig(n.children);
          };
          dig(node.children);
          // Одна клетка — одна пара, значит один цвет. Два — подложка врёт.
          found.set(`${m[1]},${m[2]}`, [...colors].join('+'));
        }
        walk(node.children);
      };
      walk(tree.toJSON());
      return found;
    };
    const visible = (): string => {
      const walk = (node: any): string => {
        if (node === null || node === undefined || node === false) return '';
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(walk).join('');
        return walk(node.children);
      };
      return walk(tree.toJSON());
    };
    return { get aux() { return aux as DotsAuxControls | null; }, underlay, visible };
  }

  /**
   * 🔴 «РАЗМЕТКА ЕСТЬ, ЭЛЕМЕНТ МЁРТВ» — самая частая беда в этом проекте.
   * Поэтому мало найти подложку в коде: нажимаем НАСТОЯЩЕЕ действие и разбираем
   * нарисованное дерево — все ли клетки закрыты и той ли парой.
   */
  it('🔴 нажатие показывает решение НА ДОСКЕ: каждая клетка и цвет своей пары', () => {
    const level = 3;
    const run = mount(level);
    expect(run.aux).toBeTruthy();
    expect(run.aux!.disabled).toBe(false);
    expect(run.aux!.solutionVisible).toBe(false);
    expect(run.underlay().size).toBe(0);                    // до нажатия подложки нет

    TestRenderer.act(() => { run.aux!.toggleSolution(); });

    const puzzle = generateDotsPuzzle('render-reveal', level);
    const drawn = run.underlay();
    expect(run.aux!.solutionVisible).toBe(true);
    expect(drawn.size).toBe(puzzle.size * puzzle.size);     // закрыта ВСЯ сетка

    // Чей цвет лежит в клетке — та пара её и занимает по решению.
    const wrong: string[] = [];
    for (const pair of puzzle.pairs as DotsPair[]) {
      for (const cell of puzzle.solution[pair.id] as Cell[]) {
        const painted = drawn.get(key(cell));
        if (!painted) { wrong.push(`${key(cell)} не закрашена вовсе`); continue; }
        // Цвет подложки — цвет пары под альфой, поэтому сверяем начало строки.
        if (!painted.startsWith(pair.color)) wrong.push(`${key(cell)}: ${painted}, ждали ${pair.color}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /** Второе нажатие прячет подложку — но цену показа с экрана не убирает. */
  it('🔴 показ выключается, а предупреждение «не засчитается» остаётся', () => {
    const run = mount(3);
    const note = getDotsStrings('ru').solutionNote;
    expect(run.visible()).not.toContain(note);

    TestRenderer.act(() => { run.aux!.toggleSolution(); });
    expect(run.visible()).toContain(note);

    TestRenderer.act(() => { run.aux!.toggleSolution(); });
    expect(run.underlay().size).toBe(0);                    // подложка убрана
    expect(run.aux!.solutionVisible).toBe(false);
    expect(run.visible()).toContain(note);                  // а метка держится
  });

  /**
   * 🔴 КНОПКА ЖИВЁТ В ШАПКЕ КАРКАСА, А НЕ ПОД ДОСКОЙ. Низ экрана означает ОТВЕТ
   * игрока — здесь отвечают пальцем по сетке. Модуль отдаёт действие наверх и
   * САМ его не рисует; иначе служебное снова оказалось бы рядом с ответом, и
   * рука тянулась бы к нему на автомате.
   */
  it('🔴 модуль отдаёт действие экрану и не рисует его сам под доской', () => {
    const run = mount(3);
    const s = getDotsStrings('ru');
    expect(typeof run.aux!.toggleSolution).toBe('function');
    expect(run.visible()).not.toContain(s.showSolution);
    expect(run.visible()).not.toContain(s.hideSolution);
    // При этом свои кнопки под доской у модуля есть — значит ищем не в пустоте.
    expect(run.visible()).toContain(s.undo);
    expect(run.visible()).toContain(s.restart);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — посмотрел решение, значит партия не в зачёт', () => {
  /**
   * 🔴 ОДИН И ТОТ ЖЕ МАРШРУТ, ДВА РАЗНЫХ ВЕРДИКТА. Разница между партиями ровно
   * одна — нажатие показа. Если бы порог смотрел только на покрытие и точность,
   * обе прошли бы одинаково: обвести показанный ответ — это 100% и 1.0.
   */
  it('🔴 честная партия проходит, та же партия после показа — нет', () => {
    const honest = playLevel('honesty', 4, false);
    expect(honest.phase).toBe('result');
    expect(honest.result!.solutionShown).toBe(false);
    expect(honest.result!.accuracy).toBe(1);
    expect(isPassed(honest.result!)).toBe(true);

    const peeked = playLevel('honesty', 4, true);
    expect(peeked.phase).toBe('result');
    expect(peeked.result!.solutionShown).toBe(true);
    // Цифры у неё НЕ ХУЖЕ честной — и именно поэтому одного порога было мало.
    expect(peeked.result!.accuracy).toBe(honest.result!.accuracy);
    expect(peeked.result!.specific.coverage).toBe(1);
    expect(isPassed(peeked.result!)).toBe(false);
  });

  /**
   * 🔴 ЛАТЧ НЕ СНИМАЕТСЯ НИ «СКРЫТЬ», НИ «ЗАНОВО». Обе дыры одинаково дешёвые:
   * зерно фиксировано номером уровня, «Заново» даёт ТУ ЖЕ раскладку, и схема
   * «подсмотрел → скрыл/перезапустил → обвёл по памяти» была бы бесплатной.
   */
  it('🔴 «скрыть» и «Заново» подсмотр не отменяют', () => {
    let hidden = startRound(createDotsSession({ seed: 'latch', level: 4 }), 1_000);
    hidden = toggleDotsSolution(toggleDotsSolution(hidden));
    expect(hidden.solutionVisible).toBe(false);
    hidden = draw(hidden, hidden.puzzle.solution);
    expect(isPassed(hidden.result!)).toBe(false);

    let again = startRound(createDotsSession({ seed: 'latch', level: 4 }), 1_000);
    again = restartSession(toggleDotsSolution(again), 1_500);
    expect(again.phase).toBe('playing');
    expect(again.paths).toEqual({});                        // доска действительно чистая
    again = draw(again, again.puzzle.solution);
    expect(again.result!.solutionShown).toBe(true);
    expect(isPassed(again.result!)).toBe(false);
  });

  /**
   * ⚠️ ОБРАТНАЯ СТОРОНА: НАКАЗАНИЕ НЕ РАСПОЛЗАЕТСЯ. Тренировочная доска 4×4 —
   * другая доска, в результат она не идёт вовсе, и разобраться там с правилом
   * («занять ВСЮ сетку» по доске не угадывается) — не жульничество. Гейт,
   * который умеет только запрещать, зелен и на игре, которую нельзя пройти.
   */
  it('🔴 показ на тренировке не отравляет следующую за ней партию', () => {
    let session = startTraining(createDotsSession({ seed: 'training-peek', level: 4 }));
    session = toggleDotsSolution(session);
    expect(dotsRevealedSolution(session)).not.toEqual({});
    expect(session.solutionShown).toBe(false);              // тренировка латч не ставит

    session = draw(session, session.trainingPuzzle.solution);
    expect(session.phase).toBe('training-complete');
    session = advanceFromTraining(session, 2_000);
    expect(session.solutionVisible).toBe(false);            // партия начинается без подложки
    session = draw(session, session.puzzle.solution);
    expect(session.result!.solutionShown).toBe(false);
    expect(isPassed(session.result!)).toBe(true);
  });

  /** Метка едет в метрике — только оттуда её и читает экран, когда модуль уже ушёл. */
  it('🔴 метка показа лежит в метрике партии, а не только в состоянии сессии', () => {
    const peeked = playLevel('metric', 6, true);
    expect(Object.prototype.hasOwnProperty.call(peeked.result!, 'solutionShown')).toBe(true);
    expect(peeked.result!.solutionShown).toBe(true);
    expect(peeked.result!.details.level).toBe(6);
    // И порог читает именно её: всё остальное в метрике у обеих партий совпадает.
    const asHonest = { ...peeked.result!, solutionShown: false };
    expect(isPassed(asHonest)).toBe(true);
    expect(isPassed(peeked.result!)).toBe(false);
  });
});
