/* psygames-flutter-dictation-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «ДИКТАНТА» ИЗ ЖИВОГО TS — прогоном `buildPhrases`,
 * `dictationLangs`, `levelPhrases`, `levelCount`, `dictationLevelParams`
 * (`src/games/dictation/core/phrases.ts`) и `слогДо` (`core/phonoHint.ts`).
 * Таблица гласных подсказки выгружается ассетом: у приложения нет второй копии.
 *
 * ⚠️ Перемешивание фраз в экране — `sort(() => Math.random() - 0.5)`: его порядок
 * зависит от алгоритма сортировки движка и шаг в шаг не переносится. Сверяется
 * то, что правило ОБЕЩАЕТ: какие фразы годятся и сколько их берётся.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-dictation-reference.test.ts'
 */
import { buildPhrases, dictationLangs, levelPhrases, levelCount, dictationLevelParams } from '@/src/games/dictation/core/phrases';
import { слогДо, ОШИБОК_ДО_ПОДСКАЗКИ, ГЛАСНЫЕ } from '@/src/games/dictation/core/phonoHint';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/dictation-reference.json');
const ASSET = path.resolve(__dirname, '../../flutter/assets/vocab/dictation.json');

describe('эталоны «Диктанта» для переноса на Flutter', () => {
  it('выгружает', () => {
    const langs = dictationLangs();
    const phrases = Object.fromEntries(langs.map((l) => [l, buildPhrases(l)]));
    const byLevel = Array.from({ length: 16 }, (_, i) => i + 1).map((level) => ({
      level,
      count: levelCount(level),
      params: dictationLevelParams(level),
      fit: Object.fromEntries(langs.map((l) => [l, levelPhrases(buildPhrases(l), level).map((f) => f.text)])),
    }));
    const hints = [
      ['I like to sleep now', 0], ['I like to sleep now', 7], ['I like to sleep now', 10], ['strength', 0],
      ['мне нравится спать', 5], ['xyz abc', 1], ['a b', 0], ['brr', 0], ['', 0], ['word', 9],
    ].map(([t, p]) => ({ text: t, pos: p, to: слогДо(t as string, p as number) }));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-dictation-reference.test.ts',
      langs, phrases, byLevel, hints, errorsBeforeHint: ОШИБОК_ДО_ПОДСКАЗКИ,
    }, null, 1), 'utf8');
    fs.writeFileSync(ASSET, JSON.stringify({ source: 'frontend/src/games/dictation/core/phonoHint.ts ГЛАСНЫЕ', vowels: [...ГЛАСНЫЕ] }), 'utf8');
    expect(langs.length).toBeGreaterThan(0);
  });
});
