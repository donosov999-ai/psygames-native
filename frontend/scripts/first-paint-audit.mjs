/**
 * ПРОВЕРКА ПЕРВОГО КАДРА: что схлопнулось при обычной загрузке.
 *
 * 🔴 ЗАЧЕМ. 19.08.2026 нашлось, что тропинка уровней невидима НА ВСЕХ игровых
 * экранах веб-сборки (а Android у нас WebView, то есть и на телефоне тоже):
 * `useWindowDimensions()` на первом кадре отдаёт 0, обновляется только по
 * событию `resize`, которого при обычной загрузке не бывает — и ноль запекался
 * в `maxWidth`. Подпись «Уровень 1 / 52» вставала по букве в столбик, узлы с
 * питомцем исчезали. Держалось до поворота экрана, то есть у большинства
 * навсегда.
 *
 * Ни один тест этого не ловил: в jest вёрстки нет, a11y-audit смотрит подписи,
 * tap-target-audit меряет кнопки. Нужен был замер РАЗМЕРА при первой загрузке.
 *
 * Запуск: node scripts/first-paint-audit.mjs [базовый-URL]
 * По умолчанию http://localhost:8123 (npx serve dist -l 8123).
 */
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:8123';
const GAMES = readdirSync(new URL('../app/games', import.meta.url))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => f.replace(/\.tsx$/, ''));

/** Текст шириной 0 при высоте больше строки = буквы встали в столбик. */
const PROBE = () => {
  const bad = [];
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length) continue;
    const txt = (e.textContent || '').trim();
    if (txt.length < 3) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height > 24) bad.push(`нулевая ширина, высота ${Math.round(r.height)}: «${txt.slice(0, 40)}»`);
  }
  const zeroMax = [...document.querySelectorAll('*')]
    .filter((e) => getComputedStyle(e).maxWidth === '0px')
    .map((e) => `maxWidth:0 у блока «${(e.textContent || '').trim().slice(0, 40)}»`);
  return [...bad, ...zeroMax];
};

const br = await chromium.launch();
let broken = 0;
for (const g of GAMES) {
  const p = await br.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await p.goto(`${BASE}/games/${g}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2200);
    for (const l of ['Понятно', 'Got it']) {
      const b = p.getByText(l, { exact: true }).first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 1200 }).catch(() => {}); break; }
    }
    await p.waitForTimeout(800);
    const issues = await p.evaluate(PROBE);
    if (issues.length) { broken++; console.log(`✗ ${g}`); issues.slice(0, 4).forEach((i) => console.log(`    ${i}`)); }
  } catch (e) {
    console.log(`⚠ ${g}: ${String(e).slice(0, 80)}`);
  }
  await p.close();
}
await br.close();
console.log(broken ? `\nсхлопнулось экранов: ${broken} из ${GAMES.length}` : `\nвсе ${GAMES.length} экранов чисты на первом кадре`);
process.exit(broken ? 1 : 0);
