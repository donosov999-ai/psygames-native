/* psygames-flutter-phoneme-pairs-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «ФОНЕМЫ: МИНИМАЛЬНЫЕ ПАРЫ» ИЗ ЖИВОГО TS — прогоном
 * `levelParams` и `buildTrials` (`app/games/phoneme-pairs.tsx`) на заданной
 * очереди случайных чисел (подмена `Math.random`). Заодно выгружает пары и
 * пиньинь к иероглифам ассетом: у приложения нет второй копии.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-phoneme-pairs-reference.test.ts'
 */
import { levelParams, buildTrials, MINIMAL_PAIRS, PINYIN_HINT } from '@/app/games/phoneme-pairs';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/phoneme-pairs-reference.json');
const ASSET = path.resolve(__dirname, '../../flutter/assets/vocab/phoneme-pairs.json');

const QUEUE = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);
function withQueue<T>(shift: number, run: () => T): T {
  let i = shift;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => QUEUE[i++ % QUEUE.length]!);
  try { return run(); } finally { spy.mockRestore(); }
}

describe('эталоны «Фонем» для переноса на Flutter', () => {
  it('выгружает', () => {
    const levels = Array.from({ length: 16 }, (_, i) => ({ level: i + 1, ...levelParams(i + 1) }));
    const games = [
      { lang: 'en', level: 1, shift: 7 }, { lang: 'ru', level: 6, shift: 43 },
      { lang: 'zh', level: 12, shift: 89 }, { lang: 'de', level: 3, shift: 101 },
    ].map((g) => {
      const p = levelParams(g.level);
      const all = MINIMAL_PAIRS[g.lang] || MINIMAL_PAIRS.en;
      const pool = p.easyOnly ? all.slice(0, Math.max(2, Math.ceil(all.length / 2))) : all;
      return { ...g, pool: pool.length, trials: withQueue(g.shift, () => buildTrials(pool, p.trials)) };
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-phoneme-pairs-reference.test.ts',
      queue: QUEUE, levels, games,
    }, null, 1), 'utf8');
    fs.writeFileSync(ASSET, JSON.stringify({
      source: 'frontend/app/games/phoneme-pairs.tsx MINIMAL_PAIRS, PINYIN_HINT',
      pairs: MINIMAL_PAIRS, pinyin: PINYIN_HINT,
    }), 'utf8');
    expect(games.every((g) => g.trials.length > 0)).toBe(true);
  });
});
