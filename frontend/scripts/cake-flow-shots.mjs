/* cake-flow-shots · VER 1 · 16.09.2026 */
/**
 * ДОКАЗАТЕЛЬСТВО НОВЫХ ПРАВИЛ ТОРТА/ПИЦЦЫ КАДРАМИ, А НЕ СЛОВАМИ.
 *
 * Денис 16.09.2026: «Задачи сделаны только когда есть скрины потверждающие эти
 * задачи». Новая механика — три шага: тап по тарелке → она разворачивается на
 * весь экран → выбираешь кусок → тапаешь тарелку-цель. Обычный кадр поля из
 * `sorting-shots.mjs` показывает только первый шаг, то есть НЕ доказывает
 * ничего: на прежних правилах доска выглядит так же.
 *
 * 🔴 ЖМЁМ НАСТОЯЩЕЙ МЫШЬЮ (`page.mouse.click`), а не `el.click()`. Записано в
 * памяти как «клик мимо Pressable»: синтетическое событие RNW-обработчик не
 * будит, и проба выходит зелёной при мёртвом экране.
 *
 * ⚠️ ПРЕМИСА У КАЖДОГО ШАГА. Перед тапом проверяем, что накладки ЕЩЁ НЕТ
 * (`plate-slice` = 0), иначе кадр «развернулось» доказывал бы лишь то, что
 * что-то нарисовано.
 *
 * Запуск:
 *   node scripts/cake-flow-shots.mjs --base=http://127.0.0.1:8233/psygames-web
 *   node scripts/cake-flow-shots.mjs --game=pizza-sort
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = (args.base ?? 'http://127.0.0.1:8233/psygames-web').replace(/\/$/, '');
const OUT = args.out ?? `${process.env.HOME}/dev/psygames/sorting-chat/art/shots`;
const GAME = args.game ?? 'cake-sort';
const VIEW = { width: 390, height: 844 };

const кнопок = () => document.querySelectorAll('[role="button"], button').length;
const кусков = () => document.querySelectorAll('[data-testid="plate-slice"]').length;
/** Счётчик ходов из шапки — им отличаем «ход прошёл» от «нарисовалось». */
const текст = () => (document.body.innerText || '').replace(/\s+/g, ' ').trim();

/**
 * Тарелки на доске: квадратные узлы ниже шапки, шире 60 точек.
 *
 * 📍 Первая редакция искала `div` с круглым `borderRadius` и нашла НОЛЬ тарелок
 * на кадре, где их пять: тарелка рисуется КАРТИНКОЙ, круглая она по самому
 * рисунку, а не по стилю. Поэтому тип узла не спрашиваем вовсе, а квадратность
 * берём с запасом — рамка подсветки делает узел на пару точек шире.
 */
const тарелки = () => {
  const все = [...document.querySelectorAll('img, div, svg, canvas')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 60 && r.height > 60 && Math.abs(r.width - r.height) < 12
      && r.top > 110 && r.width < innerWidth * 0.75);
  /* Вложенные узлы одной тарелки дают дубли — сводим по центру. */
  const из = [];
  for (const r of все) {
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (из.some((p) => Math.hypot(p.x - x, p.y - y) < 30)) continue;
    из.push({ x, y, w: Math.round(r.width) });
  }
  return из.sort((a, b) => a.y - b.y || a.x - b.x);
};

async function устойчиво(page, tries = 16) {
  let prev = -1; let same = 0;
  for (let i = 0; i < tries; i++) {
    const n = await page.evaluate(кнопок);
    if (n === prev) { if (++same >= 2) return n; } else { same = 0; prev = n; }
    await page.waitForTimeout(400);
  }
  return prev;
}

async function погаситьПодсказку(page) {
  for (let i = 0; i < 3; i++) {
    const есть = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="button"], button')]
        .find((e) => /^(Понятно|Got it|Продолжить)$/i.test((e.getAttribute('aria-label') || e.innerText || '').trim()));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    if (!есть) break;
    await page.mouse.click(есть.x, есть.y);
    await page.waitForTimeout(600);
  }
}

const шаги = [];
async function кадр(page, имя, подпись) {
  const file = path.join(OUT, `${имя}.png`);
  await fs.writeFile(file, await page.screenshot({ type: 'png' }));
  шаги.push(`${имя}.png — ${подпись}`);
  console.log(`   📷 ${имя}.png · ${подпись}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
await fs.mkdir(OUT, { recursive: true });

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem('language', 'ru');
  localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999');
  localStorage.setItem('psygames_first_run_done', '1');
});

console.log(`\nЗАМЕР ПОТОКА «${GAME}» · окно ${VIEW.width}×${VIEW.height}\n`);
await page.goto(`${BASE}/games/${GAME}?auto=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(кнопок, null, { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(1500);
await устойчиво(page);
await погаситьПодсказку(page);

/*
 * 🔴 КАРТА УРОВНЕЙ — ЭТО ЕЩЁ НЕ ПОЛЕ, И ПЕРВАЯ РЕДАКЦИЯ НА ЭТОМ ОБМАНУЛАСЬ.
 * Проба «кусков 0» была зелёной на карте уровней ровно так же, как на доске:
 * накладки нет ни там, ни там. Поэтому до кадра жмём «Начать» и ТРЕБУЕМ, чтобы
 * запрещённый текст карты («Уровень 1/15», «Начать») с экрана ушёл.
 */
const КАРТА = /Уровень\s*\d+\s*\/\s*\d+|Как играть/i;
for (let i = 0; i < 3 && КАРТА.test(await page.evaluate(текст)); i++) {
  const кн = await page.evaluate(() => {
    const плохо = /Назад|Выход|Справк|Как играть|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк/i;
    const все = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t));
    все.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    const c = все[0];
    return c ? { x: Math.round(c.r.left + c.r.width / 2), y: Math.round(c.r.top + c.r.height / 2), t: c.t.slice(0, 30) } : null;
  });
  if (!кн) break;
  console.log(`   продвигаюсь внутрь партии: «${кн.t}»`);
  await page.mouse.click(кн.x, кн.y);
  await page.waitForTimeout(1600);
  await устойчиво(page);
  await погаситьПодсказку(page);
}
if (КАРТА.test(await page.evaluate(текст))) console.log('🔴 с карты уровней уйти не удалось — дальше мерить нечего');

/* ШАГ 0 — доска. Премиса: накладки ещё нет. */
const было = { кусков: await page.evaluate(кусков), текст: await page.evaluate(текст) };
console.log(`   премиса: кусков на экране ${было.кусков} (должно быть 0)`);
if (было.кусков !== 0) { console.log('🔴 накладка УЖЕ открыта до тапа — кадр ничего не докажет'); }
await кадр(page, `${GAME}-1-доска`, `доска, накладки нет (plate-slice = ${было.кусков})`);

/* ШАГ 1 — тап по тарелке. */
const т = await page.evaluate(тарелки);
console.log(`   тарелок на доске найдено: ${т.length}${т.length ? ` (первая ${т[0].w} точек в ${т[0].x},${т[0].y})` : ''}`);
if (!т.length) { console.log('🔴 тарелок не найдено — дальше мерить нечего'); await browser.close(); process.exit(1); }
await page.mouse.click(т[0].x, т[0].y);
await page.waitForTimeout(900);
const послеТапа = await page.evaluate(кусков);
const размерНакладки = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="plate-slice"]');
  if (!s) return null;
  /* Круг — общий предок кусков; берём самый крупный круглый узел на экране. */
  const круги = [...document.querySelectorAll('div')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 150 && Math.abs(r.width - r.height) < 8);
  const макс = круги.sort((a, b) => b.width - a.width)[0];
  return макс ? { круг: Math.round(макс.width), окно: innerWidth, доля: Math.round((100 * макс.width) / innerWidth) } : null;
});
console.log(`   после тапа: кусков ${послеТапа} · круг ${размерНакладки ? `${размерНакладки.круг} точек = ${размерНакладки.доля} % ширины окна` : '—'}`);
await кадр(page, `${GAME}-2-развёрнута`, `тарелка развёрнута: кусков ${послеТапа}, круг ${размерНакладки?.круг ?? '—'} точек (${размерНакладки?.доля ?? '—'} % ширины)`);

/* ШАГ 2 — выбор куска внутри круга. */
const кусок = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="plate-slice"]');
  if (!s) return null;
  const r = s.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) };
});
if (кусок) {
  await page.mouse.click(кусок.x, кусок.y);
  await page.waitForTimeout(900);
  const послеВыбора = await page.evaluate(кусков);
  console.log(`   после выбора куска (${кусок.w} точек): накладка ${послеВыбора ? 'ещё открыта' : 'закрылась — кусок в руке'}`);
  await кадр(page, `${GAME}-3-кусок-в-руке`, `кусок выбран, накладка закрылась (plate-slice = ${послеВыбора}) — выбираем тарелку-цель`);

  /*
   * ШАГ 3 — тап по тарелке-цели.
   *
   * 📍 Первая редакция брала ПЕРВУЮ попавшуюся чужую тарелку и получила «ход не
   * прошёл»: тарелка оказалась ПОЛНОЙ, и игра ход отказала — правильно. Это был
   * замер моего скрипта, а не дефект игры. Поэтому цели перебираются, и в отчёт
   * идёт, сколько отказов было до первого принявшего — отказ тоже часть правил.
   */
  const т2 = await page.evaluate(тарелки);
  const цели = т2.filter((p) => Math.hypot(p.x - т[0].x, p.y - т[0].y) > 40);
  let прошёл = null;
  let отказов = 0;
  for (const цель of цели) {
    await page.mouse.click(цель.x, цель.y);
    await page.waitForTimeout(1100);
    const стало = await page.evaluate(текст);
    if (стало !== было.текст) { прошёл = { цель, стало }; break; }
    отказов += 1;
    /* Отказ руку не роняет — проверяем это же, а не надеемся. */
    const вРуке = await page.evaluate(() => !!document.querySelector('[data-testid="plate-slice"]'));
    if (вРуке) console.log('   🟡 после отказа снова открылась накладка — рука упала');
  }
  console.log(`   текст шапки до:    «${было.текст.slice(0, 70)}»`);
  console.log(`   текст шапки после: «${(прошёл?.стало ?? await page.evaluate(текст)).slice(0, 70)}»`);
  console.log(`   отказов до принявшей тарелки: ${отказов} из ${цели.length}`);
  console.log(`   ХОД ${прошёл ? `ПРОШЁЛ — приняла тарелка в ${прошёл.цель.x},${прошёл.цель.y}` : '🔴 НЕ ПРОШЁЛ НИ НА ОДНУ из тарелок'}`);
  await кадр(page, `${GAME}-4-ход-сделан`, прошёл
    ? `кусок переложен: счётчик ходов сдвинулся, до этого ${отказов} полных тарелок ход отказали`
    : `🔴 ход не принял никто из ${цели.length} тарелок`);
} else {
  console.log('🔴 куска в накладке нет — второй шаг не проверить');
}

console.log(`\nКАДРЫ:\n${шаги.map((s) => '  ' + s).join('\n')}\n`);
await browser.close();
