#!/usr/bin/env node
/* psygames-playfield-visible-audit · VER 1 · 09.09.2026 */
/**
 * ПОЛЕ ПАРТИИ ДОЛЖНО ПОМЕЩАТЬСЯ В ЭКРАН ТЕЛЕФОНА. ПРОВЕРКА ВМЕСТО «Я ПОСМОТРЕЛ».
 *
 * 🔴 ЗАЧЕМ. Отчёты cc1a7535 и 652e6eee, 09.09.2026, выпуск 2.52.5, iPhone
 * 403×873, экран /games/spatial-lab. Дословно: «где настройки должны были быть с
 * предыдущего экрана — в начале карт, а я ниже выводятся в игре, то есть просто
 * лишние половины экрана заняты». Блок предыдущего экрана остался в партии и
 * выдавил поле вниз. Тег 2.52.5 был поставлен без того, чтобы игру открыли на
 * устройстве, — это пункт 10 из списка Дениса, и пункт 11 туда же: «починено»
 * говорилось до того, как он увидел глазами.
 *
 * 🔴 ПОЧЕМУ pan-audit ЭТОГО НЕ ЛОВИТ, хотя тоже меряет геометрию браузером.
 * Он про БОКОВОЙ уезд: страница шире окна на 360 px. Здесь переполнение
 * ВЕРТИКАЛЬНОЕ, и по его оси всё чисто. Гейт был, экран был обрезан, гейт молчал
 * — наличие гейта не означает, что сторожат твою беду.
 *
 * ЧТО МЕРИТ, на живой веб-сборке, войдя в партию:
 *   1. `перелив` — насколько документ выше окна (scrollHeight − innerHeight).
 *      Партия не должна требовать прокрутки: игрок теряет поле из виду.
 *   2. `шапка` — какую долю экрана занимает всё, что стоит ВЫШЕ самого крупного
 *      нарисованного блока. Это и есть «лишние половины экрана»: поле формально
 *      на месте, но начинается с середины.
 *
 * ⚠️ МЕРИМ НАРИСОВАННОЕ, А НЕ КОНТЕЙНЕР. Берём прямоугольники из
 * getBoundingClientRect у видимых узлов — контейнер может быть во весь экран,
 * когда внутри пусто.
 *
 * ⚠️ ЭКРАН 403×873 — не круглое число, а iPhone из самого отчёта. Порог тоже не
 * с потолка: он поставлен по замеру всех игр (см. --report), а не «на глаз».
 *
 * Запуск:
 *   node scripts/serve-dist.mjs dist 8131 &
 *   node scripts/playfield-visible-audit.mjs --base=http://127.0.0.1:8131 --report
 *   node scripts/playfield-visible-audit.mjs --base=... --only=spatial-lab,n-back
 */
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = args.base ?? 'http://127.0.0.1:8131';
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;
const REPORT = args.report === '1';
const W = Number(args.w ?? 403), H = Number(args.h ?? 873);

/** Порог перелива: сколько пикселей ниже окна ещё терпим (полоса браузера/тени). */
const ПЕРЕЛИВ_МАКС = Number(args.overflow ?? 24);
/** Порог шапки: какую долю экрана можно отдать под всё, что выше поля. */
const ШАПКА_МАКС = Number(args.header ?? 0.5);

const ИГРЫ = (ONLY || readdirSync(new URL('../app/games', import.meta.url))
  .filter((f) => f.endsWith('.tsx') && !f.startsWith('_') && !f.startsWith('['))
  .map((f) => f.replace(/\.tsx$/, ''))).sort();

/** Вход в партию — приём pan-audit: метим кнопку атрибутом и жмём СНАРУЖИ.
 *  page.evaluate + el.click() Pressable из react-native-web не будит — молча. */
const ВХОД = /(?:^|[^\p{L}])(начать|start|старт|играть|play|продолжить|continue)(?![\p{L}])/iu;
const НЕ_ВХОД = /(таблиц|рекорд|leaderboard|об игре|about|правил|rules|назад|back|настрой|settings)/i;
const ЗАКРЫТЬ = /^(понятно|ок|ok|got it|close|закрыть|начать|start)$/i;

async function жать(page, годится) {
  const нашли = await page.evaluate(({ вход, невход }) => {
    const rx = new RegExp(вход, 'iu'), nrx = new RegExp(невход, 'i');
    const все = [...document.querySelectorAll('[role="button"], button')];
    все.forEach((el) => el.removeAttribute('data-pf-hit'));
    for (const el of все) {
      const t = (el.innerText || '').replace(/[-]/g, '').trim();
      if (!t || nrx.test(t) || !rx.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      el.setAttribute('data-pf-hit', '1');
      return t;
    }
    return null;
  }, годится);
  if (!нашли) return null;
  await page.click('[data-pf-hit]', { timeout: 4000 }).catch(() => {});
  return нашли;
}

const мера = () => {
  const окно = window.innerHeight;
  const перелив = Math.max(0, document.documentElement.scrollHeight - окно);
  /** Самый крупный НАРИСОВАННЫЙ блок: он и есть поле, чем бы ни был контейнер. */
  let лучший = null, площадь = 0;
  for (const el of document.querySelectorAll('div, canvas, svg, section, main')) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    if (r.width >= window.innerWidth - 1 && r.height >= окно - 1) continue; // это контейнер во весь экран
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
    const a = r.width * r.height;
    if (a > площадь) { площадь = a; лучший = r; }
  }
  return {
    окно, перелив,
    верхПоля: лучший ? Math.round(лучший.top) : null,
    высотаПоля: лучший ? Math.round(лучший.height) : null,
  };
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: W, height: H } });
const строки = [];

for (const игра of ИГРЫ) {
  try {
    await page.goto(`${BASE}/games/${игра}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(700);
    // карточка правил уровня накрывает кнопку старта — сначала снять
    await жать(page, { вход: ЗАКРЫТЬ.source, невход: '(?!)' });
    await page.waitForTimeout(250);
    const первый = await жать(page, { вход: ВХОД.source, невход: НЕ_ВХОД.source });
    await page.waitForTimeout(500);
    // у лабораторных под «Начать» стоит СВОЙ экран правил — второй шаг
    const второй = await жать(page, { вход: ВХОД.source, невход: НЕ_ВХОД.source });
    await page.waitForTimeout(900);
    const м = await page.evaluate(мера);
    строки.push({ игра, вошли: Boolean(первый || второй), ...м, доляШапки: м.верхПоля == null ? null : м.верхПоля / м.окно });
  } catch (e) {
    строки.push({ игра, ошибка: String(e).split('\n')[0].slice(0, 60) });
  }
}
await b.close();

const годные = строки.filter((s) => s.верхПоля != null);
if (REPORT) {
  строки.sort((a, c) => (c.перелив ?? -1) - (a.перелив ?? -1) || (c.доляШапки ?? -1) - (a.доляШапки ?? -1));
  console.log(`экран ${W}×${H}, игр ${строки.length}, вошли в партию ${строки.filter((s) => s.вошли).length}\n`);
  console.log('игра'.padEnd(24), 'перелив', 'верхПоля', 'доляШапки');
  for (const s of строки) {
    if (s.ошибка) { console.log(s.игра.padEnd(24), '— ' + s.ошибка); continue; }
    console.log(s.игра.padEnd(24), String(s.перелив).padStart(7), String(s.верхПоля).padStart(8),
      s.доляШапки == null ? '     —' : ('     ' + s.доляШапки.toFixed(2)));
  }
  const п = годные.map((s) => s.перелив).sort((a, c) => a - c);
  const ш = годные.map((s) => s.доляШапки).sort((a, c) => a - c);
  const med = (a) => a.length ? a[Math.floor(a.length / 2)] : NaN;
  console.log(`\nперелив: медиана ${med(п)}, максимум ${п[п.length - 1]}, без перелива ${п.filter((x) => x === 0).length} из ${п.length}`);
  console.log(`доля шапки: медиана ${med(ш)?.toFixed(2)}, максимум ${ш[ш.length - 1]?.toFixed(2)}`);
  process.exit(0);
}

const плохие = годные.filter((s) => s.перелив > ПЕРЕЛИВ_МАКС || s.доляШапки > ШАПКА_МАКС);
console.log(`экран ${W}×${H}: проверено ${годные.length} игр, порог перелива ${ПЕРЕЛИВ_МАКС} px, порог шапки ${ШАПКА_МАКС}`);
if (плохие.length) {
  console.error(`\n🔴 ${плохие.length} игр: поле не помещается в экран телефона\n`);
  for (const s of плохие) {
    const беды = [];
    if (s.перелив > ПЕРЕЛИВ_МАКС) беды.push(`документ выше окна на ${s.перелив} px`);
    if (s.доляШапки > ШАПКА_МАКС) беды.push(`над полем ${Math.round(s.доляШапки * 100)} % экрана (${s.верхПоля} из ${s.окно} px)`);
    console.error(`  ${s.игра.padEnd(24)} ${беды.join('; ')}`);
  }
  console.error(`\n⚠️ Так уехал spatial-lab в 2.52.5 (отчёты cc1a7535, 652e6eee): блок прошлого экрана остался в партии.`);
  process.exit(1);
}
console.log('✅ во всех играх поле помещается в экран');
