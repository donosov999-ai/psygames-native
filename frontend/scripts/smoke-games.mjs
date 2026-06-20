/**
 * Smoke-тест всех игр: открывает каждый роут /games/* в headless-браузере, ждёт монтирования,
 * собирает ошибки консоли и необработанные исключения. Exit 1, если хоть одна игра «грязная».
 *
 * Ловит: ошибки импорта, краши рендера, битые хуки/рефы, отсутствующие i18n-ключи, undefined в mount.
 * (Уровень mount + опциональный клик «Старт». Игровой процесс по фазам — отдельно, при желании.)
 *
 * Требует Playwright. В app-репо его нет → запуск одним из:
 *   1) npm i -D playwright && npx playwright install chromium && npm run smoke
 *   2) из проекта, где playwright уже стоит:
 *      cd ~/dev/psygames-site-i18n && BASE=http://localhost:8081 \
 *        GAMES_DIR=~/dev/psygames/frontend/app/games node <путь>/smoke-games.mjs
 *
 * Env: BASE (default http://localhost:8081), GAMES_DIR (default ../app/games от скрипта),
 *      START=1 — дополнительно кликать «Начать/Start» (intro→config→playing), CLICKS (default 2).
 */
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:8081';
const GAMES_DIR = process.env.GAMES_DIR
  ? resolve(process.env.GAMES_DIR.replace(/^~/, process.env.HOME))
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'games');
const DO_START = process.env.START === '1';
const CLICKS = Number(process.env.CLICKS || 2);

// Шумовые сообщения RN-web/Expo, не являющиеся реальными багами игры.
const IGNORE = [
  /Download the React DevTools/i,
  /pointerEvents is deprecated/i,
  /"shadow\*" style props are deprecated/i,
  /props\.pointerEvents is deprecated/i,
  /useNativeDriver/i,
  /Unexpected text node/i,
  /Failed to load resource.*(favicon|\.map)\b/i,
  /\[Fast Refresh\]/i,
  // React hydration mismatch — статик-экспорт (prerender) ≠ client из-за динамики игр
  // (таймеры/random/Date на маунте). React пере-рендерит на клиенте, игра работает — НЕ краш.
  /Minified React error #(418|421|422|423|425|426)/i,
  /hydrat/i,
  /did not match the server-rendered/i,
  /Text content does not match/i,
];
const isNoise = (t) => IGNORE.some((r) => r.test(t));

const routes = readdirSync(GAMES_DIR)
  .filter((f) => f.endsWith('.tsx') && !f.startsWith('_') && f !== 'index.tsx')
  .map((f) => f.replace(/\.tsx$/, ''))
  .sort();

console.log(`Smoke: ${routes.length} игр @ ${BASE} (start=${DO_START})`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

// Прогрев: первый билд бандла Metro может быть долгим.
const warm = await ctx.newPage();
try { await warm.goto(`${BASE}/games/${routes[0]}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); } catch {}
await warm.close();

const results = [];
for (const route of routes) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => { const t = 'PAGEERROR: ' + (e.message || String(e)); if (!isNoise(t)) errors.push(t); });
  try {
    await page.goto(`${BASE}/games/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1600);
    if (DO_START) {
      for (let i = 0; i < CLICKS; i++) {
        const btn = page.getByText(/^(Начать|Start|НАЧАТЬ)$/).first();
        if (await btn.count().catch(() => 0)) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(1200);
        }
      }
    }
  } catch (e) {
    errors.push('NAV: ' + e.message.split('\n')[0]);
  }
  results.push({ route, errors });
  process.stdout.write(errors.length ? `✗ ${route} (${errors.length})\n` : `✓ ${route}\n`);
  await page.close();
}
await browser.close();

const failed = results.filter((r) => r.errors.length);
console.log(`\n=== SMOKE: ${results.length - failed.length}/${results.length} clean, ${failed.length} с ошибками ===`);
for (const f of failed) {
  console.log(`\n✗ ${f.route}`);
  [...new Set(f.errors)].slice(0, 4).forEach((e) => console.log('   ' + e.slice(0, 220)));
}
process.exit(failed.length ? 1 : 0);
