/* psygames-rotation-landscape-fit · VER 1 · 17.09.2026 */
/**
 * rotation-landscape-fit — в альбоме эталон «Мысленного вращения» виден целиком и не мельче варианта.
 *
 * ЗАЧЕМ. В 2.54.15 варианты в альбоме выросли с 48 px до 0,24 высоты экрана (отчёт c8903296:
 * «картинка чуть ли не на 50 % пустая»), а эталон остался 104. Полоса вариантов подросла,
 * поле над ней стало ниже, и карточка эталона ушла под полосу: 844×390 — срез 34 px, подпись
 * «эталон» не видна; 740×360 — 56 px. Проба-функция `optionLayout` этого не видела: она меряла
 * варианты, а не то, что осталось полю.
 *
 * Поэтому здесь браузер, а не арифметика: собранная страница, настоящая партия, несколько
 * раундов, чтобы попались разные виды заданий (у «Среза» и «Трёх видов» вопрос длиннее).
 * Для каждого раунда до ответа мерится:
 *   · срез — на сколько низ карточки эталона ниже низа прокручиваемого поля;
 *   · рисунок эталона и рисунок варианта (стороны SVG).
 * Код выхода 1, если где-то срез больше допуска или эталон мельче варианта больше чем на 2 px.
 * Числа `LANDSCAPE_FIXED_HEIGHT` в `src/games/mental-rotation/optionLayout.ts` сняты этим же
 * замером — меняешь шапку каркаса, строку счёта или карточку, перемерь здесь.
 *
 * Запуск (нужен поднятый веб-билд с baseUrl=""):
 *   node scripts/serve-dist.mjs dist 8127 &
 *   node scripts/rotation-landscape-fit.mjs --base=http://127.0.0.1:8127
 *   node scripts/rotation-landscape-fit.mjs --base=... --sizes=844x390,932x430 --level=24 --rounds=6
 */
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = args.base ?? 'http://127.0.0.1:8127';
/** Альбомные окна живых телефонов: Android 740×360, iPhone SE/mini, 12–15, Plus/Pro Max. */
const SIZES = (args.sizes ?? '740x360,667x375,812x375,844x390,896x414,932x430').split(',');
const LEVEL = args.level ?? '24';
const ROUNDS = Number(args.rounds ?? 6);
/** Допуск среза: пиксель рамки на округлении — не дефект. */
const ДОПУСК = 1;

const b = await chromium.launch();
const строки = [];
let плохо = 0;
for (const size of SIZES) {
  const [W, H] = size.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ru', reducedMotion: 'reduce' });
  await ctx.addInitScript((lv) => {
    try { for (const pid of ['default', 'free']) localStorage.setItem(`psygames_mental_rotation_level_${pid}`, lv); } catch { /* приватный режим */ }
  }, LEVEL);
  const p = await ctx.newPage();
  const ошибки = [];
  p.on('pageerror', (e) => { if (!/#418/.test(String(e))) ошибки.push(String(e).slice(0, 120)); });
  await p.goto(`${BASE}/games/mental-rotation?trials=${ROUNDS}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const всёРавно = p.getByText('Всё равно играть', { exact: true });
  if (await всёРавно.count()) { await всёРавно.first().click().catch(() => {}); await p.waitForTimeout(600); }
  for (let i = 0; i < 2; i++) { const g = p.getByText(/^понятно$/i); if (await g.count()) { await g.last().click().catch(() => {}); await p.waitForTimeout(400); } }
  const начать = p.getByText('Начать', { exact: true }).last();
  await начать.scrollIntoViewIfNeeded().catch(() => {});
  await начать.click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) { const g = p.getByText(/^понятно$/i); if (!(await g.count())) break; await g.last().click().catch(() => {}); await p.waitForTimeout(500); }

  for (let раунд = 1; раунд <= ROUNDS; раунд++) {
    const r = await p.evaluate(() => {
      const ref = document.querySelector('[data-testid="mental-reference"]');
      if (!ref) return null;
      let поле = ref.parentElement;
      while (поле && !/(auto|scroll)/.test(getComputedStyle(поле).overflowY)) поле = поле.parentElement;
      const сторона = (e) => (e ? Math.round(Math.max(e.getBoundingClientRect().width, e.getBoundingClientRect().height)) : 0);
      const варианты = [...document.querySelectorAll('[aria-label^="Вариант"]')];
      const рисунокВарианта = Math.max(0, ...варианты.map((o) => сторона(o.querySelector('svg'))));
      const рисункиЭталона = [...ref.querySelectorAll('svg')].map(сторона);
      // Подписи вида в альбоме нет (шапке не хватает места) — вид узнаём по разметке эталона и вопросу.
      const поМетке = [['section-layer', 'Срез'], ['missing-whole', 'Недостающая часть'], ['formation-views', 'Три вида'], ['assembly-parts', 'Сборка'], ['same-pair', 'Одинаковы?']]
        .find(([id]) => ref.querySelector(`[data-testid="${id}"]`));
      const вид = поМетке ? поМетке[1] : (ref.previousElementSibling?.textContent ?? '?').trim().slice(0, 28);
      return {
        вид,
        срез: поле ? Math.max(0, Math.round(ref.getBoundingClientRect().bottom - поле.getBoundingClientRect().bottom)) : null,
        эталон: Math.max(0, ...рисункиЭталона),
        вариант: рисунокВарианта,
        рисунковВЭталоне: рисункиЭталона.length,
      };
    });
    if (!r) break;
    // Эталон сравниваем с вариантом только там, где в карточке один рисунок: у «Сборки»,
    // «Трёх видов» и «Одинаковы?» в эталоне несколько фигур по 0,62–0,8 размера — так задумано.
    const мельче = r.рисунковВЭталоне === 1 && r.эталон + 2 < r.вариант;
    const ok = (r.срез ?? 0) <= ДОПУСК && !мельче;
    if (!ok) плохо++;
    строки.push({ size, раунд, ...r, ok });
    console.log(`${size} раунд ${раунд} «${r.вид}»: срез эталона ${r.срез} px · эталон ${r.эталон} · вариант ${r.вариант}${ok ? '' : '  ❌'}`);
    // К следующему раунду: любой вариант, затем «дальше» из разбора, если он открылся.
    await p.locator('[aria-label^="Вариант"]').first().click().catch(() => {});
    await p.waitForTimeout(900);
    const дальше = p.locator('[data-testid="mental-review-next"]');
    if (await дальше.count()) { await дальше.first().click().catch(() => {}); }
    await p.waitForTimeout(900);
  }
  if (ошибки.length) { плохо++; console.log(`${size}: ошибки страницы — ${ошибки.join(' | ')}`); }
  await ctx.close();
}
await b.close();
console.log(плохо ? `❌ Нарушений: ${плохо} из ${строки.length} замеров.` : `✅ Эталон виден целиком и не мельче варианта: ${строки.length} замеров на ${SIZES.length} окнах.`);
process.exit(плохо ? 1 : 0);
