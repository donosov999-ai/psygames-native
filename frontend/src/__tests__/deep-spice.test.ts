/* psygames-deep-spice-gate · VER 1 · 29.08.2026 */
/**
 * ПРИПРАВА БЕЗДНЫ — термометры и клетки-суммы на нижнем слое (§7е пп.56–57).
 *
 * 🔴 ЧТО ЗДЕСЬ МОЖЕТ СЛОМАТЬСЯ ТИХО, и потому проверяется ИСПОЛНЕНИЕМ:
 *   1. Недетерминизм. Узел Бездны рождается из (зерно, путь) при КАЖДОМ входе —
 *      после перезапуска, после возврата по крошкам. Генераторы фигур в
 *      sudoku-core исторически звали `Math.random()`; если приправа возьмёт его,
 *      человек вернётся в свой же узел и увидит другой узор поверх своих цифр.
 *   2. Приправа-украшение. Термометр и суммы — это ДОПОЛНИТЕЛЬНЫЕ подсказки:
 *      если за них ничего не отнять, доска станет легче, а «вариант» превратится
 *      в раскраску. Поэтому проверяется, что цифры выкапываются.
 *   3. Второе решение. Выкопали лишнего — и у доски появляется законный второй
 *      ответ: человек ставит верную цифру и получает «ошибку» (тот самый репорт
 *      Вали, из-за которого в v1.156 в проверку добавляли маркерные варианты).
 *   4. Фигура против решения. Термометр обязан расти, суммы — сходиться ИМЕННО
 *      на решении узла, иначе правило противоречит доске.
 *   5. Приправа выше листа. Над листом часть клеток кормится снизу и руками не
 *      заполняется — термометр через такую клетку требовал бы сравнить с цифрой,
 *      которой ещё нет.
 *
 * ⚠️ Блок «нарочно испорченного» в конце: если проверки не краснеют на подделке,
 * это не проверки. Без него «сумма сходится» зеленело бы и на доске без сумм.
 */
import fs from 'fs';
import path from 'path';
import {
  DEEP_N, childPath, materializeNode, spiceLeaf, type DeepCfg,
} from '@/src/services/fractal-deep';
import { countSolutions, type Cell } from '@/src/services/sudoku-core';

// Полоса 1.7 — та же, что у пресета «Бездна»; банк разложен по полосам, и
// промежуточные значения (1.6) пусты — доску там не выбрать.
const CFG: DeepCfg = { depth: 2, rating: 1.7, feedCount: 4, unlockShare: 0.5, spice: true };
const PLAIN: DeepCfg = { ...CFG, spice: false };
const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/** Листья одного дерева: корень материализуем и спускаемся в его кормимые клетки. */
function leavesOf(seed: string, cfg: DeepCfg, take = 4) {
  const root = materializeNode(seed, '', cfg, 0);
  return root.feedCells.slice(0, take).map(([r, c]) =>
    materializeNode(seed, childPath('', r, c), cfg, root.solution[r]![c]!));
}

describe('приправа Бездны: детерминизм', () => {
  it('🔴 тот же (зерно, путь) — та же доска, тот же узор', () => {
    for (const seed of ['det-a', 'det-b', 'det-c']) {
      const [first] = leavesOf(seed, CFG, 1);
      const [second] = leavesOf(seed, CFG, 1);
      expect(second!.spice).toBe(first!.spice);
      expect(second!.puzzle).toEqual(first!.puzzle);
      expect(second!.thermo ?? null).toEqual(first!.thermo ?? null);
      expect(second!.cages?.sum ?? null).toEqual(first!.cages?.sum ?? null);
    }
  });

  it('разные зёрна дают разные приправы — жребий не залип на одном значении', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 12; i++) for (const leaf of leavesOf(`mix-${i}`, CFG, 2)) kinds.add(leaf.spice);
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('приправа Бездны: за неё платят подсказками', () => {
  it('🔴 приправленный лист несёт МЕНЬШЕ подсказок, чем он же без приправы', () => {
    let compared = 0;
    for (let i = 0; i < 14 && compared < 5; i++) {
      const seed = `dig-${i}`;
      const root = materializeNode(seed, '', PLAIN, 0);
      const [r, c] = root.feedCells[0]!;
      const p = childPath('', r, c);
      const digit = root.solution[r]![c]!;
      const spiced = materializeNode(seed, p, CFG, digit);
      if (spiced.spice === 'none') continue;
      const plain = materializeNode(seed, p, PLAIN, digit);
      const givens = (g: Cell[][]) => g.flat().filter((v) => v !== 0).length;
      expect(spiced.dug).toBeGreaterThan(0);
      expect(givens(spiced.puzzle)).toBe(givens(plain.puzzle) - spiced.dug);
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });
});

describe('приправа Бездны: доска остаётся честной', () => {
  it('🔴 решение единственно ПОД НОВЫМ ПРАВИЛОМ, а не под базовым', () => {
    let checked = 0;
    for (let i = 0; i < 10 && checked < 6; i++) {
      for (const leaf of leavesOf(`uni-${i}`, CFG, 2)) {
        if (leaf.spice === 'none') continue;
        const probe = leaf.puzzle.map((row) => [...row]);
        const n = countSolutions(
          probe, DEEP_N, 3, 3, leaf.spice === 'thermocage' ? 'thermocage' : 'thermo',
          undefined, 2, { steps: 60000 }, leaf.thermo, undefined, leaf.cages,
        );
        expect(`${leaf.spice}: решений ${n}`).toBe(`${leaf.spice}: решений 1`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('🔴 термометр растёт, а суммы сходятся — на решении узла, в каждой клетке', () => {
    let seenThermo = 0, seenCage = 0;
    for (let i = 0; i < 10; i++) for (const leaf of leavesOf(`fig-${i}`, CFG, 2)) {
      if (leaf.thermo) {
        for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) {
          const pn = leaf.thermo[r]![c];
          if (!pn?.next) continue;
          const [nr, nc] = pn.next;
          expect(`(${r},${c})→(${nr},${nc}): растёт ${leaf.solution[nr]![nc]! > leaf.solution[r]![c]!}`)
            .toBe(`(${r},${c})→(${nr},${nc}): растёт true`);
          seenThermo++;
        }
      }
      if (leaf.cages) {
        leaf.cages.cells.forEach((cells, id) => {
          if (!cells?.length) return;
          const sum = cells.reduce((acc, [r, c]) => acc + leaf.solution[r]![c]!, 0);
          expect(`группа ${id}: ${sum}`).toBe(`группа ${id}: ${leaf.cages!.sum[id]}`);
          seenCage++;
        });
      }
    }
    expect(seenThermo).toBeGreaterThan(10);
    expect(seenCage).toBeGreaterThan(5);
  });

  it('🔴 узлы ВЫШЕ листа не приправляются: кормимую клетку рукой не заполнить', () => {
    for (let i = 0; i < 8; i++) {
      const root = materializeNode(`up-${i}`, '', CFG, 0);
      expect(`корень ${i}: ${root.spice}`).toBe(`корень ${i}: none`);
      expect(root.thermo ?? null).toBeNull();
    }
  });

  it('выключенная приправа оставляет Бездну прежней классикой', () => {
    for (const leaf of leavesOf('off-1', PLAIN, 3)) {
      expect(leaf.spice).toBe('none');
      expect(leaf.dug).toBe(0);
      expect(leaf.thermo ?? null).toBeNull();
    }
  });
});

describe('приправа Бездны: её видно на экране', () => {
  const screen = read('app/games/sudoku-fractal-deep.tsx');

  it('🔴 сгенерировано — значит нарисовано: трубка, колба, заливка и сумма', () => {
    expect(screen).toContain('thermoSegment(r, c, pn.prev, cell, thermoThickPx)');
    expect(screen).toContain('thermoBulb(cell)');
    expect(screen).toContain('cageTint(colors.surface, cageMap.cageOf[r]![c]!)');
    expect(screen).toContain('fontSize: cageSumFontSize(cell)');
  });

  it('рисунок берётся из ОБЩЕГО модуля, а не из своей копии геометрии', () => {
    expect(screen).toContain("from '@/src/services/sudoku-overlay'");
    // Своя формула трубки/колбы в экране — тот самый путь к двум расходящимся рисункам.
    expect(screen).not.toMatch(/cellSize \* 0\.16|cell \* 0\.42/);
  });

  it('правило названо словами и переведено', () => {
    expect(screen).toContain("t('deepSpiceRuleThermo')");
    expect(screen).toContain("t('deepSpiceRuleCage')");
    const dict = read('src/contexts/LanguageContext.tsx');
    for (const key of ['deepSpice', 'deepSpiceDesc', 'deepSpiceRuleThermo', 'deepSpiceRuleCage']) {
      expect(`${key}: есть ru+en ${new RegExp(`${key}: \\{ ru: '[^']+', en: '[^']+' \\}`).test(dict)}`)
        .toBe(`${key}: есть ru+en true`);
    }
  });

  it('снимок партии помнит приправу — иначе продолжение соберёт другую доску', () => {
    expect(screen).toContain('spice?: boolean;');
    expect(screen).toContain('({ preset, spice, seed, path, grids, marks, errors, elapsed');
    expect(screen).toContain('setSpice(s.spice ?? false)');
  });
});

describe('🔴 подделка обязана краснеть', () => {
  it('термометр, положенный ПОПЕРЁК решения, ломает проверку роста', () => {
    const leaf = leavesOf('fake-1', CFG, 1)[0]!;
    // Разворачиваем решение задом наперёд — фигура остаётся, доска под ней другая.
    const flipped = leaf.solution.map((row) => [...row].reverse());
    let broken = 0;
    for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) {
      const pn = leaf.thermo?.[r]?.[c];
      if (!pn?.next) continue;
      const [nr, nc] = pn.next;
      if (!(flipped[nr]![nc]! > flipped[r]![c]!)) broken++;
    }
    // Если бы проверка роста была формальной, на перевёрнутом решении она бы молчала.
    expect(leaf.spice === 'none' || broken > 0).toBe(true);
  });

  it('лишняя выкопанная цифра даёт второе решение — значит проверка не декоративна', () => {
    const cfgGreedy = { ...CFG };
    let seenSecond = false;
    for (let i = 0; i < 8 && !seenSecond; i++) {
      const root = materializeNode(`greedy-${i}`, '', cfgGreedy, 0);
      const [r, c] = root.feedCells[0]!;
      const leaf = materializeNode(`greedy-${i}`, childPath('', r, c), cfgGreedy, root.solution[r]![c]!);
      if (leaf.spice === 'none') continue;
      // Копаем ЕЩЁ, уже без проверки, — и ждём, что единственность где-то развалится.
      const probe = leaf.puzzle.map((row) => [...row]);
      for (const [rr, cc] of [[0, 0], [1, 3], [2, 6], [3, 1], [4, 4], [5, 7], [6, 2], [7, 5], [8, 8]] as const) {
        probe[rr]![cc] = 0 as Cell;
      }
      const n = countSolutions(
        probe, DEEP_N, 3, 3, leaf.spice === 'thermocage' ? 'thermocage' : 'thermo',
        undefined, 2, { steps: 60000 }, leaf.thermo, undefined, leaf.cages,
      );
      if (n !== 1) seenSecond = true;
    }
    expect(seenSecond).toBe(true);
  });

  it('spiceLeaf на доске без дырок под фигуру возвращает «без приправы», а не мусор', () => {
    const solved: Cell[][] = Array.from({ length: DEEP_N }, (_, r) =>
      Array.from({ length: DEEP_N }, (_, c) => (((r * 3 + Math.floor(r / 3) + c) % 9) + 1) as Cell));
    const full = solved.map((row) => [...row]);
    const res = spiceLeaf('empty-1', 'x', full, solved, 0);
    expect(res.dug).toBe(0);
    expect(full.flat().filter((v) => v === 0).length).toBe(0);
  });
});
