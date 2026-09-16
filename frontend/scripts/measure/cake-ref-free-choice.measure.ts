/* psygames-cake-ref-free-choice-measure · VER 1 · 16.09.2026 */
/**
 * ЗАМЕР: сколько ходов на КРУГ нужно при новых правилах («любой кусок»).
 *
 * ЗАЧЕМ. `REF_PER_TYPE = 5.6` снят A*-перебором ПО СТАРОМУ правилу, где ход
 * брал верхний кусок стопки. С 16.09.2026 кусок выбирает игрок, ходов нужно
 * меньше — значит эталон завышен, и три звезды стали доступнее, чем задумано.
 * Пороги звёзд стоят на этом числе, поэтому его надо переснять тем же способом.
 *
 * ⚠️ ГРАНИЦЫ ЗАМЕРА ЗАРАНЕЕ. A* доходит до дна только на малых столах: при
 * новых правилах ветвление шире (260 ходов на L20 против прежних десятков), и с
 * L5 точный минимум не считается вовсе при 40 000 узлов. Значит число снимается
 * по видам 2…4, а дальше ЭКСТРАПОЛИРУЕТСЯ — ровно та же честная граница, что
 * записана в шапке `stars.ts` про 5,6.
 */
import { deal } from '@/src/games/cake-sort/core/level';
import { minMoves } from '@/src/games/cake-sort/core/solver';
import { allSectors, CIRCLE } from '@/src/games/cake-sort/core/plate';

describe('СМЁТ эталона при свободном выборе', () => {
  jest.setTimeout(3_600_000);

  it('ходов на круг', () => {
    const строки: string[] = [];
    const доли: number[] = [];
    for (const L of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const d = deal(L);
      const кругов = Math.round(allSectors(d.board).length / CIRCLE);
      const т0 = Date.now();
      const r = minMoves(d.board, 60_000);
      const мс = Date.now() - т0;
      if (r.moves !== null && кругов > 0) доли.push(r.moves / кругов);
      строки.push(`L${String(L).padStart(2)} · кругов ${String(кругов).padStart(2)}`
        + ` · минимум ${r.moves ?? '—'} · на круг ${r.moves !== null && кругов ? (r.moves / кругов).toFixed(2) : '—'}`
        + ` · узлов ${r.nodes} · ${мс} мс`);
    }
    const сорт = [...доли].sort((a, b) => a - b);
    console.log(['', 'ХОДОВ НА КРУГ, СВОБОДНЫЙ ВЫБОР:', ...строки, '',
      доли.length
        ? `коридор ${сорт[0]?.toFixed(2)}…${сорт[сорт.length - 1]?.toFixed(2)} · медиана ${сорт[Math.floor(сорт.length / 2)]?.toFixed(2)} · досок ${доли.length}`
        : 'ни одна доска не досчиталась',
    ].join('\n'));
    expect(строки.length).toBe(8);
  });
});
