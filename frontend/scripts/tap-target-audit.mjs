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
const MODE = args.mode ?? 'all';               // all | routes | field | header
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;
const MIN = 44;                                 // порог первого прохода
const MIN_FIELD = 48;                           // порог на поле
/**
 * Ширина узкого телефона для третьего прохода. 360 — это Galaxy A/M, самый
 * массовый Android в наших странах, и самый узкий экран, который встречается
 * в живых отчётах. Мерить на 390 бесполезно: шапка вылезала именно там, где
 * места меньше.
 */
const NARROW_W = 360;

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
const HUB_REASONS = {
  '/games/chess-hub': 'развилка: два шахматных упражнения (scholars-mate / chess-blind), каждое проверяется своим маршрутом',
  '/games/span': 'развилка: три игры на объём памяти (digit-span / corsi / spatial-span), каждая проверяется своим маршрутом',
  '/games/attention-conflict': 'развилка: четыре игры на конфликт внимания (stroop / stroop-emotional / flanker / simon), каждая проверяется своим маршрутом',
  '/games/sudoku-hub': 'развилка: три судоку (классическая / самурай / фрактальная), каждая проверяется своим маршрутом',
  // Девять развилок 04.09.2026. У всех устройство одно: список карточек, каждая
  // ведёт в игру, и та проверяется своим маршрутом. Поля у развилки нет.
  '/games/counting-hub': 'развилка: четыре пробы на счёт (counter / math-slider / math-sprint / number-bonds), каждая проверяется своим маршрутом',
  '/games/words-hub': 'развилка: шесть проб на словарь (vocab-srs / semantic-sort / cloze / lexical-decision / anagrams / phonemic-fluency), каждая проверяется своим маршрутом',
  '/games/hearing-hub': 'развилка: три пробы на слух (phoneme-pairs / chinese-tones / pseudoword-echo), каждая проверяется своим маршрутом',
  '/games/search-hub': 'развилка: шесть проб на зрительный поиск (visual-search / proofreading / find-differences / mahjong / schulte / quick-count), каждая проверяется своим маршрутом',
  '/games/flexibility-hub': 'развилка: три пробы на переключение признака (pattern / set-game / sdmt), каждая проверяется своим маршрутом',
  '/games/risk-hub': 'развилка: три пробы на решения под риском (bart / iowa / prl), каждая проверяется своим маршрутом',
  '/games/visual-memory-hub': 'развилка: три пробы на зрительную память (memory-matrix / picture-pairs / chess-blind), каждая проверяется своим маршрутом',
  '/games/mnemonics-hub': 'развилка: четыре мнемотехники (mnemonics / memory-palace / faces-names / word-pairs), каждая проверяется своим маршрутом',
  '/games/languages-hub': 'развилка-зонтик: ведёт в развилки «Слова» и «Слух», обе проверяются своими маршрутами',
  // Ещё две развилки того же дня. Их отсутствие здесь уронило сборку v2.37.26
  // сообщением «Исключение без обоснования» — гейт сработал ровно как задуман:
  // хаб взялся из каталога сам, а обоснования к нему никто не написал.
  '/games/towers-hub': 'развилка: две пробы на планирование перекладыванием (hanoi / tower-london), каждая проверяется своим маршрутом',
  '/games/routes-hub': 'развилка: три пробы на построение маршрута (dots-connect / one-line / trail-making), каждая проверяется своим маршрутом',
  '/games/inhibition-hub': 'развилка: две пробы на торможение готового движения (inhibition с двумя режимами / posner), каждая проверяется своим маршрутом',
};

/**
 * ⚠️ КТО РАЗВИЛКА — РЕШАЕТ КАТАЛОГ, А НЕ ЭТОТ СПИСОК. 20.08.2026 в приложении
 * появился хаб судоку; он был записан в соседнем живом аудите, а здесь — нет, и
 * сборка упала на «кнопка входа не найдена»: аудит пошёл искать игровое поле у
 * экрана, где поля нет по замыслу. Имена хабов лежали в шести местах кода, и это
 * седьмое.
 *
 * Теперь признак берётся из карточки каталога (`hub: true`), а здешний список
 * отвечает только за ОБЪЯСНЕНИЕ. Новый хаб без объяснения валит аудит с внятной
 * причиной — это лучше, чем молча не заходить в игру и считать её проверенной.
 */
async function catalogueHubs() {
  const src = (await fs.readFile(path.join(ROOT, 'src/constants/games.ts'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const out = new Set();
  for (const m of src.matchAll(/\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
    if (!/^\s*hub:\s*true,?\s*$/m.test(m[1])) continue;
    const route = /route:\s*'([^']+)'/.exec(m[1]);
    if (route) out.add(route[1]);
  }
  return out;
}

const HUB_ROUTES = Object.fromEntries(
  [...new Set([...(await catalogueHubs()), ...Object.keys(HUB_REASONS)])]
    .map((r) => [r, HUB_REASONS[r] ?? '']),
);

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
  '/games/sudoku-fractal-deep': { max: 81, why: 'ФИЗИКА: сетка узла 9×9 — та же клетка, что у фрактала (38–42pt по ширине экрана); крупнее — доска не влезет' },
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
  /**
   * 🔴 «ПРОДОЛЖИТЬ» — ТОЖЕ ВХОД НА ПОЛЕ.
   *
   * Замер 02.09.2026: отдельным запуском третий проход заходил в 70 игр из 70, а
   * в общем прогоне — только в 66, и все четыре потерянные оказались судоку.
   * Причина не в судоку: перед третьим проходом отрабатывает второй, он ЗАПУСКАЕТ
   * партию, и та сохраняется. На следующем заходе экран предлагает не «Начать», а
   * «Продолжить» — кнопки с прежней подписью на нём нет вовсе.
   *
   * Продолжение партии выводит ровно на то же поле, значит для замера это тот же
   * вход. Без этой строчки четыре игры молча оставались непроверенными — а «не
   * проверено» здесь и есть главный вид брака.
   */
  /(?:^|[^\p{L}])(продолжить|continue|resume)(?![\p{L}])/iu,
];

/** Самопроверка искалки: ловит подписи входа и не путает их с фишкой уровня. */
const START_SELFTEST = {
  ok: ['Начать', 'Start', 'Старт', '🎯 Уровень 1 →', 'Уровень 1 — играть', 'Играть — уровень 1', 'Play level 1', 'Play — level 1',
       'Продолжить', 'Продолжить партию', 'Continue'],
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

function reportDebt({ news, grown, stale }, label, fmt = (s) => `${String(s.w).padStart(3)}×${String(s.h).padStart(3)}  ${s.label}`) {
  let bad = 0;
  if (news.length) {
    console.log(`\n🔴 НОВОЕ: ${label} там, где долга не записано:`);
    for (const f of news) {
      console.log(`    ${f.route} — ${f.small.length} шт.`);
      for (const s of f.small.slice(0, 6)) console.log(`        ${fmt(s)}`);
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

/**
 * 🔴 ЭКРАНЫ, ЧЬЁ ПОЛЕ ЖИВЁТ ВО ВСТРОЕННОЙ СТРАНИЦЕ (`<iframe>`).
 *
 * «Пауза» с 27.08.2026 показывает страницу «Умного будильника» целиком — в
 * родительском документе кнопки входа НЕТ, и второй проход падал «кнопка входа
 * не найдена». Записать её развилкой было бы враньём: поле существует, просто в
 * дочернем кадре. Поэтому аудит заходит В КАДР: жмёт старт страницы,
 * подтверждает обязательные предупреждения (в этом же месте их подтверждает
 * человек) и меряет кнопки, по которым стучат всю партию, — тем же MEASURE.
 */
const EMBEDDED_FIELD = {
  '/games/pause': {
    framePart: '/warmup/',
    reason: 'поле — встроенная страница «Зарядки»; вход и замер идут внутри кадра',
  },
};

async function auditEmbeddedField(page, route, spec) {
  const frame = page.frames().find((f) => f.url().includes(spec.framePart));
  if (!frame) return { route, failed: `встроенная страница ${spec.framePart} не загрузилась` };
  const старт = () => frame.evaluate(() => {
    const кнопка = document.getElementById('start-practice');
    if (кнопка) кнопка.click();
    return Boolean(кнопка);
  });
  if (!(await старт().catch(() => false))) return { route, failed: 'в кадре нет кнопки старта (#start-practice)' };
  await page.waitForTimeout(600);
  /**
   * Предупреждения безопасности: аудит подтверждает их так же, как человек, —
   * галочкой «я прочитал», после чего старт жмётся повторно.
   *
   * ⚠️ ЖМЁМ ТОЛЬКО ГАЛОЧКУ ПРЕДУПРЕЖДЕНИЙ, ПО ОДНОЙ, С ПЕРЕСЪЁМОМ УЗЛА.
   * Первая редакция кликала все чекбоксы одним проходом — и не входила в
   * партию: каждый клик перерисовывает страницу, список узлов протухает, и
   * третий клик бьёт по отсоединённому узлу. Заодно первые два клика щёлкали
   * ЧУЖИЕ тумблеры планировщика (Mastered solo / Experimental sets), которые
   * аудит трогать не должен вовсе.
   */
  for (let i = 0; i < 4; i++) {
    const осталось = await frame.evaluate(() => {
      const бокс = [...document.querySelectorAll('input[type=checkbox]')].find((x) =>
        !x.checked && x.offsetParent
        && /warning|предупрежд/i.test((x.closest('label') || x.parentElement || {}).textContent || ''));
      if (бокс) бокс.click();
      return Boolean(бокс);
    }).catch(() => false);
    if (!осталось) break;
    await page.waitForTimeout(300);
  }
  await старт().catch(() => {});
  const вошли = await frame.waitForFunction(
    () => document.body.classList.contains('is-practice-running'),
    { timeout: 8000 },
  ).then(() => true).catch(() => false);
  if (!вошли) return { route, failed: 'кадр не вошёл в партию (is-practice-running не поднялся)' };
  await page.waitForTimeout(800);
  const small = await frame.evaluate(MEASURE, MIN_FIELD);
  return { route, label: 'start-practice (в кадре)', small };
}

/**
 * ЗАМЕР ТРЕТЬЕГО ПРОХОДА — что вылезло за правый край на узком экране.
 *
 * 🔴 ЗАЧЕМ ОН ПОЯВИЛСЯ. Два отчёта Дениса за 02.09.2026 на одну и ту же болезнь:
 * «поехали кнопки верх тулбара» и «с меню пиздец сверху». На кадрах счёт упирался
 * в край экрана, «Правила» были срезаны до «Правил...», в маджонге бейджи ушли во
 * второй ряд и подвинули поле. Ни один из двух существовавших проходов этого не
 * видел: оба меряют РАЗМЕР элемента, а тут размер правильный — не хватает места.
 *
 * ⚠️ И это не первое возвращение. Шапку уже чинили: заголовок переводили на общий
 * каркас, бейджам поднимали высоту. Дефект возвращался, потому что проверялся
 * глазами на одном телефоне. Замер на узком экране закрывает именно этот путь.
 *
 * ЧТО СЧИТАЕМ НАРУШЕНИЕМ. Только верхнюю четверть экрана: ниже живут игровые поля,
 * где горизонтальная лента — законный приём (та же лестница уровней). Элемент
 * виноват, если его правый край дальше окна больше чем на 2 пикселя, или левый
 * левее нуля на столько же. Двойка — на округление браузером дробных координат.
 */
/**
 * 🔴 ОБРЕЗАНИЕ ОБРЕЗАНИЮ РОЗНЬ: ОКНО В КАРТИНКУ — НЕ ДЕФЕКТ.
 *
 * Проверка «спрятано обрезанием» родилась на плашке счётчиков: overflow:hidden
 * съел шесть цифр в судоку, гейт молчал, отчёт пришёл в тот же день. Но 03.09.2026
 * она же покрасила выпуск v2.37.1 на 27 играх, и покрасила ЗРЯ: спрятанные 29 px —
 * это питомец в шапке. Его окно 30×30 показывает морду спрайта шириной 90 px, и
 * обрезание там — сама задача («в окошке голова торчит», формулировка Дениса).
 * Всё, что «спрятано», нарисовано нарочно и никому не нужно целиком.
 *
 * Разделяем по ПОТЕРЕ СМЫСЛА, а не по наличию обрезания:
 *   · внутри есть текст — читать его человек должен целиком, обрезали → дефект;
 *   · внутри есть кнопка, вылезающая из окна, — по ней стучат, дефект;
 *   · ни того, ни другого (окно в картинку) — нарочный кадр, не дефект.
 *
 * ⚠️ Дыры «обрезали иконку-кнопку» тут нет: у вылезшей кнопки собственный
 * прямоугольник обрезанием не меняется, и второе условие её ловит.
 */
function ставитьПредикатОбрезания(page) {
  return page.addInitScript(() => {
    window.__клипТеряетСмысл = function (el) {
      if ((el.innerText || '').trim()) return true;
      const w = el.getBoundingClientRect();
      for (const b of el.querySelectorAll('[role="button"], button, [tabindex]')) {
        const r = b.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.right > w.right + 2 || r.left < w.left - 2) return true;
      }
      return false;
    };
  });
}

/**
 * Самопроверка предиката на подставных узлах: гейт, который перестал ловить свой
 * же исходный дефект, обязан сказать об этом сам, а не молча зеленеть.
 */
async function selfTestClipPredicate(page) {
  const r = await page.evaluate(() => {
    const mk = (html) => { const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;overflow:hidden;z-index:-1';
      d.innerHTML = html; document.body.appendChild(d); return d; };
    const текст = mk('<span style="display:inline-block;width:200px">1234567890 ещё цифры</span>');
    const картинка = mk('<div style="width:90px;height:90px;background:#000"></div>');
    const кнопка = mk('<div role="button" style="position:absolute;left:20px;width:60px;height:20px"></div>');
    const res = { текст: window.__клипТеряетСмысл(текст), картинка: window.__клипТеряетСмысл(картинка),
      кнопка: window.__клипТеряетСмысл(кнопка) };
    [текст, картинка, кнопка].forEach((n) => n.remove());
    return res;
  });
  const беды = [];
  if (!r.текст) беды.push('обрезанный ТЕКСТ больше не считается дефектом — вернулась беда плашки счётчиков');
  if (!r.кнопка) беды.push('обрезанная КНОПКА больше не считается дефектом');
  if (r.картинка) беды.push('окно в картинку снова считается дефектом — красить будет питомца');
  if (r.полосаВОкне) беды.push('полоса кадров внутри окна снова считается вылезшей за край');
  if (беды.length) { console.log('\n🔴 Самопроверка обрезания провалена:'); for (const b of беды) console.log('    ' + b); return 1; }
  console.log('   самопроверка обрезания: текст ✓ кнопка ✓ окно-картинка ✓ полоса-в-окне ✓');
  return 0;
}

const MEASURE_OVERFLOW = () => {
  const out = [];
  const W = window.innerWidth;
  const зона = window.innerHeight * 0.25;
  for (const el of document.querySelectorAll('[role="button"], button, [tabindex], div, span, text')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    /**
     * 🔴 ПРОВЕРЯЕМ ШАПКУ И НИЖНИЙ РЯД, А НЕ ОДНУ ШАПКУ.
     *
     * Отчёт Дениса 03.09.2026 со скриншотом симулятора: в «Сортировке товаров»
     * кнопка «Перемешать» срезана правым краем, а «Отменить» начинается на 20
     * точках при отступе контейнера 68 — ряд шире коробки и вылезает с ОБЕИХ
     * сторон. Гейт при этом был зелёным: он смотрел только верхнюю четверть окна,
     * а служебный ряд живёт внизу.
     *
     * Три захода на починку ушли вслепую именно потому, что мерить было нечем —
     * каждая проверка стоила пересборки под симулятор. Теперь низ меряется здесь.
     */
    const низ = r.top >= window.innerHeight * 0.72;
    if (r.top > зона && !низ) continue;                 // ни шапка, ни нижний ряд
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.opacity === '0' || st.display === 'none') continue;
    if (st.position === 'fixed' && r.top < 0) continue;
    /**
     * 🔴 «ВЫЛЕЗЛО» ЗНАЧИТ ВИДНО ЗА КРАЕМ, А НЕ ПРОСТО ШИРЕ ОКНА.
     *
     * Замер 03.09.2026: выпуск v2.37.3 покраснел на 27 играх с «+121 px за край».
     * Виновником оказался лист кадров питомца: облик приезжает с маскот-канала одной
     * горизонтальной полосой, её растягивают на `размер × число кадров` и двигают
     * внутри окна `overflow: hidden` шириной в один кадр. Собственный прямоугольник
     * полосы и правда шире экрана — но видно из неё ровно один кадр, и он на месте.
     * Считаем ВИДИМУЮ часть: обрезаем прямоугольник каждым предком, который режет.
     */
    let vl = r.left, vr = r.right;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st2 = getComputedStyle(p);
      if (st2.overflow === 'hidden' || st2.overflowX === 'hidden' || st2.overflow === 'clip' || st2.overflowX === 'clip') {
        const pr = p.getBoundingClientRect();
        vl = Math.max(vl, pr.left); vr = Math.min(vr, pr.right);
      }
    }
    if (vr <= vl) continue;                              // видимой части не осталось
    const выход = Math.max(Math.round(vr - W), Math.round(-vl));
    if (выход <= 2) continue;
    // Внешний виноватый достаточно назвать один раз: потомок вылез вместе с ним.
    if (el.parentElement) {
      const rp = el.parentElement.getBoundingClientRect();
      if (rp.right - W > 2 || -rp.left > 2) continue;
    }
    out.push({
      label: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 44) || '(без подписи)',
      out: выход,
      w: Math.round(r.width),
    });
  }
  // Прокрутка вбок — отдельный признак: она бывает и без единого виноватого элемента.
  const scroll = Math.round(document.documentElement.scrollWidth - W);
  if (scroll > 2) out.push({ label: '(страница прокручивается вбок)', out: scroll, w: W });
  /**
   * 🔴 И ВНИЗ ТОЖЕ. Проверка появилась вместе с правкой, которая ЗАПРЕЩАЕТ полю
   * отдавать касание прокрутке (иначе экран ездил под пальцем во время хода).
   * У правки есть цена: если поле длиннее окна, до нижней части теперь не
   * дотянуться пальцем вовсе. Пока страница в окно влезает — цены нет, и вот
   * это здесь и меряется. Красное тут означает «часть экрана стала недоступна».
   */
  const вниз = Math.round(document.documentElement.scrollHeight - window.innerHeight);
  if (вниз > 2) out.push({ label: '(экран длиннее окна — низ не достать пальцем)', out: вниз, w: W });
  /**
   * 🔴 И СПРЯТАННОЕ ОБРЕЗАНИЕМ — ТОЖЕ ДЕФЕКТ, ПРИЧЁМ ХУЖЕ ВЫЛЕЗШЕГО.
   *
   * Проверка выше ловит то, что ВЫЛЕЗЛО за край. Но у переполнения есть второй
   * исход: `overflow: hidden` — и тогда лишнее не вылезает, а ПРОПАДАЕТ. Замер
   * молчит, а человек не видит цифр.
   *
   * Так и случилось: в v2.34.2 плашке счётчиков поставили обрезание «последней
   * защитой», в судоку шесть счётчиков перестали помещаться, и отчёт пришёл в тот
   * же день — «табло, не видно цифры, не видно сверху». Гейт при этом показывал
   * ноль нарушений на 360 px.
   *
   * Признак: у элемента содержимое шире его же видимой области (`scrollWidth`
   * больше `clientWidth`) при включённом обрезании. Порог 4 px — на дробные
   * координаты и границы.
   */
  for (const el of document.querySelectorAll('div, span')) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || (r.top > зона && r.top < window.innerHeight * 0.72)) continue;
    const st = getComputedStyle(el);
    if (st.overflowX !== 'hidden' && st.overflow !== 'hidden') continue;
    const спрятано = el.scrollWidth - el.clientWidth;
    if (спрятано <= 4) continue;
    if (!window.__клипТеряетСмысл(el)) continue;
    out.push({
      label: `(обрезано: спрятано ${спрятано} px) ${(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30)}`,
      out: спрятано, w: Math.round(r.width),
    });
  }
  return out;
};

/**
 * ДОЛГ ПО ШАПКЕ на 02.09.2026, ширина 360. Пусто — и это значение по умолчанию:
 * шапка обязана влезать всегда. Запись сюда — признание, что где-то она не влезает
 * по физике, и такую запись нужно защищать так же, как записи выше.
 */
const HEADER_DEBT = {};

/** ПРОХОД 3 — шапка на узком экране: что вылезло за край. */
async function auditHeader(page, routes) {
  /**
   * ⚠️ СУЖАЕМ ТУ ЖЕ ВКЛАДКУ, А НЕ ОТКРЫВАЕМ НОВУЮ.
   *
   * Первая редакция открывала свою страницу — и не зашла НИ В ОДНУ игру из пяти,
   * отчитавшись «✅ шапка влезает». Новая вкладка приходит без пройденного
   * онбординга: приложение показывает «Выбери первую игру», кнопки входа на
   * экране нет, и все пять маршрутов легли в «экран не сменился». Онбординг
   * проходится в `main` один раз и живёт в этой странице.
   */
  const прежний = page.viewportSize();
  await page.setViewportSize({ width: NARROW_W, height: 780 });
  /**
   * ⚠️ НАЧИНАЕМ С ЧИСТОГО ЭКРАНА, А НЕ С ТОГО, ГДЕ ОСТАВИЛ ПРЕДЫДУЩИЙ ПРОХОД.
   *
   * Проверено 02.09.2026 обоими способами: отдельным запуском проход заходит в
   * 70 игр из 70, а в общем прогоне (как в сборке) — только в 66. Разница в том,
   * что перед ним отработал проход по полю и оставил страницу ВНУТРИ партии:
   * идёт таймер, крутятся анимации, у части игр висит вопрос «выйти из партии?».
   * Первые навигации попадают в это состояние и не доходят.
   *
   * Четыре непроверенных игры в сборке — это четыре игры, о которых гейт молчит.
   * Возврат на главную стоит секунду и снимает весь класс.
   */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);

  const results = [];
  const пропущены = [];
  for (const route of routes) {
    if (HUB_ROUTES[route]) continue;
    /**
     * Экран, чьё поле живёт во встроенной странице, здесь пропускаем НАЗВАВ ЕГО.
     * Его вёрстку задаёт другой документ со своими правилами, и мерить её этим
     * проходом — мерить не то. Молча не пропускаем: «не проверено» обязано быть
     * видно, иначе гейт снова окажется зелёным вслепую.
     */
    if (EMBEDDED_FIELD[route]) { пропущены.push(`${route}: ${EMBEDDED_FIELD[route].reason}`); continue; }
    const rendered = await open(page, route);
    if (!rendered) { results.push({ route, failed: 'экран не отрисовался' }); continue; }
    await dismissCoach(page);
    /**
     * 🔴 ПАРТИЯ МОЖЕТ БЫТЬ УЖЕ ОТКРЫТА — И ЭТО НЕ ПРОВАЛ ВХОДА.
     *
     * Четыре судоку в общем прогоне падали с «кнопка входа не найдена». Снято
     * живьём 02.09.2026: после того как предыдущий проход начал партию, повторный
     * заход открывает НЕ экран настройки, а сразу поле — на экране «Ячейка 1, 1»,
     * «Подсказка», «Пометки», и кнопки старта там нет по замыслу.
     *
     * ⚠️ ПОРЯДОК И ПРИЗНАК — ОБА ВАЖНЫ, И ПЕРВАЯ РЕДАКЦИЯ ОШИБЛАСЬ В ОБОИХ.
     * Она спрашивала ДО попытки старта и опознавала поле по ОТСУТСТВИЮ полосы
     * настройки. Отсутствие — не признак: у семи игр-модулей экран настройки
     * рисует сам модуль, полосы там нет, и проверка объявила настройку полем.
     * Результат виден числом: гейт «нашёл» переполнение на 600–2200 px — это он
     * померил ленту уровней на экране настройки, где она законно уезжает вбок.
     *
     * Поэтому: сначала обычная попытка входа, и только если её нет — ПОЛОЖИТЕЛЬНЫЙ
     * признак партии: служебные кнопки каркаса (`game-aux`) или его нижняя полоса.
     * Они рисуются только во время партии.
     */
    let start = await pressStart(page);
    if (!start || !start.entered) {
      const наПоле = await page.evaluate(() => Boolean(
        document.querySelector('[data-testid="game-aux"]')
        || document.querySelector('[data-testid="game-toolbar"]')
        || document.querySelector('[data-testid="game-bottom-actions"]')
        // ⚠️ И шапка со служебными: судоку кладёт подсказку именно туда
        // (`headerActions`), а не в ряд `game-aux`. Без этой строки судоку
        // оставалась единственной непроверенной игрой.
        || document.querySelector('[data-testid="game-header-actions"]'),
      ));
      if (!наПоле) {
        results.push({ route, failed: start ? 'экран не сменился' : 'кнопка входа не найдена' });
        continue;
      }
      start = null;   // партия уже идёт — мерить можно прямо здесь
    }
    const small = await page.evaluate(MEASURE_OVERFLOW);
    results.push({ route, label: start ? start.label : '(партия уже была открыта)', small });
  }
  if (прежний) await page.setViewportSize(прежний);

  const blind = results.filter((r) => r.failed);
  const entered = results.filter((r) => r.small);
  const withSmall = entered.filter((r) => r.small.length);
  console.log(`\n── Проход 3: шапка на узком экране (${NARROW_W} px). Зашли в ${entered.length} игр из ${routes.length}.`);
  for (const п of пропущены) console.log(`    пропущено — ${п}`);

  let bad = 0;
  /**
   * 🔴 НЕ ЗАШЛИ — ЗНАЧИТ КРАСНЫЙ, А НЕ ПРЕДУПРЕЖДЕНИЕ.
   *
   * Первый же прогон 02.09.2026 зашёл в ноль игр из пяти и напечатал «✅ шапка
   * влезает». Это хуже отсутствия проверки: сборка зелёная, человек уверен, что
   * шапка проверена, а не проверено ничего. Соседний проход по полю падает в
   * таком случае — и этот обязан.
   */
  if (blind.length) {
    console.log(`\n🔴 Не удалось зайти в ${blind.length} игр — шапка у них НЕ ПРОВЕРЕНА:`);
    for (const b of blind) console.log(`    ${b.route}: ${b.failed}`);
    bad = 1;
  }
  if (!entered.length) {
    console.log('\n🔴 Не зашли ни в одну игру: проверять было нечего, зелёным это быть не может.');
    bad = 1;
  }
  const checkable = routes.filter((r) => entered.some((e) => e.route === r));
  bad |= reportDebt(checkAgainstDebt(withSmall, HEADER_DEBT, checkable), 'шапка вылезает за край',
    (x) => `+${String(x.out).padStart(3)} px за край  ${x.label}`);
  if (!bad) console.log(`✅ Шапка влезает в ${NARROW_W} px во всех проверенных играх.`);
  return bad;
}

/** ПРОХОД 2 — на поле: жмём «Начать» и меряем то, по чему стучат всю партию. */
async function auditField(page, routes) {
  const results = [];
  for (const route of routes) {
    if (HUB_ROUTES[route]) { results.push({ route, hub: true }); continue; }
    if (EMBEDDED_FIELD[route]) {
      await open(page, route, { needButtons: false });
      await page.waitForTimeout(1500);
      results.push(await auditEmbeddedField(page, route, EMBEDDED_FIELD[route]));
      continue;
    }
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
  await ставитьПредикатОбрезания(page);

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
  bad |= await selfTestClipPredicate(page);
  if (MODE === 'all' || MODE === 'routes') bad |= await auditRoutes(page, routes);
  if (MODE === 'all' || MODE === 'field') bad |= await auditField(page, games);
  if (MODE === 'all' || MODE === 'header') bad |= await auditHeader(page, games);

  await browser.close();
  if (bad) process.exitCode = 1;
}

main();
