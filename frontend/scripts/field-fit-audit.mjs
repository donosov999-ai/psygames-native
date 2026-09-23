#!/usr/bin/env node
/* psygames-field-fit-audit · VER 1 · 17.09.2026 */
/**
 * СОДЕРЖИМОЕ ПАРТИИ НАРИСОВАНО ЗА ГРАНИЦАМИ ПОЛЯ — ПРИБОР ВМЕСТО «Я ПОСМОТРЕЛ».
 *
 * 🔴 ЗАЧЕМ. За один день 17.09.2026 этот класс поломки выстрелил дважды, и оба раза
 * его нашли ГЛАЗА, а не гейт:
 *   · отчёт 57a0e9cd, судоку 9×9 на 2.54.20, Android 384×784: «ПОЧЕМУ ТУЛБАР ВНИЗУ ВСЕ
 *     ЦИФРЫ ЗАКРЫЛ» — цифры 6–9 ушли под служебный ряд каркаса;
 *   · обход семьи судоку в тот же вечер: у самурая крест 315 точек при поле 179 рисовался
 *     ПОВЕРХ крышки с показателями и кнопки масштаба, у дочерней сетки фрактала доска
 *     залезала на шапку и мордочку питомца, у «Бездны» нижний ряд уходил под ряд значков.
 * Общая причина одна: экран считает размер доски от ОКНА, а место ему даёт КАРКАС, и
 * разницу никто не мерил.
 *
 * 🔴 ПОЧЕМУ ЭТОГО НЕ ЛОВЯТ СОСЕДНИЕ ПРИБОРЫ (проверено, а не предположено):
 *   · `pan-audit` — про боковой уезд страницы, вертикаль ему безразлична;
 *   · `playfield-visible-audit` — обе его оси мёртвые, и это записано в нём самом:
 *     вертикального перелива документа в react-native-web не бывает (лишнее ОБРЕЗАЕТСЯ,
 *     а не прокручивается), а «доля шапки» у сломанного экрана вышла лучшей из 97;
 *   · `screen-geometry` — меряет ВЕРХ поля (канон 119), а не то, помещается ли в поле
 *     содержимое;
 *   · `slot-audit` — служебные кнопки: их место, размер и уход за правый край.
 * Ни один не отвечает на вопрос «нарисована ли доска внутри своего поля».
 *
 * ЧТО МЕРИТ. Войдя в партию, для каждого экрана:
 *   · рамку поля (`game-field`) и рамку СОДЕРЖИМОГО — объединение прямоугольников видимых
 *     узлов внутри поля площадью от 400 px² (мерим нарисованное, а не контейнеры);
 *   · `вверх` = насколько содержимое выше верха поля. Это ВСЕГДА поломка: поле не
 *     обрезает (overflow видимый), и содержимое рисуется поверх крышки показателей и шапки;
 *   · `вниз` = насколько ниже низа поля. У прокручиваемого поля (`scrollableField`) это
 *     законная прокрутка, у обычного — то же наложение на ряд значков и нижнюю полосу.
 *
 * ПОРОГ. 2 точки на округление. Ниже — ничего не считаем: округление рамок даёт ±1.
 *
 * 🔴 НАХОДКУ ПОДТВЕРЖДАТЬ КАДРОМ — ПРИБОР ЛОВИТ И ДЕКОР. Замер 17.09.2026 по 82 экранам на
 * 360×640 дал восемь имён; открытие кадров показало: «Прочти эмоцию» (фото закрывает всю шапку,
 * кнопки паузы не видно) и «Анаграммы» (строка-подсказка поверх счётчиков) — настоящие, а
 * «Шульте» (24) и CPT (24) на кадре в порядке: за край торчит невидимая коробка или украшение.
 * Поэтому прибор — не гейт CI: он даёт СПИСОК МЕСТ ДЛЯ ГЛАЗ, и каждое имя проверяется кадром.
 *
 * ЗАПУСК (статикой, не Metro — Metro на 99 маршрутах кладёт процесс):
 *   cd frontend && npx expo export -p web --output-dir dist-fit
 *   node scripts/field-fit-audit.mjs dist-fit            # окно 360×640 (узкий Android)
 *   node scripts/field-fit-audit.mjs dist-fit 390x844    # другое окно
 *   node scripts/field-fit-audit.mjs dist-fit 360x640 sudoku,sudoku-samurai   # только эти
 *
 * ⚠️ ОКНО ПО УМОЛЧАНИЮ — САМОЕ УЗКОЕ ИЗ ЖИВЫХ, 360×640. На 390×844 обе сегодняшние
 * поломки почти не видны: у самурая наложение 0, у «Бездны» 0. Мерить на просторном
 * экране — значит не мерить.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webkit } from 'playwright';

const КОРЕНЬ = path.resolve(process.argv[2] || 'dist-fit');
const [Ш, В] = (process.argv[3] || '360x640').split('x').map(Number);
const ТОЛЬКО = (process.argv[4] || '').split(',').filter(Boolean);
const ПОРОГ = 2;
const ТИП = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

if (!fs.existsSync(path.join(КОРЕНЬ, 'games'))) {
  console.error(`нет сборки в ${КОРЕНЬ} — сперва expo export (см. шапку файла)`);
  process.exit(2);
}

const сервер = http.createServer((req, res) => {
  const п = decodeURIComponent(req.url.split('?')[0]).replace(/^\/psygames-web/, '') || '/';
  let f = path.join(КОРЕНЬ, п);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    const alt = `${f.replace(/\/$/, '')}.html`;
    f = fs.existsSync(alt) ? alt : path.join(КОРЕНЬ, 'index.html');
  }
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('нет'); }
  res.writeHead(200, { 'Content-Type': ТИП[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => сервер.listen(0, '127.0.0.1', r));
const порт = сервер.address().port;

/** Развилки поля не имеют — их карточка помечена `hub: true` в каталоге игр. */
const каталог = fs.readFileSync(path.join(КОРЕНЬ, '../src/constants/games.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const хабы = new Set();
for (const m of каталог.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
  if (!/^\s*hub:\s*true,?\s*$/m.test(m[1])) continue;
  const r = /route:\s*'([^']+)'/.exec(m[1]);
  if (r) хабы.add(r[1].replace('/games/', ''));
}
if (!хабы.size) { console.error('в каталоге не нашлось ни одной развилки — разбор сломался, слепой аудит не запускаем'); process.exit(2); }

const экраны = (ТОЛЬКО.length ? ТОЛЬКО : fs.readdirSync(path.join(КОРЕНЬ, 'games'))
  .filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')))
  .filter((g) => !хабы.has(g) && !g.endsWith('-hub'));

const бр = await webkit.launch();
const ctx = await бр.newContext({ viewport: { width: Ш, height: В }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' });
await ctx.route(/\/(rest|storage)\/v1\//, (r) => r.abort());
const page = await ctx.newPage();
const итог = [];

for (const g of экраны) {
  try {
    await page.goto(`http://127.0.0.1:${порт}/games/${g}?lang=ru`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1800);
    /*
     * Вход в партию: жмём «понятно» и самую крупную кнопку-старт, ПОКА такая кнопка есть.
     * ⚠️ Признак «мы в партии» — НЕ наличие `game-field`: у половины игр экран настройки
     * тоже рисуется каркасом и поле у него есть. Замер 17.09.2026: «Бездна» отдавала
     * поле 119…640 и «содержимое ниже поля на 552» — это был список настроек, а не доска.
     */
    for (let i = 0; i < 5; i += 1) {
      const жал = await page.evaluate(() => {
        const кн = [...document.querySelectorAll('[role=button],button')].filter((e) => e.getBoundingClientRect().width > 1);
        const хочу = /(понятно|начать|играть|start|play|уровень\s*\d+\s*→)/i;
        const п = кн.filter((e) => хочу.test((e.getAttribute('aria-label') || e.textContent || '').trim()))
          .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
        const цель = п[0] || кн.find((e) => /→/.test(e.textContent || ''));
        if (!цель) return false;
        цель.click();
        return true;
      });
      if (!жал) break;
      await page.waitForTimeout(1600);
    }
    /*
     * 🔴 МЕРИМ ТОЛЬКО ЧИСТУЮ ПАРТИЮ: НИ КАРТОЧКИ ПРАВИЛ, НИ МЕНЮ ПАУЗЫ.
     * Первая редакция прибора 17.09.2026 отдала «rmet: содержимое выше поля на 131», и на кадре
     * это оказалась карточка «Прочти эмоцию» от общего хука `useLevelRules`, а на втором заходе —
     * ещё и открытое меню паузы. Оба окна живут ВНУТРИ поля и честно торчат за его края: пять
     * находок из восьми были ложной тревогой. Поэтому сперва закрываем, а если не закрылось —
     * экран НЕ меряем и говорим об этом вслух (молчаливый пропуск хуже ложной тревоги).
     */
    const окно = () => page.evaluate(() => {
      const тексты = [...document.querySelectorAll('[role=button],button')]
        .filter((e) => e.getBoundingClientRect().width > 1)
        .map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim());
      return tесты_пусто(тексты);
      function tесты_пусто(t) {
        const закрыть = t.find((x) => /^(закрыть|close|понятно|ok|хорошо)$/i.test(x));
        const пауза = t.find((x) => /^(продолжить игру|выйти из упражнения|resume|continue game)$/i.test(x));
        return { закрыть: закрыть || null, пауза: пауза || null };
      }
    });
    for (let i = 0; i < 4; i += 1) {
      const о = await окно();
      const подпись = о.пауза || о.закрыть;
      if (!подпись) break;
      await page.evaluate((п) => {
        const ц = [...document.querySelectorAll('[role=button],button')]
          .filter((e) => e.getBoundingClientRect().width > 1)
          .find((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim() === п);
        ц && ц.click();
      }, подпись);
      await page.waitForTimeout(900);
    }
    const оставшееся = await окно();
    if (оставшееся.закрыть || оставшееся.пауза) {
      итог.push({ экран: g, окно: оставшееся.закрыть || оставшееся.пауза });
      continue;
    }
    await page.waitForTimeout(1200);
    const м = await page.evaluate(([имя, порог]) => {
      if (!location.pathname.endsWith(`/games/${имя}`)) return { ушли: location.pathname };
      const поле = document.querySelector('[data-testid="game-field"]');
      if (!поле) return { нетПоля: true };
      const пр = поле.getBoundingClientRect();
      const ст = getComputedStyle(поле);
      const прокручиваемое = /(auto|scroll)/.test(ст.overflowY) && поле.scrollHeight - поле.clientHeight > 2;
      /*
       * 🔴 МЕРИМ НАРИСОВАННОЕ, ТО ЕСТЬ С УЧЁТОМ ОБРЕЗКИ. Узел внутри своей прокрутки
       * (карта уровней, список настроек) формально висит на 500 точек ниже поля, а
       * НА ЭКРАНЕ его там нет: предок с overflow его срезал. Поэтому рамку каждого узла
       * пересекаем с рамками всех предков-обрезальщиков вплоть до самого поля.
       */
      const обрезать = (el) => {
        let r = el.getBoundingClientRect();
        let t = r.top, b = r.bottom;
        for (let p = el.parentElement; p && p !== поле; p = p.parentElement) {
          if (getComputedStyle(p).overflow === 'visible') continue;
          const pr = p.getBoundingClientRect();
          t = Math.max(t, pr.top); b = Math.min(b, pr.bottom);
        }
        return { t, b, w: r.width, h: r.height };
      };
      let верх = Infinity, низ = -Infinity, кого = '';
      for (const el of поле.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
        const r = обрезать(el);
        if (r.w * r.h < 400 || r.w < 8 || r.h < 8 || r.b - r.t < 8) continue;
        if (r.t < верх) { верх = r.t; кого = el.tagName + (el.getAttribute('data-testid') ? `#${el.getAttribute('data-testid')}` : ''); }
        if (r.b > низ) низ = r.b;
      }
      if (!Number.isFinite(верх)) return { пусто: true };
      /*
       * 🔴 ДОСКА — ОТДЕЛЬНОЙ ОСЬЮ. Содержимое ниже поля у прокручиваемого экрана законно
       * (плитки, подписи, карта уровней), а вот САМА ДОСКА обязана помещаться целиком:
       * «доску ищут прокруткой» — это и есть жалоба «низ закрыт» из отчётов. Доской
       * считаем самый крупный почти квадратный блок от 120 точек стороной.
       */
      let доска = null;
      for (const el of поле.querySelectorAll('*')) {
        const s2 = getComputedStyle(el);
        if (s2.visibility === 'hidden' || s2.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) continue;
        if (Math.abs(r.width - r.height) > Math.max(12, r.width * 0.1)) continue;
        if (!доска || r.width > доска.w) доска = { w: Math.round(r.width), t: r.top, b: r.bottom };
      }
      return {
        поле: { t: Math.round(пр.top), b: Math.round(пр.bottom), h: Math.round(пр.height) },
        вверх: Math.max(0, Math.round(пр.top - верх)),
        вниз: Math.max(0, Math.round(низ - пр.bottom)),
        доска: доска ? доска.w : null,
        доскаВверх: доска ? Math.max(0, Math.round(пр.top - доска.t)) : 0,
        доскаВниз: доска ? Math.max(0, Math.round(доска.b - пр.bottom)) : 0,
        прокручиваемое, кого, порог,
      };
    }, [g, ПОРОГ]);
    итог.push({ экран: g, ...(м || { пусто: true }) });
  } catch (e) { итог.push({ экран: g, ошибка: String(e.message).slice(0, 70) }); }
}
await бр.close();
сервер.close();

const измерено = итог.filter((x) => x.поле);
const наложение = измерено.filter((x) => x.вверх > ПОРОГ);
const доскаЗаПолем = измерено.filter((x) => x.вверх <= ПОРОГ && (x.доскаВверх > ПОРОГ || x.доскаВниз > ПОРОГ));
const подРядом = измерено.filter((x) => x.вниз > ПОРОГ && !x.прокручиваемое && x.вверх <= ПОРОГ && x.доскаВниз <= ПОРОГ);
const заПрокруткой = измерено.filter((x) => x.вниз > ПОРОГ && x.прокручиваемое && x.доскаВниз <= ПОРОГ);
const сОкном = итог.filter((x) => x.окно);
const невошли = итог.filter((x) => !x.поле && !x.ошибка && !x.окно);

console.log(`\nокно ${Ш}×${В}; экранов ${экраны.length}, померено ${измерено.length}, не вошли ${невошли.length}, ошибок ${итог.filter((x) => x.ошибка).length}`);
const строка = (x) => `    ${x.экран.padEnd(22)} поле ${String(x.поле.t).padStart(3)}…${String(x.поле.b).padStart(3)} (${x.поле.h})  вверх ${String(x.вверх).padStart(3)}  вниз ${String(x.вниз).padStart(3)}${x.доска ? `  доска ${x.доска} (за полем ↑${x.доскаВверх} ↓${x.доскаВниз})` : ''}${x.прокручиваемое ? '  (поле прокручивается)' : ''}${process.env.WHO ? `  верхний узел: ${x.кого}` : ''}`;

if (наложение.length) {
  console.log(`\n🔴 СОДЕРЖИМОЕ РИСУЕТСЯ ВЫШЕ ПОЛЯ — поверх крышки показателей и шапки:`);
  наложение.sort((a, b) => b.вверх - a.вверх).forEach((x) => console.log(строка(x)));
}
if (доскаЗаПолем.length) {
  console.log(`\n🔴 ДОСКА НЕ ПОМЕЩАЕТСЯ В ПОЛЕ — её край за границей поля (прокрутка тут не оправдание: доску ищут пальцем):`);
  доскаЗаПолем.sort((a, b) => (b.доскаВверх + b.доскаВниз) - (a.доскаВверх + a.доскаВниз)).forEach((x) => console.log(строка(x)));
}
if (подРядом.length) {
  console.log(`\n🔴 СОДЕРЖИМОЕ УХОДИТ НИЖЕ ПОЛЯ, А ПОЛЕ НЕ ПРОКРУЧИВАЕТСЯ — низ закрыт рядом значков и нижней полосой:`);
  подРядом.sort((a, b) => b.вниз - a.вниз).forEach((x) => console.log(строка(x)));
}
if (заПрокруткой.length) {
  console.log(`\n🟡 НИЖЕ ПОЛЯ, НО ПОЛЕ ПРОКРУЧИВАЕТСЯ (не поломка, но доску ищут прокруткой):`);
  заПрокруткой.sort((a, b) => b.вниз - a.вниз).slice(0, 12).forEach((x) => console.log(строка(x)));
}
if (сОкном.length) console.log(`\n⚠️ не мерены — на экране осталось открытое окно (правила или пауза): ${сОкном.map((x) => `${x.экран} («${x.окно}»)`).join(', ')}`);
if (невошли.length) console.log(`\n⚠️ не вошли в партию (поля не нашлось): ${невошли.map((x) => x.экран + (x.ушли ? `→${x.ушли}` : '')).join(', ')}`);
итог.filter((x) => x.ошибка).forEach((x) => console.log(`⚠️ ${x.экран}: ${x.ошибка}`));

const плохо = наложение.length + подРядом.length + доскаЗаПолем.length;
console.log(`\n${плохо ? `🔴 экранов с наложением: ${плохо}` : '✅ наложений нет'}\n`);
process.exit(плохо ? 1 : 0);
