/**
 * store-shots — снимки для карточки Google Play, снятые с ЖИВОЙ сборки.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ `play-screenshots.mjs`. Тот снимает КОМПОЗИЦИЮ: полоса
 * заголовка сверху, под ней экран, и берёт экраны по маршруту — то есть ровно
 * то, что нарисовано сразу при открытии. Для каталога и календаря серии этого
 * достаточно, для игры — нет: по маршруту `/games/<id>` открывается экран
 * настройки с картой уровней, а не поле. В карточке магазина человек листает
 * картинки, чтобы понять, ВО ЧТО он будет играть; карта уровней ему этого не
 * говорит. Здесь мы заходим в игру и снимаем поле.
 *
 * 🔴 ГЛАВНАЯ ГРАБЛЯ, РАДИ КОТОРОЙ ЭТОТ ФАЙЛ ТАКОЙ ДЛИННЫЙ. Экран настройки и
 * поле выглядят на снимке одинаково «прилично»: заголовок, кнопки, фирменный
 * градиент. Глазами разницу видно, автоматике — нет. Снимок с экрана настройки
 * не выглядит как ошибка, он выглядит как скриншот. Поэтому у каждого кадра
 * записан МАРКЕР ПОЛЯ (текст, который существует только в партии) и ЗАПРЕТ
 * (текст экрана настройки/правил, которого быть не должно), а результат
 * проверки уезжает в манифест рядом со снимком — его сверяет гейт
 * `src/__tests__/store-shots.test.ts`.
 *
 * ⚠️ ЯКОРЯ `GameShell` ЗДЕСЬ НЕ РАБОТАЮТ, И ЭТО ВАЖНО ЗНАТЬ ЗАРАНЕЕ.
 * `data-testid="game-toolbar"` / `game-header-actions` есть у 62 игр из 71, но
 * шесть из семи новых (dots-connect, one-line, faces-names, object-tracker,
 * navigator, rhythm-pitch) нарисованы своим каркасом и этих якорей НЕ имеют —
 * проверено 19.08.2026 grep'ом по `app/games/*.tsx`. Гейт, построенный только
 * на них, был бы красным на исправных играх (а это хуже отсутствия проверки:
 * ложные срабатывания перестают читать). Поэтому якоря мы ЗАПИСЫВАЕМ как есть,
 * а доказательством поля служит маркер текста. Когда каркас доедет до новых игр —
 * поднять `SHELL_EXPECTED` и требовать якоря с них тоже.
 *
 * КАК ЗАХОДИМ В ИГРУ (два шага, оба обязательны):
 *   1) `?auto=1` — общий параметр самозапуска (`useGamePreset` → `autostart`),
 *      он переводит экран игры из настройки в партию, минуя карту уровней.
 *   2) ОДИН клик по «продвигающей» кнопке. Внутри партии у новых игр свой
 *      экран правил («Как играть» + «Попробовать тренировку» / «Начать раунд» /
 *      «Начать изучение»), и без этого клика снимок уехал бы с текстом правил.
 *      У rhythm-pitch перед полем ещё калибровка звука — она отдельным рецептом.
 *
 * ⚠️ ПРОФИЛЬ. По умолчанию приложение стартует на «Стандарт» (`free`) — девять
 * упражнений, каталог с девятью карточками. Снимать каталог в таком виде нельзя
 * (карточка обещает 71 упражнение), да и часть игр из каталога не видна. Поэтому
 * ставим профиль владельца `odv999` — ЧЕСТНО, тем же способом, что и код:
 * `psygames_unlocked_themed` + `psygames_active_profile` (см. ProfileContext).
 * Что профиль применился, проверяем по числу карточек в каталоге, а не «на веру».
 *
 * ТРЕБОВАНИЯ GOOGLE PLAY (сверено по support.google.com/googleplay/android-developer/answer/9866151,
 * 19.08.2026 — они менялись, поэтому проверено, а не по памяти):
 *   · формат JPEG или 24-битный PNG БЕЗ альфа-канала, до 8 МБ на файл;
 *   · сторона от 320 до 3840 px, длинная сторона ≤ 2× короткой;
 *   · от 2 до 8 снимков НА ТИП УСТРОЙСТВА (телефон — свой лимит);
 *   · для крупных промо-блоков нужен 9:16 портрет от 1080×1920.
 * Отсюда кадр 1080×1920: viewport 432×768 при deviceScaleFactor 2.5 даёт ровно
 * его БЕЗ передискретизации — растягивать снимок ради круглого числа нечестно,
 * человек поставит приложение и увидит другое. 432 CSS — ширина крупного
 * телефона (iPhone Pro Max — 430), при 360×640@3 экран выходил слишком тесным:
 * у навигатора кнопки направлений обрезались нижним краем кадра.
 *
 * ⚠️ ЛИМИТ 8 — ЖЁСТКИЙ, А КАДРОВ ЗДЕСЬ БОЛЬШЕ. Семь новых игр плюс каталог,
 * тропинка уровней и статистика — это десять. Репозиторий хранит все десять
 * (это библиотека, из неё выбирают), а в карточку идут помеченные `inListing`.
 * Гейт следит, чтобы помеченных было не больше восьми: молча загрузить девятый
 * не выйдет.
 *
 * Запуск:
 *   cd ~/dev/psygames/frontend
 *   cp app.json app.json.bak && sed -i '' 's|"baseUrl": "/psygames-web"|"baseUrl": ""|' app.json \
 *     && npx expo export -p web --output-dir dist-shots; mv app.json.bak app.json
 *   npx serve dist-shots -l tcp://127.0.0.1:8195
 *   node scripts/store-shots.mjs --base=http://127.0.0.1:8195
 *   node scripts/store-shots.mjs --only=one-line,statistics     # точечная пересъёмка
 *
 * ⚠️ baseUrl="" обязателен: со штатным "/psygames-web" шрифты и ассеты дают 404,
 * кнопки молча не срабатывают, и снимок уезжает с полупустым экраном.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
// 127.0.0.1, а не localhost: `serve` поднимается на IPv6, и «localhost» на этой
// машине уходит в ::1 — половина заходов молча падала в таймаут (та же грабля,
// что записана в шапке slot-audit.mjs).
const BASE = args.base ?? 'http://127.0.0.1:8195';
const LANG = args.lang ?? 'ru';
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

/** Спецификация Play. Числа здесь — единственный источник, гейт читает их же. */
export const PLAY = {
  W: 1080,
  H: 1920,
  MIN_SIDE: 320,
  MAX_SIDE: 3840,
  MAX_RATIO: 2,            // длинная сторона ≤ 2× короткой
  MAX_BYTES: 8 * 1024 * 1024,
  MAX_IN_LISTING: 8,       // на тип устройства
  MIN_IN_LISTING: 2,
};

/** 432×768 CSS при dsf 2.5 = ровно 1080×1920 пикселей и ширина крупного телефона. */
const DSF = 2.5;
const VIEW = { width: PLAY.W / DSF, height: PLAY.H / DSF };

const OUT = path.join(ROOT, 'store', 'google-play', 'screenshots', LANG);

/**
 * Языки, для которых выписаны маркеры поля. Снимать на языке без маркеров нельзя:
 * скрипт не сможет отличить поле от экрана правил и снимет «что-нибудь». Молчаливый
 * снимок не с того экрана — ровно та поломка, ради которой этот файл написан.
 */
const SUPPORTED_LANGS = ['ru'];

/**
 * Кнопки, по которым НЕЛЬЗЯ продвигаться внутрь игры: выход, справка, откат,
 * пауза. «Продвигающей» считается самая крупная из оставшихся — так же, как
 * ищут вход `tap-target-audit` и `slot-audit`.
 */
const NOT_ADVANCE = /^(выйти|справка|назад|понятно|начать заново|правила|пауза|отменить|подсказка|тише|громче|сообщить о проблеме|закрыть)$/i;

/**
 * РЕЦЕПТЫ КАДРОВ.
 *
 * `expect` — маркер поля: текст, который есть в партии и которого нет на экране
 *   настройки. Не нашли — кадр не сохраняется, прогон краснеет.
 * `forbid` — текст, которого на кадре быть не должно. Для игр это «Как играть»
 *   (внутриигровой экран правил) и «Уровень N/M» (карта уровней экрана настройки).
 * `advance` — сколько раз нажать продвигающую кнопку после захода.
 *
 * ⚠️ dots-connect и one-line первым заходом дают ТРЕНИРОВОЧНУЮ сетку («Тренировка ·
 * 4×4»), а не боевой уровень: путь rules → training → playing зашит в модуле, и
 * пропуск (`skipIntro`) включается только со второго захода, после пройденного
 * уровня. Снимаем тренировочную — это ровно то поле, которое видит человек в
 * первую минуту после установки, и врать в карточке нечем. Когда появится способ
 * поднять уровень из скрипта — заменить на боевую сетку.
 */
const SHOTS = [
  {
    id: '01-catalog', kind: 'app', route: '/', inListing: true, scroll: 640,
    why: 'сетка упражнений: карточка обещает 71 тренажёр — здесь их видно. Прокрутка обязательна: без неё в кадр попадают только карточки зарядки над сгибом',
    expect: { ru: /Память|Внимание|Логика/ },
    forbid: { ru: /Выбери первую игру/ },
  },
  {
    id: '02-dots-connect', kind: 'game', gameId: 'dots_connect', route: '/games/dots-connect?auto=1',
    inListing: true, advance: 1,
    why: 'сетка с символами и путями — сразу понятно, что делают пальцем',
    expect: { ru: /(Тренировка|Уровень \d+) · \d+×\d+/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+/i },
  },
  {
    id: '03-one-line', kind: 'game', gameId: 'one_line', route: '/games/one-line?auto=1',
    inListing: true, advance: 1,
    why: 'граф с вершинами и счётчиком пройденных рёбер — механика читается без слов',
    expect: { ru: /Пройдено рёбер: \d+ из \d+/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+/i },
  },
  {
    id: '04-faces-names', kind: 'game', gameId: 'faces_names', route: '/games/faces-names?auto=1',
    inListing: true, advance: 1,
    why: 'портрет с именем и фактом — узнаваемая житейская задача «забыл, как зовут»',
    expect: { ru: /Персонаж \d+ из \d+/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+/i },
  },
  {
    id: '05-object-tracker', kind: 'game', gameId: 'object_tracker', route: '/games/object-tracker?auto=1',
    inListing: true, advance: 0,
    why: 'фаза запоминания целей до движения: видно и объекты, и таймер',
    expect: { ru: /Уровень \d+ · объектов \d+ · целей \d+/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+/i },
  },
  {
    id: '06-navigator', kind: 'game', gameId: 'navigator', route: '/games/navigator?auto=1',
    inListing: true, advance: 2,
    why: 'фаза ответа: сетка плюс четыре направления — механика читается без слов',
    expect: { ru: /Шаг \d+ из \d+/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+/i },
  },
  {
    id: '07-rhythm-pitch', kind: 'game', gameId: 'rhythm_pitch', route: '/games/rhythm-pitch?auto=1',
    inListing: false, recipe: 'rhythm-pitch',
    why: 'экран задания на слух; в карточку не идёт — звук на картинке не показать',
    expect: { ru: /Готовы слушать|Повторите|Тап/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+|Проверка громкости/i },
  },
  {
    id: '08-memory-palace', kind: 'game', gameId: 'memory_palace', route: '/games/memory-palace?auto=1',
    inListing: true, advance: 2, scroll: 0,
    why: 'размещение предметов по местам — самый наглядный «дворец памяти». Прокрутка в ноль: экран сам уезжает к очередному месту и прячет полосу предметов',
    expect: { ru: /Разместите предметы/ },
    forbid: { ru: /Как играть|Уровень \d+\/\d+/i },
  },
  {
    id: '09-levels', kind: 'app', route: '/games/dots-connect', inListing: true,
    why: 'тропинка уровней: видно, что за игрой стоит длинный маршрут, а не один тест',
    expect: { ru: /Уровень \d+\/\d+/ },
    forbid: { ru: /Выбери первую игру/ },
  },
  {
    id: '10-statistics', kind: 'app', route: '/statistics', inListing: false,
    why: 'статистика — чем измеряют прогресс. ⚠️ В КАРТОЧКУ НЕ ИДЁТ: на чистом профиле экран пустой («0 игр», «Сыграйте несколько игр, чтобы увидеть статистику»), и половина кадра — пустота. Наполнить его можно только историей тренировок; выдумывать её для магазина — враньё, а играть недели ради снимка скрипт не может. Решение за Денисом: снять с боевого профиля с историей ЛИБО оставить вне карточки',
    expect: { ru: /Статистика/ },
    forbid: { ru: /Выбери первую игру/ },
  },
];

/* ────────────────────────────── браузерные помощники ───────────────────────── */

const countButtons = () => document.querySelectorAll('[role="button"], button').length;

/** Что видно на экране прямо сейчас — то же читает и проверка поля. */
const READ = () => ({
  text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
  buttons: document.querySelectorAll('[role="button"], button').length,
  shell: {
    toolbar: !!document.querySelector('[data-testid="game-toolbar"]'),
    headerActions: !!document.querySelector('[data-testid="game-header-actions"]'),
  },
});

/**
 * Ждём устойчивый экран и только потом снимаем. Кадр на полукадре — недомер,
 * который выглядит успехом: сетка ещё не дорисована, а снимок уже уехал.
 */
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

async function open(page, route) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(countButtons, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (await page.evaluate(countButtons)) return true;
  }
  return false;
}

/** Кликнуть кнопку по подписи. Возвращает нажатое или null. */
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

/**
 * Нажать «продвигающую» кнопку — самую крупную из тех, что не выход, не справка
 * и не откат. Мелкая фишка уровня рядом так не обманет.
 */
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

/**
 * Прокрутка кадра. React Native Web рисует ScrollView отдельным контейнером с
 * `overflow: auto`, поэтому `window.scrollTo` тут ничего не двигает — ищем самый
 * длинный прокручиваемый узел и двигаем его. Нужно в двух местах: каталог
 * открывается на карточках зарядки (сетка упражнений ниже сгиба), а дворец
 * памяти сам уезжает к очередному месту и прячет шапку с предметами.
 */
async function scrollTo(page, top) {
  await page.evaluate((y) => {
    const nodes = [...document.querySelectorAll('div')]
      .filter((el) => el.scrollHeight - el.clientHeight > 40)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const target = nodes[0];
    if (target) target.scrollTop = y;
    window.scrollTo(0, y);
  }, top);
  await page.waitForTimeout(900);
}

/**
 * Всплывающую подсказку «Понятно» гасим ДО проверки поля: она перекрывает низ
 * экрана и тащит в текст слова «как играть», из-за которых запрет сработал бы
 * на исправном кадре. Ложное срабатывание хуже отсутствия проверки.
 */
async function dismissCoach(page) {
  for (let i = 0; i < 2; i++) {
    if (!(await clickByText(page, /^(Понятно|Got it)$/))) break;
    await page.waitForTimeout(500);
  }
}

/** rhythm-pitch: перед полем стоит калибровка звука — четыре сигнала и тапы в такт. */
async function recipeRhythmPitch(page) {
  const steps = [];
  steps.push(await advanceOnce(page));                       // «Начать» → калибровка
  await dismissCoach(page);
  steps.push(await clickByText(page, /калибров/i));
  await page.waitForTimeout(700);
  // Тапаем в такт сигналам: калибровке хватает двух замеров, делаем с запасом.
  for (let i = 0; i < 8; i++) { await clickByText(page, /Тап/i); await page.waitForTimeout(550); }
  await page.waitForTimeout(2000);
  steps.push(await clickByText(page, /^Продолжить$/i));
  await page.waitForTimeout(2500);
  await waitStable(page);
  return steps.filter(Boolean);
}

/* ────────────────────────────── съёмка ─────────────────────────────────────── */

/** PNG для Play: 24 бита без альфы. Playwright отдаёт RGBA — альфу снимаем. */
async function toPlayPng(buf) {
  return sharp(buf).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

function checkDims(w, h) {
  const min = Math.min(w, h);
  const max = Math.max(w, h);
  const bad = [];
  if (min < PLAY.MIN_SIDE) bad.push(`короткая сторона ${min} < ${PLAY.MIN_SIDE}`);
  if (max > PLAY.MAX_SIDE) bad.push(`длинная сторона ${max} > ${PLAY.MAX_SIDE}`);
  if (max > min * PLAY.MAX_RATIO) bad.push(`${max}/${min} — длинная сторона больше двух коротких`);
  return bad;
}

async function main() {
  if (!SUPPORTED_LANGS.includes(LANG)) {
    console.log(`\n🔴 Для языка «${LANG}» не выписаны маркеры поля (есть: ${SUPPORTED_LANGS.join(', ')}).`);
    console.log('    Снимать вслепую нельзя: скрипт не отличит поле от экрана правил и снимет что попало.');
    console.log('    Добавь маркеры в SHOTS[].expect/forbid для этого языка и запусти снова.');
    process.exit(1);
  }

  // Самопроверка рецептов: кадр без маркера поля — это кадр без проверки.
  const noMarker = SHOTS.filter((s) => !s.expect?.[LANG] || !s.forbid?.[LANG]).map((s) => s.id);
  if (noMarker.length) {
    console.log(`\n🔴 У кадров нет маркера/запрета на языке ${LANG}: ${noMarker.join(', ')}`);
    process.exit(1);
  }

  let shots = SHOTS;
  if (ONLY) shots = shots.filter((s) => ONLY.some((o) => s.id.includes(o)));
  if (!shots.length) { console.log('🔴 --only не выбрал ни одного кадра'); process.exit(1); }

  await fs.mkdir(OUT, { recursive: true });

  // --autoplay-policy: без него Web Audio у rhythm-pitch не заводится и калибровка
  // висит вечно, а кадр уезжает с экрана «Проверка громкости».
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: DSF });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((lang) => {
    localStorage.setItem('language', lang);
    localStorage.setItem('psygames_devchat_on', '0');   // кнопка отзыва — инструмент тестировщика
    // Профиль владельца: ровно та пара ключей, которую пишет redeemCode +
    // switchProfile в ProfileContext.
    //
    // ⚠️ ПРО ВТОРОЙ КЛЮЧ, ЧЕСТНО. Проверено поломкой 19.08.2026: сегодня хватает
    // одного `active_profile` — в `services/unlock.ts` стоит UNLOCK_CODES_ENABLED
    // = false («free-фаза, замков нет»), и `requiresUnlock` возвращает false для
    // всех профилей. `unlocked_themed` пишем не «на всякий случай», а потому что
    // там же расписан возврат гейтинга при переходе на оплату: как только замки
    // включат, ProfileContext откатит несведённый профиль на free, и рецепт
    // молча начнёт снимать каталог с девятью карточками.
    localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
    localStorage.setItem('psygames_active_profile', 'odv999');
    localStorage.setItem('psygames_first_run_done', '1');
  }, LANG);

  // Онбординг проходим НАЖАТИЕМ, а не подстановкой флага: «пройден» без
  // выбранной игры — состояние, до которого живое приложение не доходит никогда
  // (на этом уже обжигались, см. шапку play-screenshots.mjs).
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  if (await page.evaluate(() => /Выбери первую игру|Choose your first game/i.test(document.body.innerText || ''))) {
    const cards = await page.$$('button, [role=button]');
    if (cards[1]) await cards[1].click().catch(() => {});
    await page.waitForTimeout(3000);
    console.log('  · онбординг пройден нажатием');
  }

  // Профиль применился? Проверяем по каталогу, а не на веру: на «Стандарт»
  // карточек девять, у владельца — весь каталог. Снимок каталога с девятью
  // карточками противоречит тексту карточки и уехал бы молча.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await waitStable(page);
  const catalogCards = await page.evaluate(countButtons);
  if (catalogCards < 40) {
    console.log(`\n🔴 В каталоге ${catalogCards} кнопок — профиль владельца НЕ применился.`);
    console.log('    Проверь ключи psygames_active_profile / psygames_unlocked_themed в ProfileContext.');
    await browser.close();
    process.exit(1);
  }
  console.log(`  · профиль odv999 применился: в каталоге ${catalogCards} кнопок`);

  const manifest = [];
  const failed = [];

  for (const s of shots) {
    if (!(await open(page, s.route))) { failed.push(`${s.id}: экран не отрисовался за два захода`); continue; }
    await dismissCoach(page);
    await waitStable(page);

    const steps = [];
    if (s.recipe === 'rhythm-pitch') {
      steps.push(...(await recipeRhythmPitch(page)));
    } else {
      for (let i = 0; i < (s.advance ?? 0); i++) {
        const t = await advanceOnce(page);
        if (!t) { steps.push('(продвигающей кнопки нет)'); break; }
        steps.push(t);
      }
    }
    await dismissCoach(page);
    await waitStable(page);
    if (s.scroll !== undefined) await scrollTo(page, s.scroll);
    await page.waitForTimeout(800);

    const state = await page.evaluate(READ);

    // Пустой экран, 404 роутера и экран падения по-разному, но одинаково молча
    // превращаются в «скриншот». Ловим все три до сохранения файла.
    if (state.text.length < 20) { failed.push(`${s.id}: экран пуст (${state.text.length} символов)`); continue; }
    if (/Unmatched Route|Page could not be found|This screen does not exist/i.test(state.text)) {
      failed.push(`${s.id}: страница не найдена`); continue;
    }
    if (/Something broke|Что-то сломалось|Rendered fewer hooks|Minified React error/i.test(state.text)) {
      failed.push(`${s.id}: ЭКРАН УПАЛ`); continue;
    }

    const expectRe = s.expect[LANG];
    const forbidRe = s.forbid[LANG];
    const hit = state.text.match(expectRe);
    const forbidden = state.text.match(forbidRe);
    if (!hit) {
      failed.push(`${s.id}: маркер поля ${expectRe} НЕ найден — снят не тот экран. Начало: «${state.text.slice(0, 120)}»`);
      continue;
    }
    if (forbidden) {
      failed.push(`${s.id}: на экране запрещённый текст «${forbidden[0]}» — это экран настройки/правил, а не поле`);
      continue;
    }

    const raw = await page.screenshot({ type: 'png' });
    const png = await toPlayPng(raw);
    const meta = await sharp(png).metadata();
    const dimBad = checkDims(meta.width, meta.height);
    if (dimBad.length) { failed.push(`${s.id}: размер ${meta.width}×${meta.height} не по Play — ${dimBad.join('; ')}`); continue; }
    if (png.length > PLAY.MAX_BYTES) { failed.push(`${s.id}: файл ${png.length} байт > лимита Play ${PLAY.MAX_BYTES}`); continue; }

    const file = `${s.id}.png`;
    await fs.writeFile(path.join(OUT, file), png);

    manifest.push({
      id: s.id,
      file,
      kind: s.kind,
      gameId: s.gameId ?? null,
      route: s.route,
      why: s.why,
      inListing: !!s.inListing,
      width: meta.width,
      height: meta.height,
      channels: meta.channels,          // 3 = 24-битный PNG без альфы, как требует Play
      bytes: png.length,
      sha256: crypto.createHash('sha256').update(png).digest('hex'),
      // Доказательство, что снято поле, а не экран настройки:
      onField: s.kind === 'game',
      fieldMarker: hit[0],
      forbidPattern: String(forbidRe),
      forbidHit: null,
      shell: state.shell,               // якоря GameShell как есть — у новых игр их нет
      buttons: state.buttons,
      textLen: state.text.length,
      steps,
      lang: LANG,
      capturedAt: new Date().toISOString(),
    });
    const shellMark = state.shell.toolbar || state.shell.headerActions ? 'каркас+' : 'свой каркас';
    console.log(`  ✅ ${s.id.padEnd(20)} «${hit[0].slice(0, 34)}» ${shellMark}, ${(png.length / 1024).toFixed(0)} КБ`);
  }

  await browser.close();

  // Манифест дописываем, а не перетираем: `--only` не должен стирать соседей.
  const manifestPath = path.join(OUT, 'shots.json');
  let prev = [];
  try { prev = JSON.parse(await fs.readFile(manifestPath, 'utf8')).shots ?? []; } catch { /* первого прогона ещё не было */ }
  const merged = [...prev.filter((p) => !manifest.some((m) => m.id === p.id)), ...manifest]
    .sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(manifestPath, JSON.stringify({
    lang: LANG,
    play: PLAY,
    note: 'Снято scripts/store-shots.mjs. Рецепт пересъёмки — в README.md рядом.',
    shots: merged,
  }, null, 2) + '\n');

  const inListing = merged.filter((m) => m.inListing).length;
  console.log(`\nготово: ${manifest.length} из ${shots.length} → ${OUT}`);
  console.log(`в манифесте ${merged.length} кадров, помечено для карточки ${inListing} (лимит Play ${PLAY.MAX_IN_LISTING})`);

  if (failed.length) {
    console.log(`\n🔴 НЕ СНЯТО ${failed.length}:`);
    failed.forEach((f) => console.log(`    ${f}`));
    process.exitCode = 1;
  }
  if (inListing > PLAY.MAX_IN_LISTING) {
    console.log(`\n🔴 Для карточки помечено ${inListing} кадров, Play примет ${PLAY.MAX_IN_LISTING}.`);
    process.exitCode = 1;
  }
}

main();
