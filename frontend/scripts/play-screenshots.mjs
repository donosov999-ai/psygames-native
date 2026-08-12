/**
 * play-screenshots — готовые скриншоты для карточки Google Play.
 *
 * ЗАЧЕМ. Описание переписано на двенадцать языков, а показать нечего: у карточки не было
 * ни одного снимка. На конверсию установки они влияют сильнее текста — человек листает
 * картинки, а не читает. У конкурента (Octothink) каждый снимок продаёт ОДНУ функцию и
 * подписан крупным заголовком; берём тот же приём.
 *
 * КАК. Живой веб-билд открывается в headless-браузере, снимается чистый экран приложения,
 * поверх кладётся полоса заголовка. Никаких муляжей телефона: рамка занимает место и
 * ничего не доказывает — работает сам экран.
 *
 * ЯЗЫК. По умолчанию английский (решение Дениса 12.08): снимки идут во все локали, где
 * своих нет. Для локализованных наборов запускать с --lang=<код>.
 *
 * Запуск:
 *   cd ~/dev/psygames/frontend && node scripts/play-screenshots.mjs            # английские
 *   node scripts/play-screenshots.mjs --lang=ru --base=http://localhost:8099
 *
 * ⚠️ Нужен поднятый веб-билд. Проверяется перед стартом — молча снимать пустые страницы
 * хуже, чем не снимать: битые снимки уедут в магазин и никто не заметит.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const LANG = args.lang ?? 'en';
const BASE = args.base ?? 'http://localhost:8099';
// От расположения самого скрипта, а не от cwd: запускать приходится из frontend,
// где лежат playwright и sharp, а класть надо в корень репозитория.
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

/**
 * Пресеты магазинов. Числа у каждого СВОИ и заданы явно — общей формулы здесь нарочно нет:
 * она бы пересчитала и перенос строк у Play, а те кадры уже сняты и одобрены. Пусть лучше
 * две строки констант, чем тихо разъехавшиеся заголовки на готовой карточке.
 *
 * windows: Microsoft Store хочет 16:9, минимум 1366×768, рекомендует 2560×1440. Отдельная
 * машина для этого не нужна — Tauri и на Windows рисует тем же Chromium (там WebView2),
 * так что headless с Мака даёт ту же картинку. Отличались бы только рамка окна, системный
 * шрифт и полосы прокрутки, а рамка магазину и не нужна: там ждут чистый экран приложения.
 */
const PRESETS = {
  play:    { W: 1080, H: 1920, BAND: 300, VIEW: { width: 540,  height: 810 }, WRAP: 19, BIG: 62, SMALL: 54,
             fit: 'cover', dir: ['store', 'google-play', 'assets', 'screenshots', LANG] },
  windows: { W: 2560, H: 1440, BAND: 220, VIEW: { width: 1100, height: 610 }, WRAP: 48, BIG: 76, SMALL: 64,
             fit: 'window', dir: ['store', 'windows', 'assets', 'screenshots', LANG] },
};

const PRESET = args.preset ?? 'play';
if (!PRESETS[PRESET]) {
  console.error(`неизвестный пресет «${PRESET}»; есть: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(1);
}
const { W, H, BAND, VIEW, WRAP, BIG, SMALL, fit, dir } = PRESETS[PRESET];
const OUT = path.join(ROOT, ...dir);

/**
 * Восемь кадров, каждый продаёт ОДНУ вещь. Порядок — по убыванию силы: первым идёт то,
 * ради чего ставят, последним — то, что удерживает.
 */
const SHOTS = [
  { id: '01-catalog',  route: '/',                    en: '61 exercises, not one test',        ru: '61 упражнение, а не один тест' },
  { id: '02-sudoku',   route: '/games/sudoku?auto=1', en: 'Sudoku with 12 rule variants',      ru: 'Судоку с 12 вариантами правил' },
  { id: '03-warmup',   route: '/warmup-picker',       en: 'A warm-up in one tap',              ru: 'Зарядка одной кнопкой' },
  { id: '04-streak',   route: '/streak-calendar',     en: 'A streak you can actually see',     ru: 'Серия, которую видно' },
  { id: '05-schulte',  route: '/games/schulte?auto=1',en: 'Schulte tables for reading speed',  ru: 'Таблицы Шульте для скорочтения' },
  { id: '06-pet',      route: '/pet',                 en: 'A pet that grows as you train',     ru: 'Питомец растёт от тренировок' },
  { id: '07-assess',   route: '/assessment-result',   en: 'See where you are strong and where you sag', ru: 'Видно, где вы сильны, а где проседаете' },
  { id: '08-loop',     route: '/whats-new',           en: 'You see what got fixed by your report', ru: 'Видно, что починили по вашему отзыву' },
];

const BG = '#0f1729';
const FG = '#ffffff';
const ACCENT = '#7f7fd5';

/** Полоса заголовка — SVG, потому что шрифт и перенос строк здесь надо держать руками. */
function band(title) {
  const words = title.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    // Предел строки — из пресета: подобран под ширину кадра с полями
    if ((cur + ' ' + w).trim().length > WRAP && cur) { lines.push(cur); cur = w; } else { cur = (cur + ' ' + w).trim(); }
  }
  if (cur) lines.push(cur);
  const size = lines.length > 2 ? SMALL : BIG;
  const startY = BAND / 2 - ((lines.length - 1) * (size + 12)) / 2 + size / 3;
  const tspans = lines.map((l, i) =>
    `<tspan x="${W / 2}" y="${startY + i * (size + 12)}">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</tspan>`).join('');
  return Buffer.from(
    `<svg width="${W}" height="${BAND}" xmlns="http://www.w3.org/2000/svg">
       <rect width="${W}" height="${BAND}" fill="${BG}"/>
       <rect x="0" y="${BAND - 4}" width="${W}" height="4" fill="${ACCENT}"/>
       <text text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif"
             font-weight="800" font-size="${size}" fill="${FG}">${tspans}</text>
     </svg>`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });

  // Язык и пропуск онбординга — иначе первый кадр снимет экран выбора первой игры.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((lang) => {
    localStorage.setItem('language', lang);
    localStorage.setItem('psygames_devchat_on', '0');   // кнопка отзыва — инструмент тестировщика, не для магазина
  }, LANG);

  // 🔴 Онбординг проходим ЧЕСТНО, нажатием, а не подстановкой флагов в хранилище.
  // Проставленный вручную «онбординг пройден» без выбранной игры — состояние, до
  // которого живое приложение не доходит НИКОГДА. 12.08.2026 я на нём же и обжёгся:
  // приложение падало с «Rendered fewer hooks than expected», я принял это за баг
  // релиза и успел разослать правку по шести экранам. Падения не было — был
  // невозможный набор данных, который я сам и подсунул.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const onboarding = await page.evaluate(() => /Choose your first game|Выбери первую игру/i.test(document.body.innerText || ''));
  if (onboarding) {
    const cards = await page.$$('button, [role=button]');
    if (cards[1]) await cards[1].click().catch(() => {});
    await page.waitForTimeout(3000);
    console.log('  · онбординг пройден нажатием');
  }

  const made = [];
  for (const s of SHOTS) {
    await page.goto(BASE + s.route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);

    // Пустая страница = битый снимок. Молча пропускать нельзя: уедет в магазин.
    const bad = await page.evaluate(() => {
      const txt = (document.body.innerText || '').trim();
      if (txt.length < 20) return 'пусто';
      // 404 роутера. Проверка на длину его НЕ ловит — текст на странице есть.
      if (/Unmatched Route|Page could not be found|This screen does not exist/i.test(txt)) return 'страница не найдена';
      // ⚠️ Экран падения. Проверки на пустоту и на 404 его НЕ ловят: текст есть, маршрут
      // верный. Так в кадр уехал сломанный календарь серии — увидел только глазами.
      if (/Something broke|Что-то сломалось|Rendered fewer hooks|Minified React error/i.test(txt)) return 'ЭКРАН УПАЛ';
      return null;
    });
    if (bad) { console.log(`  ⚠️  ${s.id}: ${bad} — ПРОПУСКАЮ, битый снимок в магазин не уедет`); continue; }

    const shot = await page.screenshot({ type: 'png' });

    // 'cover' — кадр во всю ширину: так снят Play, там окно и приложение одной ширины.
    //
    // 'window' — окно приложения по центру фирменного фона. Нужно потому, что раскладки
    // под широкий экран у приложения ПОКА НЕТ: каталог и судоку в ландшафте расходятся
    // нормально, а календарь серии, Шульте и диагностика рисуют узкую колонку по центру,
    // и растянутый на 2560 кадр выглядит недоделанным портом. Растягивать нечестно —
    // человек поставит и увидит ту же колонку. Поэтому показываем окно как окно.
    // ⚠️ Это обход, а не решение: раскладку под десктоп всё равно надо делать.
    const bodyW = fit === 'window' ? VIEW.width * 2 : W;
    const body = await sharp(shot).resize(bodyW, H - BAND, { fit: 'cover', position: 'top' }).toBuffer();

    const file = path.join(OUT, `${s.id}.png`);
    await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
      .composite([
        { input: band(s[LANG] ?? s.en), top: 0, left: 0 },
        { input: body, top: BAND, left: Math.round((W - bodyW) / 2) },
      ])
      .png()
      .toFile(file);
    made.push(s.id);
    console.log(`  ✅ ${s.id}  «${s[LANG] ?? s.en}»`);
  }

  await browser.close();
  console.log(`\nготово: ${made.length} из ${SHOTS.length} → ${OUT}`);
  if (made.length < SHOTS.length) process.exitCode = 1;
}

main();
