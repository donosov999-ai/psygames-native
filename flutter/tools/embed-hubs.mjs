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
// Заголовки самих развилок оставляем как были: они лежат отдельной таблицей.
try {
  const old = JSON.parse(readFileSync(OUT, 'utf8'));
  out.meta = old.meta ?? {};
  out.pick = old.pick;
} catch { /* первый запуск */ }
writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n');
console.log(`развилок: ${Object.keys(out.hubs).length} · карточек: ${cards} · все с ключами словаря`);
