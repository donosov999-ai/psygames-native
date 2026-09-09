#!/usr/bin/env node
/* psygames-transition-audit · VER 1 · 09.09.2026 */
/**
 * ХОДИТ ПО ПРИЛОЖЕНИЮ ОДНОЙ ВКЛАДКОЙ И ЛОВИТ ПАДЕНИЯ НА ПЕРЕХОДЕ.
 *
 * 🔴 ЗАЧЕМ ЭТО ОТДЕЛЬНО ОТ `smoke-games.mjs`. Smoke открывает КАЖДЫЙ маршрут в НОВОЙ
 * вкладке (`ctx.newPage()` в цикле). Значит каждый экран он видит только в ПЕРВОМ
 * рендере — а есть целый класс дефектов, которого при первом рендере не существует
 * по построению.
 *
 * Замер 09.09.2026, который этот скрипт и родил: в `GameHelpOverlay` (кнопка «Правила»,
 * висит на КАЖДОМ экране игры и развилки) `useEffect` стоял после `if (!hasHelp)
 * return null`. Число хуков у узла менялось между рендерами → React #310, экран
 * «Что-то сломалось» на ЛЮБОМ переходе. В тот же день:
 *   · smoke по 97 экранам со входом в партию — 97 из 97 ЗЕЛЁНЫХ;
 *   · нажатие карточки в каталоге на симуляторе iPhone — «Что-то сломалось».
 * Приложение было сломано целиком, а обход маршрутов этого не видел и не мог увидеть.
 *
 * ⚠️ ПОЭТОМУ ЗДЕСЬ ОДНА ВКЛАДКА НА ВЕСЬ ОБХОД. Как только на каждый шаг заводится
 * своя страница, проверка снова меряет первый рендер и становится вторым smoke.
 * Это главное свойство файла — не «оптимизировать».
 *
 * ЧТО СЧИТАЕТСЯ ПАДЕНИЕМ: сообщение об ошибке в консоли или необработанное исключение,
 * а также появление на экране слов заглушки аварийного экрана («Что-то сломалось» /
 * «Something went wrong») — её ставит сам ErrorBoundary, и она видна, даже когда
 * консоль уже очищена.
 *
 * ЗАПУСК: BASE=http://localhost:8081 node scripts/transition-audit.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8081';
const ПРОФИЛЬ = process.env.PROFILE || 'odv999';
const ШУМ = [
  /Download the React DevTools/i, /pointerEvents is deprecated/i,
  /"shadow\*" style props are deprecated/i, /useNativeDriver/i,
  /Unexpected text node/i, /Failed to load resource.*(favicon|\.map)\b/i,
  /hydrat/i, /did not match the server-rendered/i, /Text content does not match/i,
  /Minified React error #(418|421|422|423|425|426)\b/i,
  /**
   * Проверка обновления бьётся в сеть с localhost — CORS, и это НЕ дефект обхода.
   * 📌 НО САМ АДРЕС ДЕФЕКТЕН, и нашлось это именно здесь: `appUpdates.ts:15` стучится
   * в `https://psy-games.pro/play/version.json`, а `/play` снят с сайта решением
   * Дениса 09.09.2026 — живой ответ 404. То есть «доступна новая версия» в
   * приложении не покажется НИКОМУ. Заведено отдельно; здесь только глушим шум.
   */
  /psy-games\.pro\/play\/version\.json/i,
  /Access to fetch at .* has been blocked by CORS/i,
  // «Failed to load resource: net::ERR_FAILED» — вторая половина той же неудачной
  // выборки: браузер печатает и причину (CORS), и сам факт. Считать это падением
  // приложения нельзя, иначе гейт будет краснеть от любой недоступной сети.
  /Failed to load resource: net::ERR_FAILED/i,
];
const шум = (t) => ШУМ.some((r) => r.test(t));

/**
 * Маршруты обхода. Каждая строка — ЦЕПОЧКА переходов внутри одной вкладки; переход
 * делается через клик по видимому элементу, а не `goto`, потому что `goto` — это
 * новый первый рендер, то есть ровно та слепота, от которой файл написан.
 */
const ЦЕПОЧКИ = [
  { имя: 'каталог → развилка → упражнение → назад', шаги: ['/games', 'карточка:ротация', 'карточка:первая', 'назад', 'назад'] },
  { имя: 'каталог → судоку → доска → назад',        шаги: ['/games', 'карточка:судок', 'карточка:первая', 'назад', 'назад'] },
  { имя: 'каталог → память → упражнение → назад',   шаги: ['/games', 'карточка:память', 'карточка:первая', 'назад', 'назад'] },
  { имя: 'вкладки внизу по кругу',                  шаги: ['/', 'вкладка:Игры', 'вкладка:Зарядка', 'вкладка:Прогресс', 'вкладка:Питомец', 'вкладка:Главная'] },
  { имя: 'главная → достижения → назад → статистика', шаги: ['/', '/achievements', 'назад', '/statistics', 'назад'] },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((p) => {
  try { localStorage.setItem('psygames_active_profile', p); localStorage.setItem('psygames_first_run_done', 'true'); } catch {}
}, ПРОФИЛЬ);

const page = await ctx.newPage();          // 🔴 ОДНА на весь обход, см. шапку
const беды = [];
let текущая = '';
page.on('console', (m) => { if (m.type() === 'error' && !шум(m.text())) беды.push(`${текущая}: ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => { const t = String(e.message || e); if (!шум(t)) беды.push(`${текущая}: PAGEERROR ${t.slice(0, 200)}`); });

async function аварийныйЭкран() {
  const t = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  return /Что-то сломалось|Something went wrong/i.test(t);
}

async function жать(текст) {
  const кнопки = page.getByRole('button');
  const n = await кнопки.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 80); i++) {
    const el = кнопки.nth(i);
    const t = ((await el.innerText().catch(() => '')) || '').trim();
    if (t && t.toLowerCase().includes(текст.toLowerCase())) { await el.click({ timeout: 3000 }).catch(() => {}); return true; }
  }
  return false;
}

async function перваяКарточка() {
  const кнопки = page.getByRole('button');
  const n = await кнопки.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 80); i++) {
    const el = кнопки.nth(i);
    const кор = await el.boundingBox().catch(() => null);
    const t = ((await el.innerText().catch(() => '')) || '').trim();
    // карточка — крупный элемент с текстом, ниже шапки; «Правила» и питомец не в счёт
    if (кор && кор.y > 120 && кор.height >= 44 && t.length > 3 && !/правил|rules/i.test(t)) {
      await el.click({ timeout: 3000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

for (const цепь of ЦЕПОЧКИ) {
  текущая = цепь.имя;
  for (const шаг of цепь.шаги) {
    if (шаг.startsWith('/')) {
      await page.goto(`${BASE}${шаг}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => беды.push(`${текущая}: NAV ${e.message.split('\n')[0]}`));
    } else if (шаг === 'назад') {
      await page.goBack({ timeout: 10000 }).catch(() => {});
    } else if (шаг.startsWith('вкладка:')) {
      await жать(шаг.slice('вкладка:'.length));
    } else if (шаг === 'карточка:первая') {
      await перваяКарточка();
    } else if (шаг.startsWith('карточка:')) {
      await жать(шаг.slice('карточка:'.length));
    }
    await page.waitForTimeout(1200);
    if (await аварийныйЭкран()) беды.push(`${текущая} → шаг «${шаг}»: НА ЭКРАНЕ «Что-то сломалось»`);
  }
  console.log(`${беды.some((b) => b.startsWith(цепь.имя)) ? '✗' : '✓'} ${цепь.имя}`);
}

await browser.close();

if (беды.length) {
  console.error(`\n🔴 ПАДЕНИЙ НА ПЕРЕХОДАХ: ${беды.length}`);
  [...new Set(беды)].slice(0, 20).forEach((b) => console.error('   ' + b));
  console.error('\nСамая частая причина — хук после раннего выхода: число хуков у узла меняется');
  console.error('между рендерами, React отвечает #310. Ловит `npx eslint … | grep rules-of-hooks`.');
  process.exit(1);
}
console.log(`\n✅ переходы чисты: ${ЦЕПОЧКИ.length} цепочек, аварийного экрана и ошибок консоли нет`);
