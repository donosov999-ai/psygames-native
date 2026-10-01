/* psygames-flutter-pseudoword-echo-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «ЭХО: ПСЕВДОСЛОВА» ИЗ ЖИВОГО TS — прогоном `levelParams`,
 * `maxConsonantCluster`, `buildRounds` (`app/games/pseudoword-echo.tsx`) и
 * `noiseGainFor` (`src/services/noise.ts`) на заданной очереди случайных чисел.
 * Случайность подставляется подменой `Math.random`: генератор псевдослов берёт
 * её сам.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-pseudoword-echo-reference.test.ts'
 */
import { levelParams, maxConsonantCluster, buildRounds } from '@/app/games/pseudoword-echo';
import { noiseGainFor } from '@/src/services/noise';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/pseudoword-echo-reference.json');

const QUEUE = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);
function withQueue<T>(shift: number, run: () => T): T {
  let i = shift;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => QUEUE[i++ % QUEUE.length]!);
  try { return run(); } finally { spy.mockRestore(); }
}

describe('эталоны «Эхо» для переноса на Flutter', () => {
  it('выгружает', () => {
    const levels = Array.from({ length: 16 }, (_, i) => ({ level: i + 1, ...levelParams(i + 1) }));
    const clusters = [
      ['strapl', 'en'], ['pasata', 'en'], ['встрёпка', 'ru'], ['мама', 'ru'], ['ъьъ', 'ru'],
      ['Straße', 'de'], ['pflanz', 'de'], ['cñsta', 'es'], ['xyz', 'fr'],
    ].map(([w, l]) => ({ word: w, lang: l, cluster: maxConsonantCluster(w!, l!) }));
    const games = [
      { lang: 'en', level: 1, shift: 3 },
      { lang: 'ru', level: 5, shift: 29 },
      { lang: 'es', level: 9, shift: 61 },
      { lang: 'de', level: 12, shift: 97 },
      { lang: 'pt', level: 15, shift: 131 },
    ].map((g) => {
      const p = levelParams(g.level);
      return { ...g, rounds: withQueue(g.shift, () => buildRounds(g.lang, p.trials, p.lenMin, p.lenMax, p.hardShare)) };
    });
    const noise = [null, 0, 3, 6, 9, 12, 15, 20, -3].map((snr) => ({ snr, gain: snr === null ? 0 : noiseGainFor(snr) }));

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-pseudoword-echo-reference.test.ts',
      queue: QUEUE, levels, clusters, games, noise,
    }, null, 1), 'utf8');
    expect(games.every((g) => g.rounds.length > 0)).toBe(true);
  });
});
