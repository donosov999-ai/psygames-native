/**
 * 🔴 ОТСЕЧЕНИЕ РЕШАТЕЛЯ ПРОВЕРЯЕТСЯ A/B, А НЕ ОБОСНОВЫВАЕТСЯ РАССУЖДЕНИЕМ.
 *
 * Отсечение «не разбирай однородную тарелку в пустую» выглядит очевидно
 * безопасным: такой ход увеличивает разбросанность вида. Но любое отсечение
 * может срезать единственное решение, и красивое рассуждение этого не покажет.
 * Здесь тот же приём, что в сортировке товаров: гоняем одни и те же столы с
 * отсечением и без и требуем совпадения ВЕРДИКТА.
 *
 * ⚠️ Сравнивается вердикт, а не число узлов: узлов с отсечением, конечно,
 * меньше — ради этого оно и стоит.
 */
import { CIRCLE, makeBoard } from '@/src/games/cake-sort/core/plate';
import { solve } from '@/src/games/cake-sort/core/solver';
import { deal } from '@/src/games/cake-sort/core/level';

jest.setTimeout(300000);

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function стол(types: number, plates: number, seed: number) {
  const все: number[] = [];
  for (let t = 0; t < types; t += 1) for (let k = 0; k < CIRCLE; k += 1) все.push(t);
  const rand = rng(seed);
  for (let i = все.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [все[i], все[j]] = [все[j] as number, все[i] as number];
  }
  const out: number[][] = Array.from({ length: plates }, () => []);
  let i = 0;
  for (const s of все) { while ((out[i] as number[]).length >= CIRCLE) i += 1; (out[i] as number[]).push(s); }
  return makeBoard(out, []);
}

describe('отсечение решателя не меняет вердикт', () => {
  const столы = [
    ...[[3, 5], [3, 4], [4, 6], [4, 5], [5, 7], [5, 6]].flatMap(([t, p]) =>
      [1, 2, 3, 4, 5].map((s) => стол(t as number, p as number, s))),
    ...Array.from({ length: 12 }, (_, i) => deal(i + 1).board),
  ];

  it('есть что проверять — столов достаточно и они разные', () => {
    expect(столы.length).toBeGreaterThanOrEqual(40);
    expect(new Set(столы.map((b) => JSON.stringify(b))).size).toBeGreaterThan(20);
  });

  it('🔴 вердикт с отсечением и без совпадает на каждом столе', () => {
    const расхождения: string[] = [];
    столы.forEach((b, i) => {
      const с = solve(b, 60000, true);
      const без = solve(b, 60000, false);
      // Сравниваем только там, где ОБА дошли до ответа: исчерпание — «не знаю».
      if (с.exhausted || без.exhausted) return;
      if (с.solvable !== без.solvable) {
        расхождения.push(`стол ${i}: с отсечением ${с.solvable}, без ${без.solvable}`);
      }
    });
    expect(расхождения).toEqual([]);
  });

  it('🔴 и обе стороны правда отвечали, а не молчали исчерпанием', () => {
    const ответили = столы.filter((b) => !solve(b, 60000, true).exhausted && !solve(b, 60000, false).exhausted);
    expect(ответили.length).toBeGreaterThanOrEqual(20);
  });

  it('отсечение ради чего и стоит: узлов меньше', () => {
    let сУзлов = 0; let безУзлов = 0;
    for (const b of столы.slice(0, 20)) {
      сУзлов += solve(b, 60000, true).nodes;
      безУзлов += solve(b, 60000, false).nodes;
    }
    expect(сУзлов).toBeLessThanOrEqual(безУзлов);
  });
});
