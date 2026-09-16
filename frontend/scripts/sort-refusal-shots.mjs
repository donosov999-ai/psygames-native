/* sort-refusal-shots · VER 1 · 16.09.2026 */
/**
 * КАДР ОТКАЗАННОГО ХОДА: ИГРА НАЗЫВАЕТ ПРИЧИНУ, А НЕ МОЛЧИТ.
 *
 * Задача 44e6cd21, пункт (в): «не могу со второго шурупа снять гайки, никуда не
 * хотят сходить, и так и сяк кликаю». Гейт `water-sort-refusal-says-why` сторожит
 * ЯДРО — что причина совпадает с запретом. Этот кадр доказывает ЭКРАН: что
 * причина действительно встаёт на место строки-подсказки у живой партии.
 *
 * КАК. На первом уровне все непустые сосуды полны. Тап по первому полному, тап
 * по второму полному — ход запрещён («там уже полно»). Сосуды ищутся как узлы
 * внутри `sort-field-box` шире 40 точек, по порядку слева направо.
 *
 * ⚠️ ПРЕМИСА: до отказа в строке стоит подсказка «Нажми…», а не причина — иначе
 * кадр доказывал бы только то, что текст где-то есть.
 * ⚠️ И ОБРАТНАЯ СТОРОНА: через две секунды подсказка обязана вернуться, иначе
 * причина застревает навсегда и сама становится ложью про следующий ход.
 *
 *   node scripts/sort-refusal-shots.mjs --base=http://127.0.0.1:8236/psygames-web --game=nut-sort
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = (args.base ?? 'http://127.0.0.1:8236/psygames-web').replace(/\/$/, '');
const GAME = args.game ?? 'nut-sort';
const OUT = args.out ?? `${process.env.HOME}/dev/psygames/sorting-chat/art/shots/отказ`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await fs.mkdir(OUT, { recursive: true });
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => {
  localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999'); localStorage.setItem('psygames_first_run_done', '1');
});
await p.goto(`${BASE}/games/${GAME}?auto=1`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    if (!/Уровень\s*\d+\s*\/\s*\d+/i.test(document.body.innerText || '')) return null;
    const плохо = /Назад|Выход|Справк|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила/i;
    const c = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t))
      .sort((a, z) => z.r.width * z.r.height - a.r.width * a.r.height)[0];
    return c ? { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2 } : null;
  });
  if (!к) break;
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(2200);
}
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[role="button"], button')].find((x) => /^(Понятно|Продолжить)$/i.test((x.innerText || '').trim()));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!к) break; await p.mouse.click(к.x, к.y); await p.waitForTimeout(700);
}

const подсказка = () => p.evaluate(() => (document.querySelector('[data-testid="sort-field-hint"]')?.textContent || '').trim());
/** Сосуды: прямые дети ряда поля внутри `sort-field-box`, крупнее 40 точек. */
const сосуды = () => p.evaluate(() => {
  const box = document.querySelector('[data-testid="sort-field-box"]');
  if (!box) return [];
  const все = [...box.querySelectorAll('div')].map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 40 && r.height > 120 && r.width < 200);
  const из = [];
  for (const r of все) {
    const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
    if (из.some((q) => Math.abs(q.x - x) < 20 && Math.abs(q.y - y) < 40)) continue;
    из.push({ x, y, top: Math.round(r.top) });
  }
  return из.sort((a, z) => a.top - z.top || a.x - z.x);
});

const до = await подсказка();
console.log(`ЗАМЕР ОТКАЗА · ${GAME}\n  премиса: строка до отказа — «${до}»`);
const с = await сосуды();
console.log(`  сосудов найдено: ${с.length}`);
if (с.length < 2) { console.log('🔴 сосудов меньше двух — мерить нечего'); await b.close(); process.exit(1); }
await p.mouse.click(с[0].x, с[0].y); await p.waitForTimeout(400);
await p.mouse.click(с[1].x, с[1].y); await p.waitForTimeout(350);
const после = await подсказка();
await fs.writeFile(path.join(OUT, `${GAME}-отказ.png`), await p.screenshot({ type: 'png' }));
console.log(`  после тапа по двум полным: «${после}»`);
await p.waitForTimeout(2200);
const потом = await подсказка();
await fs.writeFile(path.join(OUT, `${GAME}-подсказка-вернулась.png`), await p.screenshot({ type: 'png' }));
console.log(`  через 2,2 с: «${потом}»`);
const ок = до.startsWith('Нажми') && после !== до && потом === до;
console.log(ок ? '🟢 причина встала на место подсказки и ушла обратно' : '🔴 поведение не то — смотреть кадры');
await b.close();
