#!/usr/bin/env node
/* psygames-sync-warmup-page · VER 1 · 27.08.2026 */
/**
 * ПЕРЕНОС СТРАНИЦЫ «ЗАРЯДКИ» ЦЕЛИКОМ.
 *
 * 🔴 ПОЧЕМУ ЦЕЛИКОМ, А НЕ ПО ЧАСТЯМ. Ядро практик у psygames и «Умного
 * будильника» ОДНО (`src/games/pause/core`, будильник компилирует его к себе).
 * Разошёлся только ВИД: в будильнике он проработан — картинки, траектория
 * взгляда, рамка времени по фазам, параллельный режим, — а в приложении на его
 * месте стоял один значок.
 *
 * Первая попытка была переписать рисовалки на `react-native-svg`. Так
 * переносится геометрия и теряется остальное: замером нашлось, что гимнастика
 * глаз получила фигуру дыхания вместо своей движущейся мишени, потому что в
 * карте рисовалок будильника её нет — у неё отдельная механика `renderEyeLayer`.
 * Пересобранная по кускам вещь не равна перенесённой.
 *
 * Поэтому берётся готовая сборка страницы и кладётся в `public/warmup`.
 *
 * ⚠️ ВСЁ В `public/warmup` — ПРИВОЗНОЕ, КРОМЕ `embed.js` И `embed.css`. Правки
 * в привозном не живут: следующий прогон их сотрёт. Нужно поведение — правь
 * `embed.js`, он снаружи.
 *
 * ⚠️ КАРТИНКИ ПОДМЕНЯЮТСЯ. Будильник несёт 9,3 МБ PNG — это настольное
 * приложение. В телефонное девять мегабайт четырёх поз не кладут, поэтому
 * ставятся webp из `assets/images/pause` (652 КБ) и ссылки переписываются.
 *
 * Запуск: node scripts/sync-warmup-page.mjs [--no-build]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const здесь = path.dirname(fileURLToPath(import.meta.url));
const фронт = path.resolve(здесь, '..');
const лаборатория = path.resolve(фронт, '../../psygames-game-lab/smart-alarm');
const источник = path.join(лаборатория, 'web-dist');
const цель = path.join(фронт, 'public', 'warmup');
const своё = ['embed.js', 'embed.css'];

/** Имена без расширения: и в PNG у будильника, и в webp у нас они одни. */
const КАРТИНКИ = [
  'body-master-v1',
  'pose-mountain-phone-v1',
  'pose-horse-phone-v1',
  'pose-cobbler-phone-v1',
  'pose-lotus-phone-v1',
];

function собратьСтраницу() {
  console.log('· собираю страницу будильника (npm run build:web)');
  execFileSync('npm', ['run', 'build:web'], { cwd: лаборатория, stdio: 'inherit' });
}

function файлыВглубь(корень) {
  const итог = [];
  for (const имя of readdirSync(корень)) {
    const полный = path.join(корень, имя);
    if (statSync(полный).isDirectory()) итог.push(...файлыВглубь(полный));
    else итог.push(полный);
  }
  return итог;
}

function перенести() {
  if (!existsSync(источник)) {
    throw new Error(`нет собранной страницы: ${источник}. Запусти без --no-build.`);
  }
  // Своё сохраняем и возвращаем: чистка убирает всё, чтобы удалённое у
  // будильника не оставалось у нас висеть мёртвым файлом.
  const сохранённое = new Map();
  for (const имя of своё) {
    const п = path.join(цель, имя);
    if (existsSync(п)) сохранённое.set(имя, readFileSync(п));
  }
  rmSync(цель, { recursive: true, force: true });
  mkdirSync(цель, { recursive: true });
  cpSync(источник, цель, { recursive: true });
  for (const [имя, тело] of сохранённое) writeFileSync(path.join(цель, имя), тело);
  return сохранённое.size;
}

function подменитьКартинки() {
  const папка = path.join(цель, 'assets', 'cosmic-body');
  let положено = 0;
  for (const имя of КАРТИНКИ) {
    const png = path.join(папка, `${имя}.png`);
    if (existsSync(png)) rmSync(png);
    const webp = path.join(фронт, 'assets', 'images', 'pause', `${имя}.webp`);
    if (!existsSync(webp)) throw new Error(`нет сжатой картинки ${webp}`);
    cpSync(webp, path.join(папка, `${имя}.webp`));
    положено += 1;
  }
  let переписано = 0;
  for (const файл of файлыВглубь(цель)) {
    if (!/\.(html|css|mjs|js|json|md)$/.test(файл)) continue;
    const было = readFileSync(файл, 'utf8');
    let стало = было;
    for (const имя of КАРТИНКИ) стало = стало.split(`${имя}.png`).join(`${имя}.webp`);
    if (стало !== было) {
      writeFileSync(файл, стало);
      переписано += 1;
    }
  }
  return { положено, переписано };
}

/** Подключает свои `embed.css` и `embed.js` — их в привозной странице нет. */
function вшитьВстраивание() {
  const п = path.join(цель, 'index.html');
  let html = readFileSync(п, 'utf8');
  if (!html.includes('embed.css')) {
    html = html.replace('</head>', '    <link rel="stylesheet" href="./embed.css" />\n  </head>');
  }
  if (!html.includes('embed.js')) {
    html = html.replace('</body>', '    <script src="./embed.js" defer></script>\n  </body>');
  }
  writeFileSync(п, html);
  return html.includes('embed.css') && html.includes('embed.js');
}

function вес(корень) {
  return файлыВглубь(корень).reduce((сумма, ф) => сумма + statSync(ф).size, 0);
}

const безСборки = process.argv.includes('--no-build');
if (!безСборки) собратьСтраницу();
const вернулось = перенести();
const картинки = подменитьКартинки();
const вшито = вшитьВстраивание();
const мб = (вес(цель) / 1024 / 1024).toFixed(2);

console.log(`✅ страница перенесена целиком → public/warmup`);
console.log(`   своё возвращено: ${вернулось} файл(ов) · картинок подменено: ${картинки.положено} · ссылок переписано в ${картинки.переписано} файле(ах)`);
console.log(`   встраивание вшито: ${вшито ? 'да' : 'НЕТ'} · вес: ${мб} МБ`);
if (!вшито) process.exit(1);
