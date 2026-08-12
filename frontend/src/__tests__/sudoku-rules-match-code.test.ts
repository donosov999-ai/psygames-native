/**
 * Описание судоку обязано совпадать с ЛЕСТНИЦЕЙ ПРАВИЛ ИЗ КОДА.
 *
 * ЗАЧЕМ. Экран «Об игре» обрывал перечень на «L34 — кривые блоки», хотя levelConfig()
 * ставит на L34 точки Кропки, а кривые блоки только с L50. Между ними человек не видел
 * трёх правил вовсе: сэндвич, термометры, стрелки. Врало это в двенадцати локалях, и
 * заметил расхождение Кодекс при проходе игры 11.08.2026 — ни один гейт его не ловил.
 *
 * Хуже: по этому же устаревшему тексту было выдано задание на ступени сложности, то есть
 * ошибка успела разойтись дальше. Текст описания — такая же часть правды об игре, как
 * сама игра, и расхождение должно валить сборку, а не ждать внимательного человека.
 *
 * Тест держит ГРАНИЦЫ ФАЗ, а не формулировки: переводить правила можно как угодно,
 * а номер уровня, с которого правило включается, обязан совпадать с кодом. Словари
 * читаются текстом — так же, как в остальных regression-тестах: LanguageContext тянет
 * за собой React-контекст, а нам нужны только строки.
 */
import { levelConfig } from '@/src/services/sudoku-core';

declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/** Уровень, с которого включается каждый вариант — вычисляем из кода, не из памяти. */
function firstLevelOfEachVariant(): Map<string, number> {
  const first = new Map<string, number>();
  for (let lv = 1; lv <= 60; lv++) {
    const v = levelConfig(lv).variant;
    if (v !== 'none' && !first.has(v)) first.set(v, lv);
  }
  return first;
}

/**
 * Строка описания для ОДНОГО языка.
 *
 * ⚠️ Брать кусок файла целиком нельзя: русская и английская строки лежат рядом, и
 * поломка в одной маскируется соседней — первая версия этого теста была именно такой
 * и мутацию не поймала. Достаём ровно одну строку в кавычках.
 */
function introDesc(file: string, lang: string): string {
  const src = read(file);
  const i = src.indexOf('sudokuIntroDesc');
  if (i < 0) return '';
  // Берём на пару символов ЛЕВЕЕ имени ключа: в файлах локалей ключ записан в кавычках,
  // и открывающая кавычка иначе остаётся за границей среза.
  const chunk = src.slice(Math.max(0, i - 4), i + 6000);
  // Базовый словарь: ru: '...' / en: '...'. Файл локали: "sudokuIntroDesc": "...".
  const m = new RegExp(`\\b${lang}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(chunk)
    ?? /"sudokuIntroDesc":\s*"((?:[^"\\]|\\.)*)"/.exec(chunk);
  if (!m) {
    // Ключ в файле есть, а достать строку не вышло — молча пропускать нельзя:
    // ровно так гейт превращается в фикцию и пропускает поломку.
    throw new Error(`не удалось прочитать sudokuIntroDesc (${lang}) из ${file}`);
  }
  return m[1];
}

const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

describe('описание судоку не расходится с кодом', () => {
  const ladder = firstLevelOfEachVariant();

  it('лестница в коде: Кропки на L34, кривые блоки только на L50', () => {
    expect(ladder.get('kropki')).toBe(34);
    expect(ladder.get('jigsaw')).toBe(50);
    expect(ladder.size).toBeGreaterThanOrEqual(11);
  });

  it.each(['ru', 'en'])('описание на %s перечисляет все границы из кода', (lang) => {
    const desc = introDesc('src/contexts/LanguageContext.tsx', lang);
    expect(desc.length).toBeGreaterThan(200);
    const missing = [...ladder].filter(([, lv]) => !desc.includes(`L${lv} `));
    expect(missing.map(([v, lv]) => `${v}@L${lv}`)).toEqual([]);
  });

  it.each(LOCALES)('локаль %s перечисляет те же границы', (loc) => {
    const desc = introDesc(`src/contexts/translations/${loc}.ts`, loc);
    if (!desc) return;   // локаль может не переопределять описание — тогда возьмётся английское
    const missing = [...ladder].filter(([, lv]) => !desc.includes(`L${lv} `));
    expect(missing.map(([v, lv]) => `${v}@L${lv}`)).toEqual([]);
  });
});
