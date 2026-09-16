/* hanoi-win-probe · VER 1 · 16.09.2026 */
/**
 * ВИДНА ЛИ ИГРОКУ КАРТОЧКА ИТОГА ПОСЛЕ РЕШЁННОЙ БАШНИ — ЗАМЕР, А НЕ ЧТЕНИЕ КОДА.
 *
 * Задача 45d479ed, дословно: «в конце, на следующий уровень когда переходишь —
 * не очки не показываются, не "молодец", не уровень два, не победа, просто
 * подвисает и потом новая картинка появляется».
 *
 * ГИПОТЕЗА ИЗ КОДА. `hanoi.tsx` рисует `LevelCleared` отдельным слоем ПЕРЕД
 * каркасом, а «Лондонская башня» — через проп `overlay` каркаса. Абсолютный слой,
 * стоящий в дереве раньше соседа, рисуется ПОД ним. Но это гипотеза: текст
 * карточки в DOM есть в обоих случаях, и проба «текст есть» зеленела бы при
 * закрытой карточке. Поэтому меряем `elementFromPoint` в центре кнопки
 * «Продолжить»: что там на самом деле под пальцем.
 *
 * КАК. L1 — три диска на трёх стержнях, минимум 7 ходов. Стержни — три крупные
 * кнопки поля слева направо. Решение: 0→2, 0→1, 2→1, 0→2, 1→0, 1→2, 0→2.
 *
 *   node scripts/hanoi-win-probe.mjs --base=http://127.0.0.1:8236/psygames-web
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = (args.base ?? 'http://127.0.0.1:8236/psygames-web').replace(/\/$/, '');
const GAME = args.game ?? 'hanoi';
const OUT = args.out ?? `${process.env.HOME}/dev/psygames/sorting-chat/art/shots/ханой`;
const ХОДЫ = [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]];

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
const текст = () => p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    if (!/Уровень\s*\d+\s*\/\s*\d+|Начать/i.test(document.body.innerText || '')) return null;
    const плохо = /Назад|Выход|Справк|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила|Рекорд|Таблица/i;
    const c = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t))
      .sort((a, z) => z.r.width * z.r.height - a.r.width * a.r.height)[0];
    return c ? { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2, t: c.t.slice(0, 20) } : null;
  });
  if (!к) break;
  console.log(`  продвигаюсь: «${к.t}»`);
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(2000);
}
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[role="button"], button')].find((x) => /^(Понятно|Продолжить)$/i.test((x.innerText || '').trim()));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!к) break; await p.mouse.click(к.x, к.y); await p.waitForTimeout(700);
}

/** Стержни: кнопки без подписи, выше 150 точек, в средней полосе экрана. */
const стержни = await p.evaluate(() => [...document.querySelectorAll('[role="button"], button')]
  .map((e) => ({ r: e.getBoundingClientRect(), t: (e.getAttribute('aria-label') || e.innerText || '').trim() }))
  .filter((x) => x.r.height > 150 && x.r.width > 60 && x.r.top > 110)
  .map((x) => ({ x: Math.round(x.r.left + x.r.width / 2), y: Math.round(x.r.top + x.r.height / 2) }))
  .sort((a, z) => a.x - z.x));
console.log(`ЗАМЕР ПОБЕДЫ · ${GAME} · стержней найдено ${стержни.length}`);
if (стержни.length !== 3) { await fs.writeFile(path.join(OUT, 'нет-стержней.png'), await p.screenshot()); console.log('🔴 ожидал 3 стержня — смотреть кадр'); await b.close(); process.exit(1); }
await fs.writeFile(path.join(OUT, '1-начало.png'), await p.screenshot({ type: 'png' }));

for (const [a, z] of ХОДЫ) {
  await p.mouse.click(стержни[a].x, стержни[a].y); await p.waitForTimeout(250);
  await p.mouse.click(стержни[z].x, стержни[z].y); await p.waitForTimeout(350);
}
await p.waitForTimeout(1500);
await fs.writeFile(path.join(OUT, '2-после-решения.png'), await p.screenshot({ type: 'png' }));

/*
 * 🔴 ИЩЕМ ЗАГОЛОВОК КАРТОЧКИ, А НЕ КНОПКУ «ПРОДОЛЖИТЬ».
 * 📍 Первая редакция искала кнопку и сказала «карточки не видно» — вывод не о
 * том: у варианта с автопродолжением кнопки нет по замыслу, там надпись
 * «Уровень 2 запускается…». Признак карточки — её заголовок «пройден», и видим
 * он, только если `elementFromPoint` в его центре возвращает сам заголовок.
 */
const итог = await p.evaluate(() => {
  const узлы = [...document.querySelectorAll('div, span')]
    .filter((e) => /пройден/i.test(e.textContent || '') && e.children.length === 0 && e.getBoundingClientRect().width > 20);
  if (!узлы.length) return { есть: false };
  const з = узлы[0]; const r = з.getBoundingClientRect();
  const x = r.left + r.width / 2; const y = r.top + r.height / 2;
  const сверху = document.elementFromPoint(x, y);
  return {
    есть: true, текст: (з.textContent || '').trim().slice(0, 40), где: `${Math.round(x)},${Math.round(y)}`,
    видна: !!сверху && (сверху === з || з.contains(сверху)),
    сверху: сверху ? (сверху.getAttribute('data-testid') || `${сверху.tagName} «${(сверху.textContent || '').trim().slice(0, 25)}»`) : null,
  };
});
const т = await текст();
console.log(`  текст после 7 ходов: «${т.slice(0, 120)}»`);
console.log(`  заголовок карточки в DOM: ${итог.есть ? `«${итог.текст}»` : 'нет'}${итог.есть ? ` · в точке ${итог.где} сверху: ${итог.видна ? 'САМ ЗАГОЛОВОК' : `🔴 ДРУГОЕ — ${итог.сверху}`}` : ''}`);
console.log(итог.есть && итог.видна ? '🟢 карточка итога видна игроку' : '🔴 карточка итога есть в DOM, но игрок её НЕ ВИДИТ');
await b.close();
