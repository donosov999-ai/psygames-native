/* psygames-flicker-audit · VER 1 · 04.09.2026 */
/**
 * МЕРЦАНИЕ — ЭТО ТО, ЧТО ШЕВЕЛИТСЯ, КОГДА НИКТО НЕ КАСАЕТСЯ ЭКРАНА.
 *
 * ЗАЧЕМ. Отчёт Вали 04.09: «мерцает всё, и это никак не записать разработчику в
 * окошко». Словами такое не ловится: человек видит движение, но не может назвать
 * место. Скрипт снимает серию кадров НЕПОДВИЖНОГО экрана и печатает, какие участки
 * менялись и в скольких переходах из скольких — дальше правится по координатам, а
 * не по догадке.
 *
 * КАК ЧИТАТЬ. Плитка 16×16 точек. «менялась в 37/49 переходах» = живёт своей жизнью
 * (анимация, таймер, спиннер). Единичные срабатывания — это дорисовка после загрузки.
 *
 * ⚠️ Скрипт НЕ судит, дефект это или задумка: таймер обязан тикать, питомец обязан
 * дышать. Он показывает, ЧТО движется, чтобы дальше смотреть глазами.
 *
 * Запуск (нужен поднятый веб-билд):
 *   cd ~/dev/psygames/frontend && node scripts/flicker-audit.mjs http://127.0.0.1:8127 "/games/sudoku?auto=1" 50 90
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8127';
const ROUTE = process.argv[3] ?? '/games/sudoku?auto=1';
const КАДРОВ = Number(process.argv[4] ?? 50);
const ПАУЗА = Number(process.argv[5] ?? 90);
const ПЛИТКА = 16;

const бр = await chromium.launch();
const стр = await бр.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const консоль = [];
стр.on('console', (м) => консоль.push(`${м.type()}: ${м.text()}`.slice(0, 200)));
стр.on('pageerror', (e) => консоль.push(`pageerror: ${String(e).slice(0, 200)}`));

await стр.goto(BASE, { waitUntil: 'domcontentloaded' });
await стр.evaluate(() => { localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0'); });
await стр.goto(BASE + ROUTE, { waitUntil: 'networkidle' });
await стр.waitForTimeout(2500);

const кадры = [];
const время = [];
for (let i = 0; i < КАДРОВ; i++) {
  время.push(Date.now());
  кадры.push(PNG.sync.read(await стр.screenshot({ type: 'png' })));
  await стр.waitForTimeout(ПАУЗА);
}
await бр.close();

const { width: W, height: H } = кадры[0];
const колонок = Math.ceil(W / ПЛИТКА), строк = Math.ceil(H / ПЛИТКА);
const счёт = new Map(); // "cx,cy" -> сколько раз плитка изменилась между соседними кадрами
for (let k = 1; k < кадры.length; k++) {
  const a = кадры[k - 1].data, b = кадры[k].data;
  const тронуто = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const и = (y * W + x) * 4;
      if (Math.abs(a[и] - b[и]) + Math.abs(a[и+1] - b[и+1]) + Math.abs(a[и+2] - b[и+2]) > 24) {
        тронуто.add(`${(x / ПЛИТКА) | 0},${(y / ПЛИТКА) | 0}`);
      }
    }
  }
  for (const т of тронуто) счёт.set(т, (счёт.get(т) ?? 0) + 1);
}
const топ = [...счёт.entries()].sort((a, b) => b[1] - a[1]);
const переходов = кадры.length - 1;
console.log(`кадров ${кадры.length}, шаг ~${Math.round((время.at(-1) - время[0]) / переходов)} мс, окно ${W}×${H}`);
console.log(`плиток шевелилось: ${топ.length} из ${колонок * строк}`);
for (const [ключ, n] of топ.slice(0, 25)) {
  const [cx, cy] = ключ.split(',').map(Number);
  console.log(`  x=${cx * ПЛИТКА}..${cx * ПЛИТКА + ПЛИТКА} y=${cy * ПЛИТКА}..${cy * ПЛИТКА + ПЛИТКА}  менялась в ${n}/${переходов} переходах`);
}
if (консоль.length) console.log('консоль:', консоль.slice(0, 10).join(' | '));
