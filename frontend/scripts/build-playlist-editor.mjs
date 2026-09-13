#!/usr/bin/env node
/* psygames-build-playlist-editor · VER 1 · 13.09.2026 */
/**
 * СБОРКА РЕДАКТОРА ПЛЕЙЛИСТОВ: шаблон + свежий снимок состава → готовая страница.
 *
 *   node scripts/build-playlist-editor.mjs
 *   открыть tools/playlist-editor.html в браузере
 *
 * 🔴 ПОЧЕМУ СНИМОК СНИМАЕТСЯ ЧЕРЕЗ JEST. Состав лежит в `constants/*.ts` —
 * TypeScript с алиасами `@/` и импортами React Native. Обычный node его не
 * прочитает, а esbuild и tsx в зависимостях проекта отсутствуют (проверено:
 * `node_modules/.bin` пуст на оба). Ставить новый инструмент ради одного снимка
 * дороже, чем воспользоваться jest, который уже умеет и TS, и алиасы.
 *
 * ⚠️ ДАННЫЕ ВКЛЕИВАЮТСЯ В СТРАНИЦУ, А НЕ ГРУЗЯТСЯ РЯДОМ ЛЕЖАЩИМ ФАЙЛОМ. Страница
 * открывается с диска (`file://`), где `fetch` к соседнему файлу запрещён
 * политикой источника. Встроенный снимок — единственный способ обойтись без
 * сервера, а сервер для инструмента одного человека — лишняя деталь, которая
 * однажды не запустится.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const ФРОНТ = path.resolve(ЗДЕСЬ, '..');
const КОРЕНЬ = path.resolve(ФРОНТ, '..');
const ШАБЛОН = path.join(КОРЕНЬ, 'tools/playlist-editor.template.html');
const ГОТОВО = path.join(КОРЕНЬ, 'tools/playlist-editor.html');

const врем = mkdtempSync(path.join(tmpdir(), 'psygames-editor-'));
const снимокПуть = path.join(врем, 'data.json');

console.log('⏳ снимаю состав (jest)…');
try {
  execFileSync('npx', ['jest', 'src/__tests__/playlist-editor-data.test.ts', '--silent'], {
    cwd: ФРОНТ,
    env: { ...process.env, PLAYLIST_EDITOR_OUT: снимокПуть },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
} catch {
  console.error('🔴 снимок не снялся: проба playlist-editor-data упала.');
  console.error('   Это значит, что реестры пусты или сломаны, — чинить надо их, а не редактор.');
  process.exit(1);
}

if (!existsSync(снимокПуть)) {
  console.error('🔴 проба прошла, но файла снимка нет:', снимокПуть);
  process.exit(1);
}

const снимок = JSON.parse(readFileSync(снимокПуть, 'utf8'));
const шаблон = readFileSync(ШАБЛОН, 'utf8');

const МАРКЕР = /\/\*ДАННЫЕ\*\/[\s\S]*?\/\*\/ДАННЫЕ\*\//;
if (!МАРКЕР.test(шаблон)) {
  console.error('🔴 в шаблоне нет места для данных (маркер /*ДАННЫЕ*/ … /*\/ДАННЫЕ*/)');
  process.exit(1);
}

/* `</script>` внутри данных разорвал бы тег страницы — экранируем, как принято
   при встраивании JSON в HTML. Сейчас таких строк нет, но состав правят люди. */
const безопасно = JSON.stringify(снимок).replace(/<\//g, '<\\/');
writeFileSync(ГОТОВО, шаблон.replace(МАРКЕР, `/*ДАННЫЕ*/${безопасно}/*/ДАННЫЕ*/`), 'utf8');

const развилок = Object.keys(снимок.хабы).length;
const вРазвилках = Object.values(снимок.хабы).reduce((с, к) => с + к.length, 0);
console.log(`✅ ${path.relative(КОРЕНЬ, ГОТОВО)}`);
console.log(`   игр в каталоге ${снимок.игры.length} · профилей ${снимок.профили.length} · развилок ${развилок} (карточек внутри ${вРазвилках})`);
console.log('   открыть: open ' + ГОТОВО);
