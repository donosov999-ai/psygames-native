/* psygames-dictation-record-flutter-lesson · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН РАЗБОРА «ДИКТАНТА» ДЛЯ FLUTTER-ПОЛОВИНЫ.
 *
 * 🔴 ЗАЧЕМ. «Диктант» нативный с #63, и в нём стояла общая демо-карточка вместо разбора по шагам
 * (`frontend/src/games/dictation/teach.ts`, задача d651a95c). Разбор переносится в
 * `flutter/lib/games/dictation/lesson.dart` и сверяется с этим эталоном: нарезка КАЖДОЙ фразы банка
 * на каждом языке (склейка обязана дать фразу знак в знак — ровно то, что примет игра) и карточки
 * на записанном потоке случайных чисел (экспортёр пишет каждое выданное число, Dart проигрывает).
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `teach.ts` или `core/phrases.ts` — ПЕРЕЗАПУСТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`):
 *   npx jest --testMatch '**\/dictation/tools/record-flutter-lesson.gen.ts'
 */
import { buildPhrases, dictationLangs, levelPhrases } from '../core/phrases';
import { разрезать, собратьРазборДиктанта } from '../teach';

declare const __dirname: string;
declare function require(m: string): any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mkdirSync, writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
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

/** Вид карточки латиницей: в Dart кириллица только в видимом тексте. */
const ВИД: Record<string, string> = { приём: 'intro', слушаем: 'listen', кусок: 'chunk', застрял: 'stuck', готово: 'done' };

describe('эталон разбора «Диктанта» для Flutter', () => {
  it('пишет нарезку всех фраз и карточки на записанных потоках', () => {
    const langs = dictationLangs();
    const chunks = langs.flatMap((lang) => buildPhrases(lang).map((ф) => ({ lang, text: ф.text, chunks: разрезать(ф.text, lang) })));
    const lessons: unknown[] = [];
    let seed = 4000;
    for (const lang of ['ru', 'en', 'zh', 'de']) {
      if (!langs.includes(lang)) continue;
      for (const level of [1, 5]) {
        const pool = levelPhrases(buildPhrases(lang), level);
        const exclude = pool[0]?.text ?? null;
        const { rnd, values } = поток(seed += 1);
        const р = собратьРазборДиктанта(pool, lang, exclude, rnd);
        lessons.push({
          lang, level, exclude, pool: pool.map((ф) => ф.text), stream: values,
          phrase: р?.фраза ?? null, chunks: р?.куски ?? null,
          cards: р?.карточки.map((к) => ({ kind: ВИД[к.вид], key: к.ключ, fields: к.поля ?? {}, typed: к.набрано, chunk: к.кусок, speak: к.звук })) ?? null,
        });
      }
    }
    const путь = join(ROOT, 'flutter/test/fixtures/dictation-lesson-reference.json');
    mkdirSync(dirname(путь), { recursive: true });
    writeFileSync(путь, `${JSON.stringify({ source: 'frontend/src/games/dictation/tools/record-flutter-lesson.gen.ts', langs, chunks, lessons }, null, 1)}\n`);
    expect(chunks.length).toBeGreaterThan(100);
  });
});
