import {
  levelBand, samuraiBuilder, buildSamuraiLevel, buildSolutionCanvas, digByLogic, minTierOf,
  gradeSamurai, CELLS, BUILD_ATTEMPTS, DIG_SLICES,
} from '@/app/games/sudoku-samurai';

/**
 * ЗАМЕР, А НЕ ТЕСТ. Цена верхней полосы судоку-самурая (пол = голые пары).
 *
 * Лежит ВНЕ src/__tests__ намеренно: jest ловит тесты только оттуда, а здесь сотни
 * смётов на прогон — в гейте перед коммитом им делать нечего. Отсюда взяты все числа,
 * которыми обоснованы levelBand, digByLogic и BUILD_ATTEMPTS.
 *
 * Запуск (по одному разделу, иначе ждать долго):
 *   npx jest --rootDir . scripts/measure/samurai-floor.measure.ts \
 *     --testMatch "<rootDir>/scripts/measure/*.measure.ts" -t "СМЁТ"
 */

const ms = (t0: number) => Math.round(Date.now() - t0);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const свод = (a: number[]) => a.length
  ? `n=${a.length} мин ${Math.min(...a)} медиана ${med(a)} макс ${Math.max(...a)}`
  : 'нет';

describe('цена верхней полосы самурая', () => {
  jest.setTimeout(1800_000);

  /**
   * УДАЧА И ЦЕНА ОДНОГО ЗАХОДА. На этом числе стоит и пол уровня, и BUILD_ATTEMPTS:
   * заход — лотерея, и вопрос только в том, сколько билетов надо купить.
   */
  it('СМЁТ: сколько заходов доходит до голых пар и во что заход обходится', () => {
    const RUNS = 40;
    const rows: string[] = [];
    const times: number[] = []; const runs: number[] = []; const tiers: number[] = [];
    const uses4: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = Date.now();
      const sol = buildSolutionCanvas();
      const a = digByLogic(sol, 4, CELLS.length);
      const dt = ms(t0);
      const t = minTierOf(a.puzzle, 4);
      const g = gradeSamurai(a.puzzle, t);
      if (t >= 4) uses4.push(g.hardUses);
      tiers.push(t); times.push(dt); runs.push(a.solverRuns);
      rows.push(`#${i + 1}: ступень ${t}, заходов техники ${g.hardUses}, дырок ${a.blanks}, прогонов решателя ${a.solverRuns}, ${dt}мс`);
    }
    const ч = tiers.filter((t) => t >= 4).length;
    console.log('\n=== ОДИН ЗАХОД (смёт по 369 клеткам, потолок 4) ===\n' + rows.join('\n')
      + `\nступень 4: ${ч} из ${RUNS} (${(ч / RUNS * 100).toFixed(0)}%); ступени: ${[2, 3, 4].map((t) => `${t}→${tiers.filter((x) => x === t).length}`).join(' ')}`
      + `\nвремя: ${свод(times)} мс; прогонов решателя: ${свод(runs)}`
      + `\nзаходов техники на ступени 4: [${[...uses4].sort((a, b) => a - b).join(',')}]`);
    expect(rows.length).toBe(RUNS);
  });

  /** ЦЕНА ПАРТИИ ЦЕЛИКОМ — то, что реально ждёт человек. */
  it('СБОРКА: партия уровня с полом голых пар', () => {
    const RUNS = 10;
    for (const L of [5, 8, 12]) {
      const rows: string[] = [];
      const times: number[] = []; const att: number[] = []; const runs: number[] = [];
      let промахов = 0;
      for (let i = 0; i < RUNS; i++) {
        const t0 = Date.now();
        const tick = buildSamuraiLevel(L);
        const dt = ms(t0);
        const t = minTierOf(tick.best.puzzle, 4);
        if (t < levelBand(L).min) промахов++;
        times.push(dt); att.push(tick.attempt); runs.push(tick.solverRuns);
        rows.push(`#${i + 1}: ступень ${t}, заходов ${tick.attempt}, прогонов ${tick.solverRuns}, дырок ${tick.best.blanks}, ${dt}мс`);
      }
      console.log(`\n=== УРОВЕНЬ ${L} (полоса ${JSON.stringify(levelBand(L))}, потолок ${BUILD_ATTEMPTS}×${DIG_SLICES} шагов) ===\n`
        + rows.join('\n')
        + `\nвремя: ${свод(times)} мс; заходов: ${свод(att)}; прогонов решателя: ${свод(runs)}; промахов мимо пола: ${промахов}`);
      expect(rows.length).toBe(RUNS);
    }
  });

  /**
   * ЛЕСТНИЦА ПОТОЛКОВ — почему пол нельзя получить построением, а только перебором
   * заходов: доска, докопанная до упора на ступени 3, заперта наглухо.
   */
  it('ЛЕСТНИЦА: открывает ли потолок 4 хоть одну клетку после исчерпания тройки', () => {
    const RUNS = 10;
    const rows: string[] = [];
    let открыло = 0;
    for (let i = 0; i < RUNS; i++) {
      const sol = buildSolutionCanvas();
      const a = digByLogic(sol, 3, CELLS.length);
      const b = digByLogic(sol, 4, CELLS.length, CELLS.length, { ...a, at: 0 });
      if (b.blanks > a.blanks) открыло++;
      rows.push(`#${i + 1}: до упора на тройке ${a.blanks} дырок → потолок 4 добавил ${b.blanks - a.blanks}, ступень ${minTierOf(b.puzzle, 4)}`);
    }
    console.log('\n=== ЛЕСТНИЦА 3→4 ===\n' + rows.join('\n') + `\nпотолок 4 открыл хоть что-то: ${открыло} из ${RUNS}`);
    expect(rows.length).toBe(RUNS);
  });

  /** ВТОРОЙ СМЁТ — то, за что раньше платили половиной времени сборки. */
  it('ПОВТОР: снимает ли что-нибудь второй смёт по той же доске', () => {
    const RUNS = 6;
    const rows: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      const sol = buildSolutionCanvas();
      const a = digByLogic(sol, 4, CELLS.length);
      const t1 = Date.now();
      const b = digByLogic(sol, 4, CELLS.length, CELLS.length, { ...a, at: 0 });
      rows.push(`#${i + 1}: первый смёт ${a.blanks} дырок / ${a.solverRuns} прогонов; второй добавил ${b.blanks - a.blanks} дырок за ${ms(t1)}мс и ${b.solverRuns - a.solverRuns} прогонов`);
    }
    console.log('\n=== ВТОРОЙ СМЁТ ===\n' + rows.join('\n'));
    expect(rows.length).toBe(RUNS);
  });

  /** Цена решения без выкапывания — чтобы не искать секунды там, где их нет. */
  it('РЕШЕНИЕ: цена полного решения самурая', () => {
    const t: number[] = [];
    for (let i = 0; i < 20; i++) { const t0 = Date.now(); buildSolutionCanvas(); t.push(ms(t0)); }
    console.log(`\n=== buildSolutionCanvas ===\n${свод(t)} мс`);
    expect(t.length).toBe(20);
  });

  /** Есть ли ось ВНУТРИ четвёртой ступени — сколько раз доска упирается в голую пару. */
  it('ТОЛЩИНА: разброс числа заходов голых пар на досках верхней полосы', () => {
    const RUNS = 16;
    const uses: number[] = []; const rows: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      const tick = buildSamuraiLevel(12);
      const g = gradeSamurai(tick.best.puzzle, 4);
      uses.push(g.hardUses);
      rows.push(`#${i + 1}: ступень ${g.tier}, заходов техники ${g.hardUses}, заходов генератора ${tick.attempt}`);
    }
    console.log('\n=== ТОЛЩИНА ВЕРХНЕЙ СТУПЕНИ ===\n' + rows.join('\n')
      + `\n${свод(uses)}; распределение: ${[1, 2, 3, 4, 5].map((k) => `${k}→${uses.filter((u) => u === k).length}`).join(' ')}`);
    expect(rows.length).toBe(RUNS);
  });
});
