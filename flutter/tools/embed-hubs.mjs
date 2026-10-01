#!/usr/bin/env node
// КАРТОЧКИ РАЗВИЛОК — С КЛЮЧАМИ СЛОВАРЯ, А НЕ С ГОТОВЫМ РУССКИМ ТЕКСТОМ.
//
// 🔴 ЧТО БЫЛО СЛОМАНО. `assets/hubs.json` вёз готовые строки: «Детский мат»,
// «Тактика · мат в 1–2 хода…». Значит ВСЕ 13 развилок показывали один язык —
// русский, — а приложение говорит на двенадцати. Нашёл раздел «Судоку»
// 23.09.2026, и нашёл не гейтом: храповик зашитого текста смотрит КОД, а здесь
// текст лежал в ДАННЫХ и проходил мимо него.
//
// В вебе ключи есть и всегда были: `frontend/src/constants/hubContents.ts`
// хранит `nameKey` и `descKey`. При первой выгрузке их развернули в текст —
// вот эту потерю генератор и чинит.
//
// Запуск: node flutter/tools/embed-hubs.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const SRC = join(FLUTTER, '..', 'frontend', 'src', 'constants', 'hubContents.ts');
const OUT = join(FLUTTER, 'assets', 'hubs.json');

const src = readFileSync(SRC, 'utf8');

/** Объект-литерал из TS читаем вычислением: в значениях кавычки и юникод. */
function evalAfter(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`не найдено: ${marker}`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      const body = text.slice(open, i + 1).replace(/,(\s*[}\]])/g, '$1');
      return new Function('return ' + body)();
    }
  }
  throw new Error(`не закрыт объект: ${marker}`);
}

const table = evalAfter(src, 'export const HUB_CONTENTS');
const out = { hubs: {}, meta: {}, source: 'frontend/src/constants/hubContents.ts' };
let cards = 0;
let missing = 0;
for (const [route, list] of Object.entries(table)) {
  out.hubs[route] = list.map((c) => {
    cards++;
    if (!c.nameKey) missing++;
    return {
      route: c.route,
      icon: c.icon,
      // 🔴 КЛЮЧИ, а не текст: экран берёт их через L.t и говорит на всех языках.
      nameKey: c.nameKey ?? null,
      descKey: c.descKey ?? null,
      type: c.type ?? null,
    };
  });
}
if (missing) {
  console.error(`🔴 у ${missing} карточек из ${cards} нет ключа названия — без него перевода не будет`);
  process.exit(1);
}
/*
 * 🔴 РАСКЛАДКА РАЗВИЛОК ПО ПРОФИЛЮ — ВТОРОЙ СЛОЙ, И БЕЗ НЕГО НАТИВ ПОКАЗЫВАЕТ НЕ ТО.
 *
 * ПОЙМАНО 24.09.2026 отчётом Дениса: «в хабах лагает — то старый хаб без Тэтхэма,
 * то новый с Тэтхэмом». Замер по файлу состава против нативного набора:
 *   Головоломки 4 против 40 · Судоку 12 против 5 · Пространство 17 против 9
 *   Сортировка 17 против 8 · Счёт 14 против 7 · Поиск 13 против 8.
 * То есть сорок режимов Тэтхэма давно разнесены по тематическим развилкам
 * решениями Дениса, а нативная сторона осталась на ЗАВОДСКОМ списке. Два разных
 * состава у одной развилки — человек и видел их попеременно.
 *
 * Веб берёт так: `состав?.профили?.[id]?.хабы ?? состав?.хабы ?? заводской`
 * (`ProfileContext.tsx:218`). Повторяем ту же цепочку, чтобы совпадало при ЛЮБОМ
 * профиле, а не только у того, на котором проверяли.
 *
 * ⚠️ Карточку нельзя ПРИДУМАТЬ файлом: строка ищется в заводском реестре, а
 * объект несёт свои ключи. Так же устроен веб (`visibleHubCards`), и расходиться
 * этим двум нельзя.
 */
const СОСТАВ = join(FLUTTER, '..', 'frontend', 'src', 'constants', 'defaultPlaylists.json');
out.layouts = {};
// Карточки, которых нет в заводском реестре (режимы Тэтхэма, разнесённые по
// развилкам). Общая таблица на все профили: карточка одна, профилей тринадцать.
out.extra = {};
let layoutCards = 0;
try {
  const состав = JSON.parse(readFileSync(СОСТАВ, 'utf8'));
  const заводскиеАдреса = new Set(Object.values(table).flat().map((c) => c.route));
  for (const [профиль, тело] of Object.entries(состав['профили'] ?? {})) {
    const хабы = тело?.['хабы'];
    if (!хабы) continue;
    const свой = {};
    for (const [route, items] of Object.entries(хабы)) {
      /*
       * 🔴 РАСКЛАДКА ХРАНИТСЯ АДРЕСАМИ, А НЕ КОПИЯМИ КАРТОЧЕК.
       *
       * Первая редакция клала в каждую раскладку карточку целиком — вышло 1001
       * копия на тринадцать профилей, ассет распух, и проба развилки покраснела
       * не на смысле, а на времени разбора. Карточка одна на всех: адрес здесь,
       * описание — в заводском реестре или в общей таблице `extra`.
       */
      свой[route] = items
        .map((э) => {
          if (typeof э === 'string') return заводскиеАдреса.has(э) ? э : null;
          const маршрут = э['маршрут'];
          if (!маршрут || !э['имя']) return null;
          if (!заводскиеАдреса.has(маршрут) && !out.extra[маршрут]) {
            out.extra[маршрут] = {
              route: маршрут,
              icon: э['значок'] ?? 'extension-puzzle',
              nameKey: э['имя'],
              descKey: э['описание'] ?? э['имя'],
              type: null,
            };
          }
          return маршрут;
        })
        .filter(Boolean);
      layoutCards += свой[route].length;
    }
    out.layouts[профиль] = свой;
  }
} catch (e) {
  console.error(`🔴 файл состава не разобран (${СОСТАВ}): ${e.message}`);
  process.exit(1);
}

/*
 * 🔴 КЛЮЧ УРОВНЯ КАРТОЧКИ — ИЗ ЭКРАНА ИГРЫ, А НЕ ИЗ АДРЕСА.
 *
 * Развилка показывает «ур. N» — то, за чем человек в неё и возвращается. Каркас
 * выводил ключ из адреса (`/games/schulte` → `schulte`), и замер 23.09.2026 нашёл
 * три карточки из 113, где это врёт: Шульте пишет уровень как `schulte_table`.
 * С раскладками по профилям (`extra`) таких стало больше: у 45 карточек в адресе
 * РЕЖИМ (`/games/puzzles?mode=Slide`), и вывод из адреса даёт бессмыслицу —
 * человек с десятым уровнем «Клоцек» видел «ур. 1».
 *
 * Поэтому ключ снимается ТЕМ ЖЕ способом, каким его пишет веб-экран:
 *  · обычный адрес — единственный литерал `usePersistentLevel('…')` в экране;
 *  · головоломки — формула `puzzles.tsx` (режим строчными, пробелы → `_`);
 *  · «Лаборатория» — литерал `spatial_lab_<режим>` в её экране;
 *  · нативная игра с режимом (веб-экрана нет, `NATIVE_ONLY_GAMES`) — литерал
 *    `<игра>_<режим>` в её Dart-коде (`flutter/lib/games/<игра>/`). Нет литерала —
 *    генератор ПАДАЕТ: карточка показывала бы уровень из адреса, то есть чужой.
 * Если веб поменяет формулу — генератор падает, а не пишет тихо старый ключ.
 * Поле ставится только там, где ключ ОТЛИЧАЕТСЯ от выводимого из адреса.
 */
const GAMES = join(FLUTTER, '..', 'frontend', 'app', 'games');
const экраны = new Map();
function экран(имя) {
  if (!экраны.has(имя)) {
    let текст = '';
    try { текст = readFileSync(join(GAMES, `${имя}.tsx`), 'utf8'); } catch { /* экрана нет */ }
    экраны.set(имя, текст);
  }
  return экраны.get(имя);
}
const формулаГоловоломок = "`puzzles_${имяРежима.toLowerCase().replace(/\\s+/g, '_')}`";
if (!экран('puzzles').includes(формулаГоловоломок)) {
  console.error('🔴 в puzzles.tsx сменилась формула ключа уровня — поправь embed-hubs.mjs, иначе развилки покажут чужой уровень');
  process.exit(1);
}
// Нативные игры без веб-экрана — по реестру `NATIVE_ONLY_GAMES` (адреса литералами).
const НАТИВНЫЕ = new Set(
  [...readFileSync(join(FLUTTER, '..', 'frontend', 'src', 'constants', 'nativeOnlyGames.ts'), 'utf8')
    .matchAll(/route:\s*'([^']+)'/g)].map((m) => m[1]),
);
function дартИгры(имя) {
  const папка = join(FLUTTER, 'lib', 'games', имя.replace(/-/g, '_'));
  try {
    return readdirSync(папка).filter((f) => f.endsWith('.dart')).map((f) => readFileSync(join(папка, f), 'utf8')).join('\n');
  } catch { return ''; }
}
const безКлюча = [];
function ключУровня(route) {
  const [путь, хвост = ''] = route.split('?');
  const имя = путь.split('/').pop();
  const изАдреса = route.split('/').pop().replace(/-/g, '_');
  const режим = new URLSearchParams(хвост).get('mode');
  let ключ = null;
  if (режим && имя === 'puzzles') {
    ключ = `puzzles_${режим.toLowerCase().replace(/\s+/g, '_')}`;
  } else if (режим && имя === 'spatial-lab') {
    const лит = `spatial_lab_${режим}`;
    if (экран(имя).includes(`'${лит}'`)) ключ = лит;
  } else if (режим && НАТИВНЫЕ.has(route)) {
    const лит = `${имя.replace(/-/g, '_')}_${режим}`;
    if (!дартИгры(имя).includes(`'${лит}'`)) {
      console.error(`🔴 нативная карточка ${route}: в flutter/lib/games/${имя.replace(/-/g, '_')}/ нет ключа лестницы '${лит}'`);
      process.exit(1);
    }
    ключ = лит;
  } else if (!режим) {
    const найдено = new Set([...экран(имя).matchAll(/usePersistentLevel\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
    if (найдено.size === 1) ключ = [...найдено][0];
  }
  if (!ключ) {
    if (режим) безКлюча.push(route);
    return null;
  }
  return ключ === изАдреса ? null : ключ;
}
let сКлючом = 0;
for (const list of [...Object.values(out.hubs), Object.values(out.extra)]) {
  for (const c of list) {
    const k = ключУровня(c.route);
    if (k) { c.levelKey = k; сКлючом++; }
  }
}
out._levelKey = 'Ключ уровня карточки, снятый с веб-экрана игры (embed-hubs.mjs). Пусто — ключ совпадает с выводимым из адреса.';

// Заголовки самих развилок оставляем как были: они лежат отдельной таблицей — это ДАННЫЕ, а не генерат.
// 🔴 Файла нет — первый запуск. Файл есть, но не разбирается (маркеры конфликта после слияния) — СТОП.
// Тихий `catch` здесь 01.10.2026 стёр title/desc/footnote у всех 13 развилок и «Выбери упражнение»
// (цепочка PR #79 → #80 → #81): у трёх развилок без ключей — «Конфликт внимания», «Объём памяти»,
// «Судоку: три доски» — заголовок стал пустым. Та же ловушка, что у embed-l10n.
let прежний = null;
try { прежний = readFileSync(OUT, 'utf8'); } catch { /* первый запуск: файла нет */ }
if (прежний !== null) {
  let old;
  try { old = JSON.parse(прежний); } catch {
    console.error(`🔴 ${OUT} есть, но не разбирается (конфликт слияния?). meta и pick в нём — данные, генератор их не`
      + ' восстановит: сначала разреши конфликт (возьми meta и pick со стороны, где они целы), потом запускай генератор.');
    process.exit(1);
  }
  out.meta = old.meta ?? {};
  out.pick = old.pick;
}

/*
 * 🔴 ЗАГОЛОВОК РАЗВИЛКИ — КЛЮЧОМ СЛОВАРЯ, КАК В ВЕБЕ. Нашёл раздел «Языки»
 * 30.09.2026: `meta` вёз только русский текст («Слух», «Выбери упражнение»),
 * и нативная развилка на остальных одиннадцати языках говорила по-русски, хотя
 * веб-экран той же развилки берёт `titleKey`/`descKey`/`pickKey`/`footnoteKey`.
 * Ключи снимаются с самого веб-экрана — второго реестра нет; текст остаётся
 * запасным для развилок, у экрана которых ключей нет.
 */
const КЛЮЧИ_ЗАГОЛОВКА = ['titleKey', 'descKey', 'pickKey', 'footnoteKey'];
let заголовковСКлючом = 0;
for (const route of Object.keys(out.hubs)) {
  const текст = экран(route.split('/').pop());
  const m = (out.meta[route] ??= {});
  let нашлось = false;
  for (const поле of КЛЮЧИ_ЗАГОЛОВКА) {
    const hit = текст.match(new RegExp(`\\b${поле}="([A-Za-z0-9_]+)"`));
    if (hit) { m[поле] = hit[1]; нашлось = true; } else delete m[поле];
  }
  if (нашлось) заголовковСКлючом++;
}
writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n');
console.log(`развилок: ${Object.keys(out.hubs).length} · карточек: ${cards} · все с ключами словаря · заголовков с ключом: ${заголовковСКлючом}`);
console.log(`ключ уровня снят с экрана у ${сКлючом} карточек · режимов без ключа: ${безКлюча.length}${безКлюча.length ? ' — ' + безКлюча.join(', ') : ''}`);
console.log(`раскладок по профилям: ${Object.keys(out.layouts).length} · адресов в них: ${layoutCards} · карточек вне реестра: ${Object.keys(out.extra).length}`);
