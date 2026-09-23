/* psygames-memory-hearing-acceptance · VER 1 · 23.09.2026 */
/**
 * ПРИЁМКА РАЗДЕЛА «ПАМЯТЬ И СЛУХ» ЗАМЕРОМ — задачи 6bf8bfec и 1dc61877 одним проходом.
 *
 * Решение Дениса 16.09.2026: игра проходит приёмку, если у неё СВОЯ справка, есть кнопки
 * и клавиатура там, где игра их требует, курсор, где нужен, и ряд управления ВНИЗУ ПОД ПОЛЕМ.
 * Не прошла хоть один пункт — в выпуск не едет.
 *
 * 🦥 ПРИБОР НЕ НАПИСАН С НУЛЯ: это `scripts/sorting-acceptance.mjs` (VER 2, чат «Сортировки»,
 * 16.09.2026) — тот же канон, та же таблица, те же грабли уже обойдены (настоящая мышь вместо
 * el.click(), обрез ряда по ОБЕИМ осям, диагонали крестовины). Изменены список игр и добавлены
 * три замера, которых у соседей нет, потому что у них нет звука:
 *
 *   · ПОВТОР ЗВУКА — в слуховом упражнении это часть правила, а не украшение. Мерим: есть ли
 *     орган повтора, его размер и доступен ли он (не disabled) в момент ответа.
 *   · ОТВЕТ ТАПОМ ПО ПОЛЮ — Денис 16.09: «многие сделали тухло через кнопки снизу, будто
 *     адаптировали компьютерную версию». Мерим: сколько нажимаемых целей ВНУТРИ поля против
 *     числа кнопок в нижнем ряду.
 *   · ПЕРЕПОЛНЕНИЕ ПОЛЯ (задача 1dc61877, жалоба Дениса «игры ездят») — у прокручиваемого узла
 *     scrollHeight − clientHeight и чей это узел: каркасный `scrollableField` или свой ScrollView
 *     экрана. Своя прокрутка внутри партии и есть «езда под пальцем».
 *
 * 🔴 ПУСТАЯ КЛЕТКА = НЕ ИЗМЕРЕНО, А НЕ «НЕ НУЖНО» — правило оставлено как у соседей.
 *
 * Запуск (по статике, не по Metro):
 *   cd frontend && npx expo export -p web && node scripts/serve-dist.mjs --port=8233 &
 *   node scripts/memory-hearing-acceptance.mjs --base=http://127.0.0.1:8233/psygames-web
 *   node scripts/memory-hearing-acceptance.mjs --view=360x640 --shots
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']),
);
const BASE = (args.base ?? 'http://127.0.0.1:8233/psygames-web').replace(/\/$/, '');
const OUT = args.out ?? `${process.env.HOME}/dev/psygames/memory-hearing-chat/приёмка-2026-09-23/${args.view ?? '390x844'}`;
const ONLY = args.only ? args.only.split(',').map((s) => s.trim().toLowerCase()) : null;
const [ШИР, ВЫС] = (args.view ?? '390x844').split('x').map(Number);
const VIEW = { width: ШИР, height: ВЫС };

/** Десять экранов раздела: пять «Мнемотехник» и пять «Слуха» (состав из STRUCTURE.md, 23.09.2026). */
const СВОИ = [
  ['Мнемоника: порядок', '/games/mnemonics'],
  ['Дворец памяти', '/games/memory-palace'],
  ['Лица и имена', '/games/faces-names'],
  ['Пары слов: память', '/games/word-pairs'],
  ['Прочти эмоцию', '/games/rmet'],
  ['Фонемы: пары', '/games/phoneme-pairs'],
  ['Тоны китайского', '/games/chinese-tones'],
  ['Эхо: псевдослова', '/games/pseudoword-echo'],
  ['Диктант', '/games/dictation'],
  ['Ритм и высота', '/games/rhythm-pitch'],
].map(([имя, route]) => ({ id: route.split('/').pop(), имя, route: `${route}?auto=1` }));

let ИГРЫ = [...СВОИ];
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

/**
 * 🔴 ВХОД В ПАРТИЮ ПРОВЕРЯЕТСЯ, А НЕ ПРЕДПОЛАГАЕТСЯ — VER 1 на этом соврала.
 *
 * Первая редакция (взята у «Сортировок») шла в партию только когда на экране видна карта
 * уровней. У «Дворца памяти» и «Ритма» первая фаза партии — ОБЪЯСНЕНИЕ ПРИЁМА, карты там нет,
 * и прибор решал, что уже в партии. Замер 23.09.2026 на 360×640: он снял «кнопки 1: Заново,
 * повтор 0» с экрана объяснения и выдал это за приёмку четырёх игр. Кадры показали правду.
 *
 * Теперь: ищем кнопку продолжения ВЕЗДЕ (включая то, что лежит за нижним краем — прокручиваем
 * к ней), жмём настоящей мышью, и каждое нажатие пишем в отчёт. Само по себе «пришлось
 * прокручивать» — уже находка приёмки: орган управления недостижим без прокрутки.
 */
const ВПЕРЁД = /^(Начать|Играть|Дальше|Продолжить|Запомнить|Поехали|Готов|Запустить|Start|Play|Next|Continue)/i;
/**
 * ⚠️ «НАЧАТЬ ЗАНОВО» — НЕ ШАГ ВПЕРЁД, А ШАГ НАЗАД. VER 1 этого не различала: у «Лиц и имён»
 * она жала «Начать изучение» → «Начать заново» → «Начать изучение» → «Начать заново» и
 * возвращалась на тот же экран, а числа снимала с объяснения, выдавая их за партию.
 * Замер 23.09.2026, 360×640, поймано кадром.
 */
const НАЗАД = /заново|restart|сначала|выйти|назад/i;

async function шагВперёд(page) {
  return page.evaluate(({ src, назадSrc }) => {
    const rx = new RegExp(src, 'iu');
    const кн = [...document.querySelectorAll('[role="button"], button')]
      .map((e) => ({ e, t: (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.t && rx.test(x.t) && !new RegExp(назадSrc, 'iu').test(x.t) && x.e.getBoundingClientRect().width > 40);
    if (!кн.length) return null;
    const { e, t } = кн[0];
    const было = e.getBoundingClientRect();
    const заКраем = было.bottom > innerHeight || было.top < 0;
    if (заКраем) e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { t: t.slice(0, 20), заКраем, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, { src: ВПЕРЁД.source, назадSrc: НАЗАД.source });
}

async function вПартию(page) {
  const шаги = [];
  for (let i = 0; i < 4; i++) {
    const ц = await шагВперёд(page);
    if (!ц) break;
    await page.mouse.click(ц.x, ц.y);
    шаги.push(ц.заКраем ? `${ц.t} (за краем, пришлось прокрутить)` : ц.t);
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
/** Орган повтора звука: своё для раздела. */
const ПОВТОР = /повтор|прослушать|ещё раз|Play again|Repeat|Listen again/i;

/** Прокручиваемый узел партии: кто именно двигается под пальцем и на сколько. */
const ПЕРЕПОЛНЕНИЕ = () => {
  const узлы = [...document.querySelectorAll('*')].filter((e) => {
    const s = getComputedStyle(e);
    return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2;
  }).map((e) => ({
    лишних: e.scrollHeight - e.clientHeight,
    каркасный: !!e.closest('[data-testid="game-field"]'),
    testid: e.getAttribute('data-testid') || e.parentElement?.getAttribute('data-testid') || '',
    высота: e.clientHeight,
  })).sort((a, b) => b.лишних - a.лишних);
  return узлы[0] ?? null;
};

/** Цели ответа ВНУТРИ поля против кнопок нижнего ряда. */
const ЦЕЛИ_В_ПОЛЕ = () => {
  const поле = document.querySelector('[data-testid="game-field"]');
  if (!поле) return null;
  const r = поле.getBoundingClientRect();
  const внутри = [...поле.querySelectorAll('[role="button"], button')].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width > 24 && b.height > 24;
  });
  return { всего: внутри.length, высотаПоля: Math.round(r.height) };
};

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

console.log(`\nПРИЁМКА «ПАМЯТЬ И СЛУХ» · окно ${VIEW.width}×${VIEW.height} · игр ${ИГРЫ.length}\n`);
const строки = [];

for (const г of ИГРЫ) {
  process.stdout.write(`▶ ${г.имя.padEnd(22)} `);
  const р = { имя: г.имя, id: г.id, справка: null, справкаN: null, кнопки: null, клава: null, курсор: null, ряд: null, повтор: null, вполе: null, переполнение: null, вход: null, фаза: null, беда: null };
  try {
    await page.goto(BASE + г.route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(кнопок, null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await устойчиво(page);
    await погаситьПодсказку(page);
    р.вход = (await вПартию(page)).join(' → ') || 'сразу в партии';

    if (КАРТА.test(await page.evaluate(текст))) { р.беда = 'в партию не зашёл'; строки.push(р); console.log('🔴 в партию не зашёл'); continue; }

    /* 🔴 ЧТО ИМЕННО ПОМЕРЕНО: первые слова экрана. Без этого неверный замер молчит. */
    р.фаза = (await page.evaluate(() => {
      const поле = document.querySelector('[data-testid="game-field"]');
      return ((поле || document.body).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    }));

    /* ── органы на экране партии ── */
    const { все, окно } = await page.evaluate(ОРГАНЫ);
    const низПоля = окно.h;
    const служебные = все.filter((b) => СЛУЖЕБНЫЕ.test(b.t));
    const стрелки = все.filter((b) => СТРЕЛКА.test(b.t) || ПОВОРОТ.test(b.t));
    const знаки = все.filter((b) => ЦИФРА.test(b.t));

    р.кнопки = служебные.length ? `${служебные.length}: ${служебные.map((b) => b.t).join('/')}`.slice(0, 60) : '0';
    р.клава = знаки.length ? `${знаки.length} знак.` : '0';
    р.курсор = стрелки.length ? `${стрелки.length}: ${стрелки.map((b) => b.t).join('/')}`.slice(0, 40) : '0';

    /* ── своё для раздела: повтор звука, ответ тапом, переполнение ── */
    const повторы = все.filter((b) => ПОВТОР.test(b.t));
    р.повтор = повторы.length
      ? повторы.map((b) => `${b.t.slice(0, 18)} ${b.w}×${b.h}`).join(' + ').slice(0, 48)
      : '0';
    const цели = await page.evaluate(ЦЕЛИ_В_ПОЛЕ);
    р.вполе = цели ? `${цели.всего} в поле ${цели.высотаПоля}px` : 'поля game-field нет';
    const пере = await page.evaluate(ПЕРЕПОЛНЕНИЕ);
    р.переполнение = пере
      ? `${пере.лишних} px (${пере.каркасный ? 'каркас' : '🔴 свой'}${пере.testid ? ' ' + пере.testid : ''})`
      : '0';

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
    console.log(`вход: ${р.вход} · экран «${р.фаза?.slice(0, 34)}» · кнопки ${р.кнопки.split(':')[0]} · повтор ${р.повтор} · в поле ${р.вполе} · переполнение ${р.переполнение} · справка ${р.справкаN ?? '—'} · ${р.ряд}`);
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
console.log(`${кол('игра', 20)}│${кол('справка', 8)}│${кол('кнопки', 26)}│${кол('повтор звука', 26)}│${кол('ответ в поле', 17)}│${кол('переполнение', 18)}│ряд под полем`);
for (const р of строки) {
  console.log(`${кол(р.имя, 20)}│${кол(р.справкаN ? `${р.справкаN} зн.` : '—', 8)}│${кол(р.кнопки, 26)}│${кол(р.повтор, 26)}│${кол(р.вполе, 17)}│${кол(р.переполнение, 18)}│${р.беда ?? р.ряд}`);
}

await fs.writeFile(path.join(OUT, 'приёмка.json'), JSON.stringify(строки, null, 2));
console.log(`\nманифест: ${path.join(OUT, 'приёмка.json')}`);
await browser.close();
