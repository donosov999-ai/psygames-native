/**
 * @jest-environment node
 */
/* psygames-cake-record-reference · VER 1 · 23.09.2026
 *
 * ЗАМЕР КАЛИБРОВКИ ЭТАЛОНА ХОДОВ → `core/reference-calibration.json`.
 *
 * 🔴 ЗАЧЕМ (задача af4c7ff1). Проба `cake-sort-reference` считала эту калибровку
 * заново на каждом прогоне: двадцать четыре стола, точный поиск A* с бюджетом
 * 200 000 узлов, 231–346 с в CI. Число меняется раз в полгода, а платили за него
 * каждый раз. Теперь замер делается здесь и лежит данными.
 *
 * ⚠️ ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/tools/record-reference.gen.ts' --testTimeout 3600000
 *
 * ⚠️ ПЕРЕЗАПУСКАТЬ ПОСЛЕ ЛЮБОЙ ПРАВКИ ПРАВИЛ ИЛИ РЕШАТЕЛЯ. Если этого не сделать,
 * проба поймает расхождение сама: она перемеряет живьём выборку столов и сверяет
 * с записанным.
 */
import { minMoves } from '../core/solver';
import { всеСтолы, стол } from './reference-boards';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

describe('замер калибровки эталона', () => {
  it('минимум посчитан на каждом столе калибровки', () => {
    const t0 = Date.now();
    const замеры: { types: number; plates: number; seed: number; min: number | null; nodes: number }[] = [];
    for (const { types, plates, seed } of всеСтолы()) {
      const m = minMoves(стол(types, plates, seed), 200_000);
      замеры.push({ types, plates, seed, min: m.moves, nodes: m.nodes ?? 0 });
    }
    const секунд = Math.round((Date.now() - t0) / 100) / 10;
    const дошли = замеры.filter((z) => z.min !== null).length;

    const файл = path.join(__dirname, '..', 'core', 'reference-calibration.json');
    fs.writeFileSync(файл, `${JSON.stringify({
      note: 'Точный минимум ходов на столах калибровки. Пишет tools/record-reference.gen.ts',
      budget: 200000,
      boards: замеры,
    }, null, 1)}\n`);
    // eslint-disable-next-line no-console
    console.log(`замерено за ${секунд} с · столов ${замеры.length} · A* дошёл до дна на ${дошли}`);

    expect(замеры.length).toBe(24);
    expect(дошли).toBeGreaterThanOrEqual(12);
  }, 3_600_000);
});
