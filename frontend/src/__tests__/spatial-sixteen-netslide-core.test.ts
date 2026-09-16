/* psygames-spatial-sixteen-netslide-core · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b */
/**
 * 🔴 «ШЕСТНАДЦАТЬ» И «СЕТЬ СО СДВИГОМ» НА ЯДРЕ CODEX: КАЖДАЯ СТУПЕНЬ РЕШАЕМА И ЧЕСТНО НАЗВАНА.
 *
 * Денис 16.09.2026: «движок кодекс надо использовать». Команда сдвига строки/столбца
 * (`core.mjs`, kind: row|column) была написана и лежала без дела; на ней собраны оба режима.
 *
 * Что стережёт проба:
 *   · каждое задание всех 50 ступеней решается своим маршрутом и не выдаётся уже решённым;
 *   · банк «Шестнадцати» 3×3: дистанция каждой позиции ТОЧНАЯ — сверено НЕЗАВИСИМЫМ обходом
 *     на досках через `apply`, а не перестановками решателя, который банк и собрал;
 *   · нижняя оценка ходов на 4×4 и 5×5 не больше длины известного решения;
 *   · лестница не проваливается: внутри доски сложность растёт, первая ступень 4×4 не легче
 *     оценки 5 ходов (первая версия начиналась с 2 при 8 ходах на ступень раньше).
 *
 * ⚠️ Ядро — модули `.mjs`, jest их не преобразует: как и соседние пробы лаборатории, берём
 * данные у настоящего node.
 */
declare const __dirname: string;
declare function require(id: string): any;
const path = require('path');
const { execFileSync } = require('child_process');

const CORE = path.join(__dirname, '..', 'games', 'spatial-core');
const SCRIPT = `
const core = await import(${JSON.stringify(path.join(CORE, 'core.mjs'))});
const s16 = await import(${JSON.stringify(path.join(CORE, 'sixteen-levels.mjs'))});
const bank = await import(${JSON.stringify(path.join(CORE, 'sixteen-bank.mjs'))});
const ns = await import(${JSON.stringify(path.join(CORE, 'netslide-levels.mjs'))});
// независимый обход 3×3: доски и apply, без перестановок решателя
const key = (b) => b.cells.map((c) => c.id).join('');
const moves = [];
for (const kind of ['row', 'column']) for (let index = 0; index < 3; index++) for (const amount of [1, -1]) moves.push({ kind, index, amount });
const start = core.board(3), dist = new Map([[key(start), 0]]), queue = [start];
for (let h = 0; h < queue.length; h++) for (const m of moves) {
  const next = core.apply(queue[h], m), k = key(next);
  if (!dist.has(k)) { dist.set(k, dist.get(key(queue[h])) + 1); queue.push(next); }
}
const bankRows = bank.SIXTEEN_BANK.map((e) => {
  const b = core.board(3); b.cells = Array.from(e.key, (ch) => ({ id: Number(ch), turns: 0 }));
  const route = e.solution.map((i) => ({ ...moves[0], ...([
    ...['row', 'column'].flatMap((kind) => [0, 1, 2].flatMap((index) => [1, -1].map((amount) => ({ kind, index, amount }))))
  ][i]) }));
  return { key: e.key, distance: e.distance, bfs: dist.get(e.key), routeLength: route.length, solves: core.solved(core.replay(b, route)) };
});
const sixteen = [], netslide = [];
for (const spec of s16.SIXTEEN_LEVELS) for (const seed of [11, 22, 33]) {
  const t = s16.sixteenLevel(spec.level, seed);
  sixteen.push({ level: spec.level, width: spec.width, distance: spec.distance ?? null, displacement: spec.displacement ?? null,
    solves: core.solved(core.replay(t.initial, t.solution)), preSolved: core.solved(t.initial), route: t.solution.length,
    lowerBound: t.lowerBound ?? null, minimumMoves: t.minimumMoves, guideIsFirst: spec.guide ? JSON.stringify(t.guide) === JSON.stringify(t.solution[0]) : null,
    measured: s16.sixteenDisplacement(t.initial).total });
}
for (const spec of ns.NETSLIDE_LEVELS) for (const seed of [11, 22, 33]) {
  const t = ns.netslideLevel(spec.level, seed);
  netslide.push({ level: spec.level, width: spec.width, shifts: spec.shifts, solves: ns.netslideWon(core.replay(t.initial, t.solution)),
    preWon: ns.netslideWon(t.initial), route: t.solution.length, guideIsFirst: spec.guide ? JSON.stringify(t.guide) === JSON.stringify(t.solution[0]) : null });
}
process.stdout.write(JSON.stringify({ states: dist.size, bankRows, sixteen, netslide }));
`;
const DATA = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT], { encoding: 'utf8', timeout: 120000 }));

describe('«Шестнадцать» на ядре Codex', () => {
  it('прибор жив: независимый обход 3×3 нашёл ровно половину перестановок', () => {
    expect(DATA.states).toBe(181440);
    expect(DATA.sixteen.length).toBe(150);
  });

  it('🔴 банк 3×3: дистанция каждой позиции точная, решение той же длины и решает', () => {
    const плохо = DATA.bankRows.filter((r: any) => r.bfs !== r.distance || r.routeLength !== r.distance || !r.solves);
    expect(плохо.slice(0, 3)).toEqual([]);
    const поДистанциям = new Map<number, number>();
    for (const r of DATA.bankRows) поДистанциям.set(r.distance, (поДистанциям.get(r.distance) ?? 0) + 1);
    expect([...поДистанциям.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('🔴 каждое задание решается своим маршрутом и не выдаётся решённым', () => {
    const плохо = DATA.sixteen.filter((r: any) => !r.solves || r.preSolved);
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('названное число — правда: ровно N ходов на 3×3, сдвиг совпадает, оценка не больше решения', () => {
    const плохо = DATA.sixteen.filter((r: any) => r.width === 3
      ? r.minimumMoves !== r.distance || r.route !== r.distance
      : r.measured !== r.displacement || r.lowerBound > r.route);
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('🔴 лестница не проваливается: внутри доски сложность растёт, 4×4 начинается не с пустяка', () => {
    const specs = DATA.sixteen.filter((_: any, i: number) => i % 3 === 0);
    for (let i = 1; i < specs.length; i++) {
      const a = specs[i - 1], b = specs[i];
      if (a.width === b.width) expect((b.distance ?? b.displacement) > (a.distance ?? a.displacement)).toBe(true);
      else expect(b.width).toBeGreaterThan(a.width);
    }
    const первая4 = DATA.sixteen.filter((r: any) => r.width === 4 && r.level === 9);
    expect(Math.min(...первая4.map((r: any) => r.lowerBound))).toBeGreaterThanOrEqual(5);
  });

  it('первая ступень подсказывает ровно первый ход решения', () => {
    expect(DATA.sixteen.filter((r: any) => r.level === 1).every((r: any) => r.guideIsFirst === true)).toBe(true);
  });
});

describe('«Сеть со сдвигом» на ядре Codex', () => {
  it('🔴 каждое задание решается своим маршрутом, связная сеть не выдаётся задачей', () => {
    expect(DATA.netslide.length).toBe(150);
    const плохо = DATA.netslide.filter((r: any) => !r.solves || r.preWon);
    expect(плохо.slice(0, 3)).toEqual([]);
  });

  it('число сдвигов — то, что названо, и растёт внутри доски', () => {
    expect(DATA.netslide.every((r: any) => r.route === r.shifts)).toBe(true);
    const specs = DATA.netslide.filter((_: any, i: number) => i % 3 === 0);
    for (let i = 1; i < specs.length; i++) {
      const a = specs[i - 1], b = specs[i];
      if (a.width === b.width) expect(b.shifts).toBeGreaterThan(a.shifts);
      else expect(b.width).toBeGreaterThan(a.width);
    }
    expect(DATA.netslide.filter((r: any) => r.level === 1).every((r: any) => r.guideIsFirst === true)).toBe(true);
  });
});
