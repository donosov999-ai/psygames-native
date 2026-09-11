/**
 * ГЕОМЕТРИЯ ЭКРАНА: ВЕРХ ПОЛЯ И ВЫСОТА ПОЛОСЫ ПОКАЗАТЕЛЕЙ ПО ВСЕМ ИГРАМ.
 *
 * Канон — `src/components/gameLayout.ts`: ШАПКА 58 + ПОЛОСА_ПОКАЗАТЕЛЕЙ 61 = ВЕРХ_ПОЛЯ 119.
 * Прибор отвечает на один вопрос: у кого верх поля НЕ 119 и откуда лишнее.
 *
 * ЗАПУСК (сборка статикой, не Metro — против Metro 99 маршрутов кладут процесс):
 *   cd frontend && NODE_OPTIONS=--max-old-space-size=8192 npx expo export -p web --output-dir dist-geom
 *   node scripts/screen-geometry.mjs            # читает dist-geom
 *   node scripts/screen-geometry.mjs путь/к/dist
 *
 * ⚠️ ТРИ ГРАБЛИ, КАЖДАЯ СТОИЛА ПРОГОНА.
 * 1. Сборка живёт под baseUrl `/psygames-web`. Показ, не снимающий префикс, отдаёт на
 *    бандл свой index.html: страница рисуется, JS не грузится, и экран молча
 *    показывает режим ПО УМОЛЧАНИЮ. Признак — «Unexpected token '<'» в консоли.
 * 2. Язык задаётся адресом `?lang=ru`, а не localStorage: приложение читает язык через
 *    AsyncStorage, и тот на вебе в localStorage не пишет.
 * 3. «Мы в партии» определяется якорем `game-header-right`, а не словами на кнопке:
 *    экран настройки бывает подписан «Configure Game», и ловля по тексту промахивается.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const КОРЕНЬ = path.resolve(process.argv[2] || 'dist-geom');
const ОКНО = { width: 390, height: 844 };
const КАНОН = 119;
const ТИП = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

if (!fs.existsSync(path.join(КОРЕНЬ, 'games'))) {
  console.error(`нет сборки в ${КОРЕНЬ} — сперва expo export (см. шапку)`);
  process.exit(1);
}

const сервер = http.createServer((req, res) => {
  const п = decodeURIComponent(req.url.split('?')[0]).replace(/^\/psygames-web/, '') || '/';
  let f = path.join(КОРЕНЬ, п);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    const alt = `${f.replace(/\/$/, '')}.html`;
    f = fs.existsSync(alt) ? alt : path.join(КОРЕНЬ, 'index.html');
  }
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('нет'); }
  res.writeHead(200, { 'Content-Type': ТИП[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

await new Promise((r) => сервер.listen(0, '127.0.0.1', r));
const порт = сервер.address().port;
const экраны = fs.readdirSync(path.join(КОРЕНЬ, 'games')).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

const br = await chromium.launch();
const page = await (await br.newContext({ viewport: ОКНО })).newPage();
const итог = [];

for (const g of экраны) {
  try {
    await page.goto(`http://127.0.0.1:${порт}/psygames-web/games/${g}?wu=1&lang=ru`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    for (let i = 0; i < 4; i += 1) {
      if (await page.evaluate(() => !!document.querySelector('[data-testid="game-header-right"]'))) break;
      await page.evaluate(() => {
        const кнопки = [...document.querySelectorAll('[role=button],button')];
        const хочу = /(Начать|Играть|Start|Play|Понятно|Уровень\s*\d+\s*→|Level\s*\d+\s*→)/i;
        (кнопки.find((e) => хочу.test((e.textContent || '').trim())) || кнопки.find((e) => /→/.test(e.textContent || '')))?.click();
      });
      await page.waitForTimeout(1400);
    }
    await page.waitForTimeout(900);
    const м = await page.evaluate(() => {
      const полоса = document.querySelector('[data-testid="game-hud"]');
      const поле = document.querySelector('[data-testid="game-field"]');
      if (!полоса || !поле) return null;
      return {
        полоса: Math.round(полоса.getBoundingClientRect().height),
        полеВерх: Math.round(поле.getBoundingClientRect().top),
      };
    });
    итог.push(м ? { экран: g, ...м } : { экран: g, полоса: null, полеВерх: null });
  } catch (e) { итог.push({ экран: g, ошибка: String(e.message).slice(0, 60) }); }
}
await br.close();
сервер.close();

const изм = итог.filter((x) => typeof x.полеВерх === 'number');
const откл = изм.filter((x) => x.полеВерх !== КАНОН).sort((a, b) => a.полеВерх - b.полеВерх);
console.log(`измерено ${изм.length} из ${итог.length}; на каноне ${КАНОН}: ${изм.length - откл.length}`);
console.log('экран | верх поля | полоса | откуда лишнее');
for (const x of откл) {
  const изПолосы = x.полоса - 61;
  const прочее = x.полеВерх - КАНОН - изПолосы;
  console.log(`${x.экран.padEnd(18)} ${String(x.полеВерх).padStart(4)} ${String(x.полоса).padStart(5)}   полоса +${изПолосы}${прочее ? `, ряд над полем +${прочее}` : ''}`);
}
const в = изм.map((x) => x.полеВерх);
console.log(`размах верха поля: ${Math.min(...в)} … ${Math.max(...в)}`);
fs.writeFileSync('screen-geometry.json', JSON.stringify(итог, null, 1));
console.log('подробности: frontend/screen-geometry.json');
