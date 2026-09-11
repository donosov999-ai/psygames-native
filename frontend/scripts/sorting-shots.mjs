/* sorting-shots · VER 2 · 11.09.2026 */
/**
 * sorting-shots — снимки ПОЛЯ всех шести игр раздела «Сортировки» для глазного
 * контроля Дениса.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ `store-shots.mjs`. Тот снимает библиотеку кадров для карточки
 * Google Play: свой список из десяти игр, свой каталог `store/google-play/...` и
 * гейт `store-shots.test.ts`, который считает помеченные `inListing` (их не больше
 * восьми). Дописывать туда шесть сортировок нельзя — это общий актив магазина и
 * чужая зона. Приёмы у него взяты целиком: `?auto=1`, профиль владельца двумя
 * ключами, «продвигающая» кнопка, ожидание устойчивого экрана, проверка поля
 * запретом. Расхождение одно: снимки уезжают в мою папку раздела.
 *
 * 🔴 ГЛАВНАЯ ГРАБЛЯ (записана в шапке store-shots и проверена поломкой): экран
 * НАСТРОЙКИ и ПОЛЕ выглядят на снимке одинаково прилично — заголовок, кнопки,
 * градиент. Автоматике разницы не видно. Поэтому у каждого кадра стоит ЗАПРЕТ
 * (текст карты уровней и правил) и требование каркаса партии — метки шапки ЛИБО
 * нижний ряд служебных кнопок, потому что каркас у игр раздела разный (см.
 * разбор у `нижнийРяд`). Результат пишется в манифест рядом со снимками.
 *
 * ⚠️ СНИМАТЬ ТОЛЬКО СО СТАТИЧЕСКОГО ЭКСПОРТА. Metro в рабочем дереве раздела
 * держит `node_modules` общего дерева, где параллельно правят другие чаты: бандл
 * инвалидируется, одна сборка веба заняла 970 с, навигация отвалилась по таймауту
 * и в панели браузера, и в Playwright.
 *
 * Запуск:
 *   cd ~/dev/psygames-wt-sorting/frontend
 *   npx expo export -p web --output-dir dist-shots
 *   # при штатном baseUrl "/psygames-web" раздавать из корня с симлинком:
 *   #   mkdir -p <root> && ln -s <...>/dist-shots <root>/psygames-web
 *   python3 -m http.server 8090 --directory <root>
 *   node scripts/sorting-shots.mjs --base=http://127.0.0.1:8090/psygames-web
 *   node scripts/sorting-shots.mjs --only=cake-sort,pizza-sort   # точечно
 *
 * ⚠️ 127.0.0.1, а не localhost: часть раздатчиков поднимается на IPv6, и
 * «localhost» на этой машине уходит в ::1 — заходы молча падали в таймаут.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = (args.base ?? 'http://127.0.0.1:8090/psygames-web').replace(/\/$/, '');
const OUT = args.out ?? '/Users/denisonosov/dev/psygames/sorting-chat/art/shots';
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;

/** 432 CSS — ширина крупного телефона (iPhone Pro Max 430). dsf 2 → 864×1536. */
const VIEW = { width: 432, height: 768 };
const DSF = 2;

/** Текст, которого на кадре поля быть НЕ должно: карта уровней и экран правил. */
const FORBID = /Как играть|Уровень \d+\s*\/\s*\d+|Выбери первую игру/i;

/** Кнопки, по которым НЕЛЬЗЯ продвигаться внутрь игры. */
const NOT_ADVANCE = /Назад|Выход|Справка|Как играть|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк/i;

const SHOTS = [
  { id: '1-goods-sort', route: '/games/goods-sort?auto=1', title: 'Сортировка товаров' },
  { id: '2-cake-sort', route: '/games/cake-sort?auto=1', title: 'Тортики' },
  { id: '3-pizza-sort', route: '/games/pizza-sort?auto=1', title: 'Пицца' },
  { id: '4-water-sort', route: '/games/water-sort?auto=1', title: 'Переливалка' },
  { id: '5-ball-sort', route: '/games/ball-sort?auto=1', title: 'Шарики' },
  { id: '6-nut-sort', route: '/games/nut-sort?auto=1', title: 'Гайки' },
];

const countButtons = () => document.querySelectorAll('[role="button"], button').length;

const READ = () => ({
  text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
  buttons: document.querySelectorAll('[role="button"], button').length,
  toolbar: !!document.querySelector('[data-testid="game-toolbar"]'),
  headerActions: !!document.querySelector('[data-testid="game-header-actions"]'),
  canvases: document.querySelectorAll('canvas, svg').length,
});

/** Кадр на полукадре — недомер, который выглядит успехом. Ждём устойчивость. */
async function waitStable(page, { step = 400, tries = 16 } = {}) {
  let prev = -1;
  let same = 0;
  for (let i = 0; i < tries; i++) {
    const n = await page.evaluate(countButtons);
    if (n === prev) { if (++same >= 2) return n; } else { same = 0; prev = n; }
    await page.waitForTimeout(step);
  }
  return prev;
}

async function clickByText(page, re) {
  const picked = await page.evaluate((src) => {
    const rx = new RegExp(src, 'iu');
    const all = [...document.querySelectorAll('[role="button"], button')];
    const el = all.find((e) => {
      const t = (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim();
      return t && rx.test(t) && e.getBoundingClientRect().width > 1;
    });
    if (!el) return null;
    all.forEach((e) => e.removeAttribute('data-shot-click'));
    el.setAttribute('data-shot-click', '1');
    return (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }, re.source);
  if (!picked) return null;
  await page.click('[data-shot-click]', { timeout: 5000 }).catch(() => {});
  return picked;
}

/** Самая крупная кнопка, кроме служебных: мелкая фишка уровня так не обманет. */
async function advanceOnce(page) {
  const picked = await page.evaluate((skipSrc) => {
    const skip = new RegExp(skipSrc, 'iu');
    const all = [...document.querySelectorAll('[role="button"], button')];
    const c = all
      .map((el, i) => ({ i, t: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim(), r: el.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !skip.test(x.t));
    c.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (!c[0]) return null;
    all.forEach((el) => el.removeAttribute('data-shot-adv'));
    all[c[0].i].setAttribute('data-shot-adv', '1');
    return c[0].t.slice(0, 40);
  }, NOT_ADVANCE.source);
  if (!picked) return null;
  await page.click('[data-shot-adv]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await waitStable(page);
  return picked;
}

/** Подсказку «Понятно» гасим ДО проверки: она тащит в текст слова «как играть». */
async function dismissCoach(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await clickByText(page, /^(Понятно|Got it|Продолжить)$/))) break;
    await page.waitForTimeout(600);
  }
}

async function main() {
  let shots = SHOTS;
  if (ONLY) shots = shots.filter((s) => ONLY.some((o) => s.id.includes(o)));
  if (!shots.length) { console.log('🔴 --only не выбрал ни одного кадра'); process.exit(1); }

  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: DSF });

  // ⚠️ Битые запросы копим ПОИМЁННО: «страница открылась» ничего не доказывает,
  // если шрифты и картинки ответили 404 — снимок уедет полупустым и молча.
  let failed = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.on('requestfailed', (r) => failed.push(`FAIL ${r.url().replace(BASE, '')}`));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('language', 'ru');
    localStorage.setItem('psygames_devchat_on', '0');
    localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
    localStorage.setItem('psygames_active_profile', 'odv999');
    localStorage.setItem('psygames_first_run_done', '1');
  });

  // Онбординг проходим НАЖАТИЕМ: «пройден» без выбранной игры — состояние, до
  // которого живое приложение не доходит никогда.
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (await page.evaluate(() => /Выбери первую игру|Choose your first game/i.test(document.body.innerText || ''))) {
    const cards = await page.$$('button, [role=button]');
    if (cards[1]) await cards[1].click().catch(() => {});
    await page.waitForTimeout(3000);
    console.log('  · онбординг пройден нажатием');
  }

  const manifest = [];
  for (const s of shots) {
    failed = [];
    console.log(`\n▶ ${s.id} (${s.title})`);
    await page.goto(BASE + s.route, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForFunction(countButtons, null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await waitStable(page);
    await dismissCoach(page);

    let state = await page.evaluate(READ);
    const steps = [];
    // Один клик по продвигающей — и только если экран ещё не поле.
    for (let i = 0; i < 2 && FORBID.test(state.text); i++) {
      const p = await advanceOnce(page);
      if (!p) break;
      steps.push(p);
      await dismissCoach(page);
      state = await page.evaluate(READ);
    }

    const hit = state.text.match(FORBID);
    /*
     * 🔴 КАРКАС ПАРТИИ ОПОЗНАЁТСЯ ДВУМЯ РАЗНЫМИ ПРИЗНАКАМИ, И ЭТО НЕ ПЕРЕСТРАХОВКА.
     *
     * 📍 Первая редакция требовала `game-toolbar` / `game-header-actions` — и
     * покрасила ИСПРАВНУЮ сортировку товаров (1 из 6 кадров). У неё объявлено
     * `bottom="actions"`: служебные кнопки стоят ВНИЗУ, шапочного ряда нет
     * вовсе, и этих меток на экране не бывает by design (реестр смыслов,
     * `slot-meaning.test.ts`). То есть слепа была проба, а не экран.
     *
     * Признак поля — «есть чем ходить»: либо каркасные метки шапки, либо нижний
     * ряд служебных кнопок (`Отменить` / `Подсказка` / `Перемешать` / `Заново`).
     * Оба варианта существуют только В ПАРТИИ: на карте уровней их нет.
     */
    const нижнийРяд = /Отменить|Подсказк|Перемеша|Заново|Undo|Hint|Shuffle|Restart/i.test(state.text);
    const shell = state.toolbar || state.headerActions || нижнийРяд;
    const file = path.join(OUT, `${s.id}.png`);
    const buf = await page.screenshot({ type: 'png' });
    await fs.writeFile(file, buf);

    const verdict = hit ? `🔴 запрещённый текст «${hit[0]}» — это не поле`
      : !shell ? '🟡 каркас партии не найден (ни меток шапки, ни нижнего ряда кнопок)'
        : '🟢 поле';
    console.log(`   ${verdict} · кнопок ${state.buttons} · svg/canvas ${state.canvases} · шаги: ${steps.join(' → ') || '—'}`);
    if (failed.length) console.log(`   ⚠️ битых запросов ${failed.length}: ${failed.slice(0, 4).join(' | ')}`);

    manifest.push({
      id: s.id, title: s.title, route: s.route, file, verdict,
      buttons: state.buttons, canvases: state.canvases, shell, нижнийРяд,
      forbidHit: hit ? hit[0] : null, steps, failed: failed.slice(0, 12),
      text: state.text.slice(0, 300),
    });
  }

  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();

  const bad = manifest.filter((m) => !m.verdict.startsWith('🟢'));
  console.log(`\nИтог: ${manifest.length - bad.length}/${manifest.length} кадров с полем. Папка: ${OUT}`);
  if (bad.length) { console.log(bad.map((b) => `  ${b.id}: ${b.verdict}`).join('\n')); process.exit(2); }
}

main().catch((e) => { console.error(e); process.exit(1); });
