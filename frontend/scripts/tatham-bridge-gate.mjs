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
const БЕЗ_ТЕКСТА = new Set(['Keen', 'Map']);

/** Замер 10.09.2026, канон на коммите 38e7ea3: сколько ступеней объявил САМ автор. */
const СТУПЕНИ = {
  Solo: 16, Unequal: 12, Dominosa: 12, 'Train Tracks': 12, Keen: 10, Singles: 10,
  'Light Up': 9, Magnets: 8, Pearl: 8, Unruly: 7, Towers: 7, Tents: 6, Slant: 6,
  Map: 6, Signpost: 6, Galaxies: 6, Pattern: 5, Filling: 3, Fifteen: 1,
  // ⚠️ У Loopy меню пресетов устроено иначе — `fetch_preset` не отвечает. Ноль здесь не
  // дефект, а записанный факт: лестницу ему считать отдельно.
  Loopy: 0,
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
