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
 * 🔴 ДВА ПРОХОДА, И ВТОРОЙ ПОЯВИЛСЯ 19.08.2026.
 *
 *   1) ПО МАРШРУТАМ (порог 44). Открывает экран и меряет то, что видно сразу.
 *      Apple требует 44 точки, Material — 48 dp. 44 — нижняя граница, ниже которой
 *      промахи растут резко, и она же — то, что проверяют при ревью в сторах.
 *
 *   2) НА ПОЛЕ (порог 48). Заходит В ИГРУ, нажав «Начать», и меряет то, по чему
 *      человек стучит всю партию.
 *
 * ЗАЧЕМ ВТОРОЙ ПРОХОД. Первый ходил только по маршрутам и упирался в экран
 * настройки: «Об игре», «Уровни», «Начать». Самого поля он не видел НИ РАЗУ —
 * то есть ровно того, по чему стучат сотни раз за партию, и где промах стоит
 * хода. Проверено 19.08: до правки аудит по 64 играм не нашёл на поле ничего,
 * потому что не заходил; после — 557 элементов мельче 48 на 14 экранах.
 *
 * ПОЧЕМУ НА ПОЛЕ ПОРОГ СТРОЖЕ. На экране настройки жмут раз и не спеша. На поле
 * жмут быстро, много и под таймером — там работает норма Material (48), а не
 * нижняя граница Apple. Это же и разумно: цена промаха на поле — потерянный ход.
 *
 * Запуск (нужен поднятый веб-билд):
 *   cd ~/dev/psygames/frontend
 *   npx expo export -p web  (с baseUrl="") && npx serve dist -l 8127
 *   node scripts/tap-target-audit.mjs --base=http://127.0.0.1:8127
 *   node scripts/tap-target-audit.mjs --mode=field --only=sudoku,schulte
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = args.base ?? 'http://localhost:8099';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const MODE = args.mode ?? 'all';               // all | routes | field
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;
const MIN = 44;                                 // порог первого прохода
const MIN_FIELD = 48;                           // порог на поле

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Экраны приложения вне каталога игр — по ним ходят не реже, чем по играм. */
const APP_ROUTES = [
  '/', '/statistics', '/achievements', '/shop', '/settings', '/pet',
  '/streak-calendar', '/warmup-picker', '/leagues', '/whats-new',
];

/**
 * Экраны-развилки: поля у них нет, они разводят по соседним играм, и каждая из
 * тех проверяется своим маршрутом. Если такой экран однажды станет игрой —
 * убрать отсюда, и второй проход начнёт в него заходить.
 */
const HUB_ROUTES = {
  '/games/span': 'развилка: три игры на объём памяти (digit-span / corsi / spatial-span), каждая проверяется своим маршрутом',
  '/games/attention-conflict': 'развилка: четыре игры на конфликт внимания (stroop / stroop-emotional / flanker / simon), каждая проверяется своим маршрутом',
};

/**
 * ДОЛГ ПО МАРШРУТАМ на 19.08.2026 (порог 44). Всего один экран — и это не физика,
 * а промах в стилях: на 63 играх из 64 «Назад» ровно 48×48.
 */
const ROUTE_DEBT = {
  '/games/math-slider': { max: 1, why: 'БАГ, чинится отдельно: у «Назад» стоит padding 4 вместо общего отступа, иконка 24 даёт 32×34; на остальных 63 играх та же кнопка 48×48' },
};

/**
 * ДОЛГ НА ПОЛЕ на 19.08.2026: маршрут → сколько элементов мельче 48 и почему это
 * так. Число — ПОТОЛОК: вырасти нельзя, уменьшить можно и нужно. Исключение без
 * обоснования — это забытая правка, а не исключение.
 *
 * Долг делится на два сорта, и второй чинится:
 *   ФИЗИКА — клетка сетки на экране 390pt физически не может быть 48pt;
 *   ОТСТУПЫ — кнопке не хватает 2–9 точек, чинится подгонкой padding.
 */
const FIELD_DEBT = {
  '/games/sudoku-samurai': { max: 379, why: 'ФИЗИКА: пять сеток 9×9 внахлёст = 21 клетка в ряд; при ширине 390pt клетка 16pt, крупнее не бывает по определению игры' },
  '/games/proofreading':   { max: 64,  why: 'ФИЗИКА: корректура идёт по буквам текста (43pt), укрупнение буквы = другой текст на экране' },
  '/games/chess-blind':    { max: 64,  why: 'ФИЗИКА: доска 8×8 при ширине 390pt даёт клетку 44pt; больше — доска не влезет' },
  '/games/visual-search':  { max: 18,  why: 'ФИЗИКА: игра про поиск мелкого среди мелкого (32pt), укрупнение убивает смысл упражнения' },
  '/games/sudoku-fractal': { max: 81,  why: 'ФИЗИКА: корневая сетка 9×9 при ширине 390pt даёт клетку 34pt; крупнее — сетка не влезет' },
  '/games/goods-sort':     { max: 12,  why: 'ФИЗИКА: товар на полке 35×58 — ширина задана числом полок в ряд' },
  '/games/trail-making':   { max: 6,   why: 'ФИЗИКА: узлы 44×44 — но вести палец помогает радиус попадания 60 (NODE_HIT_R=30), а укрупнение кружков посадит их друг на друга' },
  '/games/sudoku':         { max: 1,   why: 'ОТСТУПЫ: остаётся один мелкий элемент внутри поля судоку; бейдж правила поднят до 48 отдельно' },
};

/** Маршруты игр берём из реестра, чтобы список не разъезжался с приложением. */
async function gameRoutes() {
  const src = await fs.readFile(path.join(ROOT, 'src/constants/games.ts'), 'utf8');
  return [...src.matchAll(/route:\s*'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Кнопка входа в игру называется в разных играх по-разному: «Начать», «Start»,
 * «Старт», «Уровень 3 — играть», «Играть — уровень 3», «Play level 3», а в
 * schulte — «🎯 Уровень 1 →».
 *
 * ⚠️ ГРАБЛЯ, НА КОТОРОЙ ЭТОТ АУДИТ ОДНАЖДЫ УЖЕ БЫЛ ЗЕЛЁН ВСЛЕПУЮ. Первый заход
 * писал `/\b(начать|старт|start)\b/i`. В JS без флага `u` граница `\b` считает
 * словом только [A-Za-z0-9_], поэтому `\bначать\b` НЕ совпадает со словом
 * «Начать» — кириллица для неё не буква. Аудит честно отчитался «кнопка старта
 * не найдена» по 57 играм из 64 и не зашёл никуда. Отсюда флаг `u`, проверка
 * границ через \p{L} и самопроверка START_SELFTEST ниже.
 */
const START_PATTERNS = [
  /(?:^|[^\p{L}])(начать|старт|start|играть|play)(?![\p{L}])/iu,
  /(уровень|level)\s*\d+\s*(→|—|-)/iu,
];

/** Самопроверка искалки: ловит подписи входа и не путает их с фишкой уровня. */
const START_SELFTEST = {
  ok: ['Начать', 'Start', 'Старт', '🎯 Уровень 1 →', 'Уровень 1 — играть', 'Играть — уровень 1', 'Play level 1', 'Play — level 1'],
  no: ['Уровень 1', 'Назад', 'Об игре', 'Справка', 'Понятно', 'Топ игроков (5×5 классика)'],
};

function looksLikeStart(text) {
  return START_PATTERNS.some((re) => re.test(text));
}

function selfTestStartMatcher() {
  const wrong = [
    ...START_SELFTEST.ok.filter((t) => !looksLikeStart(t)).map((t) => `не узнал вход: «${t}»`),
    ...START_SELFTEST.no.filter((t) => looksLikeStart(t)).map((t) => `принял за вход: «${t}»`),
  ];
  if (wrong.length) {
    console.log('\n🔴 Искалка кнопки «Начать» сломана — аудит был бы зелён вслепую:');
    wrong.forEach((w) => console.log(`    ${w}`));
    process.exit(1);
  }
}

/** Меряем то, что реально нарисовано. Порог передаём — он разный у проходов. */
const MEASURE = (min) => {
  const out = [];
  for (const el of document.querySelectorAll('[role="button"], button, [tabindex]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;                    // невидимое не меряем
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.opacity === '0' || st.display === 'none') continue;
    if (r.bottom < 0 || r.top > window.innerHeight * 3) continue; // далеко за экраном

    // Вложенные кнопки считаем один раз — по внешней: палец попадает в неё.
    if (el.parentElement?.closest('[role="button"], button')) continue;

    if (r.width < min || r.height < min) {
      out.push({
        label: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) || '(без подписи)',
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return out;
};

const countButtons = () => document.querySelectorAll('[role="button"], button').length;

/**
 * Ждём, пока экран перестанет меняться, и только потом меряем.
 *
 * 🔴 ЗАЧЕМ. 19.08 первый же полный прогон поймал себя на вранье: во фрактальной
 * судоку поле замерили на полпути — были нарисованы 9 подсказок нижних сеток, а
 * корневая сетка 9×9 ещё нет. Аудит увидел 11 кнопок вместо 102, мелких нашёл
 * ноль и отчитался «чисто». Недомер тут опаснее промаха: он выглядит как успех.
 * Поэтому меряем только когда счётчик кнопок трижды подряд одинаков.
 *
 * И обратная сторона того же правила, общая для всех гейтов здесь: ЛОЖНОЕ
 * СРАБАТЫВАНИЕ ХУЖЕ ОТСУТСТВИЯ ПРОВЕРКИ. Гейт, который краснеет на исправном
 * коде — под нагрузкой, на полукадре, на переставленной строчке, — перестают
 * читать, и вместе с придуманной поломкой он пропускает настоящую. Поэтому
 * ждём устойчивого экрана вместо жёсткой паузы, порог держим на нарисованном
 * размере, а долг сверяем по «стало хуже», а не по «совпало число в число».
 */
async function waitStable(page, { step = 500, tries = 16 } = {}) {
  let prev = -1;
  let same = 0;
  for (let i = 0; i < tries; i++) {
    const n = await page.evaluate(countButtons);
    if (n === prev) { if (++same >= 2) return n; } else { same = 0; prev = n; }
    await page.waitForTimeout(step);
  }
  return prev;
}

/** Открыть маршрут и дождаться отрисовки. Пустой экран = повтор, а не тихий ноль. */
async function open(page, route, { needButtons = true } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    if (!needButtons) { await page.waitForTimeout(1200); return true; }
    await page.waitForFunction(countButtons, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (await page.evaluate(countButtons)) return true;
  }
  return false;
}

/** Всплывающую подсказку «Понятно» закрываем — она перекрывает низ экрана. */
async function dismissCoach(page) {
  for (const label of ['Понятно', 'Got it']) {
    const b = page.getByText(label, { exact: true }).first();
    if (await b.count().catch(() => 0)) { await b.click({ timeout: 1500 }).catch(() => {}); break; }
  }
  await page.waitForTimeout(400);
}

/** Нажать вход в игру. Возвращает подпись нажатого или null. */
async function pressStart(page) {
  const picked = await page.evaluate((sources) => {
    const res = sources.map((s) => new RegExp(s, 'iu'));
    const all = [...document.querySelectorAll('[role="button"], button')];
    const cands = all
      .map((el, i) => ({ i, text: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim(), r: el.getBoundingClientRect() }))
      .filter((c) => c.r.width > 1 && c.r.height > 1 && res.some((re) => re.test(c.text)));
    // Вход — самая крупная из подходящих: мелкая «фишка уровня» рядом не обманет.
    cands.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (!cands[0]) return null;
    all.forEach((el) => el.removeAttribute('data-audit-start'));
    all[cands[0].i].setAttribute('data-audit-start', '1');
    return cands[0].text.slice(0, 44);
  }, START_PATTERNS.map((r) => r.source));
  if (!picked) return null;

  const before = await page.evaluate(countButtons);
  await page.click('[data-audit-start]', { timeout: 5000 }).catch(() => {});
  // Часть игр показывает отсчёт «⏱ Старт через 3…» — ждём, пока поле встанет.
  await page.waitForFunction(
    (n) => !document.querySelector('[data-audit-start]') || document.querySelectorAll('[role="button"], button').length !== n,
    before, { timeout: 8000 },
  ).catch(() => {});
  await page.waitForTimeout(1200);
  const after = await waitStable(page);
  const gone = await page.evaluate(() => !document.querySelector('[data-audit-start]'));
  return { label: picked, entered: gone || after !== before, before, after };
}

/**
 * Сверяет находки с записанным долгом: новое — красное, выросшее — красное,
 * пережившее свою причину — тоже красное.
 *
 * Почему не требуем совпадения число-в-число. Над этими же экранами работают
 * параллельно, и правка, поднявшая пару кнопок до 48, роняла бы сборку за то,
 * что стало ЛУЧШЕ. Потолок и так не даёт долгу расти; здесь ловим другое —
 * когда исключение осталось, а нарушения уже нет: долг погашен целиком либо
 * просел так, что записанное число врёт (≥5 и ≥20% — тогда опусти его).
 */
function checkAgainstDebt(findings, debt, routes) {
  const news = findings.filter((f) => !debt[f.route]);
  const grown = findings.filter((f) => debt[f.route] && f.small.length > debt[f.route].max);
  const seen = new Map(findings.map((f) => [f.route, f.small.length]));
  const stale = [];
  for (const [route, { max }] of Object.entries(debt)) {
    if (!routes.includes(route)) continue;
    const n = seen.get(route) ?? 0;
    const needLower = Math.max(5, Math.ceil(max * 0.2));
    if (n === 0) stale.push(`${route}: мелких больше нет — убери исключение`);
    else if (max - n >= needLower) stale.push(`${route}: сейчас ${n}, в списке ${max} — опусти число, назад дороги нет`);
  }
  return { news, grown, stale };
}

/** Таблица «сколько сейчас / сколько записано» — чтобы правка числа не требовала
 *  ещё одного прогона на 13 минут: всё видно прямо в логе сборки. */
function printDebtTable(findings, debt, visited) {
  const rows = Object.keys(debt)
    .filter((route) => visited.includes(route))          // не заходили — числа не выдумываем
    .map((route) => ({ route, now: findings.find((f) => f.route === route)?.small.length ?? 0, max: debt[route].max }));
  if (!rows.length) return;
  for (const r of rows.sort((a, b) => b.now - a.now)) {
    const mark = r.now > r.max ? '↑' : r.now < r.max ? '↓' : ' ';
    console.log(`    ${String(r.now).padStart(4)} / ${String(r.max).padEnd(4)} ${mark} ${r.route}`);
  }
}

function reportDebt({ news, grown, stale }, label) {
  let bad = 0;
  if (news.length) {
    console.log(`\n🔴 НОВОЕ: ${label} там, где долга не записано:`);
    for (const f of news) {
      console.log(`    ${f.route} — ${f.small.length} шт.`);
      for (const s of f.small.slice(0, 6)) console.log(`        ${String(s.w).padStart(3)}×${String(s.h).padStart(3)}  ${s.label}`);
    }
    bad = 1;
  }
  if (grown.length) {
    console.log(`\n🔴 ДОЛГ ВЫРОС: мелких элементов стало больше, чем записано:`);
    for (const f of grown) console.log(`    ${f.route}: стало ${f.small.length}`);
    bad = 1;
  }
  if (stale.length) {
    console.log(`\n🔴 ИСКЛЮЧЕНИЕ ПРОТУХЛО:`);
    stale.forEach((s) => console.log(`    ${s}`));
    bad = 1;
  }
  return bad;
}

/** ПРОХОД 1 — по маршрутам, как было: что видно сразу при открытии экрана. */
async function auditRoutes(page, routes) {
  const findings = [];
  let measured = 0;
  for (const route of routes) {
    await open(page, route, { needButtons: false });
    const small = await page.evaluate(MEASURE, MIN);
    measured += await page.evaluate(countButtons);
    if (small.length) findings.push({ route, small });
  }
  const totalSmall = findings.reduce((n, f) => n + f.small.length, 0);
  console.log(`\n── Проход 1: по маршрутам. Кнопок ${measured} на ${routes.length} экранах, порог ${MIN}×${MIN}.`);
  const bad = reportDebt(checkAgainstDebt(findings, ROUTE_DEBT, routes), 'мелкие кнопки на экране');
  console.log(`\nИзвестный долг по маршрутам: ${totalSmall} кнопок на ${findings.length} экранах (сейчас / записано в ROUTE_DEBT):`);
  printDebtTable(findings, ROUTE_DEBT, routes);
  if (!bad) console.log('✅ Новых мелких кнопок на экранах нет.');
  return bad;
}

/** ПРОХОД 2 — на поле: жмём «Начать» и меряем то, по чему стучат всю партию. */
async function auditField(page, routes) {
  const results = [];
  for (const route of routes) {
    if (HUB_ROUTES[route]) { results.push({ route, hub: true }); continue; }
    const rendered = await open(page, route);
    if (!rendered) { results.push({ route, failed: 'экран не отрисовался за два захода' }); continue; }
    await dismissCoach(page);
    const start = await pressStart(page);
    if (!start) { results.push({ route, failed: 'кнопка входа не найдена' }); continue; }
    if (!start.entered) { results.push({ route, failed: `нажал «${start.label}», но экран не сменился` }); continue; }
    const small = await page.evaluate(MEASURE, MIN_FIELD);
    results.push({ route, label: start.label, small });
  }

  const blind = results.filter((r) => r.failed);
  const entered = results.filter((r) => r.small);
  const withSmall = entered.filter((r) => r.small.length);

  console.log(`\n── Проход 2: на поле. Зашли в ${entered.length} игр из ${routes.length - Object.keys(HUB_ROUTES).filter((h) => routes.includes(h)).length}, порог ${MIN_FIELD}×${MIN_FIELD}.`);

  let bad = 0;

  // Не зашли = не проверили. Молчать об этом нельзя: это и есть «зелёный вслепую».
  if (blind.length) {
    console.log(`\n🔴 Не удалось зайти в ${blind.length} игр — на поле у них НИЧЕГО не проверено:`);
    for (const b of blind) console.log(`    ${b.route}: ${b.failed}`);
    bad = 1;
  }

  // Протухшее исключение хуже отсутствующего: оно молча гасит проверку. Но
  // маршруты, куда не зашли, из сверки убираем — там ноль от незнания, а не от
  // починки, и объявлять исключение протухшим по такому нулю нельзя.
  const checkable = routes.filter((r) => entered.some((e) => e.route === r));
  bad |= reportDebt(checkAgainstDebt(withSmall, FIELD_DEBT, checkable), 'мелкие элементы на поле');

  const debtNow = withSmall.filter((r) => FIELD_DEBT[r.route]).reduce((n, r) => n + r.small.length, 0);
  console.log(`\nИзвестный долг на поле: ${debtNow} элементов на ${withSmall.filter((r) => FIELD_DEBT[r.route]).length} экранах (сейчас / записано в FIELD_DEBT):`);
  printDebtTable(withSmall, FIELD_DEBT, checkable);
  if (!bad) console.log('✅ Новых мелких элементов на поле нет.');
  return bad;
}

async function main() {
  selfTestStartMatcher();

  // Обоснование обязательно: исключение без причины через месяц никто не оспорит.
  const noReason = [
    ...Object.entries(FIELD_DEBT).filter(([, v]) => !v.why || v.why.length < 25).map(([k]) => k),
    ...Object.entries(HUB_ROUTES).filter(([, v]) => !v || v.length < 25).map(([k]) => k),
  ];
  if (noReason.length) {
    console.log(`\n🔴 Исключение без обоснования: ${noReason.join(', ')}`);
    process.exit(1);
  }

  let games = await gameRoutes();
  if (ONLY) games = games.filter((r) => ONLY.some((o) => r.endsWith('/' + o) || r === o));
  const routes = [...(ONLY ? [] : APP_ROUTES), ...games].slice(0, LIMIT);

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

  let bad = 0;
  if (MODE === 'all' || MODE === 'routes') bad |= await auditRoutes(page, routes);
  if (MODE === 'all' || MODE === 'field') bad |= await auditField(page, games);

  await browser.close();
  if (bad) process.exitCode = 1;
}

main();
