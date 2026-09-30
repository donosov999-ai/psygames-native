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
import { readFileSync, writeFileSync } from 'node:fs';
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

// Заголовки самих развилок оставляем как были: они лежат отдельной таблицей.
try {
  const old = JSON.parse(readFileSync(OUT, 'utf8'));
  out.meta = old.meta ?? {};
  out.pick = old.pick;
} catch { /* первый запуск */ }
writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n');
console.log(`развилок: ${Object.keys(out.hubs).length} · карточек: ${cards} · все с ключами словаря`);
console.log(`раскладок по профилям: ${Object.keys(out.layouts).length} · адресов в них: ${layoutCards} · карточек вне реестра: ${Object.keys(out.extra).length}`);
