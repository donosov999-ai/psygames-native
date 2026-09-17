#!/usr/bin/env node
/* psygames-build-hub-series · VER 1 · 17.09.2026 */
/**
 * СЕРИЯ ХАБА — ВСЕ ИГРЫ РАЗВИЛКИ ОДНИМ НАБОРОМ (задача 12470af9).
 *
 *   node scripts/build-hub-series.mjs            ← собрать недостающие серии
 *   node scripts/build-hub-series.mjs --force    ← пересобрать все, затерев правки редактора
 *
 * 📍 Денис 16.09.2026: «как мы можем в каждый хаб добавить серию (зарядку) из всех игр?».
 * 17.09.2026 о больших хабах: «надо собрать как есть, в редакторе я потом галочками поправлю,
 * что идёт и в каком виде — вначале сборка, потом оптимизация».
 *
 * Поэтому здесь ДАННЫЕ, а не код: в `defaultPlaylists.json` появляется набор
 * `серия-хаб-<ключ>` на каждую из 13 развилок — по шагу на каждый ЭКРАН развилки (групповая
 * карточка раскрывается внутрь, карточка-набор — в свои режимы, как в STRUCTURE.md). Профиль,
 * у которого уже назначены потоки этой развилки (`поток-хаб-<ключ>-*`), получает и серию —
 * она видна в выборе зарядки рядом с потоками.
 *
 * 🔴 ПРАВКИ ДЕНИСА НЕ ТРОГАЕМ. Серия, которая в файле уже есть, остаётся как есть: после сборки
 * её правят галочками в редакторе, и повторный прогон не должен стирать эту работу. Пересборка
 * всех — только с `--force`.
 *
 * После прогона: `node scripts/build-playlist-editor.mjs` и `node scripts/build-structure.mjs`
 * (редактор и STRUCTURE.md читают тот же файл) и проба `default-playlists-ship`.
 *
 * 🦥 Снимок состава снимается тем же способом, что у редактора и STRUCTURE.md: состав лежит в
 * TypeScript с алиасами, обычный node его не прочитает, а jest уже умеет.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const ФРОНТ = path.resolve(ЗДЕСЬ, '..');
const ФАЙЛ = path.join(ФРОНТ, 'src/constants/defaultPlaylists.json');
const ЗАНОВО = process.argv.includes('--force');

/** Ключ развилки → маршрут. Тот же список, что у пробы `default-playlists-ship`. */
const РАЗВИЛКА_ПОТОКА = {
  span: '/games/span', mnemonics: '/games/mnemonics-hub', chess: '/games/chess-hub',
  conflict: '/games/attention-conflict', search: '/games/search-hub', sudoku: '/games/sudoku-hub',
  puzzles: '/games/puzzles-hub', spatial: '/games/spatial-hub', sorting: '/games/sorting-hub',
  counting: '/games/counting-hub', words: '/games/words-hub', hearing: '/games/hearing-hub',
  languages: '/games/languages-hub',
};

/* ── снимок состава ─────────────────────────────────────────────────────── */
const врем = mkdtempSync(path.join(tmpdir(), 'psygames-hub-series-'));
const снимокПуть = path.join(врем, 'data.json');
console.log('⏳ снимаю состав (jest)…');
try {
  execFileSync('npx', ['jest', 'src/__tests__/playlist-editor-data.test.ts', '--silent'], {
    cwd: ФРОНТ, env: { ...process.env, PLAYLIST_EDITOR_OUT: снимокПуть }, stdio: 'inherit',
  });
} catch {
  console.error('🔴 снимок не снялся: проба playlist-editor-data упала.');
  process.exit(1);
}
if (!existsSync(снимокПуть)) { console.error('🔴 проба прошла, а файла снимка нет:', снимокПуть); process.exit(1); }
const снимок = JSON.parse(readFileSync(снимокПуть, 'utf8'));
const файл = JSON.parse(readFileSync(ФАЙЛ, 'utf8'));

/* ── состав развилок: файл главнее кода ─────────────────────────────────── */
const хабыФайла = файл.профили?.odv999?.хабы ?? {};
const карточкиХаба = (хаб) => (хабыФайла[хаб] ?? снимок.хабы[хаб] ?? [])
  .map((э) => (typeof э === 'string' ? э : (э.маршрут ?? э.route)));
const естьХаб = (маршрут) => Boolean(хабыФайла[маршрут] ?? снимок.хабы[маршрут]);
const РЕЖИМЫ_НАБОРА = new Map((снимок.наборы ?? []).map((н) => [н.карточка, (н.режимы ?? []).map((м) => м.route)]));

/** Экраны развилки по порядку карточек: группа раскрывается, набор — в режимы. */
function экраныХаба(хаб, глубина = 0) {
  const вышло = [];
  for (const маршрут of карточкиХаба(хаб)) {
    const путь = маршрут.split('?')[0];
    if (естьХаб(путь) && путь !== хаб && глубина < 2) { вышло.push(...экраныХаба(путь, глубина + 1)); continue; }
    const режимы = РЕЖИМЫ_НАБОРА.get(маршрут) ?? РЕЖИМЫ_НАБОРА.get(путь);
    if (режимы && режимы.length) вышло.push(...режимы);
    else вышло.push(маршрут);
  }
  return [...new Set(вышло)];
}

/* ── экран → шаг зарядки ────────────────────────────────────────────────── */
const ИД_ПО_ПУТИ = new Map(снимок.игры.map((и) => [и.route, и.id]));
const ИМЯ_ПО_ПУТИ = new Map(снимок.игры.map((и) => [и.route, и.имя]));
/**
 * Шаг берём ОБРАЗЦОМ из уже собранных потоков: там записаны настройки, которые Денис уже
 * утвердил — у «Детского мата» микс узоров и своё зерно (`mode: mix`, `settings`), у головоломок
 * режим, у игр с пробами — число проб. Порядок поиска:
 *   1. поток ЭТОЙ ЖЕ развилки, та же игра и тот же режим;
 *   2. поток этой развилки, та же игра — если у экрана режима в маршруте нет (кроме головоломок:
 *      у них режим и есть игра, «голая» карточка — режим по умолчанию, чужой режим не годится);
 *   3. любой другой набор, та же игра и тот же режим;
 *   4. голый шаг.
 * Длительность — медиана по всем наборам для той же игры и режима, иначе по игре, иначе минута.
 */
const ПО_УМОЛЧАНИЮ_ГОЛОВОЛОМКИ = 'Unruly';
const режимШага = (ш) => (ш.game_id === 'puzzles' ? (ш.mode ?? ПО_УМОЛЧАНИЮ_ГОЛОВОЛОМКИ) : (ш.mode ?? ''));
const длительности = new Map();
const образцыВсех = new Map();
const шагиПотоков = new Map();   // ключ развилки → шаги её потоков
for (const н of файл.наборы ?? []) {
  if (н.id.startsWith('серия-хаб-')) continue;
  const хабКлюч = /^поток-хаб-(.+)-(5|10|15)$/.exec(н.id)?.[1];
  for (const ш of н.шаги ?? []) {
    const к = `${ш.game_id}|${режимШага(ш)}`;
    if (!длительности.has(к)) длительности.set(к, []);
    if (Number.isFinite(ш.est_duration_sec)) длительности.get(к).push(ш.est_duration_sec);
    if (!образцыВсех.has(к)) образцыВсех.set(к, ш);
    if (хабКлюч) { if (!шагиПотоков.has(хабКлюч)) шагиПотоков.set(хабКлюч, []); шагиПотоков.get(хабКлюч).push(ш); }
  }
}
const медиана = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

function шаг(маршрут, хабКлюч) {
  const [путь, запрос = ''] = маршрут.split('?');
  const режимМаршрута = new URLSearchParams(запрос).get('mode') ?? undefined;
  const game_id = ИД_ПО_ПУТИ.get(путь);
  if (!game_id) return null;
  const режим = game_id === 'puzzles' ? (режимМаршрута ?? ПО_УМОЛЧАНИЮ_ГОЛОВОЛОМКИ) : (режимМаршрута ?? '');
  const свои = шагиПотоков.get(хабКлюч) ?? [];
  const образец = свои.find((ш) => ш.game_id === game_id && режимШага(ш) === режим)
    ?? (game_id !== 'puzzles' && режимМаршрута === undefined ? свои.find((ш) => ш.game_id === game_id) : undefined)
    ?? образцыВсех.get(`${game_id}|${режим}`);
  const est = медиана(длительности.get(`${game_id}|${режим}`) ?? [])
    ?? медиана([...длительности].filter(([к]) => к.startsWith(`${game_id}|`)).flatMap(([, v]) => v)) ?? 60;
  if (образец) return { ...образец, game_route: путь, est_duration_sec: est };
  return { game_id, game_route: путь, ...(режимМаршрута ? { mode: режимМаршрута } : {}), est_duration_sec: est };
}

/* ── сборка ─────────────────────────────────────────────────────────────── */
const наборы = файл.наборы ?? [];
const итоги = [];
const пропущено = [];
for (const [ключ, хаб] of Object.entries(РАЗВИЛКА_ПОТОКА)) {
  const id = `серия-хаб-${ключ}`;
  const было = наборы.findIndex((н) => н.id === id);
  if (было >= 0 && !ЗАНОВО) { итоги.push(`${id}: есть в файле — оставлена как есть (${наборы[было].шаги.length} шагов)`); continue; }
  const экраны = экраныХаба(хаб);
  const шаги = [];
  for (const э of экраны) {
    const ш = шаг(э, ключ);
    if (ш) шаги.push(ш); else пропущено.push(`${ключ}: ${э}`);
  }
  const набор = { id, название: `Все игры · ${ИМЯ_ПО_ПУТИ.get(хаб) ?? хаб}`, шаги };
  if (было >= 0) наборы[было] = набор; else наборы.push(набор);
  const минут = Math.round(шаги.reduce((с, ш) => с + ш.est_duration_sec, 0) / 60);
  итоги.push(`${id}: экранов ${экраны.length} → шагов ${шаги.length} · ~${минут} мин`);
}
файл.наборы = наборы;

/* Профилю — серию рядом с потоками этой же развилки. */
let назначено = 0;
for (const пр of Object.values(файл.профили ?? {})) {
  if (!Array.isArray(пр.наборы)) continue;
  for (const ключ of Object.keys(РАЗВИЛКА_ПОТОКА)) {
    const id = `серия-хаб-${ключ}`;
    if (пр.наборы.includes(id)) continue;
    const последний = пр.наборы.map((x, i) => (x.startsWith(`поток-хаб-${ключ}-`) ? i : -1)).filter((i) => i >= 0).pop();
    if (последний === undefined) continue;
    пр.наборы.splice(последний + 1, 0, id);
    назначено += 1;
  }
}

if (пропущено.length) {
  console.error('🔴 экраны без игры в каталоге — серия собрана без них:', пропущено.join(' · '));
}
writeFileSync(ФАЙЛ, JSON.stringify(файл), 'utf8');
console.log(итоги.join('\n'));
console.log(`✅ ${path.relative(ФРОНТ, ФАЙЛ)} · назначений профилям: ${назначено}`);
console.log('   дальше: node scripts/build-playlist-editor.mjs && node scripts/build-structure.mjs');
