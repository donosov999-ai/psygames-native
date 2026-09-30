/* psygames-flutter-cloze-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «CLOZE: ФРАЗЫ» ИЗ ЖИВОГО TS — прогоном `levelParams`,
 * `clozeOrderPhrases` и `buildClozeRounds` из `app/games/cloze.tsx` на заданной
 * очереди случайных чисел. Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-cloze-reference.test.ts'
 */
import { CLOZE_PHRASES } from '@/src/constants/clozePhrases';
import { levelParams, clozeOrderPhrases, buildClozeRounds } from '@/app/games/cloze';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const ВЫХОД = path.resolve(__dirname, '../../flutter/test/fixtures/cloze-reference.json');
const АССЕТ = path.resolve(__dirname, '../../flutter/assets/vocab/cloze-phrases.json');

const ОЧЕРЕДЬ = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);
function очередь(сдвиг = 0): () => number {
  let i = сдвиг;
  return () => ОЧЕРЕДЬ[i++ % ОЧЕРЕДЬ.length]!;
}

describe('эталоны cloze для переноса на Flutter', () => {
  it('выгружает', () => {
    const уровни = Array.from({ length: 15 }, (_, i) => ({ level: i + 1, ...levelParams(i + 1) }));

    const порядки = [
      { имя: 'en, ничего не видел', lang: 'en', seen: [] as string[], rounds: 8 },
      { имя: 'en, часть видел', lang: 'en', seen: (CLOZE_PHRASES.en ?? []).slice(0, 5).map((f) => f.text), rounds: 8 },
    ].map((c) => {
      const r = clozeOrderPhrases(CLOZE_PHRASES[c.lang] ?? [], c.seen, c.rounds, очередь());
      return { ...c, ordered: r.ordered.map((f) => f.text), seenAfter: r.seen };
    });

    const партии = [
      { имя: 'ru→en, 8 раундов', пара: ['en', 'es'], билингво: false, rounds: 8 },
      { имя: 'ru→en+es, 10 раундов, билингво', пара: ['en', 'es'], билингво: true, rounds: 10 },
    ].map((c) => {
      const поЯзыку: Record<string, { text: string; answerEn: string }[]> = {};
      for (const л of c.билингво ? c.пара : [c.пара[0]!]) {
        поЯзыку[л] = clozeOrderPhrases(CLOZE_PHRASES[л] ?? [], [], c.rounds, очередь()).ordered;
      }
      const rounds = buildClozeRounds(поЯзыку, c.rounds, c.билингво, 'ru', c.пара, очередь(29));
      return { ...c, поЯзыку: Object.fromEntries(Object.entries(поЯзыку).map(([k, v]) => [k, v.map((f) => f.text)])), раунды: rounds };
    });

    const эталон = {
      снято: '2026-09-30', прибор: 'frontend/scripts/flutter-cloze-reference.test.ts',
      очередь: ОЧЕРЕДЬ, сдвигРаундов: 29, проходТочностью: 0.8, ключЗапаса: 'cloze_phrases_<язык>',
      уровни, порядки, партии,
      фраз: Object.fromEntries(Object.entries(CLOZE_PHRASES).map(([k, v]) => [k, v.length])),
    };
    fs.mkdirSync(path.dirname(ВЫХОД), { recursive: true });
    fs.writeFileSync(ВЫХОД, JSON.stringify(эталон, null, 1), 'utf8');
    fs.writeFileSync(АССЕТ, JSON.stringify(CLOZE_PHRASES), 'utf8');
    expect(партии.every((x) => x.раунды.length === x.rounds)).toBe(true);
  });
});
