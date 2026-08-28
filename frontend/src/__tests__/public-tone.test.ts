/* psygames-public-tone-gate · VER 1 · 28.08.2026 */
/**
 * ПУБЛИЧНЫЙ ТОН: история версий и строки интерфейса — для игрока, не для багтрекера.
 *
 * Правило Дениса 28.08 (поймал «Фрактальная судоку — по репортам Вали» в истории
 * версий): в текстах, которые видит игрок, НЕ пишут внутренним сленгом и домашними
 * именами. «Репорт» — слово багтрекера; по-русски игроку говорят «отзыв» или
 * «замечание». Тестеров упоминают благодарностью и полным именем: Валентина, не
 * Валя. Английское "report" не трогаем — в EN это обычное продуктовое слово
 * ("report a problem"); чистим русский сленг и короткое имя в любом языке.
 */
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const whatsNew = readFileSync(join(__dirname, '..', 'constants', 'whatsNew.ts'), 'utf8');
const lang = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');

/** Что запрещено в публичных текстах: [паттерн, чем заменять]. */
const FORBIDDEN: [RegExp, string][] = [
  [/репорт/i, '«отзыв» / «замечание»'],
  [/тестировщик|тестер\b/i, '«игрок» / благодарность по имени'],
  [/\bВал[яеию]\b/u, 'полное имя: Валентина'],
  [/Valya/i, 'Valentina'],
];

describe('публичный тон', () => {
  it('история версий (whatsNew) — без внутреннего сленга и домашних имён', () => {
    for (const [re, fix] of FORBIDDEN) {
      const hit = whatsNew.split('\n').findIndex((l: string) => re.test(l));
      expect(`${re} → ${fix}: строка ${hit + 1}`).toBe(`${re} → ${fix}: строка 0`);
    }
  });

  it('строки интерфейса (ru-значения словаря) — «отзывы», не «репорты»', () => {
    // Комментарии в словаре — внутренние, там «репорт» законен. Ловим только
    // строки, где в ОДНОЙ строке и ru-значение, и запрещённое слово.
    const bad = lang.split('\n').findIndex((l: string) => l.includes("ru: '") && /репорт|\bВал[яеию]\b/u.test(l));
    expect(`строка ${bad + 1}`).toBe('строка 0');
  });
});
