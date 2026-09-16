/* sorting-acceptance · VER 2 · 16.09.2026 */
/**
 * ПРИЁМКА РАЗДЕЛА «СОРТИРОВКИ» ЗАМЕРОМ, А НЕ ГЛАЗАМИ.
 *
 * Решение Дениса 16.09.2026 (задача 098d4830): игра проходит приёмку, если у неё
 * есть СВОЯ справка, есть кнопки и клавиатура там, где игра их требует, есть
 * курсор, где нужен, и ряд управления ВНИЗУ ПОД ПОЛЕМ. Не прошла хоть один
 * пункт — в выпуск не едет.
 *
 * 🔴 ПУСТАЯ КЛЕТКА = НЕ ИЗМЕРЕНО, А НЕ «НЕ НУЖНО». Поэтому каждая клетка тут —
 * число или строка с экрана; там, где прибор до значения не добрался, пишется
 * «—» и это читается как провал замера, а не как «игре не нужно».
 *
 * КАК МЕРИТСЯ КАЖДЫЙ ПУНКТ:
 * · СВОЯ СПРАВКА — открываем «Правила», берём текст. Своя ⇔ текст НЕ СОВПАДАЕТ с
 *   текстом другой игры раздела. Сравнение попарное по всем 17: одинаковый текст
 *   у двух игр — это ровно та жалоба, с которой пришёл тестировщик («подсказка
 *   говорит про пробирки, когда на поле гайки», задача 44e6cd21).
 * · КНОПКИ — служебные органы под полем: их число и подписи.
 * · КЛАВА — панель ввода знаков (цифры/буквы) на экране партии.
 * · КУРСОР — органы направления (стрелки, крест, поворот).
 * · РЯД ПОД ПОЛЕМ — есть ли он и ВЛЕЗ ЛИ ЦЕЛИКОМ: низ ряда против низа окна.
 *   Ряд, уехавший под обрез, формально есть, а игроку недоступен.
 *
 * ⚠️ ЖМЁМ НАСТОЯЩЕЙ МЫШЬЮ. Синтетический `el.click()` RNW-обработчик не будит —
 * записано в памяти; проба вышла бы зелёной на мёртвом экране.
 *
 * Запуск:
 *   node scripts/sorting-acceptance.mjs --base=http://127.0.0.1:8233/psygames-web
 *   node scripts/sorting-acceptance.mjs --only=bridges,same-game --shots
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = (args.base ?? 'http://127.0.0.1:8233/psygames-web').replace(/\/$/, '');
const OUT = args.out ?? `${process.env.HOME}/dev/psygames/sorting-chat/art/shots/приёмка`;
const ONLY = args.only ? args.only.split(',').map((s) => s.trim().toLowerCase()) : null;
const VIEW = { width: 390, height: 844 };

/** 8 карточек хаба + 9 головоломок Тэтхэма = 17 игр раздела (состав на 16.09.2026). */
const СВОИ = [
  ['Сортировка товаров', '/games/goods-sort'],
  ['Переливалка', '/games/water-sort'],
  ['Шарики', '/games/ball-sort'],
  ['Гайки', '/games/nut-sort'],
  ['Торты', '/games/cake-sort'],
  ['Пицца', '/games/pizza-sort'],
  ['Ханойская башня', '/games/hanoi'],
  ['Лондонская башня', '/games/tower-london'],
].map(([имя, route]) => ({ id: route.split('/').pop(), имя, route: `${route}?auto=1` }));

const ГОЛОВОЛОМКИ = [
  ['Мосты', 'Bridges'], ['Снос групп', 'Same Game'], ['Колышки', 'Pegs'],
  ['Заливка', 'Flood'], ['Указатели', 'Signpost'], ['Инерция', 'Inertia'],
  ['Замкнутая петля', 'Loopy'], ['Жемчужная петля', 'Pearl'], ['Рельсы', 'Train Tracks'],
].map(([имя, mode]) => ({
  id: String(mode).toLowerCase().replace(/\s+/g, '-'),
  имя, mode,
  route: `/games/puzzles?mode=${encodeURIComponent(mode)}&auto=1`,
}));

let ИГРЫ = [...СВОИ, ...ГОЛОВОЛОМКИ];
if (ONLY) ИГРЫ = ИГРЫ.filter((г) => ONLY.some((o) => г.id.includes(o)));

const кнопок = () => document.querySelectorAll('[role="button"], button').length;
const текст = () => (document.body.innerText || '').replace(/\s+/g, ' ').trim();

/** Что на экране партии: подписи кнопок с их местом, чтобы отличить ряд от шапки. */
const ОРГАНЫ = () => {
  const все = [...document.querySelectorAll('[role="button"], button')].map((e) => {
    const r = e.getBoundingClientRect();
    return {
      t: (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim(),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      низ: Math.round(r.bottom), видна: r.width > 4 && r.height > 4,
    };
  }).filter((b) => b.видна);
  return { все, окно: { w: innerWidth, h: innerHeight } };
};

async function устойчиво(page, tries = 14) {
  let prev = -1; let same = 0;
  for (let i = 0; i < tries; i++) {
    const n = await page.evaluate(кнопок);
    if (n === prev) { if (++same >= 2) return n; } else { same = 0; prev = n; }
    await page.waitForTimeout(400);
  }
  return prev;
}

async function жмём(page, re) {
  const т = await page.evaluate((src) => {
    const rx = new RegExp(src, 'iu');
    const el = [...document.querySelectorAll('[role="button"], button')].find((e) => {
      const t = (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim();
      return t && rx.test(t) && e.getBoundingClientRect().width > 4;
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, re.source);
  if (!т) return false;
  await page.mouse.click(т.x, т.y);
  await page.waitForTimeout(800);
  return true;
}

async function погаситьПодсказку(page) {
  for (let i = 0; i < 3; i++) if (!(await жмём(page, /^(Понятно|Got it|Продолжить)$/))) break;
}

const КАРТА = /Уровень\s*\d+\s*\/\s*\d+|Выбери первую игру/i;
async function вПартию(page) {
  const шаги = [];
  for (let i = 0; i < 3 && КАРТА.test(await page.evaluate(текст)); i++) {
    const кн = await page.evaluate(() => {
      const плохо = /Назад|Выход|Справк|Как играть|Пауза|Отмен|Подсказк|Заново|Перемеша|Звук|Настройк|Правила/i;
      const все = [...document.querySelectorAll('[role="button"], button')]
        .map((e) => ({ t: (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim(), r: e.getBoundingClientRect() }))
        .filter((x) => x.t && x.r.width > 60 && x.r.height > 20 && !плохо.test(x.t));
      все.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
      const c = все[0];
      return c ? { x: Math.round(c.r.left + c.r.width / 2), y: Math.round(c.r.top + c.r.height / 2), t: c.t.slice(0, 24) } : null;
    });
    if (!кн) break;
    шаги.push(кн.t);
    await page.mouse.click(кн.x, кн.y);
    await page.waitForTimeout(1500);
    await устойчиво(page);
    await погаситьПодсказку(page);
  }
  return шаги;
}

/* ── признаки органов управления ── */
const СЛУЖЕБНЫЕ = /Отменить|Подсказк|Перемеша|Заново|Начать заново|Undo|Hint|Shuffle|Restart|Сдаться|Решить/i;
/*
 * ⚠️ VER 2: ДИАГОНАЛИ. Крестовина на восемь направлений (`ArrowPad восемь`, «Инерция»)
 * подписывает кнопки «вверх-влево», «вниз-вправо» — через дефис. VER 1 требовала после
 * слова пробел или конец строки и диагоналей не видела: у «Инерции» насчитала 4 стрелки
 * из 8. Прочерк «не нашёл» здесь читался бы как «не нужно», поэтому шаблон расширен.
 */
const СТРЕЛКА = /(^|\s)(Вверх|Вниз|Влево|Вправо|Up|Down|Left|Right|↑|↓|←|→)(-(Влево|Вправо|Left|Right))?(\s|$)|стрелк|Ход вверх|Ход вниз/i;
const ЦИФРА = /^[0-9]$|^[A-Za-zА-Яа-я]$|Цифра|Знак|Стереть|Ластик/;
const ПОВОРОТ = /Повернуть|Поворот|Rotate|Крутить/i;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
await fs.mkdir(OUT, { recursive: true });

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem('language', 'ru');
  localStorage.setItem('psygames_devchat_on', '0');
  localStorage.setItem('psygames_unlocked_themed', JSON.stringify(['odv999']));
  localStorage.setItem('psygames_active_profile', 'odv999');
  localStorage.setItem('psygames_first_run_done', '1');
});

console.log(`\nПРИЁМКА «СОРТИРОВКИ» · окно ${VIEW.width}×${VIEW.height} · игр ${ИГРЫ.length}\n`);
const строки = [];

for (const г of ИГРЫ) {
  process.stdout.write(`▶ ${г.имя.padEnd(22)} `);
  const р = { имя: г.имя, id: г.id, справка: null, справкаN: null, кнопки: null, клава: null, курсор: null, ряд: null, беда: null };
  try {
    await page.goto(BASE + г.route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(кнопок, null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await устойчиво(page);
    await погаситьПодсказку(page);
    await вПартию(page);

    if (КАРТА.test(await page.evaluate(текст))) { р.беда = 'в партию не зашёл'; строки.push(р); console.log('🔴 в партию не зашёл'); continue; }

    /* ── органы на экране партии ── */
    const { все, окно } = await page.evaluate(ОРГАНЫ);
    const низПоля = окно.h;
    const служебные = все.filter((b) => СЛУЖЕБНЫЕ.test(b.t));
    const стрелки = все.filter((b) => СТРЕЛКА.test(b.t) || ПОВОРОТ.test(b.t));
    const знаки = все.filter((b) => ЦИФРА.test(b.t));

    р.кнопки = служебные.length ? `${служебные.length}: ${служебные.map((b) => b.t).join('/')}`.slice(0, 60) : '0';
    р.клава = знаки.length ? `${знаки.length} знак.` : '0';
    р.курсор = стрелки.length ? `${стрелки.length}: ${стрелки.map((b) => b.t).join('/')}`.slice(0, 40) : '0';

    /*
     * Ряд под полем: самая нижняя группа кнопок и влезла ли она в окно.
     *
     * 🔴 ОБРЕЗ МЕРЯЕТСЯ ПО ОБЕИМ ОСЯМ, И ЭТО НЕ ПЕРЕСТРАХОВКА.
     * 📍 Первая редакция смотрела только вниз. Она увидела, что ряд переливалки
     * уехал на 38 точек под низ экрана, обрадовалась починке — а на кадре
     * «Заново» уезжало ЗА ПРАВЫЙ КРАЙ на 68 точек, и прибор об этом молчал.
     * Поймал глаз, а не прибор; значит прибор был слеп. Обрез вбок случается
     * ровно по той же причине (узел не сжимается), поэтому мерить надо обе.
     */
    const нижние = все.filter((b) => b.y > окно.h * 0.55);
    if (!нижние.length) р.ряд = '🔴 ряда под полем НЕТ';
    else {
      const низ = Math.max(...нижние.map((b) => b.низ));
      const верх = Math.min(...нижние.map((b) => b.y));
      const право = Math.max(...нижние.map((b) => b.x + b.w));
      const лево = Math.min(...нижние.map((b) => b.x));
      const внизНа = низ - низПоля;
      const вбокНа = Math.max(право - окно.w, -лево);
      р.ряд = `${нижние.length} кн., ${верх}…${низ} из ${низПоля}`
        + (внизНа > 0 ? ` 🔴 вниз на ${внизНа}` : '')
        + (вбокНа > 0 ? ` 🔴 вбок на ${вбокНа}` : '');
    }

    if (args.shots) await fs.writeFile(path.join(OUT, `${г.id}-поле.png`), await page.screenshot({ type: 'png' }));

    /* ── справка ── */
    const былоДо = await page.evaluate(текст);
    if (await жмём(page, /^(Правила|Справка|Как играть|Rules|Help)$/)) {
      await page.waitForTimeout(1200);
      const т = await page.evaluate(текст);
      if (т !== былоДо) {
        р.справка = т;
        р.справкаN = т.length;
        if (args.shots) await fs.writeFile(path.join(OUT, `${г.id}-справка.png`), await page.screenshot({ type: 'png' }));
      } else р.справка = null;
    }
    console.log(`кнопки ${р.кнопки.split(':')[0]} · клава ${р.клава} · курсор ${р.курсор.split(':')[0]} · справка ${р.справкаN ?? '—'} · ${р.ряд}`);
  } catch (e) {
    р.беда = String(e).slice(0, 80);
    console.log(`🔴 ${р.беда}`);
  }
  строки.push(р);
}

/* ── СВОЯ ЛИ СПРАВКА: попарное сравнение по всем ── */
console.log('\n── СВОЯ ЛИ СПРАВКА (попарное сравнение текстов) ──');
const совпали = [];
for (let i = 0; i < строки.length; i++) {
  for (let j = i + 1; j < строки.length; j++) {
    const a = строки[i]; const b = строки[j];
    if (a.справка && b.справка && a.справка === b.справка) совпали.push(`${a.имя} = ${b.имя}`);
  }
}
console.log(совпали.length ? совпали.map((s) => '  🔴 ' + s).join('\n') : '  🟢 совпадений нет — у каждой игры свой текст');
const безСправки = строки.filter((р) => !р.справка && !р.беда).map((р) => р.имя);
console.log(безСправки.length ? `  🔴 справка не открылась: ${безСправки.join(', ')}` : '  🟢 справка открылась у всех');

/* ── ТАБЛИЦА ── */
const кол = (s, n) => String(s ?? '—').slice(0, n).padEnd(n);
console.log('\n── ТАБЛИЦА ПРИЁМКИ ──');
console.log(`${кол('игра', 22)}│${кол('справка', 9)}│${кол('кнопки', 34)}│${кол('клава', 9)}│${кол('курсор', 22)}│ряд под полем`);
for (const р of строки) {
  console.log(`${кол(р.имя, 22)}│${кол(р.справкаN ? `${р.справкаN} зн.` : '—', 9)}│${кол(р.кнопки, 34)}│${кол(р.клава, 9)}│${кол(р.курсор, 22)}│${р.беда ?? р.ряд}`);
}

await fs.writeFile(path.join(OUT, 'приёмка.json'), JSON.stringify(строки, null, 2));
console.log(`\nманифест: ${path.join(OUT, 'приёмка.json')}`);
await browser.close();
