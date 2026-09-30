/* psygames-flutter-lexical-decision-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «СЛОВО ИЛИ НЕТ?» ИЗ ЖИВОГО TS — прогоном `levelParams` и
 * `buildLexicalTrials` из `app/games/lexical-decision.tsx` и генератора
 * `src/services/pseudowords.ts` на заданной очереди случайных чисел.
 *
 * Генератор псевдослов берёт `Math.random` сам, поэтому очередь подставляется
 * подменой `Math.random`, а не параметром: общий сервис остаётся нетронутым.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-lexical-decision-reference.test.ts'
 */
import { levelParams, buildLexicalTrials } from '@/app/games/lexical-decision';
import { generatePseudowords, sampleRealWords, PSEUDOWORD_LANGS, VOWELS, CONSONANTS, DEVANAGARI_CONSONANTS } from '@/src/services/pseudowords';
import { LANGUAGES } from '@/src/contexts/LanguageContext';
import { WORD_LANG_LABEL } from '@/src/services/wordLanguage';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/lexical-decision-reference.json');
const NAMES = path.resolve(__dirname, '../../flutter/assets/vocab/lang-names.json');
const LETTERS = path.resolve(__dirname, '../../flutter/assets/vocab/pseudoword-letters.json');

const QUEUE = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);

/** Подставить очередь вместо Math.random на время одного вызова. */
function withQueue<T>(shift: number, run: () => T): T {
  let i = shift;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => QUEUE[i++ % QUEUE.length]!);
  try { return run(); } finally { spy.mockRestore(); }
}

describe('эталоны «Слово или нет?» для переноса на Flutter', () => {
  it('выгружает', () => {
    const levels = Array.from({ length: 16 }, (_, i) => ({ level: i + 1, ...levelParams(i + 1) }));

    const generator = PSEUDOWORD_LANGS.map((lang, k) => ({
      lang,
      shift: 11 * k,
      pseudo: withQueue(11 * k, () => generatePseudowords(lang, 12)),
      real: withQueue(11 * k + 5, () => sampleRealWords(lang, 8)),
    }));

    const games = [
      { name: 'ru → en, уровень 1', target: 'en', second: 'es', bilingual: false, count: 14, language: 'ru', shift: 3 },
      { name: 'ru → de, уровень 12', target: 'de', second: 'es', bilingual: false, count: 22, language: 'ru', shift: 17 },
      { name: 'ru → en+es, билингво', target: 'en', second: 'es', bilingual: true, count: 18, language: 'ru', shift: 41 },
      { name: 'en → es+de, билингво', target: 'es', second: 'de', bilingual: true, count: 14, language: 'en', shift: 59 },
      { name: 'ru → zh', target: 'zh', second: 'en', bilingual: false, count: 10, language: 'ru', shift: 71 },
      { name: 'ru → hi', target: 'hi', second: 'en', bilingual: false, count: 10, language: 'ru', shift: 83 },
      { name: 'билингво, нечётное число проб', target: 'pt', second: 'en', bilingual: true, count: 7, language: 'ru', shift: 97 },
    ].map((g) => ({
      ...g,
      trials: withQueue(g.shift, () => buildLexicalTrials(g)).map((t) => ({ text: t.text, isWord: t.isWord, lang: t.язык })),
    }));

    const reference = {
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-lexical-decision-reference.test.ts',
      queue: QUEUE, passAccuracy: 0.8,
      levels, pseudowordLangs: PSEUDOWORD_LANGS, generator, games,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(reference, null, 1), 'utf8');
    // Самоназвания языков — данные веба, а не текст экрана: одинаковы на всех языках.
    fs.writeFileSync(NAMES, JSON.stringify({
      source: ['frontend/src/contexts/LanguageContext.tsx LANGUAGES', 'frontend/src/services/wordLanguage.ts WORD_LANG_LABEL'],
      languages: Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name])),
      wordLabels: WORD_LANG_LABEL,
    }), 'utf8');
    // Таблицы букв генератора — единственная копия у приложения (не переписывать руками).
    fs.writeFileSync(LETTERS, JSON.stringify({
      source: 'frontend/src/services/pseudowords.ts',
      vowels: VOWELS, consonants: CONSONANTS, devanagari: DEVANAGARI_CONSONANTS,
    }), 'utf8');
    expect(games.every((g) => g.trials.length > 0)).toBe(true);
  });
});
