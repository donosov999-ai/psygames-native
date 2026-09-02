/**
 * slot-audit — ЖИВАЯ проверка смысла двух полос управления.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ `src/__tests__/slot-meaning.test.ts`. Тот гейт читает
 * исходник и отвечает на вопрос «написано ли правильно». Здесь отвечают на
 * второй, куда более коварный: «НАРИСОВАНО ли и ГДЕ».
 *
 * 🔴 ПОЧЕМУ ЭТОТ ВОПРОС ВООБЩЕ НУЖЕН. 19.08.2026 в SET нашёлся бейдж обратного
 * отсчёта: написан, переведён на 12 языков, покрыт гейтом — и не показан ни
 * разу, потому что состояние, от которого он зависел, не присваивалось нигде.
 * Гейт по исходнику такое пропускает по построению. Перенос служебных кнопок в
 * шапку ровно так же может «пройти по бумагам» и не появиться на экране: игра
 * положит `headerActions` внутрь условия, которое никогда не истинно, и человек
 * останется вообще без отмены. Здесь мы заходим В ИГРУ и смотрим глазами
 * браузера.
 *
 * ЧТО ПРОВЕРЯЕТСЯ (три разных обмана):
 *   1) СЛУЖЕБНОЕ ВНИЗУ — кнопка `GameAuxAction` найдена внутри нижней полосы;
 *   2) СЛУЖЕБНОЕ ПРОПАЛО — игра заявлена в реестре со служебными действиями,
 *      а на поле их нарисовано меньше (или ноль): перенос вышел мёртвым;
 *   3) НЕ ЗАШЛИ В ИГРУ — молчание тут читается как успех, поэтому каждая
 *      непроверенная игра отчитывается отдельной красной строкой.
 *
 * ⚠️ ЯКОРЯ. Ищем по `data-testid` (`game-toolbar`, `game-header-actions`,
 * `game-aux`), а не по подписям кнопок: подпись переводится и меняется, а
 * якорь означает роль. Если якорей нет — аудит немедленно останавливается, а
 * не отчитывается «чисто»: слепой аудит опаснее отсутствующего.
 *
 * Запуск (нужен поднятый веб-билд с baseUrl=""):
 *   cd ~/dev/psygames/frontend
 *   npx expo export -p web --output-dir dist-slots && npx serve dist-slots -l 8143
 *   node scripts/slot-audit.mjs --base=http://127.0.0.1:8143
 *   node scripts/slot-audit.mjs --only=mahjong,cpt        # точечно
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
// Слушаем 127.0.0.1, а не localhost: `serve` поднимается на IPv6, и «localhost»
// на этой машине уходит в ::1 — половина заходов молча падала в таймаут.
const BASE = args.base ?? 'http://127.0.0.1:8143';
const ONLY = args.only ? args.only.split(',').map((s) => s.trim()) : null;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * ОЖИДАНИЯ БЕРУТСЯ ИЗ ГЕЙТА, А НЕ ДУБЛИРУЮТСЯ ЗДЕСЬ. Два списка «сколько
 * служебных кнопок у игры» неизбежно разъедутся, и разъедутся молча — поэтому
 * реестр вычитывается прямо из `slot-meaning.test.ts`. Реестр один.
 */
async function registry() {
  const src = await fs.readFile(path.join(ROOT, 'src/__tests__/slot-meaning.test.ts'), 'utf8');
  const block = (name) => {
    const m = new RegExp(`const ${name}[^{]*\\{([\\s\\S]*?)\\n\\};`).exec(src);
    if (!m) throw new Error(`в slot-meaning.test.ts не найден ${name} — реестр переехал, почини путь`);
    return m[1];
  };
  const expected = {};
  for (const m of block('AUX_IN_HEADER').matchAll(/'([\w-]+)\.tsx':\s*(\d+)/g)) expected['/games/' + m[1]] = Number(m[2]);
  // Игры, объявившие `bottom="actions"`: те же кнопки, но ждём их ВНИЗУ.
  const expectedBottom = {};
  for (const m of block('AUX_IN_BOTTOM').matchAll(/'([\w-]+)\.tsx':\s*(\d+)/g)) expectedBottom['/games/' + m[1]] = Number(m[2]);

  const auxKeys = [...block('AUX_KEYS').matchAll(/^\s{2}(\w+):\s*'/gm)].map((m) => m[1]);
  const debt = [...block('DEBT').matchAll(/'([\w-]+)\.tsx':/g)].map((m) => '/games/' + m[1]);
  // «Отменить» бывает и откатом хода, и backspace ответа — исключения поимённо.
  const draftOk = {};
  const draftBlock = block('DRAFT_EDIT_OK');
  for (const m of draftBlock.matchAll(/'([\w-]+)\.tsx':\s*\{([\s\S]*?)\n\s{2}\},/g)) {
    draftOk['/games/' + m[1]] = [...m[2].matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]);
  }
  if (!Object.keys(expected).length || !auxKeys.length) throw new Error('реестр разобран в пустоту — проверь формат');
  return { expected, expectedBottom, auxKeys, debt, draftOk };
}

/**
 * ПОДПИСИ СЛУЖЕБНЫХ ДЕЙСТВИЙ НА ЯЗЫКЕ ПРОГОНА — из словаря, а не руками.
 *
 * Нужны, чтобы поймать кнопку, нарисованную В ОБХОД общего компонента: якоря
 * `game-aux` у неё нет, и по разметке её не отличить от кнопки ответа. По
 * подписи — отличить можно, и подпись эта берётся по тому же ключу перевода,
 * что и в гейте: зашивать «СТОП» строкой сюда значит ломаться на первом же
 * переводе.
 */
async function auxLabels(keys) {
  const src = await fs.readFile(path.join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8');
  const out = {};
  for (const k of keys) {
    const m = new RegExp(`\\n\\s{2}${k}:\\s*\\{\\s*ru:\\s*'([^']+)'`).exec(src);
    if (m) out[k] = m[1];
  }
  const missing = keys.filter((k) => !out[k]);
  if (missing.length) throw new Error(`в словаре не найдены ru-подписи: ${missing.join(', ')}`);
  return out;
}

/** Маршруты игр берём из каталога приложения, чтобы список не разъезжался. */
async function gameRoutes() {
  const src = await fs.readFile(path.join(ROOT, 'src/constants/games.ts'), 'utf8');
  return [...src.matchAll(/route:\s*'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Экраны-развилки: поля у них нет, они разводят по соседним играм.
 *
 * ⚠️ СПИСОК ЧИТАЕТСЯ ИЗ КАТАЛОГА, А НЕ ЗАШИТ ЗДЕСЬ. Раньше два маршрута стояли
 * строками, и такой же список лежал ещё в четырёх местах кода. Хаб, забытый в этом
 * файле, ломается особенно неприятно: аудит идёт искать на нём игровое поле,
 * которого там нет и быть не должно, и отчитывается красным про исправный экран.
 * Карточка помечена в каталоге признаком `hub: true` — его и вычитываем.
 */
async function hubRoutes() {
  const raw = await fs.readFile(path.join(ROOT, 'src/constants/games.ts'), 'utf8');
  // Комментарии срезаем: слово `hub: true` в тексте объяснения не должно считаться
  // пометкой карточки — на этом в проекте уже обжигались не раз.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const out = new Set();
  for (const m of src.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
    if (!/^\s*hub:\s*true,?\s*$/m.test(m[1])) continue;
    const r = /route:\s*'([^']+)'/.exec(m[1]);
    if (r) out.add(r[1]);
  }
  if (!out.size) throw new Error('в каталоге не найдено ни одной карточки-хаба — разбор сломался, а слепой аудит опаснее отсутствующего');
  return out;
}

const countButtons = () => document.querySelectorAll('[role="button"], button').length;

const START_PATTERNS = [
  /(?:^|[^\p{L}])(начать|старт|start|играть|play)(?![\p{L}])/iu,
  /(уровень|level)\s*\d+\s*(→|—|-)/iu,
];

/** Ждём устойчивый экран: замер на полукадре — это недомер, который выглядит успехом. */
async function waitStable(page, { step = 400, tries = 14 } = {}) {
  let prev = -1, same = 0;
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
    await page.waitForTimeout(1000);
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
  await page.waitForTimeout(300);
}

async function pressStart(page) {
  const picked = await page.evaluate((sources) => {
    const res = sources.map((s) => new RegExp(s, 'iu'));
    const all = [...document.querySelectorAll('[role="button"], button')];
    const c = all
      .map((el, i) => ({ i, text: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim(), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 1 && x.r.height > 1 && res.some((re) => re.test(x.text)));
    // Вход — самая крупная из подходящих: мелкая «фишка уровня» рядом не обманет.
    c.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (!c[0]) return null;
    all.forEach((el) => el.removeAttribute('data-slot-start'));
    all[c[0].i].setAttribute('data-slot-start', '1');
    return c[0].text.slice(0, 44);
  }, START_PATTERNS.map((r) => r.source));
  if (!picked) return null;
  const before = await page.evaluate(countButtons);
  await page.click('[data-slot-start]', { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(
    (n) => !document.querySelector('[data-slot-start]') || document.querySelectorAll('[role="button"], button').length !== n,
    before, { timeout: 8000 },
  ).catch(() => {});
  await page.waitForTimeout(1000);
  await waitStable(page);
  return picked;
}

/** Что и где нарисовано СЕЙЧАС: две зоны каркаса и служебные кнопки в них. */
const READ_SLOTS = () => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const size = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const toolbar = document.querySelector('[data-testid="game-toolbar"]');
  const header = document.querySelector('[data-testid="game-header-actions"]');
  const aux = [...document.querySelectorAll('[data-testid="game-aux"]')].map((el) => ({
    label: label(el),
    ...size(el),
    ...box(el),
    inToolbar: !!(toolbar && toolbar.contains(el)),
    inHeader: !!(header && header.contains(el)),
    visible: getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'
      && el.getBoundingClientRect().width > 1,
  }));
  // Все кнопки нижней полосы — чтобы поймать служебное, нарисованное в обход
  // общего компонента: якоря `game-aux` у такой кнопки нет, узнаём по подписи.
  const bottom = toolbar
    ? [...toolbar.querySelectorAll('[role="button"], button')]
        .filter((el) => !el.parentElement?.closest('[role="button"], button'))
        .map((el) => ({ label: label(el), ...size(el) }))
    : [];
  return {
    hasToolbar: !!toolbar,
    toolbarBox: toolbar ? box(toolbar) : null,
    headerBox: header ? box(header) : null,
    aux,
    bottom,
  };
};

async function main() {
  const { expected: AUX_EXPECTED, expectedBottom: AUX_EXPECTED_BOTTOM, auxKeys, debt: DEBT, draftOk: DRAFT_OK } = await registry();
  const LABELS = await auxLabels(auxKeys);
  const HUB_ROUTES = await hubRoutes();
  let routes = (await gameRoutes()).filter((r) => !HUB_ROUTES.has(r));
  if (ONLY) routes = routes.filter((r) => ONLY.some((o) => r.endsWith('/' + o) || r === o));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('language', 'ru');
    localStorage.setItem('psygames_devchat_on', '0');
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  /**
   * 🔴 ЭКРАНЫ, ЧЬЁ ПОЛЕ ЖИВЁТ ВО ВСТРОЕННОЙ СТРАНИЦЕ (`<iframe>`).
   *
   * «Пауза» с 27.08.2026 показывает страницу «Умного будильника» целиком —
   * кнопки входа в родительском документе НЕТ, и аудит падал «кнопка входа не
   * найдена». Поле существует, просто в дочернем кадре: вход делается ВНУТРИ
   * кадра (старт → галочка предупреждений → старт, как жмёт человек), а СЛОТЫ
   * по-прежнему меряются У РОДИТЕЛЯ — каркас с шапкой и низом принадлежит
   * приложению, и правило «низ означает ответ игрока» спрашивается с него же.
   * Разметка входа снята с самой страницы: `#start-practice`, галочка ищется
   * по тексту предупреждения, по одной, с пересъёмом узла (клик перерисовывает
   * страницу — протухший список узлов уже кусал tap-target-audit).
   */
  const EMBEDDED_FIELD = {
    '/games/pause': { framePart: '/warmup/' },
  };

  async function enterEmbedded(route, spec) {
    const frame = page.frames().find((f) => f.url().includes(spec.framePart));
    if (!frame) return null;
    const старт = () => frame.evaluate(() => {
      const кнопка = document.getElementById('start-practice');
      if (кнопка) кнопка.click();
      return Boolean(кнопка);
    }).catch(() => false);
    if (!(await старт())) return null;
    await page.waitForTimeout(600);
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
    await старт();
    const вошли = await frame.waitForFunction(
      () => document.body.classList.contains('is-practice-running'),
      { timeout: 8000 },
    ).then(() => true).catch(() => false);
    return вошли ? 'start-practice (в кадре)' : null;
  }

  const results = [];
  for (const route of routes) {
    if (!(await open(page, route))) { results.push({ route, failed: 'экран не отрисовался за два захода' }); continue; }
    await dismissCoach(page);
    const start = EMBEDDED_FIELD[route]
      ? await enterEmbedded(route, EMBEDDED_FIELD[route])
      : await pressStart(page);
    if (!start) { results.push({ route, failed: EMBEDDED_FIELD[route] ? 'кадр не вошёл в партию' : 'кнопка входа не найдена' }); continue; }
    const slots = await page.evaluate(READ_SLOTS);
    results.push({ route, label: start, ...slots });
  }
  await browser.close();

  const entered = results.filter((r) => !r.failed);
  const blind = results.filter((r) => r.failed);

  console.log(`\n── Живой аудит слотов. Зашли в ${entered.length} игр из ${routes.length}, экран 390×844.`);

  // Самопроверка: якоря обязаны находиться хоть где-то. Ноль везде — это не
  // «нарушений нет», это «аудит смотрит в пустоту», и молчать об этом нельзя.
  const anyToolbar = entered.filter((r) => r.hasToolbar).length;
  const anyAux = entered.reduce((n, r) => n + r.aux.length, 0);
  if (!anyToolbar || !anyAux) {
    console.log(`\n🔴 АУДИТ СЛЕП: нижних полос найдено ${anyToolbar}, служебных кнопок ${anyAux}.`);
    console.log('    Якоря testID (game-toolbar / game-header-actions / game-aux) не доехали до сборки —');
    console.log('    пересобери веб-билд или проверь GameShell/GameAuxAction. Зелёный отчёт тут был бы враньём.');
    process.exit(1);
  }
  console.log(`   Якоря на месте: нижних полос ${anyToolbar}, служебных кнопок ${anyAux}.`);

  let bad = 0;

  if (blind.length) {
    console.log(`\n🔴 НЕ ЗАШЛИ в ${blind.length} игр — слоты у них НЕ проверены:`);
    for (const b of blind) console.log(`    ${b.route}: ${b.failed}`);
    bad = 1;
  }

  // 1) Служебное действие снова оказалось в нижней полосе.
  const mixed = entered.filter((r) => r.aux.some((a) => a.inToolbar));
  if (mixed.length) {
    console.log(`\n🔴 СЛУЖЕБНОЕ ДЕЙСТВИЕ В НИЖНЕЙ ПОЛОСЕ (низ означает ответ игрока):`);
    for (const r of mixed) {
      for (const a of r.aux.filter((x) => x.inToolbar)) console.log(`    ${r.route}: «${a.label}»`);
    }
    bad = 1;
  }

  // 1b) То же нарушение, но в обход общего компонента: кнопка внизу без якоря
  //     `game-aux`, узнаваемая по подписи служебного действия. Именно так
  //     выглядят два оставшихся долга (глаз-разрядка и PRL) — их печатаем
  //     отдельно и в красноту не считаем, всё остальное красное.
  const byLabel = [];
  for (const r of entered) {
    for (const b of r.bottom) {
      const key = Object.keys(LABELS).find((k) => b.label === LABELS[k] || b.label.startsWith(LABELS[k] + ' '));
      if (!key) continue;
      if (DRAFT_OK[r.route]?.includes(key)) continue;      // разобранная правка черновика ответа
      byLabel.push({ route: r.route, label: b.label, known: DEBT.includes(r.route) });
    }
  }
  const knownDebt = byLabel.filter((x) => x.known);
  const newBypass = byLabel.filter((x) => !x.known);
  if (newBypass.length) {
    console.log(`\n🔴 СЛУЖЕБНОЕ ВНИЗУ В ОБХОД ОБЩЕЙ КНОПКИ (нарисовано своей разметкой):`);
    newBypass.forEach((x) => console.log(`    ${x.route}: «${x.label}»`));
    bad = 1;
  }
  if (knownDebt.length) {
    console.log(`\n⚠️ Известный долг (записан в DEBT гейта, файлы заняты параллельным заходом):`);
    knownDebt.forEach((x) => console.log(`    ${x.route}: «${x.label}» внизу`));
  }
  // Долг протух — тоже поломка: исключение, пережившее нарушение, молча гасит проверку.
  const staleDebt = DEBT.filter((route) => entered.some((r) => r.route === route) && !byLabel.some((x) => x.route === route));
  if (staleDebt.length) {
    console.log(`\n🔴 ДОЛГ ПРОТУХ — служебного внизу больше нет, убери строку из DEBT:`);
    staleDebt.forEach((r) => console.log(`    ${r}`));
    bad = 1;
  }

  // 2) Перенос вышел мёртвым: в реестре кнопки есть, на экране их нет.
  const dead = [];
  for (const [route, want] of Object.entries(AUX_EXPECTED)) {
    const r = entered.find((x) => x.route === route);
    if (!r) continue;                                  // не зашли — об этом уже сказано выше
    const drawn = r.aux.filter((a) => a.inHeader && a.visible).length;
    if (drawn < want) dead.push(`${route}: в шапке нарисовано ${drawn} служебных кнопок, реестр обещает ${want}`);
  }
  // 2б) То же для игр, объявивших `bottom="actions"`: кнопки ждём ВНИЗУ.
  for (const [route, want] of Object.entries(AUX_EXPECTED_BOTTOM)) {
    const r = entered.find((x) => x.route === route);
    if (!r) continue;
    const drawn = r.aux.filter((a) => a.visible && !a.inHeader).length;
    if (drawn < want) dead.push(`${route}: внизу нарисовано ${drawn} служебных кнопок, реестр обещает ${want}`);
  }
  if (dead.length) {
    console.log(`\n🔴 ПЕРЕНОС ВЫШЕЛ МЁРТВЫМ — написано, но не показывается:`);
    dead.forEach((d) => console.log(`    ${d}`));
    bad = 1;
  }

  // 3) Попадание пальцем: перенос не должен был сделать кнопку мельче.
  const small = [];
  for (const r of entered) {
    for (const a of r.aux) if (a.visible && (a.w < 48 || a.h < 48)) small.push(`${r.route}: «${a.label}» ${a.w}×${a.h}`);
  }
  if (small.length) {
    console.log(`\n🔴 СЛУЖЕБНАЯ КНОПКА МЕЛЬЧЕ 48×48:`);
    small.forEach((s) => console.log(`    ${s}`));
    bad = 1;
  }

  console.log(`\nСлужебные действия по играм (зона / размер):`);
  for (const r of entered.filter((x) => x.aux.length)) {
    const where = r.aux.map((a) => `${a.inHeader ? 'шапка' : a.inToolbar ? '🔴НИЗ' : '?'} «${a.label}» ${a.w}×${a.h}`).join(' · ');
    console.log(`    ${r.route.padEnd(26)} ${where}`);
  }
  const noStrip = entered.filter((x) => !x.hasToolbar).map((x) => x.route);
  console.log(`\nБез нижней полосы (${noStrip.length}): ${noStrip.join(', ') || '—'}`);

  if (!bad) console.log('\n✅ Низ везде означает ответ игрока, служебное нарисовано в шапке.');
  process.exit(bad);
}

main().catch((e) => { console.error(e); process.exit(1); });
