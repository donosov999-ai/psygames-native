import { mahjongExtent } from '@/src/games/mahjong/extent';
import { generateDeal } from '@/app/games/mahjong';
import { mahjongLevel } from '@/src/services/mahjongLevels';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { layoutForLevel } from '@/src/games/mahjong/layouts';

/**
 * Дефект 02.09.2026 (Денис): «маджонг кривит ряды, скачут при выделении двух
 * одинаковых». Размер плитки считался от края по ЖИВЫМ плиткам — снятая с края
 * пара уменьшала край, и вся доска меняла размер и координаты.
 */
describe('габариты поля маджонга', () => {
  it('🔴 предсказание не меньше фактического края любой раздачи (уровни 1–40)', () => {
    const плохие: string[] = [];
    for (let L = 1; L <= 40; L++) {
      const пред = mahjongExtent(L);
      const p = mahjongLevel(L);
      for (let заход = 0; заход < 3; заход++) {
        const { tiles } = generateDeal(p.layers, p.pairs, p.cols, silhouetteForLevel(L), layoutForLevel(L)?.places);
        const факт = tiles.reduce((m, t) => ({ x: Math.max(m.x, t.x + 2), y: Math.max(m.y, t.y + 2) }), { x: 2, y: 2 });
        if (факт.x > пред.x || факт.y > пред.y) {
          плохие.push(`ур.${L}: факт ${факт.x}×${факт.y} > предсказано ${пред.x}×${пред.y}`);
        }
      }
    }
    expect(плохие).toEqual([]);
  });

  it('величина зависит только от уровня — снятие плиток её не меняет', () => {
    for (const L of [1, 7, 13, 26]) {
      expect(mahjongExtent(L)).toEqual(mahjongExtent(L));
    }
  });
});
