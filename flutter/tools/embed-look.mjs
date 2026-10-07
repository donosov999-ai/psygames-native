#!/usr/bin/env node
// ВИД ПРИЛОЖЕНИЯ ДЛЯ НАТИВНОЙ ПОЛОВИНЫ — ВЫГРУЗКОЙ У ВЕБА, А НЕ ПЕРЕПИСЫВАНИЕМ (задача eae0879c).
//
// 🔴 ПОЧЕМУ ТАК. Тёмная ли тема и какого цвета акцент, решает не один переключатель:
// базу задаёт профиль (`PROFILE_THEME`: «НЗТ» светлый фиолетовый, «Шахматист» тёмный
// золотой…), ручной выбор перебивает только светлоту, а надетая в магазине косметика —
// акцент. Всё это лежит в вебе (`frontend/src/contexts/ThemeContext.tsx`,
// `frontend/src/services/cosmetics.ts`). Копия в Dart разошлась бы с первой правкой веба
// молча — поэтому здесь только выгрузка, а в CI проверка «сгенерированное свежее».
//
// Запуск: node flutter/tools/embed-look.mjs   (из корня дерева или из flutter/)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const WEB = join(FLUTTER, '..', 'frontend', 'src');
const OUT = join(FLUTTER, 'assets', 'look.json');

/** Литерал `{…}` или `[…]` после метки — вычислением, а не регуляркой: в значениях есть кавычки. */
function literalAfter(src, marker, open) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`не найдено: ${marker}`);
  const close = open === '{' ? '}' : ']';
  // Ищем ПОСЛЕ «=»: у объявления есть тип, и в нём свои скобки (`Record<Id, { mood… }>`, `Cosmetic[]`).
  const from = src.indexOf(open, src.indexOf('=', start + marker.length));
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return new Function('return ' + src.slice(from, i + 1))();
  }
  throw new Error(`не закрыт литерал: ${marker}`);
}

const theme = readFileSync(join(WEB, 'contexts', 'ThemeContext.tsx'), 'utf8');
const cosmetics = readFileSync(join(WEB, 'services', 'cosmetics.ts'), 'utf8');

const accents = {};
for (const c of literalAfter(cosmetics, 'export const COSMETICS', '[')) {
  if (c.type === 'accent') accents[c.id] = c.value;
}

const look = {
  light: literalAfter(theme, 'const lightTheme', '{'),
  dark: literalAfter(theme, 'const darkTheme', '{'),
  profiles: literalAfter(theme, 'const PROFILE_THEME', '{'),
  accents,
};

// По записи на строку верхнего уровня: два PR, тронувшие разные профили, сводятся сами.
const lines = (v) => '{\n' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ':' + JSON.stringify(x)).join(',\n') + '\n}';
const out = '{\n' + Object.entries(look).map(([k, v]) => JSON.stringify(k) + ':' + lines(v)).join(',\n') + '\n}\n';
writeFileSync(OUT, out);
console.log(`look.json: светлая ${Object.keys(look.light).length} цветов, тёмная ${Object.keys(look.dark).length}, профилей ${Object.keys(look.profiles).length}, акцентов ${Object.keys(accents).length}`);
