/* sort-tap-shots · VER 2 · 16.09.2026 */
/**
 * КАДР-ДОКАЗАТЕЛЬСТВО: ОДИНАКОВЫЕ ПОДРЯД ПЕРЕНОСЯТСЯ ТОЛЬКО ВМЕСТЕ.
 *
 * Решение Дениса 16.09.2026: «если две или несколько одинаковых в сосуде
 * последовательно — переносятся они вместе только, а не что таскаем по 1 шт».
 * Ядро сторожит гейт `water-sort-strict-pour`; этот прибор доказывает ЭКРАН.
 *
 * 🔴 VER 1 СТОЯЛА НА ЛОЖНОЙ ПРЕМИСЕ, И ЭТО ЗАПИСАНО, А НЕ ТИХО ИСПРАВЛЕНО.
 * Шапка первой редакции утверждала: «расклад уровня детерминирован, второй
 * заход видит ту же доску». Замер опроверг: два захода на L40 дали разные
 * метки гаек, и нажатия по координатам из первого кадра попали в чужую доску
 * (счётчик ходов остался 0/48). Раздача зависит не только от уровня.
 *
 * ПОЭТОМУ ТЕПЕРЬ ВСЁ В ОДНОМ СЕАНСЕ, И ДОСКА ЧИТАЕТСЯ ИЗ DOM. У каждого сосуда
 * есть подпись доступности — метки порций СНИЗУ ВВЕРХ («? ▲ ✱ ▼ ▼»: сверху два
 * ▼). Прибор находит источник с верхним рядом от двух одинаковых и законную
 * цель (пустой сосуд или сосуд с той же меткой сверху и местом), жмёт, снимает
 * кадры «до» и «после» и СВЕРЯЕТ ПО ПОДПИСЯМ, сколько порций ушло.
 *
 *   node scripts/sort-tap-shots.mjs --base=http://127.0.0.1:8236/psygames-web --game=nut-sort --level=40
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const BASE = (args.base ?? 'http://127.0.0.1:8236/psygames-web').replace(/\/$/, '');
const GAME = args.game ?? 'nut-sort';
const ID = GAME.replace('-', '_');
const LEVEL = args.level ?? '40';
const OUT = args.out ?? `${process.env.HOME}/dev/psygames/sorting-chat/art/shots/вместе`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await fs.mkdir(OUT, { recursive: true });
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.evaluate(([id, lv]) => {
  localStorage.setItem('language', 'ru'); localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999'); localStorage.setItem('psygames_first_run_done', '1');
  localStorage.setItem(`psygames_${id}_level_odv999`, lv);
}, [ID, LEVEL]);
await p.goto(`${BASE}/games/${GAME}?auto=1`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
for (let i = 0; i < 3; i++) {
  const к = await p.evaluate(() => {
    if (!/Уровень\s*\d+\s*\/\s*\d+/i.test(document.body.innerText || '')) return null;
    const плохо = /Назад|Выход|Справк|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила/i;
    const c = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').trim(), r: e.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t))
      .sort((a, z) => z.r.width * z.r.height - a.r.width * a.r.height)[0];
    return c ? { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2 } : null;
  });
  if (!к) break;
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(2200);
}

/*
 * ⚠️ ОКНО ПРАВИЛА УРОВНЯ ВСПЛЫВАЕТ С ЗАДЕРЖКОЙ И ГЛОТАЕТ НАЖАТИЯ.
 * 📍 Заход 16.09.2026 на L40: прибор нашёл ряд ✦✦ и жал по стержням, а поверх
 * доски уже стояло окно «⚡ / ПОНЯТНО» — ход не случился, счётчик 0/48, и вывод
 * «перенесено 0 из 2» читался бы как нарушение правила, которого не было.
 * Ждём и гасим окно ДО чтения доски.
 */
await p.waitForTimeout(1800);
for (let i = 0; i < 4; i++) {
  const к = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[role="button"], button')].find((x) => /^(понятно|продолжить|ясно|ok)$/i.test((x.innerText || x.getAttribute('aria-label') || '').trim()));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!к) break;
  await p.mouse.click(к.x, к.y); await p.waitForTimeout(800);
}

/** Сосуды поля: подпись (метки снизу вверх) и центр. */
const сосуды = () => p.evaluate(() => {
  const box = document.querySelector('[data-testid="sort-field-box"]');
  if (!box) return [];
  return [...box.querySelectorAll('[role="button"], [tabindex]')].map((e) => {
    const r = e.getBoundingClientRect();
    /*
     * ⚠️ ПУСТОЙ СОСУД ПОДПИСАН СЛОВАМИ («Пустой стержень»), А НЕ МЕТКАМИ. Первая
     * редакция разбивала подпись по пробелам и считала пустой стержень сосудом
     * из двух порций — и честно не находила ни одной пустой цели. Метка порции —
     * один знак (или «?»), поэтому всё, что длиннее двух символов, — не порция.
     */
    const токены = (e.getAttribute('aria-label') || '').trim().split(/\s+/).filter(Boolean);
    const метки = токены.every((т) => [...т].length <= 2) ? токены : [];
    return { метки, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height };
  }).filter((q) => q.w > 30 && q.h > 80);
});
const верхнийРяд = (м) => { if (!м.length || м[м.length - 1] === '?') return 0; let n = 1; for (let i = м.length - 2; i >= 0 && м[i] === м[м.length - 1]; i--) n++; return n; };
const шапка = () => p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40));

const до = await сосуды();
if (args.dump) { до.forEach((с, n) => console.log(`  #${n} (${с.x},${с.y}) подпись: [${с.метки.join(' ')}]`)); }
const вместимость = Math.max(...до.map((с) => с.метки.length));
console.log(`${GAME} · L${LEVEL} · сосудов ${до.length}, вместимость по самому полному ${вместимость} · шапка «${await шапка()}»`);

/* Источник — ряд от двух; цель — пустой сосуд либо та же метка сверху с местом ≥ ряда. */
let ход = null;
for (const [i, с] of до.entries()) {
  const k = верхнийРяд(с.метки);
  if (k < 2) continue;
  const метка = с.метки[с.метки.length - 1];
  const j = до.findIndex((ц, jj) => jj !== i && (
    (ц.метки.length && ц.метки[ц.метки.length - 1] === метка && вместимость - ц.метки.length >= k)
    || (!ц.метки.length && k < с.метки.length)));
  if (j >= 0) { ход = { i, j, k, метка }; break; }
}
/*
 * ПОСТРОЕНИЕ РЯДА, ЕСЛИ ГОТОВОГО НЕТ. На свежей раздаче сверху почти всегда
 * одиночки. Ищем сосуд, у которого под одиночной верхней порцией лежит ряд от
 * двух одинаковых: снимаем одиночку на пустой сосуд — ряд оказывается сверху.
 * Нужны два пустых: один под одиночку, второй — цель для ряда.
 */
if (!ход) {
  const пустые = до.map((с, n) => (с.метки.length ? -1 : n)).filter((n) => n >= 0);
  for (const [i, с] of до.entries()) {
    const м = с.метки;
    if (м.length < 3 || пустые.length < 2 || верхнийРяд(м) !== 1) continue;
    const ниже = м.slice(0, -1);
    const k = верхнийРяд(ниже);
    if (k >= 2 && k < ниже.length) { ход = { i, j: пустые[1], k, метка: ниже[ниже.length - 1], подготовка: пустые[0] }; break; }
  }
  if (ход) {
    console.log(`  готового ряда нет — строю: снимаю одиночку «${до[ход.i].метки.at(-1)}» с #${ход.i} на пустой #${ход.подготовка}`);
    await p.mouse.click(до[ход.i].x, до[ход.i].y); await p.waitForTimeout(450);
    await p.mouse.click(до[ход.подготовка].x, до[ход.подготовка].y); await p.waitForTimeout(1200);
    const сейчас = await сосуды();
    console.log(`  после подготовки: #${ход.i} [${сейчас[ход.i].метки.join(' ')}] · #${ход.подготовка} [${сейчас[ход.подготовка].метки.join(' ')}]`);
    до.splice(0, до.length, ...сейчас);
    if (верхнийРяд(до[ход.i].метки) !== ход.k) { console.log('🔴 подготовка не открыла ряд — смотреть кадр'); ход = null; }
  }
}
if (!ход) { console.log('🔴 на этой раздаче не из чего собрать ряд от двух — перезапустить'); await b.close(); process.exit(2); }

console.log(`  источник #${ход.i} [${до[ход.i].метки.join(' ')}] — сверху ${ход.k}×${ход.метка}`);
console.log(`  цель     #${ход.j} [${до[ход.j].метки.join(' ') || 'пусто'}]`);
await fs.writeFile(path.join(OUT, `${GAME}-L${LEVEL}-до.png`), await p.screenshot({ type: 'png' }));
await p.mouse.click(до[ход.i].x, до[ход.i].y); await p.waitForTimeout(450);
await p.mouse.click(до[ход.j].x, до[ход.j].y); await p.waitForTimeout(1200);
await fs.writeFile(path.join(OUT, `${GAME}-L${LEVEL}-после.png`), await p.screenshot({ type: 'png' }));

const после = await сосуды();
const ушлоИз = до[ход.i].метки.length - после[ход.i].метки.length;
const пришлоВ = после[ход.j].метки.length - до[ход.j].метки.length;
console.log(`  после: источник [${после[ход.i].метки.join(' ')}] · цель [${после[ход.j].метки.join(' ')}] · шапка «${await шапка()}»`);
console.log(`  ушло из источника ${ушлоИз}, пришло в цель ${пришлоВ}, ряд был ${ход.k}`);
console.log(ушлоИз === ход.k && пришлоВ === ход.k ? `🟢 ряд из ${ход.k} перенесён ОДНИМ ходом целиком` : `🔴 перенесено ${пришлоВ} из ${ход.k} — правило «только вместе» не соблюдено`);
await b.close();
