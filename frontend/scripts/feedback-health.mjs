#!/usr/bin/env node
/**
 * psygames-feedback-health · VER 1 · 26.08.2026
 *
 * ЕДИНЫЙ КОНВЕЙЕР ОТЗЫВОВ ПАДАЕТ ГРОМКО, А НЕ УМИРАЕТ ТИХО.
 *
 * Требование Дениса 26.08.2026: «конвейер единый должен быть, чтобы если что-то
 * сломается — не умирало тихо, а падало громко».
 *
 * ━━━ ПОЧЕМУ ЭТО НЕ ПРИДИРКА ━━━
 * За один день 26.08 конвейер трижды вводил в заблуждение молча:
 *  · расшифровка голоса шла нормально, но 30 записей были цифровой тишиной от
 *    robo-test Google Play — и трижды подряд делался вывод «сломался микрофон»;
 *  · 15 репортов лежали со скриншотами, которых никто не открывал: ошибки не
 *    было, просто никто не смотрел;
 *  · сборки по тегам v1.238.0 и v1.239.0 падали на гейте, и до магазина ничего
 *    не доезжало — при этом тег стоял, и «выпущено» звучало дважды.
 * Общее у всех трёх: НИЧТО НЕ КРИЧАЛО. Отсутствие ошибки принималось за здоровье.
 *
 * ━━━ ЧТО ПРОВЕРЯЕТ (каждая проверка — с числом, а не «ок») ━━━
 * 1. приём      — свежесть последнего живого отзыва;
 * 2. расшифровка — есть ли аудио без расшифровки старше порога;
 * 3. зрение      — есть ли скриншоты без описания старше порога;
 * 4. разбор      — растёт ли очередь `v_feedback_intake_queue`;
 * 5. обратный контур — есть ли починенное без ответа автору;
 * 6. робот       — не просочился ли robo-test в живые.
 *
 * ⚠️ «СВЕЖЕСТЬ ПРИЁМА» — ПРЕДУПРЕЖДЕНИЕ, А НЕ ОШИБКА. Тишина в канале означает
 * либо поломку, либо что людям нечего сказать, и различить это отсюда нельзя.
 * Ронять сборку на молчании тестировщиков — ложная тревога, которая быстро
 * приучает не смотреть на красное.
 *
 * ⚠️ ПОРОГИ — ЗАМЕР 26.08.2026, А НЕ КРУГЛЫЕ ЧИСЛА. Расшифровка укладывается в
 * 3–5 минут (память `project_psygames_voice_pipeline`), поэтому «застряло» —
 * это час. Разбор идёт пачками вручную, поэтому у него сутки.
 *
 * ЗАПУСК:  SUPABASE_SERVICE_KEY=… node scripts/feedback-health.mjs
 *          … --json   машиночитаемо (для cron и для гейта в CI)
 * КОД ВОЗВРАТА: 0 здоров · 1 есть поломка · 2 не смог проверить.
 */
const PROJECT = 'iuvvheeocobhiothfgei';
const REST = `https://${PROJECT}.supabase.co`;
const JSON_OUT = process.argv.includes('--json');

const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) {
  console.error('❌ нужен SUPABASE_SERVICE_KEY');
  process.exit(2);
}

const STUCK_TRANSCRIBE_H = 1;    // расшифровка укладывается в 3–5 минут
const STUCK_VISION_H = 1;        // зрение идёт тем же проходом
const STUCK_INTAKE_H = 24;       // разбор пока запускается руками
const QUIET_INTAKE_H = 72;       // тишина в приёме — предупреждение

const q = async (path) => {
  const r = await fetch(`${REST}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact' },
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 120)}`);
  const range = r.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return { rows: await r.json(), total: Number.isNaN(total) ? null : total };
};

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const checks = [];
const add = (имя, ok, число, что) => checks.push({ имя, ok, число, что });

try {
  // 1. Приём: когда в последний раз приходил ЖИВОЙ отзыв.
  const last = await q('app_feedback?select=created_at&is_robot=eq.false&order=created_at.desc&limit=1');
  const lastAt = last.rows[0]?.created_at;
  const quietH = lastAt ? Math.round((Date.now() - Date.parse(lastAt)) / 3600e3) : null;
  add('приём', true, quietH, lastAt
    ? `последний живой отзыв ${quietH} ч назад${quietH > QUIET_INTAKE_H ? ' — ⚠️ тихо, но это не обязательно поломка' : ''}`
    : 'живых отзывов нет вовсе');

  // 2. Расшифровка: аудио без расшифровки, которое уже должно было пройти.
  const t = await q(`app_feedback?select=id&is_robot=eq.false&audio_path=not.is.null&transcript=is.null&created_at=lt.${ago(STUCK_TRANSCRIBE_H)}&limit=1`);
  add('расшифровка', (t.total ?? 0) === 0, t.total, `застряло записей: ${t.total} (порог ${STUCK_TRANSCRIBE_H} ч)`);

  /**
   * 3–4. Зрение и разбор — ПО ОБЕИМ ТАБЛИЦАМ.
   * ⚠️ Первая редакция смотрела только `app_feedback` и проглядела настоящую
   * поломку: работник для ВСЕГО брал бакет `feedback-shots`, а у багфикса скрины
   * лежат в `bug-shots`. Ссылка не выписывалась, разбор шёл БЕЗ картинки и
   * отчитывался успехом — 32 непрочитанных скриншота при «неразобранных 0».
   * Проверка, которая смотрит половину конвейера, врёт про здоровье целого.
   */
  for (const t of ['app_feedback', 'bug_reports']) {
    const v = await q(`${t}?select=id&is_robot=eq.false&shot_path=not.is.null&shot_caption=is.null&created_at=lt.${ago(STUCK_VISION_H)}&limit=1`);
    add(`зрение · ${t === 'app_feedback' ? 'отзывы' : 'багфикс'}`, (v.total ?? 0) === 0, v.total,
      `непрочитанных скриншотов: ${v.total} (порог ${STUCK_VISION_H} ч)`);

    const i = await q(`${t}?select=id&is_robot=eq.false&intake_at=is.null&created_at=lt.${ago(STUCK_INTAKE_H)}&limit=1`);
    add(`разбор · ${t === 'app_feedback' ? 'отзывы' : 'багфикс'}`, (i.total ?? 0) === 0, i.total,
      `неразобранных старше суток: ${i.total}`);
  }

  // 5. Обратный контур: починили, а человеку не сказали.
  const f = await q('app_feedback?select=id&is_robot=eq.false&fixed_in_version=not.is.null&fix_note=is.null&limit=1');
  add('обратный контур', (f.total ?? 0) === 0, f.total, `починено без ответа автору: ${f.total}`);

  // 6. Робот: подпись могла измениться, и тогда мусор снова пойдёт в бэклог.
  const r = await q('app_feedback?select=id&is_robot=eq.false&audio_peak_db=eq.-91.0&limit=1');
  add('фильтр робота', (r.total ?? 0) === 0, r.total, `немых записей среди живых: ${r.total} (должно быть 0)`);
} catch (e) {
  console.error(`❌ конвейер не проверить: ${e.message}`);
  process.exit(2);
}

const broken = checks.filter((c) => !c.ok);

if (JSON_OUT) {
  console.log(JSON.stringify({ здоров: broken.length === 0, проверки: checks }, null, 2));
} else {
  for (const c of checks) console.log(`${c.ok ? '✅' : '🔴'} ${c.имя.padEnd(22)} ${c.что}`);
  console.log('');
  if (broken.length) {
    // ГРОМКО: перечислить поимённо, а не «есть проблемы».
    console.error(`🔴 КОНВЕЙЕР ОТЗЫВОВ СЛОМАН: ${broken.map((b) => b.имя).join(', ')}`);
  } else {
    console.log('✅ конвейер отзывов здоров целиком');
  }
}
process.exit(broken.length ? 1 : 0);
