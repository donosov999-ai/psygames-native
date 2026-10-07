/**
 * 🔴 N-BACK, ОСЬ 9 — ГЛУБИНА МЕНЯЕТСЯ ВНУТРИ ПАРТИИ (задача 103cd98d, 02.10.2026).
 *
 * Объявить сложность, которая не исполняется, — дефект, который раздел уже чинил (nJitter,
 * объявленный и не построенный, убран 07.09). Поэтому здесь не только «levelParams обещает»,
 * но и исполнение: генератор строит блок по плану глубины с ТОЧНОЙ квотой целей и приманок
 * на каждой позиции, а постоянная глубина выходит прежней до последней цифры.
 */
import {
  buildNbackSequence, buildNbackSequenceVar, countLuresVar, countMatchesVar, MATCH_RATE, nPlanFor,
} from '@/src/games/nback/sequence';
import { levelParams } from '@/app/games/n-back';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('n-back: глубина по позициям', () => {
  it('план: отрезками по switchEvery чередуются N и N − 1; без switchEvery — постоянная N', () => {
    expect(nPlanFor(10, 6, 4).join('')).toBe('6666555566');
    expect(nPlanFor(5, 6).join('')).toBe('66666');
    expect(nPlanFor(4, 1, 2).join('')).toBe('1111');   // N − 1 = 0 не бывает
  });

  it('🔴 постоянная глубина — прежний блок до последней цифры (обёртка не меняет поток ГПСЧ)', () => {
    for (const [n, rate] of [[2, undefined], [4, 0.3], [6, 0.45]] as const) {
      const a = buildNbackSequence(30, n, 9, lcg(7 + n), rate);
      const b = buildNbackSequenceVar(30, new Array(30).fill(n), 9, lcg(7 + n), rate ?? undefined);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it('🔴 квота точна на каждой глубине плана: совпадений — 30 % годных позиций, приманок — доля уровня', () => {
    const off: string[] = [];
    for (const L of [27, 30, 33, 40]) {
      const p = levelParams(L);
      for (let seed = 1; seed <= 40; seed++) {
        const plan = nPlanFor(20, p.N, p.switchEvery);
        const seq = buildNbackSequenceVar(20, plan, 9, lcg(seed * 31 + L), p.lureRate);
        const eligible = plan.filter((n, i) => i >= n).length;
        const matches = countMatchesVar(seq.items, plan);
        const lures = countLuresVar(seq.items, plan);
        if (matches !== Math.round(eligible * MATCH_RATE)) off.push(`L${L} #${seed}: совпадений ${matches}`);
        if (lures !== Math.round(eligible * (p.lureRate ?? 0))) off.push(`L${L} #${seed}: приманок ${lures}`);
      }
    }
    expect(`расхождений: ${off.length}${off.length ? ' — ' + off.slice(0, 5).join('; ') : ''}`).toBe('расхождений: 0');
  });

  it('🔴 смена глубины бьёт по d′ игрока, которому нужно время перестроиться (замер, а не объявление)', () => {
    // Игрок с идеальной памятью, но после смены глубины ещё `lag` проб отвечает по ПРЕЖНЕЙ N —
    // цена переключения. Ось работает, если чем чаще смена, тем ниже его точность.
    function accuracyAt(L: number): number {
      const p = levelParams(L);
      let right = 0;
      let total = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const plan = nPlanFor(20, p.N, p.switchEvery);
        const seq = buildNbackSequenceVar(20, plan, 9, lcg(seed * 7 + L), p.lureRate);
        let since = 99;
        for (let i = 0; i < 20; i++) {
          since = i > 0 && plan[i] !== plan[i - 1] ? 0 : since + 1;
          const used = since < 2 && i > 0 ? plan[i - 1 - since] ?? plan[i] : plan[i];
          if (i < plan[i]) continue;
          const truth = seq.items[i] === seq.items[i - plan[i]];
          const said = i >= used && seq.items[i] === seq.items[i - used];
          total += 1;
          if (truth === said) right += 1;
        }
      }
      return right / total;
    }
    const a26 = accuracyAt(26);
    const a27 = accuracyAt(27);
    const a33 = accuracyAt(33);
    expect(`L26 ${a26 === 1} · L27 ниже L26 ${a27 < a26} · L33 ниже L27 ${a33 < a27}`)
      .toBe('L26 true · L27 ниже L26 true · L33 ниже L27 true');
  });
});
