/* rule-card-probe · VER 1 · 16.09.2026 */
/**
 * ЧТО НАПИСАНО В ОКНЕ ПРАВИЛА УРОВНЯ — ЗАМЕР ТЕКСТА, А НЕ ПРИСУТСТВИЯ ОКНА.
 *
 * 📍 Повод 16.09.2026: у «Гаек» на L40 всплыло окно «⚡ / ПОНЯТНО» без единой
 * строки. Гейт словаря правил этого не видел: он искал `useLevelRules('литерал')`
 * и пропускал экраны, где gameId — переменная. Этот прибор открывает игру на
 * уровне, где правило включается, ждёт окно и печатает ВЕСЬ его текст.
 * Пустое окно = в тексте нет ничего, кроме кнопки.
 *
 *   node scripts/rule-card-probe.mjs --base=… --game=water-sort --storage=water-sort --level=22
 */
import { chromium } from 'playwright';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = (args.base ?? 'http://127.0.0.1:8236/psygames-web').replace(/\/$/, '');
const GAME = args.game ?? 'water-sort';
const STORAGE = args.storage ?? GAME.replace('-', '_');
const LEVEL = args.level ?? '22';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.evaluate(([st, lv]) => {
  localStorage.clear();
  localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999'); localStorage.setItem('psygames_first_run_done', '1');
  localStorage.setItem(`psygames_${st}_level_odv999`, lv);
}, [STORAGE, LEVEL]);
await p.goto(`${BASE}/games/${GAME}?auto=1`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
const шапка = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60));
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    if (!/Уровень\s*\d+\s*\/\s*\d+/i.test(document.body.innerText || '')) return null;
    const плохо = /Назад|Выход|Справк|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила|Понятно/i;
    const c = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t))
      .sort((a, z) => z.r.width * z.r.height - a.r.width * a.r.height)[0];
    return c ? { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2 } : null;
  });
  if (!к) break;
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(2200);
}
await p.waitForTimeout(1500);
const окно = await p.evaluate(() => {
  const кн = [...document.querySelectorAll('[role="button"], button')].find((x) => /^понятно$/i.test((x.innerText || '').trim()));
  if (!кн) return null;
  /*
   * 🔴 КАРТОЧКА — ПО РАМКЕ, А НЕ «ПЕРВЫЙ ПРЕДОК С ТЕКСТОМ».
   * 📍 Первая редакция поднималась к первому предку, где есть что-то кроме
   * кнопки, — и хватала узел со ВСЕЙ доской: метки гаек и строка подсказки
   * засчитывались за текст правила, прибор печатал 🟢 на пустом окне. Карточка —
   * самый крупный предок, который ещё УЖЕ экрана и НИЖЕ половины экрана.
   */
  const кр = кн.getBoundingClientRect();
  let карточка = null;
  for (let узел = кн.parentElement, i = 0; узел && i < 8; узел = узел.parentElement, i++) {
    const r = узел.getBoundingClientRect();
    if (r.width < innerWidth * 0.97 && r.height < innerHeight * 0.6 && r.height > кр.height + 16) карточка = узел;
  }
  return карточка ? (карточка.innerText || '').replace(/\s+/g, ' ').trim() : '';
});
console.log(`${GAME} L${LEVEL} (хранилище «${STORAGE}») · шапка: «${шапка}»`);
if (args.shot) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(args.shot, { recursive: true });
  await writeFile(`${args.shot}/${GAME}-L${LEVEL}-правило.png`, await p.screenshot({ type: 'png' }));
}
if (окно === null) console.log('  окна правила нет');
else {
  const смысл = окно.replace(/понятно/i, '').replace(/[⚡]/g, '').trim();
  console.log(`  окно: «${окно.slice(0, 220)}»`);
  console.log(смысл.length > 10 ? '  🟢 в окне есть текст правила' : '  🔴 ОКНО ПУСТОЕ — кроме значка и кнопки ничего');
}
await b.close();
