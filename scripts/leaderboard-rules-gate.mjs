#!/usr/bin/env node
/**
 * leaderboard-rules-gate — не даёт направлению «лучше» и границам правдоподобия
 * разъехаться между кодом и базой.
 *
 * 🔴 ЗАЧЕМ. Одно и то же правило про игру записано в двух местах: `LEADERBOARD_GAMES`
 * в `frontend/src/services/leaderboard.ts` (`better: 'less' | 'more'`, `min`, `max`) и
 * ветки RPC `psygames_submit_score` в Supabase, где из направления считается `rank_score`
 * (`score` при `asc`, `-score` при `desc`), а по `rank_score asc` строится вся таблица.
 * У «Маршрута» и «Выбора из двух» меньше — лучше, у остальных наоборот, так что
 * перепутать есть что.
 *
 * Цена расхождения: перевёрнутое направление ставит первым ХУДШИЙ результат. Ни tsc,
 * ни jest этого не видят — тесты в базу не ходят, число на месте, знак не тот. Замечает
 * игрок, а не мы.
 *
 * ЧТО ДЕЛАЕТ. Берёт ЖИВЫЕ строки решения боевой функции через RPC
 * `psygames_leaderboard_rules()` (она отдаёт их из `pg_get_functiondef`, то есть из того,
 * что реально исполняется, а не из чьей-то копии) и сверяет с таблицей в коде поигрово:
 * направление, `min`, `max` и сам состав игр в обе стороны. Расходится — красный, с
 * готовым SQL.
 *
 * ⚠️ НИЧЕГО НЕ ЗАПИСЫВАЕТ. Отправлять пробные результаты в боевую таблицу рекордов, чтобы
 * узнать направление, нельзя: полезный ответ даёт только результат ВНУТРИ границ, а его
 * функция как раз и сохраняет. Поэтому спрашиваем правило, а не поведение.
 *
 * Ключ не нужен: публикуемый ключ приложения, функция только читает.
 *
 * Флаги:
 *   --parse-only          разобрать таблицу в коде, напечатать и выйти; без сети.
 *                         Этим гоняется offline-проверка в jest — чтобы «гейт ослеп на
 *                         переформатированном файле» ловилось на каждом прогоне тестов.
 *   --rpc=<имя>           другая читалка правил: копия функции, ветка Supabase.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'frontend/src/services/leaderboard.ts';
const SUPABASE_URL = 'https://iuvvheeocobhiothfgei.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const RPC = flag('rpc', 'psygames_leaderboard_rules');
const PARSE_ONLY = args.includes('--parse-only');

function die(what, detail) {
  console.error(`\n❌ таблица рекордов: ${what}\n${detail ? `\n${detail}\n` : ''}`);
  process.exit(1);
}

/**
 * Правила из кода. Читается текстом, а не импортом: скрипт обычный .mjs, а таблица —
 * TypeScript. Разбор нарочно строгий — не нашли поле, не нашли ни одной игры, поехало
 * форматирование, значит гейт ослеп, и молчать об этом нельзя.
 */
function readCodeRules() {
  const src = readFileSync(join(ROOT, SOURCE), 'utf8');
  const from = src.indexOf('export const LEADERBOARD_GAMES = {');
  const to = src.indexOf('} as const satisfies', from);
  if (from === -1 || to === -1) {
    die(`в ${SOURCE} не нашлась таблица LEADERBOARD_GAMES`,
      'Гейт читает её текстом. Если объявление переименовали — поправь SOURCE/разбор здесь же,\nиначе сверка с базой перестанет происходить молча.');
  }
  const table = src.slice(from, to);
  const rules = new Map();
  for (const [, game, body] of table.matchAll(/^ {2}([a-z0-9_]+): \{\n([\s\S]*?)^ {2}\},$/gm)) {
    const better = body.match(/^ {4}better: '(less|more)',$/m)?.[1];
    const min = body.match(/^ {4}min: (-?[\d.]+),$/m)?.[1];
    const max = body.match(/^ {4}max: (-?[\d.]+),$/m)?.[1];
    if (!better || min === undefined || max === undefined) {
      die(`у игры «${game}» в коде не читаются better/min/max`,
        'Все три поля обязательны: направление и границы — это один и тот же договор с сервером.');
    }
    rules.set(game, { better, direction: better === 'less' ? 'asc' : 'desc', min: Number(min), max: Number(max) });
  }
  if (rules.size === 0) die(`в ${SOURCE} не разобрана ни одна игра`, 'Сверять с базой нечего — это отказ гейта, а не зелёный свет.');
  return rules;
}

/**
 * Правила из живой функции. RPC отдаёт только строки решения: строка ветки
 * (`if p_game_id = '...' then`) и следом строка присвоений. Пары обязаны идти встык —
 * любая другая строка означает, что тело переписали, и разбирать его этим способом
 * больше нельзя.
 */
function parseDbRules(text) {
  const rules = new Map();
  let pending = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const game = line.match(/p_game_id = '([a-z0-9_]+)'/)?.[1];
    if (game) {
      if (pending) die('в теле функции ветка без правил', `«${pending}» объявлена, но v_direction/v_min/v_max за ней не идут.`);
      pending = game;
      continue;
    }
    const set = line.match(/v_direction\s*:=\s*'(asc|desc)';\s*v_min\s*:=\s*(-?[\d.]+);\s*v_max\s*:=\s*(-?[\d.]+);/);
    if (set) {
      if (!pending) die('в теле функции правила без ветки', `Строка «${line.trim()}» не привязана ни к одной игре.`);
      rules.set(pending, { direction: set[1], min: Number(set[2]), max: Number(set[3]) });
      pending = null;
      continue;
    }
    die('тело psygames_submit_score перестало читаться построчно',
      `Непонятная строка: «${line.trim()}»\n\nЕсли правила переехали (например, в таблицу) — перепиши разбор здесь.\nМолча пропустить нельзя: это ровно тот случай, ради которого гейт написан.`);
  }
  if (pending) die('в теле функции ветка без правил', `«${pending}» объявлена последней и осталась без v_direction/v_min/v_max.`);
  if (rules.size === 0) {
    die('база вернула правила, но ни одной игры в них нет',
      `RPC ${RPC}() ответила пустотой. Проверить живьём:\n\n   select public.${RPC}();`);
  }
  return rules;
}

const code = readCodeRules();

if (PARSE_ONLY) {
  console.log(JSON.stringify(Object.fromEntries(code), null, 2));
  process.exit(0);
}

let res;
try {
  res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${RPC}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
    },
    body: '{}',
    signal: AbortSignal.timeout(20000),
  });
} catch (e) {
  // Сети нет / база лежит — это не повод валить сборку: гейт про расхождение правил,
  // а не про доступность Supabase.
  console.warn(`⚠️  таблица рекордов: не смог спросить базу (${e.message}) — гейт пропущен`);
  process.exit(0);
}

if (res.status >= 500) {
  console.warn(`⚠️  таблица рекордов: база ответила ${res.status} — гейт пропущен`);
  process.exit(0);
}

// А вот 4xx пропускать нельзя: это не «база лежит», это «читалку правил снесли или
// закрыли права». Гейт, который в таком виде зеленеет, не гейт.
if (!res.ok) {
  die(`читалка правил недоступна (HTTP ${res.status})`,
    `${(await res.text()).slice(0, 400)}\n\nВернуть можно так:\n\n   select public.${RPC}();   -- должна отдать строки решения psygames_submit_score\n\nПрава: grant execute on function public.${RPC}() to anon;`);
}

const body = await res.json();
if (typeof body !== 'string' || !body.trim()) {
  die('читалка правил ответила не текстом', `Получено: ${JSON.stringify(body)?.slice(0, 300)}`);
}

const db = parseDbRules(body);

const problems = [];
for (const [game, want] of code) {
  const got = db.get(game);
  if (!got) {
    problems.push(`· ${game}: есть в коде, НЕТ в базе → сервер ответит unknown_game, таблица будет вечно пустой`);
    continue;
  }
  if (got.direction !== want.direction) {
    const first = want.better === 'less' ? 'самый медленный' : 'самый слабый';
    problems.push(`· ${game}: НАПРАВЛЕНИЕ РАЗОШЛОСЬ — код «${want.better}» (=${want.direction}), база «${got.direction}» → первым в таблице встанет ${first} результат`);
  }
  if (got.min !== want.min) problems.push(`· ${game}: нижняя граница — код ${want.min}, база ${got.min}`);
  if (got.max !== want.max) problems.push(`· ${game}: верхняя граница — код ${want.max}, база ${got.max}`);
}
for (const game of db.keys()) {
  if (!code.has(game)) problems.push(`· ${game}: есть в базе, НЕТ в коде → ветка-сирота, её никто не шлёт`);
}

if (problems.length > 0) {
  die(`правила разошлись с базой (${problems.length})`,
    `${problems.join('\n')}\n\nИсточник правды — LEADERBOARD_GAMES в ${SOURCE}.\nПривести базу к нему (ветки psygames_submit_score, personal-nzt / iuvvheeocobhiothfgei):\n\n${[...code]
      .map(([game, r]) => `   ${game}: v_direction := '${r.direction}'; v_min := ${r.min}; v_max := ${r.max};`)
      .join('\n')}\n\nПосмотреть, что там сейчас:\n\n   select public.${RPC}();`);
}

console.log(`✅ таблица рекордов: ${code.size} игр — направление и границы в базе совпадают с кодом`);
