#!/usr/bin/env node
/**
 * feedback-loop-gate — не даёт выпустить релиз «по репортам тестировщиков»,
 * не разметив сами репорты.
 *
 * ЗАЧЕМ. Обратный контур (v1.165) показывает человеку, что починили по ЕГО
 * сообщениям. Держится он на одном ручном шаге: при починке репорт помечается
 * в базе версией и фразой `fix_note`. Шаг забывается молча — блок «Починили по
 * твоим репортам» останется пустым, и получится красивая механика ни с чем.
 * Тестировщик снова пишет в пустоту, только теперь мы думаем, что нет.
 *
 * ЧТО ПРОВЕРЯЕТ. Если раздел CHANGELOG под текущую версию говорит о репортах
 * («репорт», «тестировщик», «из чата тестеров»), то в базе должен быть хотя бы
 * один репорт с `fixed_in_version` = этой версии. Нет — гейт валит релиз и
 * печатает готовый SQL.
 *
 * ЧЕГО НЕ ЛОВИТ (осознанно). Если правку по репорту вообще не упомянуть в
 * changelog — гейту не за что зацепиться. Это остаётся на дисциплине; гейт
 * закрывает частый случай «написал про репорт, забыл пометить», а не все.
 *
 * Ключ не нужен: считает публикуемым ключом приложения через RPC, которая
 * отдаёт только число.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://iuvvheeocobhiothfgei.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1';

/** Слова, по которым видно, что раздел говорит о сообщениях тестировщиков. */
const TESTER_MARKERS = /репорт|тестировщик|тестер|из чата тестеров|жалоб/i;

const version = JSON.parse(readFileSync(join(ROOT, 'frontend/package.json'), 'utf8')).version;
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

const post = (fn, body) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${PUBLISHABLE_KEY}`,
  },
  body: JSON.stringify(body),
});

/**
 * 🔴 ПРОВЕРКА ПО КОММИТАМ — ЗАКРЫВАЕТ ДЫРУ, В КОТОРУЮ ГЕЙТ САМ ПРИЗНАВАЛСЯ.
 *
 * Ниже написано: «если правку по репорту вообще не упомянуть в changelog —
 * зацепиться не за что». 21.08.2026 через эту дыру прошли ЧЕТЫРЕ репорта: три
 * про правила судоку и один про выбор набора товаров. Все были починены в
 * v1.209.0 и ни один не помечен — авторы не узнали.
 *
 * Но связь-то была, и не в changelog, а в коммите: `850e5606` дословно называет
 * id отчёта, по которому сделан. Там она и живёт естественно — пишешь починку,
 * ссылаешься на репорт. Значит и спрашивать надо оттуда.
 *
 * ⚠️ ПОЧЕМУ ЭТО НЕ ЛОМАЕТСЯ НА СТАРЫХ КОММИТАХ. Проверяется только «помечен ли»,
 * а помеченный проходит всегда. Захватить лишние коммиты не страшно — страшно
 * недобрать, поэтому при неудаче с тегом берём просто последние сто.
 */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function commitMessagesSincePreviousRelease() {
  const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
  const prev = versions.find((v) => v !== version);
  const range = prev ? [`v${prev}..HEAD`] : ['-n', '100'];
  return execFileSync('git', ['log', ...range, '--format=%B'], { cwd: ROOT, encoding: 'utf8' });
}

try {
  const ids = [...new Set((commitMessagesSincePreviousRelease().match(UUID) || []).map((x) => x.toLowerCase()))];
  if (ids.length) {
    const r = await post('psygames_reports_unmarked', { p_ids: ids });
    if (r.ok) {
      const unmarked = (await r.json()).map((x) => x.id);
      if (unmarked.length) {
        console.error(`
❌ обратный контур: коммиты этого релиза ссылаются на ${unmarked.length} репорт(ов),
   которые НЕ помечены починенными. Автор репорта ничего не узнает.

   Пометить (текст ответа — на языке, на котором человек ПИСАЛ):

   update public.app_feedback set
     status = 'fixed', fixed_in_version = '${version}', fixed_at = now(),
     fix_note = '<что именно изменилось, словами автора репорта>'
   where id in (${unmarked.map((x) => `'${x}'`).join(', ')});
`);
        process.exit(1);
      }
      console.log(`✅ обратный контур: ${ids.length} репорт(ов) из коммитов помечены`);
    } else {
      console.warn(`⚠️  обратный контур: не смог сверить репорты из коммитов (${r.status}) — эта половина гейта пропущена`);
    }
  }
} catch (e) {
  // Мелкий клон в CI, нет тега, нет git — это не повод валить релиз.
  console.warn(`⚠️  обратный контур: коммиты не прочитались (${String(e?.message || e).split('\n')[0]}) — эта половина гейта пропущена`);
}

// Раздел текущей версии: от её заголовка до следующего "## ["
const start = changelog.indexOf(`## [${version}]`);
if (start === -1) {
  console.error(`❌ В CHANGELOG.md нет раздела для v${version} — релиз без записи в changelog`);
  process.exit(1);
}
const rest = changelog.slice(start + 1);
const end = rest.indexOf('\n## [');
const section = end === -1 ? rest : rest.slice(0, end);

if (!TESTER_MARKERS.test(section)) {
  console.log(`✅ обратный контур: v${version} не заявлен как релиз по репортам — проверять нечего`);
  process.exit(0);
}

// Явный отказ. Бывает, что раздел УПОМИНАЕТ репорты как контекст («разбирал
// репорт и нашёл вот это»), но ни одного не закрывает — тогда помечать нечего,
// а выдумывать пометку значит врать автору репорта. Обойти гейт можно только
// написав это в самом changelog: отказ виден в истории и в ревью, а не спрятан
// в аргументах команды.
if (/Репортов этот релиз не закрывает/i.test(section)) {
  console.log(`✅ обратный контур: v${version} прямо заявляет, что репортов не закрывает`);
  process.exit(0);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/psygames_fixed_count`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${PUBLISHABLE_KEY}`,
  },
  body: JSON.stringify({ p_version: version }),
});

if (!res.ok) {
  // Сеть или база недоступны — это не повод валить релиз: гейт про дисциплину,
  // а не про доступность Supabase. Громко предупреждаем и пропускаем.
  console.warn(`⚠️  обратный контур: не смог спросить базу (${res.status}) — гейт пропущен`);
  process.exit(0);
}

const count = Number(await res.json());
if (count > 0) {
  // Ответ должен быть на языке, на котором человек ПИСАЛ. Признак — письменность
  // самого сообщения, а не язык интерфейса: у Rulon интерфейс английский, пишет
  // он по-русски, и подгонка под интерфейс отвечала бы ему не на его языке.
  const langRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/psygames_fix_note_lang_mismatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ p_version: version }),
  });
  if (langRes.ok) {
    const mismatched = Number(await langRes.json());
    if (mismatched > 0) {
      console.error(`
❌ обратный контур: ${mismatched} ответ(ов) в v${version} написаны не на языке репорта.

   Человек написал на одном языке, а прочитает ответ на другом — и решит,
   что отвечали не ему.

   Найти и переписать:

   select id, message, fix_note from public.app_feedback
   where fixed_in_version = '${version}'
     and (message ~ '[А-Яа-яЁё]') <> (fix_note ~ '[А-Яа-яЁё]');
`);
      process.exit(1);
    }
  }
  console.log(`✅ обратный контур: v${version} закрывает ${count} репорт(ов) — авторы это увидят`);
  process.exit(0);
}

console.error(`
❌ обратный контур: v${version} заявлен в CHANGELOG как релиз по репортам,
   но в базе НИ ОДИН репорт не помечен этой версией.

   Значит, человек, который это написал, снова ничего не узнает.

   Пометь репорты (фрагмент его собственного текста как ключ):

   update public.app_feedback
   set fixed_in_version = '${version}',
       fix_note = 'Одна фраза: что именно изменилось',
       fixed_at = now(),
       status = 'fixed'
   where message ilike '%фрагмент его слов%'
     and fixed_in_version is null;

   Проверить: select public.psygames_fixed_count('${version}');
`);
process.exit(1);
