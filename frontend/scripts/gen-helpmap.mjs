#!/usr/bin/env node
/**
 * gen-helpmap — пересобирает src/constants/helpMap.ts по каталогу игр.
 *
 * ЗАЧЕМ. Карта связывает маршрут игры с ключами её справки, и по ней экран
 * GameHelpOverlay решает, что показать по кнопке «как играть». Маршрута нет в
 * карте — кнопка молча не показывает ничего.
 *
 * ⚠️ ПОЧЕМУ СКРИПТ ЛЕЖИТ ЗДЕСЬ, А НЕ В /tmp. Прошлый генератор жил по пути
 * /tmp/gen_helpmap.js — так и было написано в шапке сгенерированного файла. /tmp
 * чистится, скрипт пропал, и карта тихо отстала от каталога: 51 маршрут против
 * 63, двенадцать игр остались без справки. Обнаружилось только 14.08.2026 и
 * случайно — при сборке гайда для бота.
 *
 * ЗАПУСК:  node scripts/gen-helpmap.mjs
 * ПРОВЕРКА: гейт help-map.test.ts требует, чтобы каждый маршрут из GAMES был в
 * карте. Добавил игру, не перегенерировал — гейт краснеет.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const CATALOG = join(SRC, 'constants', 'games.ts');
const DICT = join(SRC, 'contexts', 'LanguageContext.tsx');
const OUT = join(SRC, 'constants', 'helpMap.ts');

/** Ключи словаря — и однострочные, и многострочные записи. */
function dictKeys(src) {
  const keys = new Set();
  for (const m of src.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\{/gm)) keys.add(m[1]);
  return keys;
}

/** Записи каталога: блоки верхнего уровня в массиве GAMES. */
function catalog(src) {
  const out = [];
  for (const block of src.split(/\n {2}\{/).slice(1)) {
    const g = (k) => (block.match(new RegExp(`${k}:\\s*'([^']+)'`)) || [])[1];
    const route = g('route');
    if (!route) continue;
    out.push({ route, nameKey: g('nameKey'), skillKey: g('skillKey') });
  }
  return out;
}

const keys = dictKeys(readFileSync(DICT, 'utf8'));
const games = catalog(readFileSync(CATALOG, 'utf8'));

/** Маршрут → camelCase: '/games/sudoku-samurai' → 'sudokuSamurai'. */
const slug = (route) => route.split('/').pop().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const missing = [];
const entries = games.map(({ route, nameKey, skillKey }) => {
  /**
   * ⚠️ ДВА СОГЛАШЕНИЯ ИМЁН, А НЕ ОДНО. Основное — <nameKey>IntroDesc. Но у части
   * игр ключ назван по МАРШРУТУ, а не по ключу имени: у Шульте nameKey =
   * schulteTable, а текст лежит под schulteIntroDesc. Проверка «какие ключи
   * словаря не использованы» показала ровно один осиротевший — его же.
   * Поэтому пробуем оба и берём тот, что реально есть в словаре.
   */
  const introKey = [`${nameKey}IntroDesc`, `${slug(route)}IntroDesc`].find((k) => keys.has(k));
  if (!introKey) {
    missing.push(`${route} → нет текста (пробовали ${nameKey}IntroDesc и ${slug(route)}IntroDesc)`);
    return null;
  }
  return [route, { nameKey, skillKey, introKey }];
}).filter(Boolean);

const body = entries
  .map(([route, e]) => `  ${JSON.stringify(route)}: {\n    "nameKey": ${JSON.stringify(e.nameKey)},\n    "skillKey": ${JSON.stringify(e.skillKey)},\n    "introKey": ${JSON.stringify(e.introKey)}\n  }`)
  .join(',\n');

writeFileSync(OUT, `// AUTO-GENERATED. route → ключи справки игры (имя/навык/intro-описание).
// Регенерировать: node scripts/gen-helpmap.mjs   (скрипт в репозитории, НЕ в /tmp)
export interface HelpEntry { nameKey: string; skillKey: string; introKey: string }
export const HELP_MAP: Record<string, HelpEntry> = {
${body}
};
`);

console.log(`маршрутов в каталоге: ${games.length}`);
console.log(`записано в карту:     ${entries.length}`);
if (missing.length) {
  console.log(`\n⚠️ нет текста справки (${missing.length}) — ключи надо завести в LanguageContext:`);
  for (const m of missing) console.log('   ' + m);
  process.exitCode = 1;
}
