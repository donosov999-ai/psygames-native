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
const ИМЕНА_ТЭТХЭМА = join(SRC, 'games', 'tatham-bridge', 'names.ts');
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

/**
 * 🔴 СОРОК ДВЕ ГОЛОВОЛОМКИ НА ОДНОМ МАРШРУТЕ — И ОДНА СПРАВКА НА ВСЕХ.
 *
 * В каталоге движки Саймона Тэтхэма это ОДНА запись `/games/puzzles`, а режим
 * выбирается `?mode=<имя>`. Карта строилась по маршрутам, поэтому у всех сорока
 * двух был один и тот же `introKey` — `puzzlesUnrulyIntroDesc`. То есть человек
 * открывал «Галактики», жал «Правила» и читал про чёрные и белые клетки
 * «Чёт-нечета».
 *
 * 📍 Замер 16.09.2026: ключей `puzzles*IntroDesc` в словаре РОВНО ОДИН на 42
 * режима; коротких описаний `puzzles*Desc` — 44. Живая жалоба того же дня
 * (задача 2b774e8b): четыре РАЗНЫЕ головоломки брошены за 90 секунд подряд с
 * текстом «Как играть? Где справка?», кнопка «Правила» при этом видна на всех
 * четырёх кадрах. Кнопка была — за ней лежал чужой текст.
 *
 * Поэтому маршрут раскрывается по режимам: ключ карты `/games/puzzles?mode=<X>`.
 * Пока у режима нет своего `IntroDesc`, ставим его короткое описание — оно
 * переведено на все языки и говорит хотя бы про ЭТУ игру, а не про соседнюю.
 */
function режимыТэтхэма() {
  const src = readFileSync(ИМЕНА_ТЭТХЭМА, 'utf8');
  const кусок = (имя) => {
    const i = src.indexOf(`export const ${имя}`);
    return i < 0 ? '' : src.slice(i, src.indexOf('};', i));
  };
  /* ⚠️ Ключ бывает и в кавычках, и без них: `Net: 'puzzlesNet'`, но
     `'Light Up': 'puzzlesLightUp'` — многословные обязаны быть в кавычках.
     Первая редакция читала только закавыченные и нашла 4 режима из 42;
     карта вышла на четыре строки, и это выглядело как «почти всё готово». */
  const пары = (имя) => Object.fromEntries(
    [...кусок(имя).matchAll(/(?:'([^']+)'|([A-Za-z][A-Za-z0-9_]*))\s*:\s*'([^']+)'/g)]
      .map((m) => [m[1] ?? m[2], m[3]]),
  );
  const имена = пары('КЛЮЧ_ИМЕНИ');
  /* КЛЮЧ_ОПИСАНИЯ собирается из КЛЮЧ_ИМЕНИ по правилу «имя + Desc» — повторяем его,
     а не разбираем выражение: разбор сломался бы на первой же правке формулы. */
  const поумолчанию = (src.match(/ПО_УМОЛЧАНИЮ = '([^']+)'/) || [])[1] || 'Unruly';
  return { имена, поумолчанию };
}
const { имена: ИМЯ_РЕЖИМА, поумолчанию: РЕЖИМ_ПО_УМОЛЧАНИЮ } = режимыТэтхэма();

/** Маршрут → camelCase: '/games/sudoku-samurai' → 'sudokuSamurai'. */
const slug = (route) => route.split('/').pop().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * 🔴 ЗАИМСТВОВАННЫЕ ТЕКСТЫ — ИНАЧЕ ПЕРЕСБОРКА ИХ ТЕРЯЕТ.
 *
 * У трёх маршрутов своего текста нет, и им поставили чужой — родственной игры.
 * Правка делалась РУКАМИ прямо в сгенерированном файле, и потому жила до первой
 * пересборки: 16.09.2026 я перегенерировал карту и потерял все три (гейт
 * `help-map` покраснел на «без справки 3»). Файл подписан «AUTO-GENERATED» —
 * значит правки рукой в нём не живут, и место таким исключениям здесь.
 */
const ЗАИМСТВОВАНО = {
  '/games/ball-sort': 'waterSortIntroDesc',   // та же механика переливания
  '/games/nut-sort': 'waterSortIntroDesc',    // она же
  '/games/puzzles-hub': 'puzzlesUnrulyIntroDesc', // развилка: общий текст про все сорок две
};

const missing = [];
const entries = games.map(({ route, nameKey, skillKey }) => {
  /**
   * ⚠️ ДВА СОГЛАШЕНИЯ ИМЁН, А НЕ ОДНО. Основное — <nameKey>IntroDesc. Но у части
   * игр ключ назван по МАРШРУТУ, а не по ключу имени: у Шульте nameKey =
   * schulteTable, а текст лежит под schulteIntroDesc. Проверка «какие ключи
   * словаря не использованы» показала ровно один осиротевший — его же.
   * Поэтому пробуем оба и берём тот, что реально есть в словаре.
   */
  const introKey = [`${nameKey}IntroDesc`, `${slug(route)}IntroDesc`].find((k) => keys.has(k))
    ?? ЗАИМСТВОВАНО[route];
  if (!introKey) {
    missing.push(`${route} → нет текста (пробовали ${nameKey}IntroDesc и ${slug(route)}IntroDesc)`);
    return null;
  }
  return [route, { nameKey, skillKey, introKey }];
}).filter(Boolean);

/* ── раскрытие `/games/puzzles` по режимам ──────────────────────────────── */
const базовая = entries.find(([route]) => route === '/games/puzzles');
const безСправки = [];
if (базовая) {
  const skillKey = базовая[1].skillKey;
  for (const [режим, nameKey] of Object.entries(ИМЯ_РЕЖИМА)) {
    /* Свой текст «как ходить» → короткое описание этой же игры → в крайнем случае
       базовый. Третьего не случается: описание есть у всех сорока двух. */
    const свой = `${nameKey}IntroDesc`;
    const описание = `${nameKey}Desc`;
    const introKey = keys.has(свой) ? свой : keys.has(описание) ? описание : базовая[1].introKey;
    if (!keys.has(свой)) безСправки.push(`${режим} (${nameKey})`);
    /* Режим по умолчанию живёт на голом маршруте — его запись уже есть выше,
       но текст ей надо дать тот же, что и явному `?mode=`. */
    if (режим === РЕЖИМ_ПО_УМОЛЧАНИЮ) базовая[1] = { nameKey, skillKey, introKey };
    entries.push([`/games/puzzles?mode=${режим}`, { nameKey, skillKey, introKey }]);
  }
}

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
if (безСправки.length) {
  console.log(`\n📋 головоломок Тэтхэма без СВОЕГО текста «как ходить» (${безСправки.length} из ${Object.keys(ИМЯ_РЕЖИМА).length}):`);
  console.log('   показывают короткое описание игры; свой текст заводит владелец режима,');
  console.log('   ключ `<nameKey>IntroDesc` в LanguageContext. Раскладка — STRUCTURE.md.');
  console.log('   ' + безСправки.join(' · '));
}
if (missing.length) {
  console.log(`\n⚠️ нет текста справки (${missing.length}) — ключи надо завести в LanguageContext:`);
  for (const m of missing) console.log('   ' + m);
  process.exitCode = 1;
}
