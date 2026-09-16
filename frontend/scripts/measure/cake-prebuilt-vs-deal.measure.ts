/* psygames-cake-prebuilt-vs-deal-measure · VER 1 · 16.09.2026 */
/**
 * ПРЕМИСА ЗАМЕРА ЗВЁЗД: та ли доска, что получит игрок. Экран на уровнях 1…120
 * раздаёт вшитую `prebuilt(L)`, а замер лучом строит `deal(L).board`. Если это
 * разные доски, замер мерил не ту игру.
 */
import { deal } from '@/src/games/cake-sort/core/level';
import { prebuilt, PREBUILT_COUNT } from '@/src/games/cake-sort/core/prebuilt';

describe('СМЁТ вшитая доска против раздачи', () => {
  it('сравнение', () => {
    const разные: number[] = [];
    let образец = '';
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      const p = prebuilt(L) as any;
      const d = deal(L).board as any;
      const ps = JSON.stringify({ plates: p?.plates ?? p?.board?.plates, queue: p?.queue ?? p?.board?.queue });
      const ds = JSON.stringify({ plates: d.plates, queue: d.queue });
      if (ps !== ds) { разные.push(L); if (!образец) образец = `L${L}\n  вшитая: ${ps.slice(0, 160)}\n  раздача: ${ds.slice(0, 160)}`; }
    }
    process.stdout.write(`\nвшитых уровней ${PREBUILT_COUNT} · отличаются от deal(L): ${разные.length}${разные.length ? ' → ' + разные.slice(0, 20).join(',') : ''}\n${образец}\nключи prebuilt(1): ${Object.keys(prebuilt(1) as any).join(',')}\n`);
    expect(PREBUILT_COUNT).toBeGreaterThan(0);
  });
});
