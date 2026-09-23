/**
 * У КАЖДОГО ИЗ ЧЕТЫРЁХ РЕЖИМОВ АНАГРАММ — СВОЯ СПРАВКА, НА ВСЕХ ЯЗЫКАХ.
 *
 * 🔴 ПОВОД — ПРИЁМКА §4б, пункт 1 (решение Дениса 16.09.2026): «приёмка
 * проходит, если есть справка уникальная для этой игры».
 *
 * 📍 ЗАМЕР 23.09.2026, собранная статика, четыре режима, окна 390 и 360:
 * адрес во ВСЕХ четырёх был один — `/games/anagrams?lang=ru`, без режима.
 * `GameHelpOverlay` ищет запись по `HELP_MAP['<маршрут>?mode=<режим>']` и без
 * режима в адресе откатывается на общую: все четыре игры показывали один текст.
 * Тот же адрес уходит в отчёты тестировщиков — восемь отзывов за два месяца
 * были неразличимы между собой.
 *
 * ЧТО СТЕРЕЖЁТ ПРОБА, тремя утверждениями:
 *   1. режимы берутся ИЗ ЭКРАНА (объявление состояния), а не переписаны сюда —
 *      появится пятый, проба покраснеет сама;
 *   2. у каждого режима есть своя запись в `helpMap` и свой `introKey`, и ключи
 *      РАЗНЫЕ: одна запись на четыре игры — это и есть исходный дефект;
 *   3. экран кладёт режим в адрес. Без этого записи есть, а справка их не видит:
 *      механизм был бы, до игрока не доехал.
 */
declare const __dirname: string;
declare function require(id: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const ROOT = join(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- рядом с fs/path выше
const { HELP_MAP } = require('../constants/helpMap');
const читать = (p: string) => readFileSync(join(ROOT, p), 'utf8') as string;

/** Режимы — из объявления состояния в самом экране. */
function режимыЭкрана(): string[] {
  const экран = читать('app/games/anagrams.tsx');
  /* Союз типов, а не начальное значение: инициализатор бывает и функцией
     (режим читается из адреса), и от этого список режимов не меняется. */
  const m = /useState<((?:'[a-z]+'\s*\|\s*)*'[a-z]+')>\s*\(/.exec(экран);
  expect(m).not.toBeNull();
  return m![1].split('|').map((s) => s.trim().replace(/'/g, ''));
}

/* Карта берётся ИМПОРТОМ, а не разбором файла: файл собирается генератором
   (`scripts/gen-helpmap.mjs`), и разбирать сгенерированное регуляркой — лишний
   способ разойтись. Заодно так проба видит ровно то, что видит приложение. */
const карта = () => HELP_MAP as Record<string, { introKey?: string; nameKey?: string }>;

it('🔴 у каждого режима своя запись справки, и ключи РАЗНЫЕ', () => {
  const режимы = режимыЭкрана();
  expect(режимы.length).toBeGreaterThanOrEqual(4);
  const m = карта();
  const ключи: string[] = [];
  const нет: string[] = [];
  for (const р of режимы) {
    const запись = m[`/games/anagrams?mode=${р}`];
    if (!запись?.introKey) { нет.push(р); continue; }
    ключи.push(запись.introKey);
  }
  expect(нет).toEqual([]);
  expect(new Set(ключи).size).toBe(режимы.length);   // один текст на четыре игры = дефект
});

it('🔴 текст каждого режима непустой на всех двенадцати языках', () => {
  const режимы = режимыЭкрана();
  const m = карта();
  const ctx = читать('src/contexts/LanguageContext.tsx');
  const языки = ['es', 'fr', 'de', 'it', 'pt', 'ar', 'hi', 'zh', 'ja', 'ko'];
  const пусто: string[] = [];
  for (const р of режимы) {
    const ключ = m[`/games/anagrams?mode=${р}`]!.introKey!;
    const ru = new RegExp(`\\n  ${ключ}: \\{\\s*\\n\\s*ru: '((?:[^'\\\\]|\\\\.)*)'`, 's').exec(ctx);
    const en = new RegExp(`\\n  ${ключ}: \\{[\\s\\S]*?en: '((?:[^'\\\\]|\\\\.)*)'`, 's').exec(ctx);
    if (!ru?.[1]?.trim()) пусто.push(`ru: ${ключ}`);
    if (!en?.[1]?.trim()) пусто.push(`en: ${ключ}`);
    for (const код of языки) {
      const файл = читать(`src/contexts/translations/${код}.ts`);
      const мм = new RegExp(`"${ключ}":\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(файл);
      if (!мм?.[1]?.trim()) пусто.push(`${код}: ${ключ}`);
    }
  }
  expect(пусто).toEqual([]);
});

it('🔴 экран кладёт режим в АДРЕС — иначе записи есть, а справка их не видит', () => {
  const экран = читать('app/games/anagrams.tsx');
  expect(экран).toMatch(/setParams\(\s*\{\s*mode:/);
  // И оверлей обязан читать режим из адреса — связка целиком, а не половина.
  expect(читать('src/components/GameHelpOverlay.tsx')).toMatch(/useGlobalSearchParams<\{\s*mode\?/);
});
