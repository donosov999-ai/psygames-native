/* psygames-chinese-tones-record-flutter-lesson · VER 1 · 30.09.2026 */
/**
 * ЭТАЛОН РАЗБОРА «ТОНОВ КИТАЙСКОГО» ДЛЯ FLUTTER-ПОЛОВИНЫ.
 *
 * 🔴 ЗАЧЕМ. «Тоны» нативные с 30.09, и в них стояла общая демо-карточка вместо разбора по шагам
 * (`frontend/src/games/chinese-tones/teach.ts`, задача d651a95c). Разбор переносится в
 * `flutter/lib/games/chinese_tones/lesson.dart` и сверяется с этим эталоном: слоги банка во всех
 * четырёх тонах и с парой «второй — третий» (по основе без знака тона) и карточки на записанном
 * потоке случайных чисел при разных текущих заданиях. Банк у Dart — ассет
 * `flutter/assets/vocab/zh-tone-bank.json` (прибор `scripts/flutter-chinese-tones-reference.test.ts`),
 * эталон пишет его размер, и проба сверит, что ассет снят с того же банка.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `teach.ts` или банка (`build-zh-pinyin.mjs`) — ПЕРЕЗАПУСТИТЬ оба прибора.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`):
 *   npx jest --testMatch '**\/chinese-tones/tools/record-flutter-lesson.gen.ts'
 */
import { ZH_TONE_BANK, ZH_TONE_BANK_COUNT } from '@/src/constants/zhToneBank.generated';
import { stripTone } from '../core/pinyin';
import { основыВоВсехТонах, основыСПарой23, собратьРазборТонов } from '../teach';

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
const ВИД: Record<string, string> = { приём: 'intro', тон: 'tone', пара: 'pair', готово: 'done' };

describe('эталон разбора «Тонов китайского» для Flutter', () => {
  it('пишет основы банка и карточки на записанных потоках', () => {
    const full = основыВоВсехТонах(ZH_TONE_BANK);
    const pair23 = основыСПарой23(ZH_TONE_BANK);
    // Текущее задание: нет · слог из основы во всех тонах · слог из основы с парой · любой другой.
    const excludes: (string | null)[] = [null];
    for (const тон of [1, 2, 3, 4] as const) {
      for (const с of ZH_TONE_BANK[тон].slice(0, 6)) excludes.push(с.pinyin);
    }
    for (const тон of [1, 2, 3, 4] as const) {
      for (const с of ZH_TONE_BANK[тон]) {
        if (full.includes(stripTone(с.pinyin))) excludes.push(с.pinyin);
      }
    }
    excludes.push(...pair23.slice(0, 4).map((о) => ZH_TONE_BANK[2].find((с) => stripTone(с.pinyin) === о)!.pinyin));
    const lessons: unknown[] = [];
    let seed = 11000;
    for (const exclude of excludes) {
      for (let k = 0; k < 2; k++) {
        const { rnd, values } = поток(seed += 1);
        const р = собратьРазборТонов(ZH_TONE_BANK, exclude, rnd);
        lessons.push({
          exclude, stream: values, base: р.основа,
          cards: р.карточки.map((к) => ({
            kind: ВИД[к.вид], key: к.ключ,
            fields: Object.fromEntries(Object.entries(к.поля ?? {}).map(([f, v]) => [f, String(v)])),
            tone: к.тон, speak: к.звук,
            sylls: к.слоги.map((с) => ({ zh: с.zh, pinyin: с.pinyin, tone: с.тон })),
          })),
        });
      }
    }
    const путь = join(ROOT, 'flutter/test/fixtures/chinese-tones-lesson-reference.json');
    mkdirSync(dirname(путь), { recursive: true });
    writeFileSync(путь, `${JSON.stringify({ source: 'frontend/src/games/chinese-tones/tools/record-flutter-lesson.gen.ts', bankCount: ZH_TONE_BANK_COUNT, full, pair23, lessons }, null, 1)}\n`);
    expect(full.length).toBeGreaterThanOrEqual(2);
  });
});
