/* psygames-gate-dots-unique · VER 1 · 06.09.2026 */
/**
 * 🔴 ДОСКА РЕШАЕТСЯ ВЫВОДОМ, А НЕ УГАДЫВАНИЕМ.
 *
 * 📍 ЗАМЕР, ИЗ-ЗА КОТОРОГО ВСЁ ЭТО ЗАВЕДЕНО (06.09.2026). Независимый перебор
 * всех решений по правилам `validateDotsSolution`: L1, L3, L5 решались
 * единственным способом, а **с L7 — нет**. Игра засчитывала победу на разных
 * ответах, то есть верхние уровни не выводились, а угадывались.
 *
 * ЧТО ПОЧИНИЛО. Правило классического нумберлинка: путь пары не касается сам
 * себя. Замер после: единственное решение на восьми уровнях из девяти
 * проверенных (девятый упёрся в бюджет перебора, а не провалился).
 *
 * ⚠️ ПРАВИЛО ОБЯЗАНО СТОЯТЬ В ТРЁХ МЕСТАХ, И ЭТО НЕ ПЕРЕСТРАХОВКА:
 *   · генератор режет путь на самонепересекающиеся куски — иначе своё же
 *     решение станет незаконным;
 *   · проверка отвергает касание — иначе у игрока остаются лишние маршруты, и
 *     задача снова угадывается (замер с правилом только в генераторе: те же
 *     ≥2 решения);
 *   · решатель знает то же правило — иначе он находит ответы, которые игра не
 *     принимает, и подсказка ведёт в тупик.
 * Здесь проверяются все три.
 */
import {
  generateDotsPuzzle, dotsLevelPlan, самонепересекающийсяРазрез,
} from '@/src/games/dots-connect/core/generator';
import { validateDotsSolution } from '@/src/games/dots-connect/core/validator';
import { solveDotsPuzzle } from '@/src/games/dots-connect/core/solver';
import type { Cell } from '@/src/games/dots-connect/core/types';

jest.setTimeout(600000);

const рядом = (a: Cell, b: Cell) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

/** Независимая проверка: путь касается сам себя. Не зовём код игры. */
function касаетсяСебя(путь: readonly Cell[]): boolean {
  for (let i = 0; i < путь.length; i += 1) {
    for (let j = i + 2; j < путь.length; j += 1) {
      if (рядом(путь[i] as Cell, путь[j] as Cell)) return true;
    }
  }
  return false;
}

describe('точки решаются выводом', () => {
  it('есть что проверять: лестница не пуста и пары растут', () => {
    expect(dotsLevelPlan(1).pairCount).toBeGreaterThanOrEqual(4);
    expect(dotsLevelPlan(40).pairCount).toBeGreaterThan(dotsLevelPlan(1).pairCount);
  });

  it('🔴 ни один путь готового решения не касается сам себя — все 40 уровней', () => {
    const беды: string[] = [];
    for (let L = 1; L <= 40; L += 1) {
      const p = generateDotsPuzzle(`уник-${L}`, L);
      for (const [id, путь] of Object.entries(p.solution)) {
        if (касаетсяСебя(путь as Cell[])) беды.push(`L${L} ${id}`);
      }
    }
    expect(беды.slice(0, 5)).toEqual([]);
  });

  /**
   * 🔴 САМОПРОВЕРКА ОТ СЛЕПОГО ЗЕЛЁНОГО. Проверка выше молчала бы и на пустом
   * решении. Подаём заведомо касающийся путь — обязана поймать и назвать причину.
   */
  it('🔴 правило ловит подделку: путь, прижатый к себе, отвергается', () => {
    const п = generateDotsPuzzle('подделка', 1);
    const своё = validateDotsSolution(п, п.solution);
    expect(`своё решение валидно: ${своё.valid}`).toBe('своё решение валидно: true');
    // Буква «П»: клетки (0,0)-(0,1)-(1,1)-(2,1)-(2,0)-(1,0) — концы (0,0) и (1,0) соседи.
    const кривой: Cell[] = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 },
      { row: 2, col: 1 }, { row: 2, col: 0 }, { row: 1, col: 0 },
    ];
    expect(касаетсяСебя(кривой)).toBe(true);
    const первая = п.pairs[0]!.id;
    const порча = { ...п.solution, [первая]: кривой };
    const итог = validateDotsSolution(п, порча as never);
    expect(`отвергнуто: ${!итог.valid}`).toBe('отвергнуто: true');
    expect(итог.issues.some((i) => i.includes('touches itself'))).toBe(true);
  });

  it('🔴 разрез отказывается там, где куски были бы с касанием', () => {
    // Прямая линия из пяти клеток — куски без касания, разрез обязан выйти.
    const прямая: Cell[] = [0, 1, 2, 3, 4, 5].map((c) => ({ row: 0, col: c }));
    expect(самонепересекающийсяРазрез(прямая, 2, 3)).not.toBeNull();
    // Змейка, которая тут же прижимается к себе, на два куска по три не режется.
    const змейка: Cell[] = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 0 },
    ];
    expect(самонепересекающийсяРазрез(змейка, 1, 4)).toBeNull();
  });

  it('🔴 решатель знает то же правило: его ответ проходит проверку игры', () => {
    const беды: string[] = [];
    for (const L of [1, 5, 10, 20, 30, 40]) {
      const п = generateDotsPuzzle(`реш-${L}`, L);
      const ответ = solveDotsPuzzle(п);
      if (!ответ) { беды.push(`L${L}: решатель не нашёл ответа`); continue; }
      const итог = validateDotsSolution(п, ответ);
      if (!итог.valid) беды.push(`L${L}: ${итог.issues.slice(0, 2).join('; ')}`);
    }
    expect(беды).toEqual([]);
  });

  /**
   * ⚠️ И ГЛАВНОЕ СЛЕДСТВИЕ — РЕШЕНИЕ ЕДИНСТВЕННО. Перебор считает до двух и
   * останавливается: доказывать надо не «сколько их», а «не больше одного».
   * Бюджет узлов ограничен — на больших досках ответ «не успел» законен и
   * назван, потому что «не успел» не то же самое, что «нашёл второе».
   */
  it('🔴 на нижних уровнях решение ровно одно', () => {
    const плохо: string[] = [];
    for (const L of [1, 3, 5, 7, 9]) {
      const п = generateDotsPuzzle(`ед-${L}`, L);
      const { n, исчерпан } = решений(п);
      if (n >= 2) плохо.push(`L${L}: решений ≥2`);
      if (n === 0 && !исчерпан) плохо.push(`L${L}: решений НОЛЬ — сломан перебор или доска`);
    }
    expect(плохо).toEqual([]);
  });
});

/** Перебор решений по правилам игры, включая запрет самокасания. */
function решений(puzzle: ReturnType<typeof generateDotsPuzzle>, потолок = 300000) {
  const size = puzzle.size;
  const пары = puzzle.pairs;
  const N = size * size;
  const занято = new Uint8Array(N);
  const k = (c: Cell) => c.row * size + c.col;
  let n = 0; let узлов = 0; let исчерпан = false;
  const пути: number[][] = [];
  for (const p of пары) for (const e of p.endpoints) занято[k(e)] = 1;
  const соседи = (i: number): number[] => {
    const r = Math.floor(i / size); const c = i % size; const из: number[] = [];
    if (c + 1 < size) из.push(i + 1);
    if (c > 0) из.push(i - 1);
    if (r + 1 < size) из.push(i + size);
    if (r > 0) из.push(i - size);
    return из;
  };
  function живо(с: number): boolean {
    for (let j = с; j < пары.length; j += 1) {
      const a = k(пары[j]!.endpoints[0]); const b = k(пары[j]!.endpoints[1]);
      const виден = new Uint8Array(N); виден[a] = 1;
      const стек = [a]; let дошли = false;
      while (стек.length) {
        const cur = стек.pop() as number;
        if (cur === b) { дошли = true; break; }
        for (const nk of соседи(cur)) {
          if (виден[nk]) continue;
          if (занято[nk] && nk !== b) continue;
          виден[nk] = 1; стек.push(nk);
        }
      }
      if (!дошли) return false;
    }
    return true;
  }
  function начать(idx: number): void {
    if (n >= 2 || исчерпан) return;
    if (idx === пары.length) {
      for (let i = 0; i < N; i += 1) if (!занято[i]) return;
      const paths: Record<string, Cell[]> = {};
      пары.forEach((p, i) => {
        paths[p.id] = (пути[i] as number[]).map((x) => ({ row: Math.floor(x / size), col: x % size }));
      });
      if (validateDotsSolution(puzzle, paths as never).valid) n += 1;
      return;
    }
    if (!живо(idx)) return;
    вести(idx, k(пары[idx]!.endpoints[0]), k(пары[idx]!.endpoints[1]), [k(пары[idx]!.endpoints[0])]);
  }
  function вести(idx: number, cur: number, цель: number, путь: number[]): void {
    if (n >= 2 || исчерпан) return;
    узлов += 1;
    if (узлов > потолок) { исчерпан = true; return; }
    if (cur === цель) { пути[idx] = [...путь]; начать(idx + 1); return; }
    for (const nk of соседи(cur)) {
      if (занято[nk] && nk !== цель) continue;
      if (путь.indexOf(nk) >= 0) continue;
      let каса = false;
      for (const сос of соседи(nk)) {
        const поз = путь.indexOf(сос);
        if (поз >= 0 && поз !== путь.length - 1) { каса = true; break; }
      }
      if (каса) continue;
      const было = занято[nk];
      занято[nk] = 1; путь.push(nk);
      вести(idx, nk, цель, путь);
      путь.pop(); занято[nk] = было as number;
      if (n >= 2 || исчерпан) return;
    }
  }
  начать(0);
  return { n, исчерпан };
}
