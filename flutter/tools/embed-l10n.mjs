#!/usr/bin/env node
// СЛОВАРЬ ДЛЯ НАТИВНЫХ ЭКРАНОВ — НЕ ПИШЕТСЯ ЗАНОВО, А БЕРЁТСЯ У ВЕБ-СТОРОНЫ.
//
// 🔴 ПОЧЕМУ ТАК. В вебе двенадцать языков, 2921 ключ в базовом словаре
// (frontend/src/contexts/LanguageContext.tsx) и десять готовых накладок
// (frontend/src/contexts/translations/<язык>.ts), которые генерирует воркфлоу
// translate-psygames-i18n. Заводить второй словарь для Flutter — значит завести
// второй источник правды и второе место, где перевод отстаёт. Поэтому словарь
// один, а этот скрипт лишь ВЫРЕЗАЕТ из него подмножество, нужное нативным экранам.
//
// 🔴 ПОЧЕМУ ПОДМНОЖЕСТВО, А НЕ ВСЁ. Гибрид уже несёт веб-сборку внутри (101,5 МБ
// против 51,1 у нынешней версии). Полный словарь на 12 языков — это ещё несколько
// мегабайт поверх того, что и так лежит в assets/web. Вырезаем ровно те ключи,
// которые нативные экраны действительно зовут через L.t('…'), — набор растёт сам
// по мере переезда, и ни один ключ не попадает в сборку «на всякий случай».
//
// Запуск: node flutter/tools/embed-l10n.mjs   (из корня дерева)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 🔴 ПО ЗАПИСИ НА СТРОКУ, А НЕ ОДНОЙ СТРОКОЙ (01.10.2026). Файл писался `JSON.stringify(…, null, 0)` —
 * целиком в одну строку (en.json — 98 597 знаков), и git сравнивал его одной строкой: ЛЮБЫЕ два PR,
 * добавившие хоть по ключу, конфликтовали всегда. «Шахматы» дважды за утро ловили конфликт к концу
 * CI. Теперь верхние уровни — по записи на строку (порядок тот же), глубже — компактно: git сводит
 * добавления в разных местах сам, а размер почти не растёт.
 */
function jsonLines(v, depth) {
  if (depth <= 0 || v === null || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
  const items = Object.entries(v).map(([k, x]) => JSON.stringify(k) + ':' + jsonLines(x, depth - 1));
  return items.length ? '{\n' + items.join(',\n') + '\n}' : '{}';
}


const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const ROOT = join(FLUTTER, '..');
const WEB = join(ROOT, 'frontend', 'src', 'contexts');
const OUT = join(FLUTTER, 'assets', 'l10n');

const LOCALES = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];
const OVERLAY = LOCALES.filter((l) => l !== 'ru' && l !== 'en');

/** Объект-литерал из TS читаем вычислением, а не регуляркой: в значениях есть
 *  апострофы и кавычки, и regexp на них ломается молча. */
function evalObjectAfter(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`не найдено начало: ${marker}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      return new Function('return ' + src.slice(open, i + 1))();
    }
  }
  throw new Error(`не закрыт объект: ${marker}`);
}

function dartFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...dartFiles(p));
    else if (name.endsWith('.dart')) out.push(p);
  }
  return out;
}

// 1. Какие ключи зовут нативные экраны.
//
// 🔴 ДВЕ ДВЕРИ, А НЕ ОДНА: `L.t('ключ')` и `L.f('ключ', {…})` — со вставкой чисел.
// 📍 Замер 24.09.2026: регулярка искала только `L.t(`, и ключ, живущий ТОЛЬКО в
// `L.f`, молча не попадал в словарь — экран показывал сам ключ вместо текста.
// Поймано на `tolWonPreset` («Лондонская башня»). Три соседних экрана
// (`levelDone` у «Лиц и имён», «Дворца памяти», «Пар слов») уцелели случайно:
// тот же ключ зовётся у них ещё и через `L.t`. Ни одна проба этого не видит —
// подстановка молча возвращает ключ, а не падает.
const used = new Set();
const call = /\bL\.[tf]\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/g;
// ⚠️ КОММЕНТАРИИ ОТСЕКАЕМ. В `l10n.dart` пример вызова стоит прямо в описании
// (`L.f('levelOf', …)`), и без этого шага инструмент честно требовал завести в
// веб-словаре ключ, которого не зовёт ни один экран.
const withoutComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
for (const f of dartFiles(join(FLUTTER, 'lib'))) {
  const src = withoutComments(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(call)) used.add(m[1]);
}

// 1в. КЛЮЧИ, ОБЪЯВЛЕННЫЕ СПИСКОМ.
//
// 🔴 Третий способ позвать ключ — через свою функцию: `L.t(teachStepKey(шаг))` у
// разбора по шагам. Литерала в вызове нет, и шаблон 1а его не видит; данных в
// ассете, как у развилок, тоже нет — ключ живёт в коде игры. Поэтому игра обязана
// объявить их списком `const …Keys = <String>[…]`, а сборщик читает такие списки.
// 📍 Замер 30.09.2026: без этой двери четыре объяснения разбора анаграмм собрались
// в словарь НИКАК, и экран показал бы `teachAnagramLook` вместо текста.
for (const f of dartFiles(join(FLUTTER, 'lib'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/const\s+\w*Keys\s*=\s*(?:<String>)?\s*\[([^\]]*)\]/g)) {
    for (const lit of m[1].matchAll(/'([A-Za-z][\w.]*)'/g)) used.add(lit[1]);
  }
}

// 1б. КЛЮЧИ, КОТОРЫЕ ЗОВУТСЯ ПЕРЕМЕННОЙ, А НЕ ЛИТЕРАЛОМ.
//
// 🔴 Шаблон выше находит только `L.t('имя')`. А карточки развилок и режимов
// головоломок берут ключ ИЗ ДАННЫХ: `L.t(c.nameKey)`. Такие ключи в исходнике
// не написаны вовсе, и первый же прогон после перевода развилок оставил бы их
// без строк — экран показал бы сами ключи. Поэтому собираем их из собранных
// ассетов: там они лежат явно.
for (const [file, fields] of [
  ['assets/hubs.json', ['nameKey', 'descKey', 'titleKey', 'pickKey', 'footnoteKey']],
  ['assets/puzzles/modes.json', ['titleKey', 'digitNames', 'secondKey', 'secondPickKey']],
  // Каталог «Игры» (задача f5025027): названия, описания, навыки и разделы — из выгрузки games.ts.
  ['assets/catalog.json', ['nameKey', 'descKey', 'skillKey', 'titleKey']],
  ['assets/game_help_routes.json', ['introKey']],
]) {
  let data;
  // 🔴 НЕТ ФАЙЛА — пропустить можно; ЕСТЬ, НО НЕ ЧИТАЕТСЯ — СТОП. Замер 01.10.2026: после
  // слияния веток hubs.json стоял с маркерами конфликта, разбор падал, `catch` молча шёл
  // дальше — и словарь собрался на 710 ключей вместо 831: выпали ~90 имён и описаний
  // карточек развилок, экран показал бы ключи. Порядок после слияния: embed-hubs, потом этот.
  let raw;
  try { raw = readFileSync(join(FLUTTER, file), 'utf8'); } catch { continue; }
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`🔴 ${file} есть, но не разбирается (${e.message.split('\n')[0]}) — конфликт слияния? Сначала node flutter/tools/embed-hubs.mjs`);
    process.exit(1);
  }
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const f of fields) {
      const v = node[f];
      if (typeof v === 'string' && v) used.add(v);
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && x && used.add(x));
    }
    Object.values(node).forEach(walk);
  };
  walk(data);
}

// 1в. ПРАВИЛА УРОВНЕЙ: ключ собирается из игры и правила, `lr_<игра>_<ключ>_<поле>`.
//
// Каркас показывает карточку правила по таблице `assets/level_rules.json` (её выгружает
// `frontend/src/games/level-rules/tools/export-level-rules.gen.ts`), и ни одного такого
// ключа литералом в Dart нет. Без этого шага карточка пришла бы без текста — задача
// e371fd3a, 30.09.2026. Пример у правила необязателен, поэтому берём только то, что есть.
const lrWanted = new Set();
try {
  const rules = JSON.parse(readFileSync(join(FLUTTER, 'assets/level_rules.json'), 'utf8')).games;
  for (const [game, ranges] of Object.entries(rules)) {
    for (const [, , key] of ranges) {
      if (key) ['title', 'rule', 'example'].forEach((f) => lrWanted.add(`lr_${game}_${key}_${f}`));
    }
  }
} catch { /* таблицы нет — и правил во Flutter нет */ }

// 2. Словари веба.
const base = evalObjectAfter(
  readFileSync(join(WEB, 'LanguageContext.tsx'), 'utf8'),
  'const translations: Translations = {',
);
const overlays = Object.fromEntries(
  OVERLAY.map((loc) => [
    loc,
    evalObjectAfter(readFileSync(join(WEB, 'translations', `${loc}.ts`), 'utf8'),
      'const t: Record<string, string> = {'),
  ]),
);

// 3. Ключ, которого в веб-словаре нет, — это ошибка, а не повод молча пропустить:
//    словарь один, и заводить строку надо в нём, иначе перевода не будет НИГДЕ.
/*
 * 🔴 ПРАВИЛО ЕСТЬ У КАЖДОЙ ПЕРЕХВАЧЕННОЙ ИГРЫ, И КЛЮЧ ЕГО НИКТО НЕ ЗОВЁТ ЯВНО.
 *
 * Справку каркас показывает САМ, по адресу открытой игры: ключ выводится правилом
 * `<имя адреса>Desc` (`/games/go-no-go` → `goNoGoDesc`). Шаблон `L.t('ключ')` таких
 * ключей не видит — их в исходнике нет, — и десять правил не доехали бы в сборку,
 * хотя в словаре лежат. Замер 24.09.2026: из двенадцати игр без карточки в развилке
 * у десяти правило в вебе БЫЛО.
 */
for (const файл of ['lib/shell/hybrid_app.dart', 'lib/shell/puzzle_routes.g.dart']) {
  let код = '';
  try { код = readFileSync(join(FLUTTER, файл), 'utf8'); } catch { continue; }
  for (const m of код.matchAll(/'(\/games\/[^']+)':/g)) {
    const адрес = m[1].split('?')[0].split('/').pop();
    const camel = адрес.split('-').map((ч, i) => (i ? ч[0].toUpperCase() + ч.slice(1) : ч)).join('');
    const ключ = `${camel}Desc`;
    if (base[ключ]) used.add(ключ);
  }
}

// Правила уровней: в словарь уходит то, что в веб-словаре есть. Нет заголовка или текста —
// это дыра веба (её сторожит гейт level-rules-i18n), и карточку каркас тогда не покажет.
const lrNoText = [];
for (const k of lrWanted) {
  if (base[k]) used.add(k);
  else if (!k.endsWith('_example')) lrNoText.push(k);
}
if (lrNoText.length) console.warn(`⚠️ правила уровней без текста в веб-словаре (${lrNoText.length}): ${lrNoText.slice(0, 8).join(', ')}`);

const orphans = [...used].filter((k) => !base[k]);
if (orphans.length) {
  console.error(`🔴 ${orphans.length} ключей зовут из Dart, но их нет в веб-словаре:`);
  for (const k of orphans.slice(0, 20)) console.error(`   · ${k}`);
  console.error(`Заведи их в frontend/src/contexts/LanguageContext.tsx и перегенерируй накладки`);
  console.error(`воркфлоу translate-psygames-i18n — тогда строка переведётся во всех 12 языках.`);
  process.exit(1);
}

// 4. Вырезаем подмножество.
mkdirSync(OUT, { recursive: true });
const report = [];
for (const loc of LOCALES) {
  const dict = {};
  let fell = 0;
  for (const k of [...used].sort()) {
    const entry = base[k];
    const v = loc === 'ru' || loc === 'en'
      ? entry[loc]
      : (overlays[loc]?.[k] ?? entry[loc] ?? entry.en);
    if (loc !== 'ru' && loc !== 'en' && !overlays[loc]?.[k]) fell++;
    dict[k] = v;
  }
  writeFileSync(join(OUT, `${loc}.json`), jsonLines(dict, 1) + '\n');
  report.push(`${loc}: ${Object.keys(dict).length} ключей${fell ? `, ${fell} с откатом на английский` : ''}`);
}
console.log(`ключей зовут из Dart: ${used.size}`);
report.forEach((r) => console.log('  ' + r));
