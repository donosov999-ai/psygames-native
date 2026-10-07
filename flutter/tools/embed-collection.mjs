#!/usr/bin/env node
// ФИГУРКИ КОЛЛЕКЦИИ ДЛЯ НАТИВНОГО РАСЧЁТА — ТАБЛИЦА ВЕБА, А НЕ ВТОРАЯ КОПИЯ (d6a60b02, вариант Б).
//
// «Коллекция» считает модель на Dart (`lib/shell/collection_model.dart`), а фигурки и их пороги живут
// у веба в `frontend/src/services/collection.ts` (FIGURES). Скрипт вырезает их в
// `assets/collection.json`; правка порога на вебе без пересборки краснеет в CI. Имя фигурки — ключ
// `fig<Key>`: его подбирает `embed-l10n.mjs` по полю `nameKey`.
//
// Запуск: node flutter/tools/embed-collection.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', '..', 'frontend', 'src', 'services', 'collection.ts'), 'utf8');
const start = src.indexOf('export const FIGURES');
const open = src.indexOf('= [', start) + 2;
let depth = 0;
let figures = null;
for (let i = open; i < src.length; i++) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']' && --depth === 0) {
    figures = new Function(`return ${src.slice(open, i + 1)}`)();
    break;
  }
}
if (!figures) throw new Error('нет FIGURES в collection.ts');
const out = { figures: figures.map((f) => ({ key: f.key, at: f.at, face: f.face, nameKey: `fig${f.key}` })) };
writeFileSync(join(HERE, '..', 'assets', 'collection.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(`фигурок: ${out.figures.length} → assets/collection.json`);
