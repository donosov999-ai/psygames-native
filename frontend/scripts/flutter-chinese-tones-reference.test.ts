/* psygames-flutter-chinese-tones-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «ТОНЫ КИТАЙСКОГО» ИЗ ЖИВОГО TS — прогоном `levelParams`,
 * `buildTrials` (`app/games/chinese-tones.tsx`) и ядра пиньиня
 * (`src/games/chinese-tones/core/pinyin.ts`) на заданной очереди случайных чисел
 * (подмена `Math.random`). Банк слогов HSK выгружается ассетом.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-chinese-tones-reference.test.ts'
 */
import { levelParams, buildTrials } from '@/app/games/chinese-tones';
import { allTones, toneOf, stripTone, applyTone } from '@/src/games/chinese-tones/core/pinyin';
import { ZH_TONE_BANK } from '@/src/constants/zhToneBank.generated';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/chinese-tones-reference.json');
const ASSET = path.resolve(__dirname, '../../flutter/assets/vocab/zh-tone-bank.json');

const QUEUE = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);
function withQueue<T>(shift: number, run: () => T): T {
  let i = shift;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => QUEUE[i++ % QUEUE.length]!);
  try { return run(); } finally { spy.mockRestore(); }
}

describe('эталоны «Тонов» для переноса на Flutter', () => {
  it('выгружает', () => {
    const levels = Array.from({ length: 16 }, (_, i) => ({ level: i + 1, ...levelParams(i + 1) }));
    const syllables = ['zhǎo', 'liú', 'guī', 'dòu', 'huán', 'nǚ', 'lüè', 'ma', 'xiǎo', 'shuō', 'qù'].map((p) => ({
      pinyin: p, tone: toneOf(p), bare: stripTone(p), all: allTones(p), back: applyTone(stripTone(p), toneOf(p)),
    }));
    const games = [
      { level: 1, shift: 11 }, { level: 7, shift: 53 }, { level: 12, shift: 97 },
    ].map((g) => {
      const p = levelParams(g.level);
      return {
        ...g,
        trials: withQueue(g.shift, () => buildTrials(p.trials, p.pinyinMode))
          .map((t) => ({ zh: t.syll.zh, pinyin: t.syll.pinyin, tone: t.tone, options: t.options, correctIdx: t.correctIdx })),
      };
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-chinese-tones-reference.test.ts',
      queue: QUEUE, levels, syllables, games,
    }, null, 1), 'utf8');
    fs.writeFileSync(ASSET, JSON.stringify({ source: 'frontend/src/constants/zhToneBank.generated.ts', bank: ZH_TONE_BANK }), 'utf8');
    expect(games.every((g) => g.trials.length > 0)).toBe(true);
  });
});
