/**
 * ФРАКТАЛЬНАЯ СУДОКУ: ПАРТИЯ ОБЯЗАНА ДОИГРЫВАТЬСЯ, РЕШЕНИЕ — БЫТЬ ОДНИМ, СЛОЖНОСТЬ —
 * РАСТИ СОДЕРЖАНИЕМ, А ОТМЕНА ХОДА — РЕАЛЬНО ОТКАТЫВАТЬ.
 *
 * ЗАЧЕМ ГЕЙТ. Замер 19.08.2026 на живом коде до правок:
 *
 *   • ПОБЕД 0 ИЗ 30 на пятнадцатом уровне — и так на ЛЮБОМ уровне. Победа проверяла
 *     полное совпадение корня с решением, а заполнялись в корне ровно девять клеток,
 *     приходящих снизу. Остальные (в среднем 51 из 81) не заполнял никто: ввода в
 *     корень на экране не было вовсе. Игра была непроходима по построению.
 *   • ЕДИНСТВЕННЫХ РЕШЕНИЙ 0 ИЗ 270. Дырки копались случайно, без проверки. Значит
 *     подсветка ошибки врала: игрок ставил ВАЛИДНУЮ цифру, а сверка с зашитым
 *     solution засчитывала ошибку. И «вывести логикой» было невозможно в принципе —
 *     оставалась угадайка.
 *   • СЛОЖНОСТЬ РОСЛА ЧИСЛОМ ДЫРОК НАУГАД (38→56) — ровно та ось, на которой уже
 *     сломался обычный судоку («с 30 по 34 сложность не меняется», репорт Вали).
 *   • ЛЕСТНИЦА ТЕХНИК КОНЧАЛАСЬ НА ЧЕТВЁРТОЙ СТУПЕНИ, а уровней тридцать: с 22-го
 *     расти было некуда. Внутри ступени уровни отличались только долей захода в
 *     дочернюю — то есть длиной одной и той же работы, а не её содержанием.
 *   • ОТМЕНЫ ХОДА НЕ БЫЛО ВООБЩЕ (`useMoveHistory` не встречался в экране ни разу) —
 *     в самой длинной партии приложения. И незаконченная партия не сохранялась.
 *
 * Ни одну из этих поломок нельзя увидеть глазами за разумное время: непроходимость
 * вскрывается через час игры, неединственность — когда «правильная» цифра вдруг
 * краснеет, а «уровень 20 не отличается от 14» — только если сыграть оба. Поэтому гейт.
 *
 * ⚠️ ЧЕМ ПРОВЕРЯЕМ. Широкий прогон идёт быстрым решателем самого движка — тем же,
 * которым генератор копает дырки. Чтобы это не было «код проверяет сам себя», узкий
 * срез перепроверен ЧУЖИМИ реализациями: countSolutions из ядра судоку и gradePuzzle
 * из градатора. Разъедутся — гейт покраснеет.
 *
 * ═══ ЦЕНА ГЕЙТА: БЫСТРЫЙ ПРОГОН ПО УМОЛЧАНИЮ ═══
 *
 * Требование «50 раскладов на уровень» на шести уровнях держало прогон на 22–55 с, и
 * это в одиночку решало время сборки. Гейт, который идут ждать полминуты, перестают
 * запускать перед коммитом — он превращается в украшение (ровно тот же вывод сделан
 * по самураю: 197 с → 6.8 с, полнота под SAMURAI_FULL=1).
 *
 * Поэтому по умолчанию берём пять уровней по шесть раскладов, а полный набор — по
 * требованию:
 *
 *     FRACTAL_FULL=1 npx jest src/__tests__/fractal-sudoku-solvable.test.ts
 *
 * Быстрый набор выбран НЕ «поменьше», а так, чтобы он ловил ВСЕ поломки, ради которых
 * гейт написан: первая ступень (уровень 1), оба конца ступени, которая КОПАЕТСЯ
 * (11 и 15), и оба конца ступени, которая берётся ЗАГОТОВКАМИ (26 и 30). Обе оси
 * сложности — и ступень техники, и число сеток, требующих верхней техники, — на этом
 * наборе видны целиком. Мутационная проверка гонялась именно на быстром наборе.
 */
import {
  N, FEED_CELL, generateFractal, flatten, countSolutionsFast, logicSolve, solveFast,
  rootEditable, rootSolved, rootUnreachableCells, isUnlocked, solvedCount,
  logicSolveCalls, resetLogicSolveCalls,
  SEED_PUZZLES, transformSeed, FRACTAL_TIERS, SEED_RECALL, resetSeedRecall,
  startPlayState, playDigit, revertMove, givenOf,
  type FractalPuzzle, type FractalPlayState,
} from '@/src/services/fractal-sudoku';
import {
  fractalLevel, fractalTier, fractalChildTiers, FRACTAL_MAX_LEVEL, FRACTAL_CHILDREN,
} from '@/src/services/fractalLevels';
import { makeRng } from '@/src/services/seed';
import { countSolutions } from '@/src/services/sudoku-core';
import { gradePuzzle } from '@/src/services/sudoku-grade';

declare const __dirname: string;
declare function require(m: string): any;
declare const process: { env: Record<string, string | undefined> };
const { readFileSync } = require('fs');
const { join } = require('path');

const FULL = process.env.FRACTAL_FULL === '1';

/** Полный набор — оба конца каждой из шести ступеней: там и меняется содержание уровня. */
const FULL_LEVELS = [1, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26, 30];
/** Быстрый — первая ступень плюс оба конца копаемой (3) и заготовочной (6) ступеней. */
const FAST_LEVELS = [1, 11, 15, 26, 30];

const LEVELS = FULL ? FULL_LEVELS : FAST_LEVELS;
const PER_LEVEL = FULL ? 50 : 6;
const CROSS_LEVELS = FULL ? [1, 10, 20, 30] : [1, 30];
const COST_RUNS = FULL ? 5 : 3;
const SEEDS_CHECKED = FULL ? 999 : 8;   // сколько заготовок каждой ступени проверять поимённо

/**
 * Ровный срез по ВСЕЙ библиотеке, а не её голова.
 *
 * ⚠️ ЗАЧЕМ. Быстрый прогон проверяет восемь заготовок на ступень, и пока это были
 * `slice(0, 8)`, он смотрел ровно на восемь самых старых — то есть на те, что и так
 * лежали проверенными. Библиотека выросла с 28 до 64 досок на ступень, и весь прирост
 * оказался бы вне быстрого прогона: сломанная заготовка №40 краснела бы только под
 * FRACTAL_FULL=1. Индексы возвращаем настоящие, чтобы в тексте ошибки был номер доски.
 */
function spread<T>(arr: readonly T[], n: number): [number, T][] {
  if (arr.length <= n) return arr.map((v, i) => [i, v] as [number, T]);
  return Array.from({ length: n }, (_, k) => {
    const i = Math.round((k * (arr.length - 1)) / (n - 1));
    return [i, arr[i]] as [number, T];
  });
}

const CTX = { N: 9, BR: 3, BC: 3, variant: 'none' as const };

/**
 * ⚠️ ВСЕ ДОСКИ ГЕЙТА — ПО СИДУ, И ЭТО НЕ ПЕРЕСТРАХОВКА.
 *
 * Половина здешних проверок статистическая: «на конце ступени верхняя техника нужна
 * большинству сеток», «внутри ступени доля растёт». Со случайными досками такой гейт
 * краснеет через раз, а гейт, который краснеет через раз, ХУЖЕ ОТСУТСТВУЮЩЕГО: его
 * перестают читать и начинают перезапускать «до зелёного».
 *
 * Сид не сводит выборку к одной доске: он разный на каждый расклад (`уровень#номер`),
 * то есть досок по-прежнему шесть на уровень (пятьдесят в полном прогоне) — просто
 * ОДНИ И ТЕ ЖЕ от прогона к прогону. Заодно это проверяет и сам сидированный путь:
 * им же собираются доски мега-боссов по сиду (см. seed.test.ts).
 */
const boardSeed = (level: number, n: number) => `гейт-фрактал-${level}-${n}`;
const houseSolutions = (b: number[][]) =>
  countSolutions(b.map((r) => [...r]), 9, 3, 3, 'none', undefined, 2, { steps: 500000 });

/**
 * Доиграть партию до конца ровно теми правилами, которыми играет экран: дочернюю
 * добиваем верными цифрами до её порога → она отдаёт свой центр наверх; в корне
 * человек заполняет всё, что движок считает его клетками.
 *
 * ⚠️ Ходим через playDigit — ту же функцию, что зовёт экран. Гейт, который повторяет
 * правило своей копией, зелен вслепую.
 */
function playToWin(f: FractalPuzzle): string | null {
  let st: FractalPlayState = startPlayState(f);

  for (const [i, ch] of f.children.entries()) {
    const given = givenOf(ch.puzzle);
    const done = () => st.children[i].done;
    for (let r = 0; r < N && !done(); r++) {
      for (let c = 0; c < N && !done(); c++) {
        if (given[r][c]) continue;
        const res = playDigit(st, f, { child: i, r, c }, ch.solution[r][c]);
        if (res) st = res.next;
      }
    }
    if (!done()) return `дочерняя ${i}: порог ${ch.unlockCells} не берётся, дырок всего ${ch.blanks}`;
    const [rr, rc] = ch.feedsCell;
    if (st.rootGrid[rr][rc] !== ch.solution[FEED_CELL[0]][FEED_CELL[1]]) {
      return `дочерняя ${i}: открылась, но цифра наверх не ушла`;
    }
  }

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!rootEditable(f.root.puzzle, r, c)) continue;
      const res = playDigit(st, f, { child: null, r, c }, f.root.solution[r][c]);
      if (res) st = res.next;
    }
  }
  if (!rootSolved(st.rootGrid, f.root.solution)) {
    const left = st.rootGrid.flat().filter((v, k) => v !== f.root.solution[(k / N) | 0][k % N]).length;
    return `корень не сошёлся: ${left} клеток некому заполнить`;
  }
  return null;
}

/** Доля сеток уровня, которым верхняя техника ступени действительно понадобилась. */
const topShare = new Map<number, number>();

describe(`каждый уровень доигрывается до победы, и решение одно (${FULL ? 'полный' : 'быстрый'} прогон)`, () => {
  it(`уровни ${LEVELS.join(', ')} по ${PER_LEVEL} раскладов`, () => {
    const bad: string[] = [];
    const seen: string[] = [];

    for (const level of LEVELS) {
      const cfg = fractalLevel(level);
      const wanted = fractalChildTiers(level);
      let top = 0, all = 0;

      for (let n = 0; n < PER_LEVEL; n++) {
        const f = generateFractal(level, boardSeed(level, n));
        const tag = `L${level}#${n}`;

        // 1. Партия доигрывается. Прямой регресс на «0 побед из 30».
        const fail = playToWin(f);
        if (fail) bad.push(`${tag}: ${fail}`);

        // 2. В корне нет клеток, которые не заполнит никто.
        const dead = rootUnreachableCells(f.root.puzzle);
        if (dead.length) bad.push(`${tag}: в корне ${dead.length} мёртвых клеток`);

        // 3. Дочерние: одно решение, берётся логикой, не сложнее обещанного уровнем.
        for (const [i, ch] of f.children.entries()) {
          const sols = countSolutionsFast(flatten(ch.puzzle), 2);
          if (sols !== 1) bad.push(`${tag} дочерняя ${i}: решений ${sols}`);
          const g = logicSolve(flatten(ch.puzzle), cfg.tier);
          if (!g.solved) bad.push(`${tag} дочерняя ${i}: логикой уровня не берётся, только перебором`);
          if (ch.tier > cfg.tier) bad.push(`${tag} дочерняя ${i}: техника ${ch.tier} выше обещанной ${cfg.tier}`);
          if (ch.unlockCells > ch.blanks || ch.unlockCells < 1) {
            bad.push(`${tag} дочерняя ${i}: порог ${ch.unlockCells} при ${ch.blanks} дырках`);
          }
          all++;
          if (ch.tier === cfg.tier) top++;
        }
        // Ни одна сетка не может быть сложнее самой сложной заказанной уровнем.
        const cap = Math.max(...wanted);
        for (const [i, ch] of f.children.entries()) {
          if (ch.tier > cap) bad.push(`${tag} дочерняя ${i}: техника ${ch.tier} выше заказанной ${cap}`);
        }

        // 4. Корень с девятью цифрами снизу — ровно одно решение (иначе подсказка врёт).
        const withFeeds = f.root.puzzle.map((r) => [...r]);
        for (const ch of f.children) {
          const [rr, rc] = ch.feedsCell;
          withFeeds[rr][rc] = ch.solution[FEED_CELL[0]][FEED_CELL[1]];
        }
        const rootSols = countSolutionsFast(flatten(withFeeds), 2);
        if (rootSols !== 1) bad.push(`${tag} корень с цифрами снизу: решений ${rootSols}`);

        // 5. …а БЕЗ них — неоднозначен. Иначе девять дочерних декорация: корень
        //    закрывался бы напрямую, и вся вложенность оказалась бы ни при чём.
        if (countSolutionsFast(flatten(f.root.puzzle), 2) < 2) {
          bad.push(`${tag}: корень решается без дочерних`);
        }
        if (!f.root.needsChildren) bad.push(`${tag}: движок сам признал корень независимым от дочерних`);
      }

      topShare.set(level, top / all);
      seen.push(`L${level} (ступень ${cfg.tier}, заказано ${cfg.topTierCount}/9): верхняя техника нужна ${(100 * top / all).toFixed(0)}% сеток`);
    }

    console.log('ступени —', seen.join('; '));
    expect(bad.slice(0, 12)).toEqual([]);
    expect(bad).toEqual([]);
  }, 900000);

  /**
   * 🔴 ПЕРВАЯ ОСЬ. На ступенях выше первой верхняя техника обязана реально требоваться
   * заметной доле сеток на КОНЦЕ ступени — иначе «уровень 15» отличается от «уровня 10»
   * только надписью.
   */
  it('на конце ступени верхняя техника нужна большинству сеток', () => {
    const lazy: string[] = [];
    for (const level of LEVELS) {
      const cfg = fractalLevel(level);
      if (cfg.tier === 1 || cfg.topTierCount < 9) continue;   // это конец ступени
      const share = topShare.get(level) ?? 0;
      if (share < 0.5) lazy.push(`уровень ${level}: верхняя техника нужна лишь в ${(100 * share).toFixed(0)}% сеток`);
    }
    expect(lazy).toEqual([]);
  });

  /**
   * 🔴 ВТОРАЯ ОСЬ — та, из-за которой уровни 14–21 были одной задачей. Внутри одной
   * ступени начало и конец обязаны отличаться ЧИСЛОМ сеток, требующих верхней техники,
   * а не только долей захода в дочернюю.
   *
   * Проверяем ЗАМЕРЕННУЮ долю, а не таблицу: таблица проверена отдельно (в
   * fractal-sudoku.test.ts), а здесь важно, что генератор её читает.
   */
  it('внутри ступени доля сеток с верхней техникой реально растёт', () => {
    const bad: string[] = [];
    const byStep = new Map<number, number[]>();
    for (const level of LEVELS) {
      const t = fractalTier(level);
      if (t === 1) continue;
      byStep.set(t, [...(byStep.get(t) ?? []), level]);
    }
    let checked = 0;
    for (const [step, levels] of byStep) {
      if (levels.length < 2) continue;
      const lo = Math.min(...levels), hi = Math.max(...levels);
      const a = topShare.get(lo) ?? 0, b = topShare.get(hi) ?? 0;
      checked++;
      if (a > 0.4) bad.push(`ступень ${step}: уже на уровне ${lo} верхняя техника нужна ${(100 * a).toFixed(0)}% сеток — ось схлопнута вверх`);
      if (b - a < 0.3) bad.push(`ступень ${step}: с уровня ${lo} по ${hi} доля выросла с ${(100 * a).toFixed(0)}% до ${(100 * b).toFixed(0)}% — это не рост`);
    }
    // Без этого гейт зелен вслепую: если в наборе нет ни одной пары «начало—конец
    // ступени», сравнивать было не с чем.
    expect(`пар начало—конец: ${checked}`).toBe(`пар начало—конец: ${FULL ? 5 : 2}`);
    expect(bad).toEqual([]);
  });
});

/**
 * ЗАГОТОВКИ ВЕРХНИХ СТУПЕНЕЙ.
 *
 * Скрытая пара и X-wing вслепую не выкапываются (замер: 0.5% досок), поэтому они лежат
 * готовыми и раздаются через автоморфизмы. Если хоть одна заготовка неверна или
 * преобразование ломает доску, вся верхняя треть игры превращается в мусор — а на
 * экране это выглядит как «правильная цифра краснеет».
 */
describe('библиотека заготовок и её преобразование', () => {
  it('в библиотеке есть обе верхние ступени, и она не пуста', () => {
    for (const tier of [FRACTAL_TIERS.hiddenSubset, FRACTAL_TIERS.xWing]) {
      expect(`ступень ${tier}: ${(SEED_PUZZLES[tier] ?? []).length >= 8}`).toBe(`ступень ${tier}: true`);
    }
  });

  /**
   * ⚠️ СВОИМ РЕШАТЕЛЕМ — ВСЮ БИБЛИОТЕКУ, ЧУЖИМ — СРЕЗ, И ЭТО НЕ ЭКОНОМИЯ НА ГЛАВНОМ.
   *
   * logicSolve стоит 0.03–0.3 мс, gradePuzzle — 10–27 мс: разница в сто раз, и именно
   * она когда-то заставила проверять заготовки выборочно. Но выборка — дыра: подложенную
   * в середину списка фальшивку (доску пятой ступени в списке шестой) быстрый прогон
   * пропускал, потому что смотрел мимо неё. Поймано ИСПОЛНЕНИЕМ 20.08: поломка №5
   * встала на позицию 45, и гейт остался зелёным.
   *
   * Поэтому дёшево — по КАЖДОЙ доске без исключений, дорого — по ровному срезу.
   */
  it('каждая заготовка требует СВОЕЙ техники и решается единственным образом', () => {
    const bad: string[] = [];
    for (const tier of [FRACTAL_TIERS.hiddenSubset, FRACTAL_TIERS.xWing]) {
      const foreign = new Set(spread(SEED_PUZZLES[tier], SEEDS_CHECKED).map(([n]) => n));
      for (const [n, s] of SEED_PUZZLES[tier].entries()) {
        const flat = Int8Array.from(Array.from(s).map((ch) => (ch === '.' ? 0 : Number(ch))));
        const board = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => flat[r * 9 + c]));
        if (s.length !== 81) bad.push(`t${tier}#${n}: длина строки ${s.length}`);
        if (flat[FEED_CELL[0] * 9 + FEED_CELL[1]] !== 0) bad.push(`t${tier}#${n}: кормящая клетка не выколота`);
        if (countSolutionsFast(flat, 2) !== 1) bad.push(`t${tier}#${n}: решений не одно`);
        const mine = logicSolve(flat, tier);
        if (!mine.solved || mine.tier !== tier) bad.push(`t${tier}#${n}: свой решатель solved=${mine.solved} tier=${mine.tier}`);
        // 🔴 ГЛАВНОЕ: без верхней техники доска НЕ берётся. Иначе «ступень» декоративна.
        if (logicSolve(flat, tier - 1).solved) bad.push(`t${tier}#${n}: берётся и БЕЗ верхней техники`);
        // и то же самое — ЧУЖИМ решателем, но по срезу: он в сто раз дороже
        if (!foreign.has(n)) continue;
        const g = gradePuzzle(board, CTX, tier);
        if (!g.solved || g.tier !== tier) bad.push(`t${tier}#${n}: градатор solved=${g.solved} tier=${g.tier}`);
        if (gradePuzzle(board, CTX, tier - 1).solved) bad.push(`t${tier}#${n}: градатор взял БЕЗ верхней техники`);
      }
    }
    expect(bad).toEqual([]);
  }, 900000);

  it('преобразование сохраняет и технику, и единственность, и ставит нужный центр', () => {
    const bad: string[] = [];
    const rnd = makeRng('гейт-преобразование');
    for (const tier of [FRACTAL_TIERS.hiddenSubset, FRACTAL_TIERS.xWing]) {
      for (const [n, s] of spread(SEED_PUZZLES[tier], FULL ? 999 : 4)) {
        for (const center of FULL ? [1, 4, 7, 9] : [3, 8]) {
          const { puzzle, solution } = transformSeed(s, center, rnd);
          const board = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => puzzle[r * 9 + c]));
          if (solution[FEED_CELL[0] * 9 + FEED_CELL[1]] !== center) {
            bad.push(`t${tier}#${n}→${center}: центр решения ${solution[FEED_CELL[0] * 9 + FEED_CELL[1]]}`);
          }
          if (puzzle[FEED_CELL[0] * 9 + FEED_CELL[1]] !== 0) bad.push(`t${tier}#${n}→${center}: центр не выколот`);
          const mine = logicSolve(puzzle, tier);
          if (!mine.solved || mine.tier !== tier) bad.push(`t${tier}#${n}→${center}: техника уехала на ${mine.tier}`);
          if (logicSolve(puzzle, tier - 1).solved) bad.push(`t${tier}#${n}→${center}: после преобразования берётся без верхней техники`);
          if (houseSolutions(board) !== 1) bad.push(`t${tier}#${n}→${center}: ядро насчитало не одно решение`);
          // задание обязано совпадать со своим решением
          for (let i = 0; i < 81; i++) if (puzzle[i] && puzzle[i] !== solution[i]) { bad.push(`t${tier}#${n}→${center}: подсказка ≠ решение`); break; }
        }
      }
    }
    expect(bad).toEqual([]);
  }, 900000);

  it('одна заготовка даёт РАЗНЫЕ доски — иначе девять сеток были бы близнецами', () => {
    // Если преобразование выродится в тождественное, все дочерние верхних уровней
    // окажутся одной и той же доской, просто перекрашенной. На глаз это ловится сразу,
    // а в коде — только здесь.
    const rnd = makeRng('гейт-разнообразие');
    const seed = SEED_PUZZLES[FRACTAL_TIERS.xWing][0];
    const views = new Set<string>();
    for (let k = 0; k < 20; k++) views.add(Array.from(transformSeed(seed, 5, rnd).puzzle).join(''));
    expect(`разных видов из 20: ${views.size >= 18}`).toBe('разных видов из 20: true');
    // и все они — та же задача по существу
    expect(views.has(seed.replace(/\./g, '0'))).toBe(false);
  });
});

/**
 * РАЗДАЧА ЗАГОТОВОК: ЧЕЛОВЕК НЕ ДОЛЖЕН РЕШАТЬ ОДНУ И ТУ ЖЕ ДОСКУ ДВАЖДЫ.
 *
 * ⚠️ ЗАМЕР 19.08.2026 НА ПРЕЖНЕЙ РАЗДАЧЕ (тычок в библиотеку наугад, 28 заготовок на
 * ступень): отрезок уровней 26–30 — это 45 дочерних сеток, и разных среди них было
 * 30.4 из 45 (40 прогонов). Каждая третья сетка — уже решённая, просто повёрнутая.
 * На одном экране из девяти сеток разными были 8.16.
 *
 * ⚠️ ПОЧЕМУ ЭТО НЕ ЛЕЧИТСЯ ОДНОЙ БИБЛИОТЕКОЙ. 25 случайных тычков в M досок
 * сталкиваются по задаче о днях рождения: шанс обойтись без повтора ≈ exp(−300/M).
 * Чтобы столкновений почти не было, понадобилось бы M в тысячах — это сотни килобайт
 * в бандле ради второго знака. Поэтому библиотека выросла вдвое (28 → 64 на ступень),
 * а повторы убрала ПАМЯТЬ РАЗДАЧИ: недавно выданное из выбора исключается.
 *
 * ⚠️ ГЛАВНОЕ ЗДЕСЬ — «ТА ЖЕ ДОСКА» СЧИТАЕТСЯ ПО ГРУППЕ ПРЕОБРАЗОВАНИЙ, А НЕ ПО СТРОКЕ.
 * transformSeed показывает заготовку перекрашенной и переложенной, поэтому две сетки
 * из одной заготовки в виде строк РАЗНЫЕ — и гейт, сравнивающий строки, был бы зелен
 * при полностью выродившейся раздаче. Сравниваем канонический вид узора дырок.
 */
describe('раздача заготовок не повторяется', () => {
  /**
   * Те же перекладки, что делает transformSeed: полосы местами, строки внутри крайних
   * полос как угодно, в средней меняются 3 и 5 (строка 4 стоит — она кормит корень).
   * 144 на строки × 144 на столбцы × транспонирование = 41472. Повороты и отражения
   * входят целиком: и разворот строк, и разворот столбцов этими картами выразимы.
   *
   * ⚠️ Своя реализация, а не импорт из скрипта-генератора: гейт обязан уметь опознать
   * повтор сам, иначе он проверяет скрипт, а не игру.
   */
  const lineMaps = (): Int8Array[] => {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const out: Int8Array[] = [];
    for (const swapBands of [false, true]) for (const a of perms) for (const b of perms) for (const swapMid of [false, true]) {
      const m = new Int8Array(9);
      for (let k = 0; k < 3; k++) { m[k] = (swapBands ? 6 : 0) + a[k]; m[6 + k] = (swapBands ? 0 : 6) + b[k]; }
      m[3] = swapMid ? 5 : 3; m[4] = 4; m[5] = swapMid ? 3 : 5;
      out.push(m);
    }
    return out;
  };
  const MAPS = lineMaps();

  /** Канонический вид узора дырок: минимальный из 41472. У всей орбиты он один. */
  const canon = (bits: Uint8Array): string => {
    const best = new Uint8Array(81).fill(2);
    const buf = new Uint8Array(81);
    for (const rm of MAPS) for (const cm of MAPS) for (let flip = 0; flip < 2; flip++) {
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        const rr = flip ? cm[c] : rm[r], cc = flip ? rm[r] : cm[c];
        buf[rr * 9 + cc] = bits[r * 9 + c];
      }
      for (let i = 0; i < 81; i++) {
        if (buf[i] === best[i]) continue;
        if (buf[i] < best[i]) best.set(buf);
        break;
      }
    }
    return best.join('');
  };
  const canonOfSeed = (s: string) => canon(Uint8Array.from(Array.from(s, (ch) => (ch === '.' ? 0 : 1))));
  const canonOfBoard = (b: number[][]) => canon(Uint8Array.from(b.flat().map((v) => (v ? 1 : 0))));

  /** Канон → имя заготовки. Заодно ловит, что в самой библиотеке нет повторов. */
  const library = new Map<string, string>();
  const twins: string[] = [];
  for (const tier of [FRACTAL_TIERS.hiddenSubset, FRACTAL_TIERS.xWing]) {
    SEED_PUZZLES[tier].forEach((s, i) => {
      const key = canonOfSeed(s);
      if (library.has(key)) twins.push(`${library.get(key)} и t${tier}#${i} — одна доска, только повёрнутая`);
      else library.set(key, `t${tier}#${i}`);
    });
  }

  /**
   * 🔴 СНАЧАЛА ПРОВЕРЯЕМ САМ ИЗМЕРИТЕЛЬ, ПОТОМ ИМ МЕРЯЕМ.
   *
   * Все проверки ниже стоят на том, что канон опознаёт повёрнутую доску как ту же.
   * Канон, который вернул бы вход как есть, сделал бы их зелёными НАВСЕГДА и на любой
   * раздаче: два вида одной заготовки в виде строк разные. Поэтому измеритель сам
   * проходит проверку — на развороте строк (он в группе) и на заведомо чужой доске.
   */
  it('канон опознаёт поворот как ту же доску, а чужую — как чужую', () => {
    const lib = SEED_PUZZLES[FRACTAL_TIERS.xWing];
    const rows = Array.from({ length: 9 }, (_, r) => lib[0].slice(r * 9, r * 9 + 9));
    const upsideDown = [...rows].reverse().join('');
    const mirrored = rows.map((row) => [...row].reverse().join('')).join('');
    expect(upsideDown).not.toBe(lib[0]);                       // строки правда переехали
    expect(canonOfSeed(upsideDown)).toBe(canonOfSeed(lib[0])); // но доска та же
    expect(canonOfSeed(mirrored)).toBe(canonOfSeed(lib[0]));
    expect(canonOfSeed(lib[1])).not.toBe(canonOfSeed(lib[0])); // а вот это другая доска
  });

  it('в самой библиотеке нет двух заготовок, которые одна и та же доска', () => {
    expect(twins).toEqual([]);
  }, 300000);

  it('библиотеки хватает, чтобы память раздачи не упёрлась в дно', () => {
    // Память держит SEED_RECALL последних, и одновременно в партии раздаётся до девяти.
    // Если запаса нет, свободных не остаётся, срабатывает фолбэк — и повторы вернутся.
    const bad: string[] = [];
    for (const tier of [FRACTAL_TIERS.hiddenSubset, FRACTAL_TIERS.xWing]) {
      const need = SEED_RECALL + FRACTAL_CHILDREN;
      if (SEED_PUZZLES[tier].length < need) bad.push(`ступень ${tier}: заготовок ${SEED_PUZZLES[tier].length}, а нужно ≥ ${need}`);
    }
    expect(bad).toEqual([]);
  });

  it('девять сеток одной партии — девять РАЗНЫХ досок', () => {
    const bad: string[] = [];
    for (const level of [26, 30]) {
      const f = generateFractal(level, boardSeed(level, 900));
      const ids = f.children.map((ch) => library.get(canonOfBoard(ch.puzzle)) ?? 'НЕ ИЗ БИБЛИОТЕКИ');
      if (ids.includes('НЕ ИЗ БИБЛИОТЕКИ')) bad.push(`уровень ${level}: сетка не из библиотеки`);
      if (new Set(ids).size !== FRACTAL_CHILDREN) bad.push(`уровень ${level}: разных досок ${new Set(ids).size} из ${FRACTAL_CHILDREN} — ${ids.join(' ')}`);
    }
    expect(bad).toEqual([]);
  }, 300000);

  it('🔴 на уровнях 26–30 подряд ни одна доска не повторяется', () => {
    // Без сида — ровно так партии собирает экран (sudoku-fractal.tsx: generateFractal(lvl)).
    // Это не статистика: памяти хватает на все 45 сеток отрезка, поэтому 45 из 45 обязаны
    // быть разными В КАЖДОМ прогоне, а не «в среднем».
    resetSeedRecall();
    const ids: string[] = [];
    for (let level = 26; level <= 30; level++) {
      for (const ch of generateFractal(level).children) ids.push(library.get(canonOfBoard(ch.puzzle)) ?? 'НЕ ИЗ БИБЛИОТЕКИ');
    }
    expect(ids).toHaveLength(45);
    expect(ids.filter((k) => k === 'НЕ ИЗ БИБЛИОТЕКИ')).toEqual([]);
    const repeats = ids.filter((k, i) => ids.indexOf(k) !== i);
    expect(`повторов на отрезке 26–30: ${repeats.length} (${repeats.join(' ')})`).toBe('повторов на отрезке 26–30: 0 ()');
  }, 300000);

  it('память раздачи не течёт в сидированный путь: тот же сид — та же партия', () => {
    // Сид обещает «поделился строкой — у друга та же доска». Если бы память влияла на
    // выбор заготовки, партия зависела бы от того, во что человек играл до этого.
    resetSeedRecall();
    const a = generateFractal(30, 'сид-раздачи-1');
    generateFractal(30);            // между ними — обычная партия, она память двигает
    generateFractal(29);
    const b = generateFractal(30, 'сид-раздачи-1');
    expect(b.children.map((c) => c.puzzle)).toEqual(a.children.map((c) => c.puzzle));
  }, 300000);
});

/**
 * ОТМЕНА ХОДА.
 *
 * ⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ, — НЕ КНОПКА, А ОТКАТ. В SET бейдж отсчёта был
 * написан, переведён на 12 языков и покрыт гейтом по разметке — и не показывался ни
 * разу, потому что состояние, от которого зависел показ, нигде не присваивалось.
 * Здесь отмена не «возвращает цифру»: ход, добравший дочернюю до порога, ОТКРЫВАЕТ её
 * и отправляет цифру наверх, в корень. Отмена обязана снять все три вещи разом.
 */
describe('отмена хода действительно откатывает', () => {
  const f = generateFractal(3, boardSeed(3, 500));

  it('обычный ход: клетка возвращается к прежнему значению', () => {
    const st0 = startPlayState(f);
    const ch = f.children[0];
    let r = -1, c = -1;
    outer: for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (ch.puzzle[i][j] === 0) { r = i; c = j; break outer; }
    const res = playDigit(st0, f, { child: 0, r, c }, 5)!;
    expect(res.next.children[0].grid[r][c]).toBe(5);
    const back = revertMove(res.next, f, res.move);
    expect(back.children[0].grid[r][c]).toBe(0);
    // повторный ввод той же цифры хода не создаёт — иначе лента копила бы пустышки,
    // а отмена «не работала» на глаз
    const again = playDigit(res.next, f, { child: 0, r, c }, 5);
    expect(again).toBeNull();
  });

  it('🔴 отмена хода, открывшего дочернюю, закрывает её И убирает цифру из корня', () => {
    const ch = f.children[0];
    const given = givenOf(ch.puzzle);
    let st = startPlayState(f);
    let unlockMove: ReturnType<typeof playDigit> = null;

    outer: for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (given[r][c]) continue;
        const res = playDigit(st, f, { child: 0, r, c }, ch.solution[r][c]);
        if (!res) continue;
        st = res.next;
        if (res.move.unlocked) { unlockMove = res; break outer; }
      }
    }
    expect(unlockMove).not.toBeNull();

    const [rr, rc] = ch.feedsCell;
    const fed = ch.solution[FEED_CELL[0]][FEED_CELL[1]];
    // до отмены: открыта, цифра наверху
    expect(st.children[0].done).toBe(true);
    expect(st.rootGrid[rr][rc]).toBe(fed);

    const back = revertMove(st, f, unlockMove!.move);
    // после отмены: клетка пуста, сетка закрыта, корень снова без этой цифры
    expect(back.children[0].grid[unlockMove!.move.r][unlockMove!.move.c]).toBe(unlockMove!.move.from);
    expect(back.children[0].done).toBe(false);
    expect(back.rootGrid[rr][rc]).toBe(0);
    // и порог снова не взят — то есть откат честный, а не косметический
    expect(isUnlocked(back.children[0].grid, ch.solution, given, ch.unlockCells)).toBe(false);
    expect(solvedCount(back.children[0].grid, ch.solution, given)).toBeLessThan(ch.unlockCells);
  });

  it('вся партия откатывается до исходного состояния — лента не теряет ходов', () => {
    const ch = f.children[1];
    const given = givenOf(ch.puzzle);
    const st0 = startPlayState(f);
    let st = st0;
    const moves: any[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (given[r][c]) continue;
        const res = playDigit(st, f, { child: 1, r, c }, ch.solution[r][c]);
        if (!res) continue;
        st = res.next;
        moves.push(res.move);
      }
    }
    expect(moves.length).toBeGreaterThan(10);
    for (let i = moves.length - 1; i >= 0; i--) st = revertMove(st, f, moves[i]);
    expect(st).toEqual(st0);
  });

  it('чужое отмена не трогает: подсказку задания и кормящую клетку корня не поставить', () => {
    const st = startPlayState(f);
    // подсказка дочерней
    let gr = -1, gc = -1;
    outer: for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (f.children[0].puzzle[r][c] !== 0) { gr = r; gc = c; break outer; }
    expect(playDigit(st, f, { child: 0, r: gr, c: gc }, 1)).toBeNull();
    // кормящая клетка корня — её приносят снизу, руками не заполнить
    const [fr, fc] = f.children[0].feedsCell;
    expect(playDigit(st, f, { child: null, r: fr, c: fc }, 1)).toBeNull();
  });
});

describe('сверка чужими реализациями — чтобы движок не судил сам себя', () => {
  it('countSolutions ядра и gradePuzzle градатора согласны с быстрым решателем', () => {
    const bad: string[] = [];
    for (const level of CROSS_LEVELS) {
      const cap = Math.max(...fractalChildTiers(level));
      for (let n = 0; n < 3; n++) {
        const f = generateFractal(level, boardSeed(level, 900 + n));
        for (const [i, ch] of f.children.entries()) {
          const mine = countSolutionsFast(flatten(ch.puzzle), 2);
          const house = houseSolutions(ch.puzzle);
          if (mine !== house) bad.push(`L${level}#${n} дочерняя ${i}: свой решатель ${mine}, ядро ${house}`);
          if (house !== 1) bad.push(`L${level}#${n} дочерняя ${i}: ядро насчитало ${house} решений`);
          const g = gradePuzzle(ch.puzzle, CTX, cap);
          if (!g.solved) bad.push(`L${level}#${n} дочерняя ${i}: градатор не решил логикой в пределах ступени ${cap}`);
          // Градатор доводит доску до конца — она обязана совпасть с эталоном.
          if (g.grid && g.grid.some((row, r) => row.some((v, c) => v !== ch.solution[r][c]))) {
            bad.push(`L${level}#${n} дочерняя ${i}: градатор решил ЧУЖУЮ доску`);
          }
          // и обе лестницы обязаны назвать ОДНУ И ТУ ЖЕ ступень
          if (g.solved && g.tier !== ch.tier) {
            bad.push(`L${level}#${n} дочерняя ${i}: ступень своя ${ch.tier}, градатор ${g.tier}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  }, 900000);

  it('быстрый решатель совпадает с ядром и на заведомо неоднозначных досках', () => {
    // ⚠️ САМАЯ ОПАСНАЯ ВЕТКА — «решений несколько». Совпадение только на единственных
    // решениях не доказывает ничего: решатель, который ВСЕГДА отвечает «одно», прошёл бы
    // такую сверку целиком. Поэтому здесь задание ломают снятием настоящих подсказок
    // (не пустых клеток — их в задании и так большинство) и требуют одинакового ответа
    // от обеих реализаций именно там, где решений стало много.
    const bad: string[] = [];
    let ambiguous = 0;
    const f = generateFractal(10, boardSeed(10, 700));
    for (const [i, ch] of f.children.entries()) {
      const clues: [number, number][] = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (ch.puzzle[r][c] !== 0) clues.push([r, c]);
      for (let k = 1; k <= 4; k++) {
        const holed = ch.puzzle.map((r) => [...r]);
        for (let j = 0; j < k; j++) holed[clues[j][0]][clues[j][1]] = 0;
        const mine = countSolutionsFast(flatten(holed), 2);
        const house = houseSolutions(holed);
        if (mine !== house) bad.push(`дочерняя ${i} −${k}: свой решатель ${mine}, ядро ${house}`);
        if (mine >= 2) ambiguous++;
      }
    }
    expect(bad).toEqual([]);
    // Без этого гейт был бы зелен вслепую: если снятие подсказок ничего не размножило,
    // сверять на «много решений» было не на чем.
    expect(ambiguous).toBeGreaterThanOrEqual(9);
  }, 300000);

  it('solveFast достраивает доску, а не отдаёт что попало', () => {
    // На нём стоит вся раздача заготовок: решение восстанавливается им, и ошибка здесь
    // означала бы, что «эталон» дочерней не имеет отношения к её заданию.
    const f = generateFractal(1, boardSeed(1, 600));
    for (const ch of f.children) {
      const done = solveFast(flatten(ch.puzzle));
      expect(done).not.toBeNull();
      const same = Array.from(done!).every((v, i) => v === ch.solution[(i / 9) | 0][i % 9]);
      expect(same).toBe(true);
    }
    // противоречивая доска — null, а не «решение»
    const broken = new Int8Array(81);
    broken[0] = 5; broken[1] = 5;
    expect(solveFast(broken)).toBeNull();
  }, 300000);
});

describe('экран действительно даёт закрыть корень, откатить ход и продолжить партию', () => {
  const src: string = readFileSync(join(__dirname, '../../app/games/sudoku-fractal.tsx'), 'utf8');

  it('в корне есть ввод: выбор клетки, клавиатура и победа по движку', () => {
    // Именно отсутствие этих трёх вещей и делало игру непроходимой: корень был
    // картинкой. Гейт держит их вместе — клавиатура без правила редактируемости
    // позволила бы вписать цифру в клетку, которую обязаны принести дочерние.
    expect(src).toContain('placeRootDigit');
    expect(src).toContain('renderPad(placeRootDigit)');
    expect(src).toContain('rootEditable');
    expect(src).toContain('rootSolved');
  });

  it('порог открытия берётся у самой сетки, а не из таблицы уровней', () => {
    // Число дырок теперь задаёт логика, и общий на всех порог мог бы оказаться выше
    // числа дырок конкретной сетки — она не открылась бы никогда.
    expect(src).toContain('unlockCells');
    expect(src).not.toMatch(/cfg\.unlockCells/);
  });

  it('отмена хода подключена — и лента ходов реально наполняется', () => {
    expect(src).toContain('useMoveHistory');
    expect(src).toMatch(/hist\.undo\(\)/);
    expect(src).toMatch(/revertMove\(/);
    expect(src).toMatch(/onPress=\{handleUndo\}/);
    // ⚠️ Кнопка живёт от hist.canUndo. Если в ленту никто не кладёт ходы, она вечно
    // серая — ровно та поломка, что была у бейджа отсчёта в SET: разметка есть,
    // перевод есть, а состояние никто не присваивает.
    expect(src).toMatch(/hist\.push\(/);
    expect(src).toContain('hist.canUndo');
    // и правило отката живёт в движке, а не в экране своей копией
    expect(src).not.toMatch(/done\s*=\s*false/);
  });

  it('размер клетки считается от ширины, которой можно верить на первом кадре', () => {
    // ⚠️ Ловушка, сработавшая в проекте трижды за один день: голый useWindowDimensions
    // в веб-сборке (а Android у нас WebView) на первом кадре отдаёт 0 и обновляется
    // только по resize, которого при загрузке не бывает. Здесь от ширины считается
    // размер клетки: min(34, floor((min(0,520) − 48) / 9)) = −6, и доска запекается
    // в клетки отрицательного размера до поворота экрана — то есть насовсем.
    expect(src).toContain('useScreenWidth');
    // Ищем ВЫЗОВ, а не упоминание: имя стоит и в пояснении, почему голый хук нельзя
    // пускать в размеры, — гейт, ловящий слово, покраснел бы на собственном комментарии.
    expect(src).not.toMatch(/useWindowDimensions\s*\(/);
  });

  it('незаконченная партия сохраняется, поднимается и выбрасывается доигранной', () => {
    expect(src).toContain('saveResume');
    expect(src).toContain('loadResume');
    expect(src).toContain('clearResume');
    expect(src).toMatch(/RESUME_V\s*=\s*\d+/);
    // экран обязан честно обещать продолжение, а не пугать «всё пропадёт»
    expect(src).toContain('resumable');
    expect(src).toContain('onSaveBeforeExit');
  });
});

describe('генерация не вешает экран', () => {
  /**
   * ⚠️ МЕРИМ РАБОТУ, А НЕ ЧАСЫ. Здесь стояло «партия собирается быстрее полусекунды», и
   * 19.08 на общем прогоне это покраснело: на машине шли три тяжёлых набора разом (load
   * average 73), и та же партия тридцатого уровня заняла 1016 мс вместо 143 на свободной.
   * Часы в параллельном прогоне меряют ЗАГРУЗКУ МАШИНЫ, а не код — и гейт начинает врать
   * про регресс, которого нет. Та же ошибка, от которой лечили самурая: там генератор
   * обрывал выкалывание по gameNow(), и сложность зависела от быстродействия телефона.
   *
   * Прогон логического решателя — единица работы генератора: копание зовёт его на каждое
   * пробное снятие клетки. Потолки по построению: девять дочерних × заходы × 82 прогона
   * плюс корень (2 × 82) плюс страховочный проход. Заходов десять там, где уровень
   * заказывает третью ступень и выше, — отсюда рост потолка к двадцатому уровню.
   *
   * ⚠️ И РОВНО ЗДЕСЬ ВИДНО, ЗАЧЕМ ЗАГОТОВКИ: на тридцатом уровне работы стало МЕНЬШЕ, чем
   * на первом (заготовку не надо выкапывать), хотя доска там самая трудная за игру.
   */
  it('партия стоит ограниченного числа прогонов решателя', () => {
    const over: string[] = [];
    const seen: string[] = [];
    for (const [level, cap] of [[1, 900], [15, 4600], [20, 7800], [FRACTAL_MAX_LEVEL, 400]] as [number, number][]) {
      let worst = 0;
      for (let i = 0; i < COST_RUNS; i++) {
        resetLogicSolveCalls();
        const t = Date.now();
        generateFractal(level, boardSeed(level, 100 + i));
        const ms = Date.now() - t;
        const calls = logicSolveCalls();
        if (calls > worst) worst = calls;
        if (i === 0) seen.push(`L${level}: ${calls} прогонов, ${ms} мс`);
      }
      if (worst > cap) over.push(`уровень ${level}: ${worst} прогонов при потолке ${cap}`);
    }
    // Миллисекунды печатаем для человека, но НЕ утверждаем: см. шапку блока.
    console.log('стоимость партии —', seen.join('; '));
    expect(over).toEqual([]);
  }, 900000);

  it('счётчик работы живой — иначе потолок сторожит ноль', () => {
    // Гейт выше зелен вслепую, если счётчик всегда отдаёт ноль.
    resetLogicSolveCalls();
    expect(logicSolveCalls()).toBe(0);
    generateFractal(1, boardSeed(1, 400));
    expect(logicSolveCalls()).toBeGreaterThan(100);
  }, 300000);
});
