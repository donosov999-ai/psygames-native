/**
 * ГЕОМЕТРИЯ ВАРИАНТА ВЫВОДИТСЯ ИЗ РЕШЕНИЯ, А НЕ ИЩЕТСЯ ПОД НЕЁ РЕШЕНИЕ.
 *
 * Зачем гейт. До 23.08.2026 `generatePuzzle` рисовал термометр, стрелку и разбиение
 * джигсо ВСЛЕПУЮ и до шестидесяти раз искал сетку, которая под них подойдёт («~90%
 * раскладок нерешаемы» стояло в комментарии к джигсо). Замер: одна укладка термометра
 * 2 443–5 432 мс, сборка доски L45 — 9 908 мс, худшее по лестнице 13 670 мс.
 * Обращённый порядок стоит 0,078 мс на том же шаге, потому что проверять нечего:
 * фигура согласована с решением ПО ПОСТРОЕНИЮ.
 *
 * ⚠️ ЧТО ИМЕННО СТОРОЖИМ. Не время (оно железозависимо) и не текст исходника, а
 * СВОЙСТВА выданной доски:
 *   · решение удовлетворяет своей же геометрии в каждой клетке — иначе доска
 *     нерешаема, а раньше это ловилось дорогим перебором;
 *   · геометрия вообще есть — прежний путь при неудаче молча отдавал `undefined`
 *     и доска превращалась в классику с чужой подписью;
 *   · разбиение джигсо: девять СВЯЗНЫХ областей по девять клеток, внутри каждой
 *     девять РАЗНЫХ цифр, и форма достаточно разошлась с блоками — разбиение,
 *     совпавшее с блоками, это обычное судоку под именем джигсо;
 *   · сэндвич копается ГЛУБЖЕ классического лимита 58 — именно исключение
 *     `variant === 'sandwich'` держало уровни 38–41 на четвёртой ступени при цели 5–6
 *     (замер: ступень 4 восемнадцать раз из восемнадцати, потолок при любом бюджете).
 *
 * Проверки ведут СВОЙ разбор (связность — свой обход, цифры — свои множества),
 * из модуля берутся только сами доски.
 */
import {
  Cell, solve, isValid, generatePuzzle, levelConfig,
  thermoFromSolution, arrowFromSolution, regionsFromSolution,
} from '@/src/services/sudoku-core';
import { logicalBuilder } from '@/src/services/sudoku-grade';

const N = 9, BR = 3, BC = 3;
const ORTHO4: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** Сколько раз пробуем построить карту областей и сколько удач требуем — см. пояснение у порога. */
const TRIES = 40;
const FLOOR = 34;

function freshSolution(): Cell[][] {
  const sol: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
  solve(sol, N, BR, BC, 'none');
  return sol;
}

/** Связна ли группа клеток по стороне — свой обход, не из модуля. */
function connected(cells: [number, number][]): boolean {
  const key = (r: number, c: number) => r * N + c;
  const set = new Set(cells.map(([r, c]) => key(r, c)));
  const seen = new Set([key(cells[0][0], cells[0][1])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [r, c] = stack.pop() as [number, number];
    for (const [dr, dc] of ORTHO4) {
      const nr = r + dr, nc = c + dc, k = key(nr, nc);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([nr, nc]); }
    }
  }
  return seen.size === cells.length;
}

describe('геометрия варианта выводится из решения', () => {
  it('🔴 термометр: цифры вдоль каждой цепочки строго растут в САМОМ решении', () => {
    let chains = 0;
    for (let i = 0; i < 12; i++) {
      const sol = freshSolution();
      const pn = thermoFromSolution(sol, N);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = pn[r][c];
        if (!cell) continue;
        if (cell.prev) {
          const [pr, pc] = cell.prev;
          expect(sol[pr][pc]).toBeLessThan(sol[r][c]);
        }
        if (!cell.prev) chains++;
      }
    }
    expect(chains).toBeGreaterThanOrEqual(12);   // хотя бы по цепочке на доску
  });

  it('🔴 стрелка: сумма хвоста в решении равна цифре кружка', () => {
    let groups = 0;
    for (let i = 0; i < 12; i++) {
      const sol = freshSolution();
      const map = arrowFromSolution(sol, N);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = map[r][c];
        if (!cell || !cell.isCircle) continue;
        groups++;
        const sum = cell.arrows.reduce((a, [ar, ac]) => a + sol[ar][ac], 0);
        expect(sum).toBe(sol[r][c]);
        expect(cell.arrows.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(groups).toBeGreaterThanOrEqual(12);
  });

  it('🔴 джигсо: девять связных областей по девять клеток, цифры внутри разные', () => {
    let built = 0;
    for (let i = 0; i < TRIES; i++) {
      const sol = freshSolution();
      const reg = regionsFromSolution(sol, N);
      if (!reg) continue;   // отказ допустим — вызывающий уходит на запасной путь
      built++;
      const byId = new Map<number, [number, number][]>();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const id = reg[r][c];
        expect(id).toBeGreaterThanOrEqual(0);
        if (!byId.has(id)) byId.set(id, []);
        (byId.get(id) as [number, number][]).push([r, c]);
      }
      expect(byId.size).toBe(N);
      for (const [, cells] of byId) {
        expect(cells.length).toBe(N);
        expect(new Set(cells.map(([r, c]) => sol[r][c])).size).toBe(N);
        expect(connected(cells)).toBe(true);
      }
    }
    /**
     * 🔴 ПОРОГ ПОСТАВЛЕН ЗАМЕРОМ, А НЕ НА ГЛАЗ (09.09.2026).
     *
     * Было: 12 попыток, порог «удалось ≥ 10». 09.09 он дал 9 и уронил полный прогон,
     * хотя генератор был исправен. Замер частоты отказов на 600 попытках: отказов 16,
     * то есть 2,7%. При такой частоте набор из 12 недобирает до десяти в 0,5% случаев
     * (замер: 2 набора из 400) — то есть примерно каждый двухсотый прогон краснел ни
     * за что, и виноватого в нём было не найти.
     *
     * Стало: 40 попыток, порог 34 (85%). При замеренных 2,7% отказов недобор до 34
     * практически невозможен, а настоящую поломку — рост отказов выше ~15% — проба
     * по-прежнему видит. Утверждение то же самое: отказ редок. Изменился способ его
     * проверять: доля на большой выборке вместо счёта на дюжине.
     */
    expect(`удалось ${built} из ${TRIES} при пороге ${FLOOR}`)
      .toBe(`удалось ${Math.max(built, FLOOR)} из ${TRIES} при пороге ${FLOOR}`);
  });

  it('🔴 джигсо не притворяется классикой: форма разошлась с блоками', () => {
    const moved: number[] = [];
    for (let i = 0; i < TRIES; i++) {
      const sol = freshSolution();
      const reg = regionsFromSolution(sol, N);
      if (!reg) continue;
      let d = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (reg[r][c] !== Math.floor(r / 3) * 3 + Math.floor(c / 3)) d++;
      moved.push(d);
    }
    // Тот же замер, что у порога выше: отказов 2,7%, поэтому «10 из 12» краснело
    // ни за что примерно раз в двести прогонов. Здесь это лишь размер выборки —
    // настоящее утверждение пробы стоит строкой ниже.
    expect(`выборка ${moved.length} из ${TRIES} при пороге ${FLOOR}`)
      .toBe(`выборка ${Math.max(moved.length, FLOOR)} из ${TRIES} при пороге ${FLOOR}`);
    expect(Math.min(...moved)).toBeGreaterThanOrEqual(14);   // порог в модуле — четверть доски
  });

  it('🔴 выданная доска: решение удовлетворяет СВОЕЙ геометрии, и геометрия есть', () => {
    for (const L of [45, 49, 53, 57]) {
      const cfg = levelConfig(L);
      for (let i = 0; i < 3; i++) {
        const g = generatePuzzle(cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant);
        const present = cfg.variant === 'jigsaw' ? !!g.regions : cfg.variant === 'arrow' ? !!g.arrow : !!g.thermo;
        expect(present).toBe(true);
        for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) {
          const v = g.solution[r][c];
          g.solution[r][c] = 0;
          const ok = isValid(g.solution, r, c, v, cfg.N, cfg.BR, cfg.BC, cfg.variant, g.regions, g.thermo, g.arrow, g.cages);
          g.solution[r][c] = v;
          expect(ok).toBe(true);
        }
      }
    }
  });

  it('🔴 сэндвич копается глубже классического лимита 58', () => {
    const cfg = levelConfig(40);
    expect(cfg.variant).toBe('sandwich');
    const blanks: number[] = [];
    // ⚠️ БЮДЖЕТ ЗАВЕДОМО ЩЕДРЫЙ, а не боевые 2200 мс. Проверяется ПОТОЛОК (снято ли
    // исключение `variant === 'sandwich'` из лимита пустых), а не скорость машины.
    // С боевым бюджетом проверка была шаткой: при полном прогоне тесты идут
    // параллельно, бюджет съедается, копание не доходит — один прогон дал 53 клетки
    // при 60 минимальных в спокойном замере (16 досок: 60,61,61,62,62,63×7,64×3).
    // Шаткая проверка хуже отсутствующей: она краснеет на чужой нагрузке и приучает
    // не смотреть на красное.
    // ⚠️ ЗАХОДОВ ВОСЕМЬ, А НЕ ЧЕТЫРЕ. Даже со щедрым бюджетом проверка мигнула
    // дважды за день на полном прогоне: копание идёт по НАСТЕННЫМ часам, тесты
    // идут параллельно, и отдельный заход не добирает дырок. Проверяется МАКСИМУМ
    // по заходам, поэтому лишние заходы делают её устойчивее, а не мягче: планка
    // «глубже 58» остаётся той же.
    //
    // 🔴 04.09.2026 найден и сам корень: внутри сборщика был ЗАШИТ настенный срок
    // ожидания BUILD_WAIT_MS = 6000, и `budgetMs` его не трогал. Шесть секунд на
    // загруженной машине покупают в разы меньше вычислений, чем на спокойной, —
    // отсюда «раз из трёх». Теперь срок переопределяется (`waitMs`), и проверка
    // меряет ПОТОЛОК, а не загрузку железа. Игра по-прежнему ждёт 6000.
    for (let i = 0; i < 8; i++) {
      const b = logicalBuilder(40, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 30000, waitMs: 120000 });
      let made: ReturnType<typeof b.step> | null = null;
      for (let s = 0; s < b.steps; s++) { made = b.step(); if (b.enough(made)) break; }
      if (!made) continue;
      let z = 0;
      for (const row of made.gen.puzzle) for (const v of row) if (v === 0) z++;
      blanks.push(z);
    }
    expect(blanks.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...blanks)).toBeGreaterThan(58);
  }, 300000);
});
