#!/usr/bin/env node
// КАРТИНКИ «ПАРНЫХ КАРТИНОК» ДЛЯ НАТИВНОГО ЭКРАНА — ИЗ ВЕБ-НАБОРОВ, А НЕ РУКАМИ.
//
// 🔴 ПОЧЕМУ СКРИПТОМ. Вшитые данные без экспортёра не чинятся: поменяли набор в вебе —
// и нативная игра молча показывает старый, а откуда её файлы взялись, уже никто не
// помнит. Поэтому источник один — `frontend/src/constants/pairThemes.ts` (наборы,
// профили, рубашки), и этот скрипт ВЫРЕЗАЕТ из него ровно то, что нужно Flutter.
//
// 🔴 ПОРЯДОК КАРТИНОК = СМЫСЛ. Номер картинки в наборе — это номер символа в колоде:
// пара — это две карты с одним номером. Файл N кладётся под именем N.webp в ТОМ ЖЕ
// порядке, в каком он стоит в массиве TS, а не в порядке имён на диске.
//
// Что пишет:
//   flutter/assets/pairs/<набор>/<N>.webp   — картинки, 12 на набор
//   flutter/assets/pairs/themes.json         — профиль → набор, рубашки, пути
//
// Запуск: node flutter/tools/embed-pairs.mjs   (из корня дерева)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const ROOT = join(FLUTTER, '..');
const SRC = join(ROOT, 'frontend', 'src', 'constants', 'pairThemes.ts');
const OUT = join(FLUTTER, 'assets', 'pairs');

const ts = readFileSync(SRC, 'utf8');

/** Массивы картинок: `const ИМЯ = [ require('…'), … ];` → путь каждого файла по порядку. */
function arrays() {
  const out = {};
  for (const m of ts.matchAll(/^const ([A-Z]+) = \[([\s\S]*?)\n\];/gm)) {
    out[m[1]] = [...m[2].matchAll(/require\('([^']+)'\)/g)].map((r) => resolve(dirname(SRC), r[1]));
  }
  return out;
}

/** Объект-литерал после маркера — вычислением, а не регуляркой (как в embed-l10n). */
function objectAfter(marker) {
  const start = ts.indexOf(marker);
  if (start < 0) throw new Error(`не найдено: ${marker}`);
  // Объект начинается после `=`: в объявлении перед ним бывает тип со своими скобками
  // (`Record<PairTheme, { color: string; icon: string }> = {`).
  const open = ts.indexOf('{', ts.indexOf('=', start));
  let depth = 0;
  for (let i = open; i < ts.length; i++) {
    if (ts[i] === '{') depth++;
    else if (ts[i] === '}' && --depth === 0) return ts.slice(open, i + 1);
  }
  throw new Error(`не закрыт объект: ${marker}`);
}

const files = arrays();
// Набор → имя массива: `animals: ANIMALS` — берём как текст, имена массивов не вычисляются.
const themes = Object.fromEntries(
  [...objectAfter('export const PAIR_THEMES').matchAll(/(\w+):\s*([A-Z]+)/g)].map((m) => [m[1], m[2]]),
);
const profiles = new Function(`return ${objectAfter('const PROFILE_PAIR_THEME')}`)();
const backs = new Function(`return ${objectAfter('export const PAIR_BACKS')}`)();

const sprites = {};
let copied = 0;
for (const [theme, arr] of Object.entries(themes)) {
  const list = files[arr];
  if (!list || list.length !== 12) throw new Error(`набор ${theme}: ${list ? list.length : 0} картинок вместо 12`);
  mkdirSync(join(OUT, theme), { recursive: true });
  sprites[theme] = list.map((src, i) => {
    if (!existsSync(src)) throw new Error(`нет файла ${src}`);
    copyFileSync(src, join(OUT, theme, `${i}.webp`));
    copied++;
    return `assets/pairs/${theme}/${i}.webp`;
  });
}
for (const [profile, theme] of Object.entries(profiles)) {
  if (!sprites[theme]) throw new Error(`профиль ${profile} ссылается на неизвестный набор ${theme}`);
}
writeFileSync(join(OUT, 'themes.json'), JSON.stringify({ profiles, backs, sprites, fallback: 'animals' }, null, 1) + '\n');
console.log(`наборов ${Object.keys(sprites).length}, картинок ${copied}, профилей ${Object.keys(profiles).length} → ${OUT}`);
