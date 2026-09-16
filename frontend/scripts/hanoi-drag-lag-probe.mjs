/* hanoi-drag-lag-probe · VER 4 · 16.09.2026 */
/**
 * «ПЕРЕТАСКИВАНИЕ ЛАГАЕТ» — ЗАМЕР, А НЕ ОЩУЩЕНИЕ. Задача 45d479ed, пункт (а), дословно:
 * «DragandDrop… вроде работает, но лагает».
 *
 * ЧТО МЕРИТСЯ. Настоящие касания (CDP Input.dispatchTouchEvent), процессор замедлен
 * в `--cpu` раз (по умолчанию 4 — порядок телефона против настольного Chromium). Палец
 * берёт верхний диск левого стержня и ведёт его до правого и обратно, отпускает над
 * исходным (хода нет). Внутри страницы на каждом кадре (requestAnimationFrame):
 *   · где палец (последний touchmove) и где нарисован диск в руке → отставание, точки;
 *   · сколько прошло с прошлого кадра → выпавшие кадры (> 25 мс);
 *   · длинные задачи главного потока (PerformanceObserver longtask).
 * И отдельно — вычисленный `touch-action` у поля и его предков: если браузер вправе
 * толковать протяжку как прокрутку, «лаг» — это спор двух жестов, а не медленный код.
 *
 *   node scripts/hanoi-drag-lag-probe.mjs --base=http://127.0.0.1:8237/psygames-web [--cpu=4] [--steps=120] [--engine=webkit]
 *
 * ⚠️ `--engine=webkit` — движок Safari и WKWebView, на котором собрано приложение для iPhone.
 * У WebKit в Playwright нет касаний через CDP и замедления процессора: жест ведётся мышью
 * (ответчик RNW принимает и её), процессор — как есть. Числа двух движков не складывать.
 */
import { chromium, webkit } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = (args.base ?? 'http://127.0.0.1:8237/psygames-web').replace(/\/$/, '');
const CPU = Number(args.cpu ?? 4);
const ШАГОВ = Number(args.steps ?? 120);
const ПАУЗА = Number(args.interval ?? 16);
const WEBKIT = args.engine === 'webkit';

const b = await (WEBKIT ? webkit : chromium).launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: !WEBKIT, isMobile: !WEBKIT });
const p = await ctx.newPage();
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => {
  localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999'); localStorage.setItem('psygames_first_run_done', '1');
});
await p.goto(`${BASE}/games/hanoi?auto=1`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    if (!/Уровень\s*\d+\s*\/\s*\d+|Начать/i.test(document.body.innerText || '')) return null;
    const плохо = /Назад|Выход|Справк|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила|Рекорд|Таблица/i;
    const c = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t))
      .sort((a, z) => z.r.width * z.r.height - a.r.width * a.r.height)[0];
    return c ? { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2 } : null;
  });
  if (!к) break;
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(2000);
}
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[role="button"], button')].find((x) => /^(Понятно|Продолжить)$/i.test((x.innerText || '').trim()));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!к) break; await p.mouse.click(к.x, к.y); await p.waitForTimeout(700);
}

const стержни = await p.evaluate(() => [...document.querySelectorAll('[role="button"], button')]
  .map((e) => ({ r: e.getBoundingClientRect() }))
  .filter((x) => x.r.height > 150 && x.r.width > 60 && x.r.top > 110)
  .map((x) => ({ x: Math.round(x.r.left + x.r.width / 2), y: Math.round(x.r.top + x.r.height * 0.6) }))
  .sort((a, z) => a.x - z.x));
if (стержни.length !== 3) { console.log(`🔴 стержней ${стержни.length}, ожидал 3 — не измерено`); await b.close(); process.exit(1); }

/* Кто вправе толковать протяжку как прокрутку: touch-action от стержня вверх до body. */
const касание = await p.evaluate(({ x, y }) => {
  const out = [];
  for (let e = document.elementFromPoint(x, y); e && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.touchAction !== 'auto' || /(auto|scroll)/.test(cs.overflowY)) out.push(`${e.getAttribute('data-testid') || e.tagName.toLowerCase()}:${cs.touchAction}/${cs.overflowY}`);
  }
  return out;
}, стержни[0]);

await p.evaluate(() => {
  const w = window;
  w.__лаг = { кадры: [], длинных: 0, длинныхМс: 0, палец: null, слой: null };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { w.__лаг.длинных += 1; w.__лаг.длинныхМс += e.duration; } })
      .observe({ type: 'longtask', buffered: false });
  } catch { /* longtask не везде */ }
  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (t) w.__лаг.палец = { x: t.clientX, y: t.clientY };
  }, { capture: true, passive: true });
  document.addEventListener('mousemove', (e) => { w.__лаг.палец = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
  let прошлый = 0;
  const кадр = (ts) => {
    const л = w.__лаг;
    if (л.идёт) {
      if (!л.слой || !л.слой.isConnected) {
        /* ⚠️ Слой узнаётся по СОДЕРЖИМОМУ — номеру диска. Первая редакция брала первый сдвинутый
         * элемент без касаний и до захвата цеплялась за круглую кнопку 56×56 внизу экрана: весь
         * жест мерился отставание от неё, «105 точек» при диске ровно под пальцем. */
        л.слой = [...document.querySelectorAll('div')].find((d) => d.style.transform && /translate/.test(d.style.transform)
          && getComputedStyle(d).pointerEvents === 'none' && /^\d+$/.test((d.innerText || '').trim())) || null;
      }
      let отставание = null;
      if (л.слой && л.палец) {
        const r = (л.слой.firstElementChild || л.слой).getBoundingClientRect();
        отставание = Math.abs(r.left + r.width / 2 - л.палец.x);
      }
      л.кадры.push({ dt: прошлый ? ts - прошлый : 0, отставание, фаза: л.фаза });
    }
    прошлый = ts;
    requestAnimationFrame(кадр);
  };
  requestAnimationFrame(кадр);
});

const cdp = WEBKIT ? null : await ctx.newCDPSession(p);
if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const touch = async (type, x, y) => {
  if (cdp) return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  if (type === 'touchStart') { await p.mouse.move(x, y); return p.mouse.down(); }
  if (type === 'touchMove') return p.mouse.move(x, y);
  return p.mouse.up();
};
const [с0, , с2] = стержни;
/* КОНТРОЛЬ: те же кадры в покое, до касания. Без него 30 кадров в секунду на жесте нельзя
 * отличить от «движок так рисует всегда». */
await p.evaluate(() => { window.__лаг.фаза = 'покой'; window.__лаг.идёт = true; });
await p.waitForTimeout(1500);
await p.evaluate(() => { window.__лаг.фаза = 'жест'; });
const т0 = Date.now();
await touch('touchStart', с0.x, с0.y);
for (let i = 1; i <= ШАГОВ; i += 1) {
  const доля = i <= ШАГОВ / 2 ? i / (ШАГОВ / 2) : 2 - i / (ШАГОВ / 2);
  await touch('touchMove', Math.round(с0.x + (с2.x - с0.x) * доля), с0.y - 40);
  await new Promise((r) => setTimeout(r, ПАУЗА));
}
await touch('touchEnd', с0.x, с0.y - 40);
const мсЖеста = Date.now() - т0;
await p.waitForTimeout(600);
if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const л = await p.evaluate(() => { const x = window.__лаг; x.идёт = false; return { кадры: x.кадры, длинных: x.длинных, длинныхМс: Math.round(x.длинныхМс), слой: !!x.слой }; });

const покой = л.кадры.filter((k) => k.фаза === 'покой').map((k) => k.dt).filter((d) => d > 0);
const dts = л.кадры.filter((k) => k.фаза === 'жест').map((k) => k.dt).filter((d) => d > 0);
const отст = л.кадры.map((k) => k.отставание).filter((d) => d !== null);
const q = (a, f) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const ср = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
console.log(`ЛАГ ПЕРЕТАСКИВАНИЯ · hanoi · ${WEBKIT ? 'WebKit, мышь, процессор как есть' : `Chromium, касания, процессор ×${CPU}`} · шагов ${ШАГОВ} через ${ПАУЗА} мс · жест ${мсЖеста} мс`);
console.log(`  touch-action по пути вверх: ${касание.join(' → ') || 'везде auto'}`);
console.log(`  ПОКОЙ (контроль): кадров ${покой.length} · средний ${ср(покой).toFixed(1)} мс · p95 ${q(покой, 0.95).toFixed(1)} · выпавших (>25 мс) ${покой.filter((d) => d > 25).length}`);
console.log(`  ЖЕСТ: кадров ${dts.length} · средний ${ср(dts).toFixed(1)} мс · p95 ${q(dts, 0.95).toFixed(1)} · худший ${Math.max(...dts).toFixed(1)} · выпавших (>25 мс) ${dts.filter((d) => d > 25).length}`);
console.log(`  длинных задач ${л.длинных} на ${л.длинныхМс} мс`);
console.log(`  диск в руке: ${отст.length ? `найден в ${отст.length} кадрах из ${л.кадры.length}` : '🔴 НЕ НАЙДЕН ни в одном кадре — отставание не измерено'} · отставание от пальца: среднее ${ср(отст).toFixed(1)} точек · p95 ${q(отст, 0.95).toFixed(1)} · худшее ${отст.length ? Math.max(...отст).toFixed(1) : '—'}`);
await b.close();
