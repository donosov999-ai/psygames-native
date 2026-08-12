/**
 * tap-target-audit — ищет кнопки, в которые не попасть пальцем.
 *
 * ЗАЧЕМ. Промах по кнопке не выглядит как промах. Человек не думает «я не попал» —
 * он думает «не нажалось» и жмёт ещё раз, а в игре второе нажатие часто означает
 * другое действие. В судоку «Отменить» стоит вплотную к «Подсказке»: промах тратит
 * лимит подсказок и режет счёт, и виноватым в этом человек считает не свой палец.
 *
 * ПОЧЕМУ МЕРЯЕМ, А НЕ ЧИТАЕМ КОД. Высота кнопки складывается из отступов, размера
 * иконки, размера шрифта и межстрочного расстояния — по стилям её не сложить, а по
 * скриншоту не измерить. Меряем то, что реально нарисовано, в размере телефона.
 *
 * ПОРОГ 44. Apple требует 44 точки, Material — 48 dp. Берём 44: это нижняя граница,
 * ниже которой промахи растут резко, и она же — то, что проверяют при ревью в сторах.
 *
 * Запуск (нужен поднятый веб-билд):
 *   cd ~/dev/psygames/frontend && node scripts/tap-target-audit.mjs
 *   node scripts/tap-target-audit.mjs --base=http://localhost:8099 --limit=20
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = args.base ?? 'http://localhost:8099';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const MIN = 44;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Экраны приложения вне каталога игр — по ним ходят не реже, чем по играм. */
const APP_ROUTES = [
  '/', '/statistics', '/achievements', '/shop', '/settings', '/pet',
  '/streak-calendar', '/warmup-picker', '/leagues', '/whats-new',
];

/** Маршруты игр берём из реестра, чтобы список не разъезжался с приложением. */
async function gameRoutes() {
  const src = await fs.readFile(path.join(ROOT, 'src/constants/games.ts'), 'utf8');
  return [...src.matchAll(/route:\s*'([^']+)'/g)].map((m) => m[1]);
}

async function main() {
  const routes = [...APP_ROUTES, ...(await gameRoutes())].slice(0, LIMIT);

  const browser = await chromium.launch();
  // Размер телефона: на нём кнопки самые тесные, и именно там промахиваются.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('language', 'ru');
    localStorage.setItem('psygames_devchat_on', '0');
  });

  // Онбординг проходим нажатием, а не подстановкой флага: подставленный «пройден»
  // без выбранной игры — состояние, до которого живое приложение не доходит никогда.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  if (await page.evaluate(() => /Выбери первую игру|Choose your first game/i.test(document.body.innerText || ''))) {
    const cards = await page.$$('button, [role=button]');
    if (cards[1]) await cards[1].click().catch(() => {});
    await page.waitForTimeout(2500);
  }

  const findings = [];
  let measured = 0;

  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1200);

    const small = await page.evaluate((MIN) => {
      const out = [];
      for (const el of document.querySelectorAll('[role="button"], button, [tabindex]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;                    // невидимое не меряем
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.opacity === '0' || st.display === 'none') continue;
        if (r.bottom < 0 || r.top > window.innerHeight * 3) continue; // далеко за экраном

        // Вложенные кнопки считаем один раз — по внешней: палец попадает в неё.
        if (el.parentElement?.closest('[role="button"], button')) continue;

        if (r.width < MIN || r.height < MIN) {
          out.push({
            label: (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 40) || '(без подписи)',
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
      return out;
    }, MIN);

    const total = await page.evaluate(() => document.querySelectorAll('[role="button"], button').length);
    measured += total;
    if (small.length) findings.push({ route, small });
  }

  await browser.close();

  const totalSmall = findings.reduce((n, f) => n + f.small.length, 0);
  console.log(`\nПроверено кнопок: ${measured} на ${routes.length} экранах. Порог ${MIN}×${MIN}.`);
  if (!findings.length) {
    console.log('✅ Мелких кнопок не найдено.');
    return;
  }
  console.log(`\n⚠️  Не попасть пальцем: ${totalSmall} кнопок на ${findings.length} экранах\n`);
  for (const f of findings) {
    console.log(`  ${f.route}`);
    for (const s of f.small) console.log(`      ${String(s.w).padStart(3)}×${String(s.h).padStart(3)}  ${s.label}`);
  }
  process.exitCode = 1;
}

main();
