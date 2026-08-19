/* psygames-report-media · VER 1 · 19.08.2026 */
/**
 * ДОСТАТЬ СКРИНШОТ И ГОЛОС ИЗ РЕПОРТА ТЕСТИРОВЩИКА.
 *
 * 🔴 ЗАЧЕМ. 19.08.2026 выяснилось, что мы НЕ МОЖЕМ ПОСМОТРЕТЬ ни один скриншот,
 * присланный тестировщиками. У бакетов `feedback-shots` и `feedback-audio` в
 * Supabase заведены ТОЛЬКО политики на запись (INSERT для anon) — политики на
 * чтение нет ни одной, ни для какой роли. То есть 163 скриншота лежат в
 * хранилище, куда можно класть и откуда нельзя брать.
 *
 * Цена этого видна в репорте 18.08: «Половина банок обрезана… как объяснить
 * словами, не знаю» — человек приложил картинку ИМЕННО потому, что словами не
 * получалось, и картинка оказалась нечитаемой. Тестировщик думает, что помог;
 * мы этого не видим. Это тот же класс поломки, что немые голосовые: канал есть,
 * данные копятся, толку ноль.
 *
 * ⚠️ БАКЕТЫ ОСТАЮТСЯ ПРИВАТНЫМИ. Публиковать их нельзя: на скриншотах бывает
 * личное — переписка, имена, содержимое экрана телефона. Правильный доступ —
 * подписанная ссылка сервисным ключом, то есть этим скриптом.
 *
 * ЧТОБЫ ЗАРАБОТАЛО, нужен сервисный ключ в ~/.sdt_secrets/supabase_db.json:
 *   { "personal-nzt": { …, "service_role_key": "sb_secret_…" } }
 * Взять его: Supabase → Project Settings → API keys → service_role.
 * 🔴 Ключ обходит RLS — в репозиторий, в чат и в логи он не попадает НИКОГДА,
 * только в этот файл, который лежит вне git.
 *
 * ЗАПУСК:
 *   node scripts/fetch-report-media.mjs --last 5
 *   node scripts/fetch-report-media.mjs <id-репорта>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'iuvvheeocobhiothfgei';
const REST = `https://${PROJECT}.supabase.co`;
const OUT = join(process.cwd(), '.report-media');

function serviceKey() {
  const p = join(homedir(), '.sdt_secrets', 'supabase_db.json');
  let cfg;
  try { cfg = JSON.parse(readFileSync(p, 'utf8')); } catch {
    fail(`нет файла ${p}`);
  }
  const k = cfg['personal-nzt']?.service_role_key;
  if (!k) {
    fail(
      `в ${p} нет поля service_role_key у personal-nzt.\n` +
      `  Взять: Supabase → Project Settings → API keys → service_role.\n` +
      `  Положить туда же, рядом с connection_string. В git и в чат ключ не несём.`,
    );
  }
  return k;
}

function fail(msg) { console.error('🔴 ' + msg); process.exit(1); }

const key = serviceKey();
const H = { apikey: key, Authorization: `Bearer ${key}` };

const args = process.argv.slice(2);
const lastIdx = args.indexOf('--last');
const limit = lastIdx >= 0 ? Number(args[lastIdx + 1] || 5) : null;
const id = lastIdx >= 0 ? null : args[0];
if (!limit && !id) fail('нужен id репорта либо --last N');

const q = id
  ? `id=eq.${id}&select=id,created_at,person,screen,message,transcript,shot_path,audio_path`
  : `shot_path=not.is.null&order=created_at.desc&limit=${limit}` +
    `&select=id,created_at,person,screen,message,transcript,shot_path,audio_path`;

const rows = await fetch(`${REST}/rest/v1/app_feedback?${q}`, { headers: H }).then((r) => r.json());
if (!Array.isArray(rows) || !rows.length) fail('репортов не найдено');

mkdirSync(OUT, { recursive: true });

/** Подписанная ссылка живёт минуту — этого хватает, чтобы скачать и не хватает, чтобы утечь. */
async function grab(bucket, path, name) {
  const r = await fetch(`${REST}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!r.ok) return `не подписалось (${r.status})`;
  const { signedURL } = await r.json();
  const buf = Buffer.from(await (await fetch(`${REST}/storage/v1${signedURL}`)).arrayBuffer());
  const dest = join(OUT, name);
  writeFileSync(dest, buf);
  return `${dest} (${Math.round(buf.length / 1024)} КБ)`;
}

for (const row of rows) {
  const when = String(row.created_at).slice(0, 16).replace('T', ' ');
  console.log(`\n── ${when} · ${row.person} · ${row.screen}`);
  console.log(`   ${(row.message || row.transcript || '').slice(0, 160)}`);
  if (row.shot_path) console.log('   скрин: ' + await grab('feedback-shots', row.shot_path, `${row.id}.jpg`));
  if (row.audio_path) console.log('   голос: ' + await grab('feedback-audio', row.audio_path, `${row.id}.webm`));
}
console.log(`\nвсё в ${OUT}`);
