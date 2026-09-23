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
const used = new Set();
const call = /\bL\.t\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/g;
for (const f of dartFiles(join(FLUTTER, 'lib'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(call)) used.add(m[1]);
}

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
  writeFileSync(join(OUT, `${loc}.json`), JSON.stringify(dict, null, 0) + '\n');
  report.push(`${loc}: ${Object.keys(dict).length} ключей${fell ? `, ${fell} с откатом на английский` : ''}`);
}
console.log(`ключей зовут из Dart: ${used.size}`);
report.forEach((r) => console.log('  ' + r));
