#!/usr/bin/env node
// «ИСТОЧНИКИ» ДЛЯ НАТИВНОГО ЭКРАНА — ДАННЫЕ ВЕБА, А НЕ ВТОРАЯ КОПИЯ НА DART (задача d6a60b02, вариант Б).
//
// Экран считает свою модель на Dart (`lib/shell/sources_model.dart`), но список источников, лицензий
// и авторов записей живёт у веба: `frontend/src/constants/sources.ts` и два сгенерированных списка
// голосов (`voiceLive.generated.ts`, `letterVoice.generated.ts`). Скрипт вырезает их в
// `assets/sources.json`; правка источника на вебе без пересборки краснеет в CI («Сгенерированное
// совпадает с исходниками»). Подписи — ключами словаря (`key`, `nameKey`, `creditKey`): их подбирает
// `embed-l10n.mjs`.
//
// Запуск: node flutter/tools/embed-sources.mjs   (из корня дерева или из flutter/)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CONSTANTS = join(ROOT, 'frontend', 'src', 'constants');

/** Массив-литерал после `export const <ИМЯ>…= [` — вычислением, не регуляркой (в строках кавычки). */
function arrayAfter(file, name) {
  const src = readFileSync(join(CONSTANTS, file), 'utf8');
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`нет ${name} в ${file}`);
  const open = src.indexOf('= [', start) + 2;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return new Function(`return ${src.slice(open, i + 1)}`)();
  }
  throw new Error(`не закрыт массив ${name}`);
}

const sources = arrayAfter('sources.ts', 'SOURCES').map((s) => ({
  name: s.name,
  nameKey: s.nameKey ?? null,
  key: s.key,
  license: s.license,
  credit: s.credit ?? null,
  creditKey: s.creditKey ?? null,
  url: s.url,
}));
const voices = [...arrayAfter('voiceLive.generated.ts', 'VOICE_LIVE_CREDITS'), ...arrayAfter('letterVoice.generated.ts', 'LETTER_VOICE_CREDITS')]
  .map((v) => ({ author: v.author, license: v.license, count: v.count }));

const out = join(HERE, '..', 'assets', 'sources.json');
writeFileSync(out, `${JSON.stringify({ sources, voices }, null, 1)}\n`, 'utf8');
console.log(`источников: ${sources.length}, авторов записей: ${voices.length} → assets/sources.json`);
