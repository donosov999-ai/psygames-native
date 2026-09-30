/* psygames-mnemonics-record-flutter-reference · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН И ДАННЫЕ ДЛЯ FLUTTER-ПОЛОВИНЫ «МНЕМОНИКИ». Пишет два файла:
 *   · `flutter/test/fixtures/mnemonics-reference.json` — лестницы (`levelParams`, `pegQuizParams`),
 *     раздачи рядов, примеры окна удержания, ПАРТИИ «Опор» целиком (вопрос за вопросом, с тем же
 *     списком «уже спрошено», что ведёт экран) и карточки разбора;
 *   · `flutter/assets/mnemonics.json` — данные игры: словари слов, код 00–99 (слово и разбор
 *     «мёд: м=3 + д=1» на каждое число), правило кода и подписи режима на двух языках.
 *
 * 🔴 КАК СВЕРЯЕТСЯ СЛУЧАЙНОЕ. Раздача и вопросы зовут `rnd()`. Экспортёр записывает КАЖДОЕ
 * выданное число в эталон рядом с результатом, а Dart-проба проигрывает тот же поток. Перенос
 * генератора случайных чисел не нужен: совпасть обязан алгоритм, а не источник случайности.
 * Поток сеется (mulberry32), поэтому повторный запуск без правки ядра даёт тот же файл.
 *
 * ⚠️ ДАННЫЕ ИГРЫ — ДАННЫМИ, А НЕ КОДОМ. Слова опор, разборы и подписи режима едут ассетом: так
 * их не приходится переписывать на Dart (второй источник правды), а правка словаря в TS
 * приезжает в приложение перезапуском этого файла.
 *
 * ⚠️ ПОСЛЕ ЛЮБОЙ ПРАВКИ `frontend/src/games/mnemonics/{core,pegs,pegsQuiz,teach}.ts` —
 * ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ ОБА ФАЙЛА: эталон замораживает перенос, а не источник.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/mnemonics/tools/record-flutter-reference.gen.ts'
 */
import { RUSSIAN_WORDS, ENGLISH_WORDS } from '@/src/constants/games';
import { levelParams, новыйПример, раздатьРяд } from '../core';
import { PEG_RULE, PEG_TEXT, PEG_WORDS, hasPegTable, pegFor, pegHint } from '../pegs';
import { makePegQuestion, pegQuizParams } from '../pegsQuiz';
import { собратьРазборМнемоники } from '../teach';

declare const __dirname: string;
declare function require(m: string): any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mkdirSync, writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dirname, join } = require('path');
const ROOT = join(__dirname, '../../../../..');

/** Сеяный поток, который помнит всё, что выдал. */
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

function записать(путь: string, данные: unknown): void {
  const полный = join(ROOT, путь);
  mkdirSync(dirname(полный), { recursive: true });
  writeFileSync(полный, `${JSON.stringify(данные, null, 1)}\n`);
}

describe('эталон «Мнемоники» для Flutter', () => {
  it('пишет эталон и данные игры', () => {
    const уровни = [0, ...Array.from({ length: 16 }, (_, i) => i + 1), 40];
    const levelTable = уровни.map((level) => ({ level, ...levelParams(level) }));

    const examples = Array.from({ length: 30 }, (_, i) => {
      const { rnd, values } = поток(1000 + i);
      const п = новыйПример(rnd);
      return { stream: values, a: п.a, b: п.b, answer: п.ответ, options: п.варианты };
    });

    const rows: unknown[] = [];
    let seed = 2000;
    for (const mode of ['words', 'numbers'] as const) {
      for (const lang of ['ru', 'en', 'de']) {
        for (const count of [5, 8, 15]) {
          for (let k = 0; k < 2; k += 1) {
            const { rnd, values } = поток(seed += 1);
            rows.push({ mode, lang, count, stream: values, items: раздатьРяд(mode, count, lang, rnd) });
          }
        }
      }
    }

    const pegLevels = [0, ...Array.from({ length: 41 }, (_, i) => i + 1)];
    const pegParams = pegLevels.map((level) => ({ level, ...pegQuizParams(level) }));

    // Партия «Опор» целиком — как ведёт её экран: следующий вопрос избегает уже спрошенных.
    const pegRuns: unknown[] = [];
    for (const level of [1, 2, 3, 4, 6, 10, 12, 20, 29, 35, 40]) {
      for (const lang of ['ru', 'en'] as const) {
        const { rnd, values } = поток(3000 + level * 10 + (lang === 'ru' ? 0 : 1));
        const { count } = pegQuizParams(level);
        const спрошено: number[] = [];
        const questions = [];
        for (let i = 0; i < count; i += 1) {
          const q = makePegQuestion(level, lang, rnd, [...спрошено]);
          questions.push(q);
          спрошено.push(q.n);
        }
        pegRuns.push({ level, lang, stream: values, questions });
      }
    }

    const pegTable = (['ru', 'en', 'de'] as const).map((lang) => ({
      lang,
      has: hasPegTable(lang),
      words: Array.from({ length: 100 }, (_, n) => pegFor(n, lang)),
      hints: Array.from({ length: 100 }, (_, n) => pegHint(n, lang)),
    }));

    const lessonInputs: Array<{ items: string[]; mode: 'words' | 'numbers'; lang: string }> = [
      { items: ['дом', 'собака', 'река', 'лампа', 'ключ'], mode: 'words', lang: 'ru' },
      { items: ['house', 'dog'], mode: 'words', lang: 'en' },
      { items: ['окно'], mode: 'words', lang: 'ru' },
      { items: ['31', '82', '47', '90', '15'], mode: 'numbers', lang: 'ru' },
      { items: ['20', '99', '10'], mode: 'numbers', lang: 'en' },
      { items: ['31', '82', '47', '90', '15'], mode: 'numbers', lang: 'de' },
      { items: ['55'], mode: 'numbers', lang: 'ru' },
    ];
    const lessons = lessonInputs.map((вход) => ({
      ...вход,
      cards: собратьРазборМнемоники(вход.items, вход.mode, вход.lang).карточки.map((к) => ({
        kind: к.вид, key: к.ключ, fields: к.поля ?? {}, item: к.элемент,
      })),
    }));

    записать('flutter/test/fixtures/mnemonics-reference.json', {
      source: 'frontend/src/games/mnemonics/tools/record-flutter-reference.gen.ts',
      levelParams: levelTable,
      examples,
      rows,
      pegQuizParams: pegParams,
      pegRuns,
      pegTable,
      lessons,
    });

    записать('flutter/assets/mnemonics.json', {
      source: 'frontend/src/games/mnemonics/tools/record-flutter-reference.gen.ts',
      words: { ru: RUSSIAN_WORDS, en: ENGLISH_WORDS },
      pegs: Object.fromEntries((['ru', 'en'] as const).map((lang) => [lang, {
        words: PEG_WORDS[lang],
        hints: Array.from({ length: 100 }, (_, n) => pegHint(n, lang)),
        rule: PEG_RULE[lang],
        text: PEG_TEXT[lang],
      }])),
    });

    expect(examples).toHaveLength(30);
    expect(pegRuns.length).toBeGreaterThan(0);
  });
});
