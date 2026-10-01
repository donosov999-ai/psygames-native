/* psygames-pseudoword-echo-record-flutter-lesson · VER 1 · 30.09.2026 */
/**
 * ЭТАЛОН РАЗБОРА «ЭХА ПСЕВДОСЛОВ» ДЛЯ FLUTTER-ПОЛОВИНЫ.
 *
 * 🔴 ЗАЧЕМ. «Эхо» нативное с 30.09, и в нём стояла общая демо-карточка вместо разбора по шагам
 * (`frontend/src/games/pseudoword-echo/teach.ts`, задача d651a95c). Разбор переносится в
 * `flutter/lib/games/pseudoword_echo/lesson.dart` и сверяется с этим эталоном: карточки на раундах
 * живого генератора (`buildRounds` экрана) по всем пяти языкам и четырём ступеням длины, плюс ручные
 * случаи, где вид ловушки не распознаётся (`null`), — генератор их не даёт, а ветки в коде есть.
 * Гласные записаны из веб-таблицы `VOWELS`: Dart берёт их из ассета генератора, и проба сверит, что
 * это одно и то же.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `teach.ts`, `buildRounds` или `VOWELS` — ПЕРЕЗАПУСТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`):
 *   npx jest --testMatch '**\/pseudoword-echo/tools/record-flutter-lesson.gen.ts'
 */
import { buildRounds, levelParams, VOWELS } from '@/app/games/pseudoword-echo';
import { разобратьЛовушку, собратьРазборЭха, type Ловушка } from '../teach';

declare const __dirname: string;
declare function require(m: string): any;
const { mkdirSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');
const ROOT = join(__dirname, '../../../../..');

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Виды латиницей: в Dart кириллица только в видимом тексте. */
const ВИД: Record<string, string> = { приём: 'intro', слушаем: 'listen', отсев: 'drop', ответ: 'answer', готово: 'done' };
const ЛОВУШКА: Record<string, string> = { гласная: 'vowel', согласная: 'consonant', перестановка: 'swap', удвоение: 'double' };
const ловушка = (л: Ловушка | null) =>
  л && { variant: л.вариант, kind: ЛОВУШКА[л.вид], at: л.где, was: л.было, now: л.стало };

describe('эталон разбора «Эха псевдослов» для Flutter', () => {
  it('пишет карточки на раундах живого генератора и ручные случаи распознавания', () => {
    const langs = ['en', 'es', 'pt', 'de', 'ru'];
    const vowels = Object.fromEntries(langs.map((l) => [l, VOWELS[l] || VOWELS.en!]));
    const lessons: unknown[] = [];
    let seed = 9000;
    for (const lang of langs) {
      for (const level of [1, 5, 9, 13]) {
        const p = levelParams(level);
        const spy = jest.spyOn(Math, 'random').mockImplementation(mulberry(seed += 1));
        let rounds;
        try { rounds = buildRounds(lang, 6, p.lenMin, p.lenMax, p.hardShare); } finally { spy.mockRestore(); }
        for (const r of rounds) {
          const р = собратьРазборЭха(r, vowels[lang]!);
          lessons.push({
            lang, level, word: r.word, options: r.options,
            traps: р.ловушки.map(ловушка),
            cards: р.карточки.map((к) => ({
              kind: ВИД[к.вид], key: к.ключ,
              fields: Object.fromEntries(Object.entries(к.поля ?? {}).map(([k, v]) => [k, String(v)])),
              variant: к.вариант, dropped: к.отсеяно, speak: к.звук, at: к.где,
            })),
          });
        }
      }
    }
    const ручные = [
      ['bamo', 'bomo'], ['bamo', 'bapo'], ['bamo', 'bmao'], ['bamo', 'bammo'], ['bamo', 'bamoo'],
      ['bamo', 'bemi'], ['bamo', 'bbmo'], ['bamo', 'xbamo'], ['bamo', 'bamoxy'], ['bamo', 'bmoa'],
      ['bamo', 'abmo'], ['bamo', 'bamo'], ['дома', 'дамо'], ['дома', 'домма'], ['дома', 'дмоа'],
      // два соседних различия, но не перестановка: генератор так не делает — вид не распознаётся
      ['bamo', 'beno'], ['bamo', 'bmmo'], ['дома', 'дуна'],
    ].map(([w, v]) => ({ word: w, variant: v, lang: /[а-я]/.test(w!) ? 'ru' : 'en' }))
      .map((c) => ({ ...c, trap: ловушка(разобратьЛовушку(c.word!, c.variant!, vowels[c.lang]!)) }));

    const путь = join(ROOT, 'flutter/test/fixtures/pseudoword-echo-lesson-reference.json');
    mkdirSync(dirname(путь), { recursive: true });
    writeFileSync(путь, `${JSON.stringify({ source: 'frontend/src/games/pseudoword-echo/tools/record-flutter-lesson.gen.ts', vowels, lessons, manual: ручные }, null, 1)}\n`);
    expect(lessons.length).toBeGreaterThan(100);
  });
});
