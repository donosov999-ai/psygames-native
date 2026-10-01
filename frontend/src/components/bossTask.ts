/* psygames-boss-task · VER 1 · 30.09.2026 */
/**
 * ЗАДАНИЕ БОЯ С БОССОМ — чистая часть `BossRound.tsx`, без React.
 *
 * 🔴 ЗАЧЕМ ВЫНЕСЕНО. Босс переносится во Flutter (`flutter/lib/shell/boss_round.dart`),
 * а правила переносятся сверкой с эталоном, снятым прогоном ЖИВОГО кода. Экран
 * `BossRound.tsx` тянет react-native и словарь — выгрузчику эталона они не нужны, ему
 * нужна только раздача задания. Поэтому раздача живёт здесь, а экран её зовёт: правило
 * одно, копий нет. Поведение веба не изменилось ни на бросок — строки перенесены как есть.
 *
 * ⚠️ ПОСЛЕ ЛЮБОЙ ПРАВКИ ЭТОГО ФАЙЛА — переснять эталон:
 *   npx jest --testMatch '**\/components/tools/record-boss-reference.gen.ts'
 * иначе веб и приложение разойдутся молча (эталон замораживает перенос, а не источник).
 */

export type BossType = 'counting' | 'lightning' | 'completeline' | 'finderror' | 'oddletter' | 'gonogo';

const rnd = (n: number) => Math.floor(Math.random() * n);
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function mkOptions(answer: number): number[] {
  const o = new Set<number>([answer]);
  while (o.size < 4) { const d = answer + (Math.random() < 0.5 ? -1 : 1) * (1 + rnd(6)); if (d > 0) o.add(d); }
  return shuffle([...o]);
}
function mkOptionsFrom(answer: number, max: number): number[] {
  const o = new Set<number>([answer]);
  for (const v of shuffle(Array.from({ length: max }, (_, i) => i + 1).filter((v) => v !== answer))) {
    if (o.size >= 4) break; o.add(v);
  }
  return shuffle([...o]);
}

export interface BossTask {
  kind: 'choose' | 'tapcell';
  introKey: string;   // ключи словаря LanguageContext (bossIntro*/bossHud*) — рендер через t()
  hudKey: string;
  cells?: { value: number | string; hl?: boolean }[];   // choose: визуальная сетка-подсказка
  cols?: number;
  options?: number[];
  answer?: number;
  grid?: (number | string)[];                             // tapcell: сетка для тапа (числа/буквы/эмодзи)
  gridCols?: number;
  badCells?: number[];                                    // tapcell: «нарушители» (верный тап)
}

export function makeTask(type: BossType): BossTask {
  if (type === 'lightning') {
    const n = 5, miss = 1 + rnd(n);
    const cells = Array.from({ length: n }, (_, i) => ({ value: (i + 1 === miss ? '?' : i + 1) as number | string, hl: i + 1 === miss }));
    return { kind: 'choose', introKey: 'bossIntroLightning', hudKey: 'bossHudLightning', cells, cols: n, options: mkOptionsFrom(miss, n), answer: miss };
  }
  if (type === 'completeline') {
    const miss = 1 + rnd(9);
    const shown = shuffle(Array.from({ length: 9 }, (_, i) => i + 1).filter((v) => v !== miss));
    return { kind: 'choose', introKey: 'bossIntroCompleteline', hudKey: 'bossHudCompleteline', cells: shown.map((v) => ({ value: v })), cols: 9, options: mkOptionsFrom(miss, 9), answer: miss };
  }
  if (type === 'finderror') {
    const n = 4;
    const grid: number[] = [];
    for (let r = 0; r < n; r++) for (const v of shuffle([1, 2, 3, 4])) grid.push(v);
    const er = rnd(n), base = er * n, a = rnd(n);
    let b = rnd(n); while (b === a) b = rnd(n);
    grid[base + b] = grid[base + a];   // в строке er теперь повтор (клетки a и b)
    return { kind: 'tapcell', introKey: 'bossIntroFinderror', hudKey: 'bossHudFinderror', grid, gridCols: n, badCells: [base + a, base + b] };
  }
  if (type === 'oddletter') {
    // 5 согласных + 1 гласная (латиница, универсально) — тапни ЛИШНЮЮ гласную.
    const cons = 'BCDFGHJKLMNPQRSTVWXZ', vow = 'AEIOU';
    const letters: (number | string)[] = Array.from({ length: 5 }, () => cons[rnd(cons.length)]);
    const vIdx = rnd(6);
    letters.splice(vIdx, 0, vow[rnd(vow.length)]);
    return { kind: 'tapcell', introKey: 'bossIntroOddletter', hudKey: 'bossHudOddletter', grid: letters, gridCols: 3, badCells: [vIdx] };
  }
  if (type === 'gonogo') {
    // 6 цветных кружков, ровно один ЗЕЛЁНЫЙ — тапни только его (подави остальные).
    const others = ['🔴', '🔵', '🟡', '🟣', '🟠'];
    const grid: (number | string)[] = Array.from({ length: 6 }, () => others[rnd(others.length)]);
    const gIdx = rnd(6);
    grid[gIdx] = '🟢';
    return { kind: 'tapcell', introKey: 'bossIntroGonogo', hudKey: 'bossHudGonogo', grid, gridCols: 3, badCells: [gIdx] };
  }
  // counting (Шульте)
  const nums = Array.from({ length: 6 }, () => 1 + rnd(12));
  const hl = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3);
  const answer = hl.reduce((s, i) => s + nums[i], 0);
  return { kind: 'choose', introKey: 'bossIntroCounting', hudKey: 'bossHudCounting', cells: nums.map((v, i) => ({ value: v, hl: hl.includes(i) })), cols: 3, options: mkOptions(answer), answer };
}
