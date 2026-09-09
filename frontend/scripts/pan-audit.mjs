/**
 * pan-audit — экран не должен ездить вбок ни сам, ни от пальца по полю.
 *
 * ЗАЧЕМ. Два отчёта Дениса об одном и том же, второй со словом «ВСЁ ЕЩЁ»:
 *   02.09.2026, dots-connect: «окно ездит, когда начинаешь их соединять»;
 *   05.09.2026, dots-connect: «экран всё ещё сдвигается пальцем влево-вправо,
 *                              это очень мешает игре, особенно когда соединяешь точки».
 *
 * Между ними была правка: `GameShell` навесил `touch-action: none` на контейнер
 * поля. Она не помогла, и вот почему её было мало. У «уезда вбок» ДВЕ разные
 * причины, и лечатся они по-разному:
 *
 *   1) СТРАНИЦА ШИРЕ ОКНА. Что-то на экране вылезло за 360 px — и браузер честно
 *      даёт таскать всю страницу. `touch-action` на поле тут бессилен: жест
 *      начинается на поле, но прокручивается ДОКУМЕНТ, который выше по дереву.
 *      Ровно так v2.37.52 уехала на 6 px из-за трёх кнопок «Пробирок» в ряд.
 *
 *   2) ЖЕСТ ПО ПОЛЮ ТОЛКУЕТСЯ КАК ПРОКРУТКА. Это и лечит `touch-action`, но
 *      только если он реально доехал до узла, по которому ведут пальцем.
 *
 * Поэтому здесь ДВЕ проверки, и обе меряют браузером, а не читают исходник.
 * Ни одна не заменяет другую: страница может не быть шире окна и всё равно
 * ездить, и наоборот.
 *
 * ⚠️ ШИРИНА 360. Это Galaxy A/M — самый узкий экран из живых отчётов. На 390
 * тот же дефект не виден: места хватает, и переполнения нет.
 *
 * Запуск (нужен поднятый веб-билд с baseUrl=""):
 *   node scripts/serve-dist.mjs dist 8127 &
 *   node scripts/pan-audit.mjs --base=http://127.0.0.1:8127
 *   node scripts/pan-audit.mjs --base=... --only=dots-connect,one-line
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = args.base ?? 'http://127.0.0.1:8127';
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;
const LIMIT = args.limit ? Number(args.limit) : Infinity;

/** Узкий телефон из живых отчётов. */
const W = args.w ? Number(args.w) : 360;
const H = args.h ? Number(args.h) : 780;
/**
 * Допуск переполнения. НЕ ноль: у прокручиваемых экранов полоса прокрутки в
 * headless-хроме занимает пиксель, и требовать ровного равенства значило бы
 * ловить браузер, а не вёрстку.
 */
const ЗАПАС = 2;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * ИЗВЕСТНЫЙ ДОЛГ. Пусто и должно оставаться пустым: горизонтальный уезд — не
 * «мелкая кнопка», его нельзя оставить на потом. Экран, который ездит вбок,
 * ломает любой жест по полю.
 */
const ДОЛГ = {};

/**
 * ВЫСОТА ДЛЯ ЗАМЕРА НИЖНЕГО КРАЯ. Основной проход идёт на 780 — там низ влезает у
 * всех. Дефект живёт на КОРОТКИХ экранах: телефон тестировщика отдаёт 436×677,
 * классический бюджетный Android — 360×640. Меряем на 640: это пол, ниже него
 * телефонов в отчётах нет.
 */
const H_НИЗ = 640;
/** Ниже этого — не дефект, а полоса прокрутки/округление. У counter — 22. */
const ЗАПАС_НИЗ = 8;
/**
 * ДОЛГ ПО НИЖНЕМУ КРАЮ: маршрут → сколько кнопок и почему. Замер 09.09.2026 по
 * всем 97 экранам на 360×640 и 436×677: единственный экран — счёт. Запись
 * снимает counting-chat вместе с самим дефектом (см. его COORDINATOR_INBOX).
 */
const ДОЛГ_НИЗ = {
  '/games/counter': { max: 3, why: 'нижний ряд цифровой клавиатуры («7 8 9») уходит ниже окна на 22 px при высоте 640/677; при 780 влезает' },
};

/**
 * Маршруты берём с ДИСКА — по файлам `app/games/*.tsx`, а не по каталогу.
 *
 * ⚠️ Первая редакция читала `id` из `src/constants/games.ts`, и это была
 * ловушка: там идентификаторы через подчёркивание (`object_tracker`), а
 * маршруты через дефис (`object-tracker`). Из шести запрошенных игр аудит
 * проверил ОДНУ и отрапортовал бы «всё хорошо» по остальным пяти.
 */
/**
 * Развилки — экраны, которые разводят по соседним играм. Кнопки «Начать» у них
 * нет и не должно быть: поля нет, есть список карточек.
 *
 * 🔴 СПИСОК БЕРЁТСЯ ИЗ КАТАЛОГА (`hub: true`), А НЕ ПЕРЕПИСЫВАЕТСЯ СЮДА. У
 * соседнего аудита он выписан руками в `HUB_REASONS`, и это работает ровно до
 * первой новой развилки: сборка v2.37.26 уже падала на «Исключение без
 * обоснования», потому что хаб появился в каталоге, а в список его не внесли.
 * Признак `hub` живёт в самом каталоге — оттуда и читаем.
 */
async function развилки() {
  const src = await fs.readFile(path.join(ROOT, 'src/constants/games.ts'), 'utf8');
  const набор = new Set();
  // Разбираем по объектам каталога: маршрут и признак развилки лежат в одном.
  for (const кусок of src.split(/\n\s*\{\s*\n/)) {
    const м = кусок.match(/route:\s*'(\/games\/[a-z0-9-]+)'/);
    if (м && /\bhub:\s*true\b/.test(кусок)) набор.add(м[1]);
  }
  return набор;
}

async function маршруты() {
  const файлы = await fs.readdir(path.join(ROOT, 'app/games'));
  const все = файлы
    .filter((f) => f.endsWith('.tsx') && !f.startsWith('_'))
    .map((f) => `/games/${f.replace(/\.tsx$/, '')}`)
    .sort();
  const выбор = ONLY ? все.filter((r) => ONLY.some((o) => r.endsWith(`/${o}`))) : все;
  if (ONLY) {
    const нет = ONLY.filter((o) => !выбор.some((r) => r.endsWith(`/${o}`)));
    if (нет.length) { console.log(`🔴 нет таких маршрутов: ${нет.join(', ')}`); process.exit(1); }
  }
  return выбор.slice(0, LIMIT);
}

/** Сколько на экране нажимаемого — признак, что React отрисовался. */
const считатьКнопки = () => document.querySelectorAll('[role="button"], button').length;

async function открыть(page, route) {
  for (let попытка = 0; попытка < 2; попытка++) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(считатьКнопки, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    if (await page.evaluate(считатьКнопки)) return true;
  }
  return false;
}

const ВХОД = [
  /(?:^|[^\p{L}])(начать|start|старт|играть|play)(?![\p{L}])/iu,
  /(?:^|[^\p{L}])(продолжить|continue|resume)(?![\p{L}])/iu,
  // Часть игр подписывает вход фишкой уровня: «🎯 Уровень 1 →», «Level 1 →».
  // Без этой строки `schulte` и `chess-blind` молча уходили в «не проверено».
  /(уровень|level)\s*\d+\s*(→|->|—|-)/iu,
];

/**
 * 🔴 САМОПРОВЕРКА ИСКАЛКИ ВХОДА. Сломанная искалка не падает — она отчитывается
 * «кнопка входа не найдена» по всем играм сразу, и это выглядит как чужая
 * поломка, а не как своя. Приём взят из `scripts/tap-target-audit.mjs`.
 */
const ВХОД_ПРОБА = {
  да: ['Начать', 'Start', 'Старт', '🎯 Уровень 1 →', 'Уровень 1 — играть', 'Play level 1', 'Продолжить'],
  нет: ['Уровень 1', 'Назад', 'Об игре', 'Справка', 'Уровни', 'Топ игроков (5×5 классика)'],
};
function проверитьИскалку() {
  const похоже = (t) => ВХОД.some((re) => re.test(t));
  const беда = [
    ...ВХОД_ПРОБА.да.filter((t) => !похоже(t)).map((t) => `не узнал вход: «${t}»`),
    ...ВХОД_ПРОБА.нет.filter((t) => похоже(t)).map((t) => `принял за вход: «${t}»`),
  ];
  if (беда.length) {
    console.log('\n🔴 Искалка кнопки входа сломана — аудит был бы «не проверено» на всём:');
    беда.forEach((b) => console.log(`    ${b}`));
    process.exit(1);
  }
}

/**
 * Служебные экраны без поля: у них нет партии и входа в неё по устройству.
 * Молча не пропускаем — называем поимённо, иначе «не проверено» превратится в
 * тихую дыру.
 */
const БЕЗ_ПОЛЯ = {
  '/games/pause': 'пауза: служебный экран между упражнениями, поля нет',
};

/**
 * Второй шаг входа: у лабораторных игр ПОСЛЕ «Начать» идёт СВОЙ экран правил.
 *
 * 🔴 ЗАМЕР 05.09.2026, ради которого это написано. Гейт жал одну кнопку и мерил
 * то, что оказалось под ней. У «Соедини точки» под ней — экран правил («Как
 * играть… Показать решение / Попробовать тренировку»), а доска ЕЩЁ ДАЛЬШЕ.
 * То есть по семи лабораторным играм гейт не видел поля НИ РАЗУ и был зелёным
 * именно поэтому. За два дня пришло четыре отчёта «экран ездит под пальцем» —
 * ровно по этим играм, и все четыре гейт пропустил.
 */
const ВТОРОЙ_ШАГ = [
  'Попробовать тренировку', 'Try the training', 'Играть', 'Play',
  'Дальше', 'Next', 'Продолжить', 'Continue',
];

async function второйШаг(page) {
  for (const label of ВТОРОЙ_ШАГ) {
    const b = page.getByText(label, { exact: true }).first();
    if (await b.count().catch(() => 0)) {
      await b.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(1600);
      return label;
    }
  }
  return null;
}

async function войти(page) {
  for (const label of ['Понятно', 'Got it']) {
    const b = page.getByText(label, { exact: true }).first();
    if (await b.count().catch(() => 0)) { await b.click({ timeout: 1500 }).catch(() => {}); break; }
  }
  const подпись = await page.evaluate((исходники) => {
    const res = исходники.map((s) => new RegExp(s, 'iu'));
    const все = [...document.querySelectorAll('[role="button"], button')];
    const годные = все
      .map((el, i) => ({ i, t: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim(), r: el.getBoundingClientRect() }))
      .filter((c) => c.r.width > 1 && c.r.height > 1 && res.some((re) => re.test(c.t)));
    годные.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (!годные[0]) return null;
    все.forEach((el) => el.removeAttribute('data-pan-start'));
    все[годные[0].i].setAttribute('data-pan-start', '1');
    return годные[0].t.slice(0, 40);
  }, ВХОД.map((r) => r.source));
  if (!подпись) return null;
  await page.click('[data-pan-start]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1600);
  /**
   * Дожимаем до поля: не больше двух шагов, и каждый называем в отчёте — чтобы
   * из строки было видно, ГДЕ гейт остановился, а не только что он зелёный.
   */
  const шаги = [подпись];
  for (let i = 0; i < 2; i++) {
    const ещё = await второйШаг(page);
    if (!ещё) break;
    шаги.push(ещё);
  }
  return шаги.join(' → ');
}

/**
 * Устойчивое переполнение: берём МИНИМУМ из нескольких замеров.
 *
 * ⚠️ Первая редакция мерила один раз и поймала маджонг на 142 px — переходное
 * состояние разметки в первую секунду после отрисовки. На устоявшейся странице
 * переполнения там нет вовсе. Гейт, срабатывающий на миг разметки, мигает: он
 * покраснеет на чужой правке и позеленеет сам собой при перезапуске, и доверия
 * к нему не останется. Человек чувствует то, что ДЕРЖИТСЯ.
 */
async function устойчивоеПереполнение(page) {
  let худшее = null;
  for (let i = 0; i < 4; i++) {
    const з = await page.evaluate(переполнение);
    if (!худшее || з.лишнее < худшее.лишнее) худшее = з;   // минимум = то, что держится
    if (худшее.лишнее <= 0) return худшее;                 // хоть раз ноль — значит не держится
    await page.waitForTimeout(400);
  }
  return худшее;
}

/** Насколько документ шире окна и КТО его расширяет. */
const переполнение = () => {
  const de = document.documentElement;
  const лишнее = de.scrollWidth - de.clientWidth;
  if (лишнее <= 0) return { лишнее: 0, виновные: [] };
  const виновные = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const выход = Math.max(0, Math.round(r.right - de.clientWidth), Math.round(-r.left));
    if (выход > 0) {
      виновные.push({
        выход,
        тег: el.tagName.toLowerCase(),
        класс: (el.className && String(el.className).slice(0, 40)) || '',
        текст: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30),
        файл: (el.currentSrc || el.src || '').split('/').pop().slice(0, 42),
        ширина: Math.round(r.width),
      });
    }
  }
  виновные.sort((a, b) => b.выход - a.выход);
  return { лишнее, виновные: виновные.slice(0, 3) };
};

/**
 * 🔴 ЗАГОЛОВОК НЕ ДОЛЖЕН УХОДИТЬ ПОД ПЛАВАЮЩИЕ КНОПКИ.
 *
 * Отчёт ребёнка 05.09.2026 (b0ceeb2e, memory-matrix, tauri-android). На кадре
 * аватар питомца и кнопка «Правила» лежат поверх слова «Матрица памяти».
 *
 * Причина не в шапке игры, а в том, что угловой ряд (питомец + справка) —
 * СКВОЗНОЙ слой поверх всего экрана, а место под него резервирует каждый экран
 * сам. Каркас `GameShell` отводит 68 px, но с питомцем ряд занимает 117, и
 * экраны настройки, рисующие свою шапку, отводят и вовсе 40. Замер 05.09.2026 на
 * 360 px: ряд 239…356, заголовок доходит до 266 — наезд 27 px.
 *
 * Мерим НАРИСОВАННОЕ: у ряда есть `testID`, у заголовка — своя строка текста.
 */
const наездНаЗаголовок = () => {
  const ряд = document.querySelector('[data-testid="help-corner-row"]');
  if (!ряд) return null;                       // нет углового ряда — нечего накрывать
  const r = ряд.getBoundingClientRect();
  if (r.width < 4) return null;
  let худший = null;
  for (const el of document.querySelectorAll('div, span, p, h1, h2')) {
    if (el.children.length) continue;          // только листья с текстом
    if (ряд.contains(el)) continue;            // сам ряд не считается
    const текст = (el.innerText || '').trim();
    if (текст.length < 2) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 8 || b.height < 8) continue;
    const поВертикали = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
    const поГоризонтали = Math.min(b.right, r.right) - Math.max(b.left, r.left);
    if (поВертикали > 4 && поГоризонтали > 4) {
      if (!худший || поГоризонтали > худший.наезд) {
        худший = { наезд: Math.round(поГоризонтали), текст: текст.slice(0, 28) };
      }
    }
  }
  return худший;
};

/**
 * Провести пальцем по полю и посмотреть, уехала ли СТРАНИЦА.
 *
 * 🔴 ЧЕРЕЗ CDP, А НЕ `dispatchEvent`. Первая редакция рассылала TouchEvent'ы
 * руками — и была зелена вслепую по определению: событие, созданное скриптом,
 * браузер НЕ считает вводом и прокрутку от него не запускает. Проверка «палец
 * прокрутил страницу» никогда бы не покраснела, что бы ни творилось в вёрстке.
 *
 * `Input.dispatchTouchEvent` протокола CDP идёт по тому же пути, что настоящее
 * касание: страница прокручивается ровно так, как под пальцем человека.
 *
 * ⚠️ Мышью проверять бесполезно по той же причине: она страницу не таскает.
 */
/**
 * КНОПКИ НИЖЕ НИЖНЕГО КРАЯ ЭКРАНА (замер, пока не гейт).
 *
 * Кадры тестировщика 09.09.2026: в n-back кнопка MATCH на пяти снимках подряд
 * (v1.198…v2.37.46, вьюпорт 436×677) прижата к нижнему краю и обрезана — видна
 * полоска. Ни один гейт этого не видел: pan-audit меряет ширину, tap-audit —
 * размер, а «кнопка есть, но ниже экрана» не мерил никто.
 *
 * Считаем кнопки, чей низ ниже окна и которые НЕ лежат внутри прокручиваемого
 * контейнера (там ниже сгиба — нормально, палец дотянется). Прокручиваемость —
 * по computed overflow-y auto|scroll у предка, кроме html/body.
 */
const кнопкиНижеЭкрана = () => {
  const vh = window.innerHeight;
  const прокручиваем = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  const итог = [];
  for (const el of document.querySelectorAll('[role="button"], button')) {
    const b = el.getBoundingClientRect();
    if (b.width < 8 || b.height < 8) continue;
    if (b.bottom <= vh + 2) continue;
    if (прокручиваем(el)) continue;
    const текст = (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 28);
    итог.push({ текст, ниже: Math.round(b.bottom - vh), top: Math.round(b.top) });
  }
  return итог;
};

async function протащить(page) {
  const до = await page.evaluate(() => window.scrollX + document.documentElement.scrollLeft);
  const y = Math.round(H * 0.55);
  const cdp = await page.context().newCDPSession(page);
  const точка = (x) => [{ x, y, radiusX: 8, radiusY: 8, force: 1 }];
  const x0 = Math.round(W * 0.78);
  const x1 = Math.round(W * 0.18);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: точка(x0) });
  for (let x = x0; x > x1; x -= 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: точка(x) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  const после = await page.evaluate(() => window.scrollX + document.documentElement.scrollLeft);
  await cdp.detach().catch(() => {});
  return Math.abs(после - до);
}

/**
 * 🔴 САМОПРОВЕРКА ИНСТРУМЕНТА. Без неё этот аудит бесполезен.
 *
 * Проверка «палец прокрутил страницу» отвечает «нет» двумя способами: потому что
 * страница не ездит, и потому что палец ненастоящий. Второй случай неотличим от
 * первого по результату и молчалив: гейт зеленеет на всём подряд.
 *
 * Так и было в первой редакции — события рассылались через `dispatchEvent`, а
 * их браузер вводом не считает и прокрутку от них не запускает. Поэтому здесь
 * заведомо ЕЗДЯЩАЯ страница: если на ней палец не сдвинул ничего, инструмент
 * сломан, и аудит обязан упасть, а не отчитаться об успехе.
 */
async function самопроверкаПальца(ctx) {
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0">
    <div style="width:2400px;height:400px;background:linear-gradient(90deg,#eee,#333)"></div>
  </body>`);
  await page.waitForTimeout(200);
  const сдвиг = await протащить(page);
  await page.close();
  if (сдвиг <= ЗАПАС) {
    console.log('\n🔴 ИНСТРУМЕНТ СЛОМАН: на заведомо едущей странице палец не сдвинул ничего');
    console.log(`   (сдвиг ${сдвиг} px). Проверка «палец прокручивает страницу» была бы`);
    console.log('   зелена вслепую на любой игре. Разбираться с этим, а не с играми.');
    process.exit(1);
  }
  console.log(`Самопроверка пальца: на едущей странице сдвинул ${сдвиг} px — инструмент работает.`);
}

/**
 * 🔴 САМОПРОВЕРКА ЗАМЕРА НИЖНЕГО КРАЯ — по той же причине, что и у пальца.
 *
 * «Кнопок ниже окна нет» тоже отвечается «нет» двумя способами: их правда нет —
 * или измеритель их не видит (не тот селектор, не то окно, прокрутка посчитана
 * не так). Заведомо устроенная страница различает эти случаи: кнопка ниже
 * короткого окна вне прокрутки ОБЯЗАНА найтись, кнопка ниже сгиба ВНУТРИ
 * прокручиваемого блока и кнопка в окне — обязаны НЕ найтись. Иначе гейт либо
 * слеп, либо кричит на законную прокрутку — и в обоих случаях ему нельзя верить.
 */
async function самопроверкаНиза(ctx) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: W, height: H_НИЗ });
  // ⚠️ meta viewport ОБЯЗАТЕЛЕН: контекст мобильный (isMobile), и без него страница
  // раскладывается в 980 px с масштабом — innerHeight становится ~1700, и кнопка на
  // 620 px оказывается «в окне». Первая редакция самопроверки на этом и упала.
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;height:${H_НИЗ}px;overflow:hidden">
    <button id="ok" style="position:fixed;top:10px;left:10px;width:100px;height:48px">в окне</button>
    <div style="position:fixed;top:100px;left:0;width:300px;height:200px;overflow-y:auto">
      <div style="height:900px"></div><button style="width:100px;height:48px">в прокрутке</button>
    </div>
    <button id="low" style="position:fixed;top:${H_НИЗ - 20}px;left:10px;width:100px;height:48px">ниже окна</button>
  </body></html>`);
  await page.waitForTimeout(200);
  const найдено = (await page.evaluate(кнопкиНижеЭкрана)).filter((k) => k.ниже > ЗАПАС_НИЗ);
  await page.close();
  const тексты = найдено.map((k) => k.текст).sort().join(', ');
  if (тексты !== 'ниже окна') {
    console.log('\n🔴 ИНСТРУМЕНТ СЛОМАН: замер нижнего края на заведомо устроенной странице дал');
    console.log(`   «${тексты || 'ничего'}», а ждали ровно «ниже окна» (кнопка в окне и кнопка в прокрутке не в счёт).`);
    console.log('   Гейт был бы либо слеп, либо кричал на законную прокрутку. Разбираться с ним, а не с играми.');
    process.exit(1);
  }
  console.log(`Самопроверка нижнего края: нашла ровно «ниже окна» (${найдено[0].ниже} px) — инструмент работает.`);
}

async function main() {
  const routes = await маршруты();
  if (!routes.length) { console.log('🔴 маршруты не найдены — аудит был бы зелён вслепую'); process.exit(1); }
  проверитьИскалку();
  const ХАБЫ = await развилки();
  if (!ХАБЫ.size) { console.log('🔴 развилки не распознаны в каталоге — список хабов пуст, аудит соврёт'); process.exit(1); }
  console.log(`Развилок в каталоге: ${ХАБЫ.size} — у них кнопки входа нет по устройству, поле не проверяется.`);

  const browser = await chromium.launch();
  /**
   * 🔴 ЯЗЫК — РУССКИЙ, И ЭТО ЧАСТЬ ЗАМЕРА, А НЕ НАСТРОЙКА УДОБСТВА.
   *
   * Первая редакция шла на английском по умолчанию, и проверка наезда на
   * заголовок молчала: «Memory Matrix» занимает 113…255 и задевает угловой ряд
   * на 3 px, а «Матрица памяти» — 102…266, то есть на 27. Дефект, который
   * человек видит каждый день, в аудите не существовал.
   *
   * Вёрстку ломает САМАЯ ДЛИННАЯ строка, а английский почти всегда короче
   * остальных. Мерить на нём — мерить лучший случай и называть его правдой.
   * Русский взят потому, что на нём приходят отчёты и на нём играет семья.
   */
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    locale: 'ru-RU',
  });
  await самопроверкаПальца(ctx);
  await самопроверкаНиза(ctx);

  const page = await ctx.newPage();
  const итог = [];
  for (const route of routes) {
    const отрисован = await открыть(page, route);
    if (!отрисован) { итог.push({ route, провал: 'экран не отрисовался' }); continue; }
    const наЭкране = await устойчивоеПереполнение(page);
    // У развилки и служебного экрана поля нет: меряем экран и жест, входа не ждём.
    const наезд = await page.evaluate(наездНаЗаголовок);
    if (ХАБЫ.has(route) || БЕЗ_ПОЛЯ[route]) {
      итог.push({ route, развилка: true, наЭкране, наезд, уехало: await протащить(page) });
      continue;
    }
    let подпись = await войти(page);
    if (!подпись) {
      /**
       * 🔴 ПАРТИЯ МОЖЕТ БЫТЬ УЖЕ ОТКРЫТА — И ЭТО НЕ ПРОВАЛ ВХОДА.
       *
       * Предыдущий маршрут оставил игру запущенной, и повторный заход открывает
       * не экран настройки, а сразу поле: кнопки «Начать» там нет по замыслу.
       * Замер 05.09.2026: так молча выпадали `chess-blind` и `schulte` — два
       * экрана, о которых гейт отчитывался «не проверено».
       *
       * ⚠️ Признак ПОЛОЖИТЕЛЬНЫЙ — служебные узлы каркаса, которые рисуются
       * только в партии. По ОТСУТСТВИЮ полосы настройки судить нельзя: у
       * игр-модулей экран настройки рисует сам модуль, полосы там нет, и
       * проверка объявила бы настройку полем. Та же грабля разобрана в
       * scripts/tap-target-audit.mjs — приём взят оттуда, а не изобретён заново.
       */
      const вПартии = await page.evaluate(() => Boolean(
        document.querySelector('[data-testid="game-aux"]')
        || document.querySelector('[data-testid="game-toolbar"]')
        || document.querySelector('[data-testid="game-bottom-actions"]')
        || document.querySelector('[data-testid="game-header-actions"]'),
      ));
      if (!вПартии) { итог.push({ route, наЭкране, провал: 'кнопка входа не найдена' }); continue; }
      подпись = '(партия уже была открыта)';
    }
    const наПоле = await устойчивоеПереполнение(page);
    const уехало = await протащить(page);
    // Низ меряем на КОРОТКОМ окне: на 780 он влезает у всех, дефект живёт на 640/677.
    await page.setViewportSize({ width: W, height: H_НИЗ });
    await page.waitForTimeout(300);
    const ниже = (await page.evaluate(кнопкиНижеЭкрана)).filter((k) => k.ниже > ЗАПАС_НИЗ);
    await page.setViewportSize({ width: W, height: H });
    итог.push({ route, подпись, наЭкране, наПоле, наезд, уехало, ниже });
  }
  await browser.close();

  console.log(`\n── Уезд вбок на ${W}×${H}. Проверено маршрутов: ${итог.length}.`);

  const слепые = итог.filter((r) => r.провал);
  if (слепые.length) {
    console.log(`\n🔴 Не проверено ${слепые.length} — это и есть «зелёный вслепую»:`);
    for (const b of слепые) console.log(`    ${b.route}: ${b.провал}`);
  }

  const шире = итог.filter((r) => (r.наЭкране?.лишнее ?? 0) > ЗАПАС || (r.наПоле?.лишнее ?? 0) > ЗАПАС);
  const ездит = итог.filter((r) => (r.уехало ?? 0) > ЗАПАС);

  if (шире.length) {
    console.log(`\n🔴 Страница ШИРЕ окна (палец таскает весь документ) — ${шире.length}:`);
    for (const r of шире) {
      const где = (r.наПоле?.лишнее ?? 0) > ЗАПАС ? r.наПоле : r.наЭкране;
      console.log(`    ${r.route}: лишних ${где.лишнее} px`);
      for (const в of где.виновные) console.log(`        ${в.тег} ширина ${в.ширина} «${в.текст}${в.файл}» вылезает на ${в.выход} px`);
    }
  }
  if (ездит.length) {
    console.log(`\n🔴 Палец по полю ПРОКРУЧИВАЕТ страницу — ${ездит.length}:`);
    for (const r of ездит) console.log(`    ${r.route}: уехало на ${r.уехало} px`);
  }

  const накрыты = итог.filter((r) => r.наезд && r.наезд.наезд > 4);
  if (накрыты.length) {
    console.log(`\n🔴 Заголовок уходит ПОД плавающие кнопки — ${накрыты.length}:`);
    for (const r of накрыты) console.log(`    ${r.route}: «${r.наезд.текст}» накрыт на ${r.наезд.наезд} px`);
  }

  const нижние = итог.filter((r) => r.ниже && r.ниже.length);
  const нижниеНовые = нижние.filter((r) => !ДОЛГ_НИЗ[r.route] || r.ниже.length > ДОЛГ_НИЗ[r.route].max);
  const нижниеДолг = нижние.filter((r) => ДОЛГ_НИЗ[r.route] && r.ниже.length <= ДОЛГ_НИЗ[r.route].max);
  if (нижниеНовые.length) {
    console.log(`\n🔴 Кнопки НИЖЕ нижнего края окна ${W}×${H_НИЗ} (палец до них не дотянется) — ${нижниеНовые.length}:`);
    for (const r of нижниеНовые) for (const k of r.ниже) console.log(`    ${r.route}: «${k.текст}» ниже на ${k.ниже} px (top ${k.top})`);
  }
  if (нижниеДолг.length) {
    console.log(`\nИзвестный долг по нижнему краю (${W}×${H_НИЗ}): ${нижниеДолг.length} экран(ов)`);
    for (const r of нижниеДолг) console.log(`    ${r.route}: ${r.ниже.length} кнопок — ${ДОЛГ_НИЗ[r.route].why}`);
  }
  // Долг, который больше не нужен, — тоже сигнал: запись снимают вместе с дефектом.
  for (const route of Object.keys(ДОЛГ_НИЗ)) {
    const r = итог.find((x) => x.route === route);
    if (r && !r.провал && !(r.ниже && r.ниже.length)) console.log(`\n✅ Долг по нижнему краю закрыт — снять запись ДОЛГ_НИЗ['${route}']`);
  }

  const плохо = [...new Set([...шире, ...ездит, ...накрыты, ...нижниеНовые].map((r) => r.route))].filter((r) => !ДОЛГ[r]);
  if (!плохо.length && !слепые.length) {
    console.log('\n✅ Ни один экран не ездит вбок, не прячет заголовок под кнопками и не роняет кнопки ниже окна.');
  }
  process.exit(плохо.length || слепые.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
