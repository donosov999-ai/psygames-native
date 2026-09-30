/* psygames-flutter-phonemic-fluency-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «БЕГЛОСТЬ РЕЧИ» ИЗ ЖИВОГО TS — прогоном `isValidWord`,
 * `phonemicSummary`, `phonemicScriptFor`, `phonemicLetterPool`
 * (`src/services/phonemicFluency.ts`) и `defaultWordLang` / `wordLangsFor`
 * (`src/services/wordLanguage.ts`).
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-phonemic-fluency-reference.test.ts'
 */
import {
  isValidWord, phonemicSummary, phonemicScriptFor, phonemicLetterPool,
  RU_PHONEMIC_LETTERS, EN_PHONEMIC_LETTERS, PHONEMIC_CHARS, PHONEMIC_VOWELS,
} from '@/src/services/phonemicFluency';
import { defaultWordLang, wordLangsFor } from '@/src/services/wordLanguage';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/phonemic-fluency-reference.json');
const ASSET = path.resolve(__dirname, '../../flutter/assets/vocab/phonemic-fluency.json');

const UI = ['en', 'es', 'pt', 'hi', 'zh', 'de', 'fr', 'it', 'ja', 'ko', 'ar', 'ru'];

describe('эталоны «Беглость речи» для переноса на Flutter', () => {
  it('выгружает', () => {
    const words: [string, string, 'ru' | 'en'][] = [
      ['кот', 'К', 'ru'], ['ко', 'К', 'ru'], ['лампа', 'К', 'ru'], ['кот1', 'К', 'ru'],
      ['кран', 'К', 'ru'], ['ккк', 'К', 'ru'], ['кккот', 'К', 'ru'], ['кабабаб', 'К', 'ru'],
      ['к-т', 'К', 'ru'], ['кит-кот', 'К', 'ru'], ['kot', 'К', 'ru'], ['ёж', 'Ё', 'ru'], ['ёлка', 'Ё', 'ru'],
      ['свёкла', 'С', 'ru'], ['сыр', 'С', 'ru'], ['сырррр', 'С', 'ru'], ['к'.repeat(31), 'К', 'ru'],
      ['fish', 'F', 'en'], ['fff', 'F', 'en'], ['fly', 'F', 'en'], ['frrr', 'F', 'en'], ['fababab', 'F', 'en'],
      ['éclair', 'E', 'en'], ['apple', 'A', 'en'], ['apple', 'B', 'en'], ['a-b-c', 'A', 'en'], ['ab', 'A', 'en'],
      ['sun', 'S', 'en'], ['s1n', 'S', 'en'], ['кот', 'K', 'en'], ['fish', 'F', 'ru'],
    ];
    const checks = words.map(([raw, letter, script]) => ({ raw, letter, script, ...isValidWord(raw, letter, script) }));

    const said = [
      { word: 'кот', ts: 1000, valid: true },
      { word: 'кит', ts: 4000, valid: true },
      { word: 'кот', ts: 5000, valid: false, reason: 'repetition' },
      { word: 'лампа', ts: 9000, valid: false, reason: 'wrong_letter' },
      { word: 'ко', ts: 12000, valid: false, reason: 'too_short' },
      { word: 'кран', ts: 30500, valid: true },   // между 30 и 31 с: половина считается от старта (1 с), а не от нуля
      { word: 'кекс', ts: 45500, valid: true },
      { word: 'ккк', ts: 50000, valid: false, reason: 'no_vowels' },
    ];
    const s = phonemicSummary(said, 1000, 60);
    const summary = { ...s, validWords: s.validWords.map((w) => w.word) };

    const reference = {
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-phonemic-fluency-reference.test.ts',
      ruLetters: RU_PHONEMIC_LETTERS, enLetters: EN_PHONEMIC_LETTERS,
      wordLangs: wordLangsFor('phonemic_fluency'),
      byUi: UI.map((ui) => ({
        ui,
        defaultWordLang: defaultWordLang(ui, 'phonemic_fluency'),
        script: phonemicScriptFor(ui),
        pool: phonemicLetterPool(ui),
      })),
      checks,
      summaryInput: { said, startTs: 1000, duration: 60 },
      summary,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(reference, null, 1), 'utf8');
    // Буквы и письменности — данными веба: у приложения нет второй копии.
    const script = (k: 'ru' | 'en', letters: readonly string[]) => ({
      letters, chars: PHONEMIC_CHARS[k].source, vowels: PHONEMIC_VOWELS[k].source,
      ignoreCase: PHONEMIC_CHARS[k].flags.includes('i') && PHONEMIC_VOWELS[k].flags.includes('i'),
    });
    fs.writeFileSync(ASSET, JSON.stringify({
      source: 'frontend/src/services/phonemicFluency.ts',
      scripts: { ru: script('ru', RU_PHONEMIC_LETTERS), en: script('en', EN_PHONEMIC_LETTERS) },
      wordLangs: wordLangsFor('phonemic_fluency'),
    }), 'utf8');
    expect(checks.some((c) => c.valid)).toBe(true);
  });
});
