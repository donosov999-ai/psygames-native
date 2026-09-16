/* hanoi-disc-label-probe · VER 1 · 16.09.2026 */
/**
 * ВИДЕН ЛИ НОМЕР ДИСКА — ИЛИ ЕГО ПЕРЕЧЁРКИВАЕТ СТЕРЖЕНЬ. Замер на собранном вебе.
 *
 * ПОВОД. Кадр посреди перетаскивания (16.09.2026, 390×844): на дисках, стоящих на
 * стержне, светлая полоса стержня идёт ПОВЕРХ цифр «2» и «3» — номер почти не читается.
 * Причина в разметке `hanoi.tsx`: стержень — `position: absolute` и стоит в стопке ПОСЛЕ
 * дисков, а у каждого View в react-native-web `position: relative; z-index: 0`, то есть
 * рисуются они строго в порядке дерева.
 *
 * КАК. В центре номера каждого диска на старте уровня спрашиваем `elementFromPoint`:
 * что там сверху. Номер виден, если сверху сам номер или его диск; стержень сверху — 🔴.
 *
 *   node scripts/hanoi-disc-label-probe.mjs --base=http://127.0.0.1:8237/psygames-web
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = (args.base ?? 'http://127.0.0.1:8237/psygames-web').replace(/\/$/, '');
const КАДР = args.shot;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => {
  localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999'); localStorage.setItem('psygames_first_run_done', '1');
});
await p.goto(`${BASE}/games/hanoi?auto=1`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    if (!/Уровень\s*\d+\s*\/\s*\d+|Начать/i.test(document.body.innerText || '')) return null;
    const плохо = /Назад|Выход|Справк|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила|Рекорд|Таблица/i;
    const c = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t))
      .sort((a, z) => z.r.width * z.r.height - a.r.width * a.r.height)[0];
    return c ? { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2 } : null;
  });
  if (!к) break;
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(2000);
}
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[role="button"], button')].find((x) => /^(Понятно|Продолжить)$/i.test((x.innerText || '').trim()));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!к) break; await p.mouse.click(к.x, к.y); await p.waitForTimeout(700);
}

const итог = await p.evaluate(() => {
  const стержни = [...document.querySelectorAll('[role="button"], button')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 150 && r.width > 60 && r.top > 110; });
  const out = [];
  for (const с of стержни) {
    for (const el of с.querySelectorAll('div')) {
      const т = (el.innerText || '').trim();
      if (!/^\d+$/.test(т) || el.children.length) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const x = r.left + r.width / 2; const y = r.top + r.height / 2;
      const сверху = document.elementFromPoint(x, y);
      /* ⚠️ Видно — только если сверху САМ номер или его предок. Первая редакция засчитывала и
       * «родитель верхнего элемента содержит номер» — а это верно и для стержня, у которого со
       * стопкой общий родитель: прибор сказал «видно» при стержне 10×373 поверх всех трёх цифр. */
      const видно = !!сверху && (сверху === el || сверху.contains(el));
      out.push({ номер: т, видно, сверху: сверху ? `${сверху.tagName.toLowerCase()} ${Math.round(сверху.getBoundingClientRect().width)}×${Math.round(сверху.getBoundingClientRect().height)} «${(сверху.innerText || '').trim().slice(0, 6)}»` : '—' });
    }
  }
  return out;
});
if (КАДР) await fs.writeFile(КАДР, await p.screenshot({ type: 'png' }));
const закрыто = итог.filter((x) => !x.видно);
console.log(`НОМЕРА ДИСКОВ · hanoi L1 · дисков с номером ${итог.length} · перекрыто ${закрыто.length}`);
for (const x of итог) console.log(`  диск ${x.номер}: ${x.видно ? '🟢 сверху сам номер/диск' : '🔴 сверху чужое'} — ${x.сверху}`);
await b.close();
process.exit(итог.length === 0 ? 2 : закрыто.length ? 1 : 0);
