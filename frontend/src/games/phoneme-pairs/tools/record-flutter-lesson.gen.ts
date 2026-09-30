/* psygames-phoneme-pairs-record-flutter-lesson · VER 1 · 30.09.2026 */
/**
 * ЭТАЛОН РАЗБОРА «ФОНЕМНЫХ ПАР» ДЛЯ FLUTTER-ПОЛОВИНЫ.
 *
 * 🔴 ЗАЧЕМ. «Фонемы» нативные с 30.09 (b49d56219), и в них стояла общая демо-карточка вместо разбора
 * по шагам (`frontend/src/games/phoneme-pairs/teach.ts`, задача d651a95c). Разбор переносится в
 * `flutter/lib/games/phoneme_pairs/lesson.dart` и сверяется с этим эталоном: место расхождения
 * КАЖДОЙ пары каждого языка (по написанию, у китайского — по пиньиню, у английского и немецкого —
 * «гласный», без подсветки) и карточки на записанном потоке случайных чисел (экспортёр пишет каждое
 * выданное число, Dart проигрывает).
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `teach.ts` или `MINIMAL_PAIRS` — ПЕРЕЗАПУСТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`):
 *   npx jest --testMatch '**\/phoneme-pairs/tools/record-flutter-lesson.gen.ts'
 */
import { MINIMAL_PAIRS } from '@/app/games/phoneme-pairs';
import { ZH_PINYIN } from '@/src/constants/zhPinyin.generated';
import { гдеРасходятся, видРазличия, пулУровня, собратьРазборФонем, type Пара } from '../teach';

declare const __dirname: string;
declare function require(m: string): any;
const { mkdirSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');
const ROOT = join(__dirname, '../../../../..');

function поток(seed: number): { rnd: () => number; values: number[] } {
  let a = seed >>> 0;
  const values: number[] = [];
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    values.push(v);
    return v;
  };
  return { rnd, values };
}

/** Виды латиницей: в Dart кириллица только в видимом тексте. */
const ВИД: Record<string, string> = { приём: 'intro', пара: 'pair', проба: 'probe', ответ: 'answer', готово: 'done' };
const РАЗЛИЧИЕ: Record<string, string> = { буквы: 'letters', гласный: 'vowel', пиньинь: 'pinyin' };
const пиньинь = (знак: string) => ZH_PINYIN[знак]?.pinyin ?? знак;

describe('эталон разбора «Фонемных пар» для Flutter', () => {
  it('пишет места расхождения всех пар и карточки на записанных потоках', () => {
    const langs = Object.keys(MINIMAL_PAIRS);
    const where = langs.flatMap((lang) => MINIMAL_PAIRS[lang]!.map(([a, b]) => {
      const вид = видРазличия(lang);
      const место = вид === 'гласный' ? null : вид === 'пиньинь' ? гдеРасходятся(пиньинь(a), пиньинь(b)) : гдеРасходятся(a, b);
      return { lang, kind: РАЗЛИЧИЕ[вид], a, b, diff: место };
    }));

    const lessons: unknown[] = [];
    let seed = 7000;
    const снять = (lang: string, pool: Пара[], exclude: Пара | null, note: string) => {
      const { rnd, values } = поток(seed += 1);
      const р = собратьРазборФонем(pool, lang, exclude, rnd);
      lessons.push({
        note, lang, pool, exclude, stream: values,
        examples: р.примеры,
        cards: р.карточки.map((к) => ({
          kind: ВИД[к.вид], key: к.ключ,
          fields: Object.fromEntries(Object.entries(к.поля ?? {}).map(([k, v]) => [k, String(v)])),
          pair: к.пара, sounding: к.звучит, speak: к.звук, diff: к.отличие,
        })),
      });
    };
    for (const lang of langs) {
      for (const лёгкие of [true, false]) {
        const pool = пулУровня(MINIMAL_PAIRS[lang]!, лёгкие);
        снять(lang, pool, null, 'до партии');
        снять(lang, pool, pool[0]!, 'текущая пара');
        снять(lang, pool, [pool[1]![1], pool[1]![0]], 'текущая пара в обратном порядке кнопок');
      }
    }
    const две = MINIMAL_PAIRS.ru!.slice(0, 2);
    снять('ru', две, две[0]!, 'из двух пар одна текущая — один пример');
    снять('ru', две.slice(0, 1), две[0]!, 'единственная пара текущая — примеров нет');

    const путь = join(ROOT, 'flutter/test/fixtures/phoneme-pairs-lesson-reference.json');
    mkdirSync(dirname(путь), { recursive: true });
    writeFileSync(путь, `${JSON.stringify({ source: 'frontend/src/games/phoneme-pairs/tools/record-flutter-lesson.gen.ts', langs, where, lessons }, null, 1)}\n`);
    expect(where.length).toBeGreaterThan(70);
  });
});
