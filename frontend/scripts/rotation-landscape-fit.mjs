/* psygames-rotation-landscape-fit · VER 3 · 17.09.2026 */
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
 *
 * РАЗБОР (VER 3, задача 5de33bb4). После ответа, если открылся разбор, мерится то же самое ещё раз:
 * срез эталона, рисунки эталона и варианта — они обязаны совпасть с заданием (ничего не прыгает),
 * — и кнопка «Следующий раунд»: не ниже 44 px и целиком в окне. До VER 3 разбор в альбоме уводил
 * эталон под варианты: видно 0–64 px из 96–131 на шести окнах, а этот прибор мерил только задание.
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
    const замер = () => p.evaluate(() => {
      const ref = document.querySelector('[data-testid="mental-reference"]');
      if (!ref) return null;
      let поле = ref.parentElement;
      while (поле && !/(auto|scroll)/.test(getComputedStyle(поле).overflowY)) поле = поле.parentElement;
      const сторона = (e) => (e ? Math.round(Math.max(e.getBoundingClientRect().width, e.getBoundingClientRect().height)) : 0);
      const варианты = [...document.querySelectorAll('[aria-label^="Вариант"]')];
      const рисунокВарианта = Math.max(0, ...варианты.map((o) => сторона(o.querySelector('svg'))));
      const рисункиЭталона = [...ref.querySelectorAll('svg')].map(сторона);
      // Подписи вида в альбоме нет (шапке не хватает места) — вид узнаём по разметке эталона и вопросу.
      const поМетке = [['section-layer', 'Срез'], ['missing-whole', 'Недостающая часть'], ['formation-views', 'Три вида'], ['assembly-parts', 'Сборка'], ['same-pair', 'Одинаковы?'], ['oblique-reference', 'Сечение'], ['memory-figure', 'Память'], ['memory-hidden', 'Память']]
        .find(([id]) => ref.querySelector(`[data-testid="${id}"]`));
      const вид = поМетке ? поМетке[1] : (ref.previousElementSibling?.textContent ?? '?').trim().slice(0, 28);
      const дальше = document.querySelector('[data-testid="mental-review-next"]');
      const кн = дальше?.getBoundingClientRect();
      // Надпись кнопки и подпись разбора: слово не рвётся посреди (у слова больше одной строки)
      // и текст не обрезан многоточием (живой кадр 667×375: «Следу…ющ…» при колонке 72 px).
      const рвётсяИлиОбрезан = (el) => {
        if (!el) return false;
        const листья = [...el.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
        for (const лист of листья.length ? листья : [el]) {
          if (лист.scrollHeight > лист.clientHeight + 1 || лист.scrollWidth > лист.clientWidth + 1) return true;
          const обход = document.createTreeWalker(лист, NodeFilter.SHOW_TEXT);
          for (let узел = обход.nextNode(); узел; узел = обход.nextNode()) {
            for (const m of (узел.textContent || '').matchAll(/\S+/g)) {
              // японский и китайский переносятся между любыми знаками — это не разрыв слова
              if (/[\u3040-\u30ff\u3400-\u9fff]/.test(m[0])) continue;
              const диапазон = document.createRange();
              диапазон.setStart(узел, m.index); диапазон.setEnd(узел, m.index + m[0].length);
              if (new Set([...диапазон.getClientRects()].map((q) => Math.round(q.top))).size > 1) return true;
            }
          }
        }
        return false;
      };
      return {
        вид,
        срез: поле ? Math.max(0, Math.round(ref.getBoundingClientRect().bottom - поле.getBoundingClientRect().bottom)) : null,
        эталон: Math.max(0, ...рисункиЭталона),
        карточка: Math.round(ref.getBoundingClientRect().height),
        вариант: рисунокВарианта,
        вариантX: варианты[0] ? Math.round(варианты[0].getBoundingClientRect().left) : null,
        рисунковВЭталоне: рисункиЭталона.length,
        кнопка: кн ? { h: Math.round(кн.height), внеОкна: кн.bottom > innerHeight + 0.5 || кн.right > innerWidth + 0.5 || кн.top < 0 || кн.left < 0, рвётся: рвётсяИлиОбрезан(дальше) || рвётсяИлиОбрезан(document.querySelector('[data-testid="mental-picked-note"]')) } : null,
      };
    });
    // «Память»: пока фигуру показывают, в карточках вариантов пустое место без рисунка — мерить вариант
    // рано (прибор сравнил бы рисунок 0 в задании с рисунком в разборе и назвал бы это прыжком).
    for (let i = 0; i < 80 && await p.locator('[data-testid="memory-figure"]').count() && !(await p.locator('[data-testid="mental-review-next"]').count()); i++) await p.waitForTimeout(100);
    const r = await замер();
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
    if (await дальше.count()) {
      const рз = await замер();
      if (рз) {
        // В разборе ничего не прыгает: эталон и вариант того же размера, срез в допуске, кнопка под палец и в окне.
        // Карточку эталона сравниваем всегда; рисунок — только если он есть в обоих замерах: у «Памяти»
        // после показа на месте фигуры знак «?» той же величины, а в разборе фигура возвращается.
        const прыжок = Math.abs(рз.карточка - r.карточка) > 1 || Math.abs(рз.вариант - r.вариант) > 1
          || Math.abs((рз.вариантX ?? 0) - (r.вариантX ?? 0)) > 1
          || (рз.эталон > 0 && r.эталон > 0 && Math.abs(рз.эталон - r.эталон) > 1);
        const кнопкаПлохо = !рз.кнопка || рз.кнопка.h < 44 || рз.кнопка.внеОкна || рз.кнопка.рвётся;
        const okР = (рз.срез ?? 0) <= ДОПУСК && !прыжок && !кнопкаПлохо;
        if (!okР) плохо++;
        строки.push({ size, раунд, разбор: true, ...рз, ok: okР });
        console.log(`${size} раунд ${раунд} «${рз.вид}» РАЗБОР: срез эталона ${рз.срез} px · карточка ${r.карточка} → ${рз.карточка} · ряд x ${r.вариантX} → ${рз.вариантX} · эталон ${рз.эталон} · вариант ${рз.вариант} · кнопка ${рз.кнопка ? `${рз.кнопка.h} px${рз.кнопка.внеОкна ? ' ВНЕ ОКНА' : ''}${рз.кнопка.рвётся ? ' ТЕКСТ РВЁТСЯ' : ''}` : 'нет'}${okР ? '' : '  ❌'}`);
      }
      await дальше.first().click().catch(() => {});
    }
    await p.waitForTimeout(900);
  }
  if (ошибки.length) { плохо++; console.log(`${size}: ошибки страницы — ${ошибки.join(' | ')}`); }
  await ctx.close();
}
await b.close();
const разборов = строки.filter((s) => s.разбор).length;
console.log(плохо ? `❌ Нарушений: ${плохо} из ${строки.length} замеров (разборов ${разборов}).` : `✅ Эталон виден целиком и не мельче варианта: ${строки.length} замеров на ${SIZES.length} окнах, из них разборов ${разборов}.`);
process.exit(плохо ? 1 : 0);
