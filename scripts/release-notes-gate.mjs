#!/usr/bin/env node
/* psygames-release-notes-gate · VER 1 · 19.08.2026 */
/**
 * НЕ ДАЁТ СОБРАТЬ РЕЛИЗ, КАРТОЧКУ КОТОРОГО МАГАЗИН НЕ ПРОЧИТАЕТ.
 *
 * 🔴 ЗАЧЕМ. Выкладка в Play — САМЫЙ ПОСЛЕДНИЙ шаг: к нему уже собраны Android,
 * macOS, Windows и веб, пройдены все гейты и опубликован GitHub Release. Ошибка
 * в тексте карточки обнаруживается именно там, и стоит она полного круга: новый
 * тег, новая версия, полчаса сборок.
 *
 * Так и вышло 19.08.2026 дважды подряд. Первый раз записи под версию правда не
 * было. Второй — запись была, но её строки стояли в ДВОЙНЫХ кавычках, а разбор
 * понимал только одинарные: наружу шло «нет записи», и починка искалась не там.
 *
 * ЧТО ПРОВЕРЯЕТ (тем же кодом, которым потом читает выкладка — иначе гейт
 * проверял бы не то, что происходит на самом деле):
 *   · запись под версию из package.json есть и ЧИТАЕТСЯ;
 *   · в ru и en есть непустые строки;
 *   · после нарезки под лимит Google (500 символов на язык) остаётся хотя бы
 *     одна строка — иначе человек увидит пустую карточку обновления.
 *
 * Печатает то, что увидит человек. Карточку читают глазами, значит и в логе
 * сборки она должна быть видна глазами.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { extractNotes, format, PLAY_NOTES_LIMIT } = require(join(ROOT, '.github/scripts/whatsnew-notes.js'));

const version = JSON.parse(readFileSync(join(ROOT, 'frontend/package.json'), 'utf8')).version;
const notes = extractNotes(version);

if (notes.error) {
  console.error(`❌ карточка обновления: ${notes.error}`);
  console.error('');
  console.error('   В Play эта строка — единственное, что человек читает про обновление.');
  console.error(`   Поправь запись { version: '${version}', date, ru: [...], en: [...] } в`);
  console.error('   frontend/src/constants/whatsNew.ts — и только потом снимай тег.');
  process.exit(1);
}

const bad = [];
for (const [lang, items] of [['ru', notes.ru], ['en', notes.en]]) {
  const shown = format(items);
  if (!shown.trim()) {
    bad.push(`${lang}: после нарезки под ${PLAY_NOTES_LIMIT} символов не осталось ни строки`);
    continue;
  }
  const lines = shown.split('\n');
  console.log(`── ${lang.toUpperCase()}: ${lines.length} из ${items.length} пунктов, ${shown.length} символов из ${PLAY_NOTES_LIMIT}`);
  for (const l of lines) console.log(`   ${l}`);
}

if (bad.length) {
  console.error('❌ карточка обновления пуста:');
  for (const b of bad) console.error(`   ${b}`);
  process.exit(1);
}

console.log(`✅ карточка обновления v${version} читается и не пуста`);
