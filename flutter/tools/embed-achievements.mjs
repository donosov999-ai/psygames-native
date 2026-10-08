#!/usr/bin/env node
// ДОСТИЖЕНИЯ ДЛЯ НАТИВНОГО РАСЧЁТА — ТАБЛИЦА ВЕБА, А НЕ ВТОРАЯ КОПИЯ (d6a60b02, вариант Б).
//
// «Достижения» считают модель на Dart (`lib/shell/achievements_model.dart`), а сами достижения живут
// у веба в `frontend/src/services/achievements.ts` (ACHIEVEMENTS), разделы экрана — в
// `frontend/app/achievements.tsx` (CATEGORIES). Скрипт вырезает их в `assets/achievements.json`;
// правка на вебе без пересборки краснеет в CI. Подписи — парами `_ru`/`_en`, как у веба: другие языки
// видят английский (долг двуязычных строк, `screen-language-fallback.test.ts`), перенос его не меняет.
//
// Запуск: node flutter/tools/embed-achievements.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..', '..', 'frontend');

function arrayAfter(src, marker, file) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`нет ${marker} в ${file}`);
  const open = src.indexOf('= [', start) + 2;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return new Function(`return ${src.slice(open, i + 1)}`)();
  }
  throw new Error(`не закрыт ${marker} в ${file}`);
}

const service = readFileSync(join(FRONT, 'src', 'services', 'achievements.ts'), 'utf8');
const screen = readFileSync(join(FRONT, 'app', 'achievements.tsx'), 'utf8');
const achievements = arrayAfter(service, 'export const ACHIEVEMENTS', 'achievements.ts');
const categories = arrayAfter(screen, 'const CATEGORIES', 'achievements.tsx');
const out = {
  categories: categories.map((c) => ({ key: c.key, label_ru: c.label_ru, label_en: c.label_en })),
  achievements: achievements.map((a) => ({
    id: a.id, emoji: a.emoji, category: a.category,
    name_ru: a.name_ru, name_en: a.name_en, desc_ru: a.desc_ru, desc_en: a.desc_en,
  })),
};
writeFileSync(join(HERE, '..', 'assets', 'achievements.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(`разделов: ${out.categories.length}, достижений: ${out.achievements.length} → assets/achievements.json`);
