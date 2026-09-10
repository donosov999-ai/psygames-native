#!/usr/bin/env node
/* psygames-tatham-bridge-gate · VER 1 · 10.09.2026 */
/**
 * МОСТ К ДВИЖКАМ ТЭТХЭМА ДЕЛАЕТ ТО, РАДИ ЧЕГО ВЗЯТ.
 *
 * Взят он не ради правил головоломок — правила пишутся своими руками за десятки строк.
 * Взят ради двух вещей, и обе проверяются ПОВЕДЕНИЕМ, а не чтением файла:
 *   1) генератор выдаёт доску каждым из двадцати движков;
 *   2) вместе с движком приезжает ЕГО лестница — число авторских ступеней сложности.
 *
 * 📌 Решение Дениса 10.09.2026: его ступень становится осью в НАШЕЙ лестнице. Значит число
 * ступеней — величина, на которую мы опираемся, и молчаливая её смена ломает лестницы.
 *
 * ⚠️ ПОЧЕМУ ЭТО СКРИПТ, А НЕ ПРОБА JEST. Замер 10.09.2026: под jest модуль стартует,
 * `psy_name` и `psy_presets` отвечают верно, а `psy_generate` возвращает ноль — в чистом
 * node тот же модуль тем же вызовом отдаёт доску. Причина не найдена, и выдумывать её я не
 * стал: гейт живёт там, где доказуемо работает, рядом с release-notes-gate и lint-ratchet.
 * Если кто-то поймёт причину — перенести обратно в пробы и убрать этот абзац.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');

/**
 * 🔴 КТО ПОКАЗЫВАЕТ ДОСКУ ТЕКСТОМ. Замер 10.09.2026: `text_format` реализован у 33
 * головоломок из 40 в каноне и у 18 из 20 в нашем модуле. Это ключ ко всей коллекции —
 * наша сторона рисует сетку по ASCII, не разбирая двадцать разных форматов описания.
 * Keen и Map себя текстом не показывают: им нужна своя отрисовка, и это записанный факт,
 * а не дефект.
 */
const БЕЗ_ТЕКСТА = new Set(['Black Box', 'Cube', 'Guess', 'Keen', 'Map', 'Net', 'Netslide', 'Untangle']);

/**
 * 🔴 У КОГО НЕТ РЕШАТЕЛЯ — ФЛАГ САМОГО АВТОРА, НЕ МОЙ СПИСОК. `psy_can_solve` читает
 * `game.can_solve`. Замер 10.09.2026 по всем сорока: его нет у трёх — Cube, Pegs,
 * Same Game. Причина одна на всех: единственного решения у них не существует по
 * устройству игры. Кнопка подсказки в таких режимах не показывается.
 */
const БЕЗ_РЕШАТЕЛЯ = new Set(['Cube', 'Pegs', 'Same Game']);

/**
 * 🔴 РЕШАТЕЛЬ ЕСТЬ, А ПАРТИЮ ОН НЕ ЗАКАНЧИВАЕТ — тринадцать движков, замер 10.09.2026
 * (`psy_solve` → `psy_status`). Три разных исхода, и все три законные:
 *   · Black Box и Guess отдают −1 (проигрыш): раскрыть спрятанное — и значит проиграть,
 *     плата за подсказку у них встроена в правило;
 *   · Cube, Netslide, Pegs, Same Game, Untangle отдают solve=0 — midend отказывает,
 *     решателя нет вовсе либо ход-решение он построить не берётся;
 *   · Flip, Flood, Inertia, Mines, Rectangles, Undead показывают ответ, но статус
 *     остаётся 0 — доска раскрыта, а «победой» это по их правилам не считается.
 * Поэтому наш экран считает ВЗЯТУЮ подсказку концом раздачи независимо от статуса:
 * ступень не засчитана, партия закрыта, человек не заперт на раскрытой доске.
 */
const РЕШАТЕЛЬ_НЕ_ЗАКАНЧИВАЕТ = new Set([
  'Black Box', 'Cube', 'Flip', 'Flood', 'Guess', 'Inertia', 'Mines',
  'Netslide', 'Pegs', 'Rectangles', 'Same Game', 'Undead', 'Untangle',
]);

/** Замер 10.09.2026, канон на коммите 38e7ea3: сколько ступеней объявил САМ автор. */
const СТУПЕНИ = {
  Solo: 16, Dominosa: 12, 'Train Tracks': 12, Unequal: 12, Keen: 10, Net: 10, Singles: 10,
  Bridges: 9, 'Light Up': 9, Netslide: 9, Pegs: 9, Magnets: 8, Pearl: 8, Twiddle: 8,
  Undead: 8, Flood: 7, Rectangles: 7, Towers: 7, Unruly: 7, Flip: 6, Galaxies: 6, Map: 6,
  Mosaic: 6, Signpost: 6, Slant: 6, Tents: 6, 'Black Box': 5, Pattern: 5, 'Same Game': 5,
  Sixteen: 5, Untangle: 5, Cube: 4, Palisade: 4, Range: 4, Filling: 3, Inertia: 3,
  Guess: 2, Fifteen: 1,
  // ⚠️ Ноль у двоих — не дефект, а записанный факт: меню пресетов у них устроено иначе
  // и `fetch_preset` не отвечает. Лестницу этим двум считать отдельно, размером поля.
  Loopy: 0, Mines: 0,
};

const беды = [];
/**
 * ⚠️ Модуль собран ЕДИНЫМ файлом (`SINGLE_FILE=1`): wasm лежит внутри `tatham.js`
 * в base64, отдельного `.wasm` НЕТ и быть не должно. Так Metro кладёт его в бандл
 * как обычный модуль — без ассета и без загрузки по сети. Цена: 459 КБ бинаря
 * превращаются в 530 КБ текста.
 */
if (!existsSync(МОСТ)) {
  console.error('❌ мост не собран: нет tatham.js');
  console.error('   пересобрать: source ~/dev/emsdk/emsdk_env.sh && frontend/src/games/tatham-bridge/build.sh');
  process.exit(1);
}

const M = await require_(МОСТ)();
const n = M.ccall('psy_count', 'number', [], []);
if (n !== Object.keys(СТУПЕНИ).length) {
  беды.push(`движков в модуле ${n}, а в замере ${Object.keys(СТУПЕНИ).length} — состав сменился молча`);
}

for (let i = 0; i < n; i++) {
  const имя = M.ccall('psy_name', 'string', ['number'], [i]);

  // 1. движок ВЫДАЁТ доску, а не просто линкуется
  const p = M.ccall('psy_generate', 'number', ['number', 'string', 'number'], [i, '', 12345]);
  const описание = p ? M.UTF8ToString(p) : '';
  if (p) M.ccall('psy_free', null, ['number'], [p]);
  if (!/^[^:]+:.+/.test(описание)) {
    беды.push(`${имя}: доска не сгенерирована — «${описание.slice(0, 30)}»`);
  }

  // 2. доска отдаётся текстом — то, по чему рисует наша сторона
  const умеет = M.ccall('psy_has_board', 'number', ['number'], [i]) === 1;
  if (умеет === БЕЗ_ТЕКСТА.has(имя)) {
    беды.push(`${имя}: показывает текстом ${умеет}, а в замере записано обратное`);
  }
  if (умеет) {
    const b = M.ccall('psy_board', 'number', ['number', 'string', 'number'], [i, '', 42]);
    const доска = b ? M.UTF8ToString(b) : '';
    if (b) M.ccall('psy_free', null, ['number'], [b]);
    const строк = доска.split('\n').filter(Boolean).length;
    if (строк < 3) беды.push(`${имя}: доска текстом пуста или в ${строк} строк`);
  }

  // 3. лестница автора на месте
  const было = СТУПЕНИ[имя];
  const стало = M.ccall('psy_presets', 'number', ['number'], [i]);
  if (было === undefined) беды.push(`${имя}: движка не было в замере 10.09.2026`);
  else if (было !== стало) беды.push(`${имя}: ступеней автора было ${было}, стало ${стало}`);
}

/*
 * 🔴 ИГРАБЕЛЬНЫЙ КРУГ — то, ради чего писался слой рисования.
 * Замер 10.09.2026: `text_format` даёт РОВНУЮ сетку только у Unruly, остальные печатают
 * дамп с рамками и разной шириной строк. Поэтому доска берётся не текстом, а вектором:
 * его же `drawing_api` записывает примитивы, и рисуются ВСЕ 20, включая Keen и Map,
 * которые текстом себя не показывают вовсе.
 * Здесь проверяется весь круг: открылось — нарисовалось — решатель довёл до победы.
 */
for (let i = 0; i < n; i++) {
  const имя = M.ccall('psy_name', 'string', ['number'], [i]);
  if (!M.ccall('psy_open', 'number', ['number', 'string', 'number'], [i, '', 42])) {
    беды.push(`${имя}: партия не открылась`); continue;
  }
  const ш = M.ccall('psy_width', 'number', [], []);
  const в = M.ccall('psy_height', 'number', [], []);
  if (ш < 32 || в < 32) беды.push(`${имя}: поле ${ш}×${в} — размер не задан`);

  const примитивов = (M.UTF8ToString(M.ccall('psy_draw', 'number', [], [])) || '').split('\n').filter(Boolean).length;
  if (примитивов < 4) беды.push(`${имя}: нарисовано ${примитивов} примитивов — доски нет`);

  // решатель автора обязан доводить партию до победы: на нём стоят подсказки
  const решён = M.ccall('psy_can_solve', 'number', ['number'], [i]) === 1;
  if (решён === БЕЗ_РЕШАТЕЛЯ.has(имя)) {
    беды.push(`${имя}: can_solve=${решён}, а в замере записано обратное`);
  }
  M.ccall('psy_solve', 'number', [], []);
  const победил = M.ccall('psy_status', 'number', [], []) === 1;
  if (победил === РЕШАТЕЛЬ_НЕ_ЗАКАНЧИВАЕТ.has(имя)) {
    беды.push(`${имя}: решатель ${победил ? 'довёл' : 'не довёл'} до победы — обратное замеру`);
  }
}

/*
 * 🔴 НИ ОДИН РЕЖИМ НЕ ПОКАЗЫВАЕТ «УРОВЕНЬ 1/0». Замер 10.09.2026 на симуляторе iPhone:
 * у «Сапёра» счётчик в шапке обещал НОЛЬ ступеней — `psy_presets` у Mines и Loopy
 * возвращает 0, меню пресетов у них устроено иначе. Лестница им набрана размером поля
 * в `names.ts` (`СВОЯ_ЛЕСТНИЦА`), и здесь проверяется, что она есть и РАБОТАЕТ:
 * каждая её ступень обязана открыть доску и нарисовать её.
 */
{
  const имена = ЗДЕСЬ && (await import('node:fs')).readFileSync(
    path.join(ЗДЕСЬ, '../src/games/tatham-bridge/names.ts'), 'utf8');
  const блок = /СВОЯ_ЛЕСТНИЦА[^=]*= \{([\s\S]*?)\n\};/.exec(имена)?.[1] ?? '';
  const пары = [...блок.matchAll(/(\w[\w ]*):\s*\[([\s\S]*?)\]/g)];
  const безЛестницы = [];
  for (let i = 0; i < n; i++) {
    const имя = M.ccall('psy_name', 'string', ['number'], [i]);
    if (M.ccall('psy_presets', 'number', ['number'], [i]) > 0) continue;
    const своя = пары.find(([, к]) => к.trim() === имя.trim());
    if (!своя) { безЛестницы.push(`${имя}: ступеней автора 0 и своей лестницы нет — покажет «1/0»`); continue; }
    const параметры = [...своя[2].matchAll(/параметры: '([^']+)'/g)].map((m) => m[1]);
    if (параметры.length < 3) безЛестницы.push(`${имя}: своя лестница из ${параметры.length} ступеней — это не лестница`);
    for (const п of параметры) {
      if (!M.ccall('psy_open', 'number', ['number', 'string', 'number'], [i, п, 7])) {
        безЛестницы.push(`${имя}: ступень «${п}» не открывается`); continue;
      }
      const пр = (M.UTF8ToString(M.ccall('psy_draw', 'number', [], [])) || '').split('\n').filter(Boolean).length;
      if (пр < 4) безЛестницы.push(`${имя}: ступень «${п}» нарисовала ${пр} примитивов`);
    }
  }
  беды.push(...безЛестницы);
}

// 4. одно зерно — одна доска, иначе прогресс игрока не воспроизводится
const a = (() => { const p = M.ccall('psy_generate', 'number', ['number', 'string', 'number'], [0, '', 777]); const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; })();
const b = (() => { const p = M.ccall('psy_generate', 'number', ['number', 'string', 'number'], [0, '', 777]); const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; })();
if (a !== b || a.length < 8) беды.push(`одно зерно даёт разные доски: «${a.slice(0, 20)}» против «${b.slice(0, 20)}»`);

if (беды.length) {
  console.error(`\n🔴 МОСТ К ДВИЖКАМ ТЭТХЭМА СЛОМАН (${беды.length}):`);
  беды.forEach((s) => console.error('   ' + s));
  console.error('\nЕсли движок обновился и число ступеней изменилось — это не «поправить проверку»,');
  console.error('а повод пересчитать лестницу той головоломки: его ступень у нас ось сложности.');
  process.exit(1);
}
console.log(`✅ мост: ${n} движков · доску текстом дают ${n - БЕЗ_ТЕКСТА.size} · лестницы автора на месте · зерно воспроизводится`);
