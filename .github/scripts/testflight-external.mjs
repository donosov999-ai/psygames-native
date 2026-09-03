#!/usr/bin/env node
/* psygames-testflight-external · VER 1 · 03.09.2026 */
/**
 * ПОДАЁТ СВЕЖУЮ СБОРКУ НА ВНЕШНЕЕ РЕВЬЮ TESTFLIGHT И ЦЕПЛЯЕТ ЕЁ К ВНЕШНЕЙ ГРУППЕ.
 *
 * 🔴 ЗАЧЕМ. Замер 03.09.2026 по App Store Connect: внешняя группа «Семья и близкие»
 * открыта, публичная ссылка работает — а сборки 2.34.4, 2.34.5 и 2.35.0 НЕ ПОДАВАЛИСЬ
 * на внешнее ревью вовсе. CI грузил в TestFlight и на этом останавливался: внутренние
 * тестировщики получали всё сразу, внешние — только прошедшее ревью, а прошедшего не
 * было ни одного. По ссылке люди видели старьё, и заметить это было нельзя: загрузка
 * шла успешно, лента задач молчала.
 *
 * ⚠️ ПОДАЧА — ДЕЙСТВИЕ НАРУЖУ. Скрипт ничего не публикует в App Store: бета-ревью
 * решает только, увидят ли сборку внешние тестировщики. Но это всё равно отправка
 * к Apple, поэтому он запускается ТОЛЬКО по тегу и печатает, что именно подаёт.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY_ID = process.env.APPLE_API_KEY_ID;
const ISSUER = process.env.APPLE_API_ISSUER;
/**
 * ⚠️ ИДЕНТИФИКАТОР ПРИЛОЖЕНИЯ НЕ БЕРЁТСЯ ИЗ СЕКРЕТА. Первая редакция ждала
 * `APPLE_APP_ID`, а его в секретах репозитория НЕТ — и скрипт «успешно» пропускал
 * шаг, то есть воспроизводил ровно тот сбой, ради которого написан: тихо ничего не
 * делал. Ищем по bundle id, который и так лежит в конфиге платформы.
 */
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.psygames.app';
const GROUP = process.env.APPLE_BETA_GROUP || 'Семья и близкие';
const KEY_PATH = process.env.APPLE_API_KEY_PATH || `${process.env.HOME}/private_keys/AuthKey_${KEY_ID}.p8`;

if (!KEY_ID || !ISSUER) {
  console.log('ℹ️  ключей App Store Connect нет — шаг пропущен');
  process.exit(0);
}

/** JWT ES256 руками: тянуть зависимость ради одного токена незачем. */
function токен() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const body = b64({ iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 900, aud: 'appstoreconnect-v1' });
  const s = createSign('SHA256');
  s.update(`${head}.${body}`);
  const der = s.sign({ key: readFileSync(KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${der.toString('base64url')}`;
}

const T = токен();
const H = { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' };
const API = 'https://api.appstoreconnect.apple.com/v1/';
const get = async (p) => {
  const r = await fetch(API + p, { headers: H });
  if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`);
  return r.json();
};

const приложения = await get(`apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const APP_ID = приложения.data?.[0]?.id;
if (!APP_ID) { console.log(`❌ приложение ${BUNDLE_ID} не найдено в App Store Connect`); process.exit(1); }

/**
 * ⚠️ ВЕРСИЮ МОЖНО ЗАДАТЬ СНАРУЖИ. В CI она берётся из package.json — там сборка
 * только что уехала в TestFlight. Но руками часто нужно подать УЖЕ загруженную:
 * так было 03.09.2026, когда три версии висели неподанными, и ждать следующего
 * выпуска значило оставить тестировщиков на старом ещё на день.
 */
const версия = process.env.TF_VERSION
  || JSON.parse(readFileSync(new URL('../../frontend/package.json', import.meta.url), 'utf8')).version;
console.log(`▶ ищу сборку ${версия}`);

// Ждём обработки: сразу после загрузки сборка ещё PROCESSING и подать её нельзя.
let build = null;
for (let попытка = 1; попытка <= 30; попытка += 1) {
  const r = await get(`builds?filter[app]=${APP_ID}&limit=10&sort=-uploadedDate&include=preReleaseVersion`);
  const вкл = Object.fromEntries((r.included || []).map((i) => [i.id, i]));
  build = r.data.find((b) => {
    const pr = b.relationships?.preReleaseVersion?.data;
    return pr && вкл[pr.id]?.attributes?.version === версия;
  }) || null;
  if (build && build.attributes.processingState === 'VALID') break;
  console.log(`  … ${build ? build.attributes.processingState : 'сборки ещё нет'} (${попытка}/30)`);
  build = null;
  // ⚠️ Ждём только когда сборка ТОЛЬКО ЧТО уехала (режим CI). При ручной подаче
  // уже загруженной ждать нечего: нет — значит нет, и надо сказать об этом сразу.
  if (process.env.TF_VERSION) break;
  await new Promise((r2) => setTimeout(r2, 60_000));
}
if (!build) { console.log('⚠️  сборка не дождалась обработки — внешнее ревью не подано'); process.exit(0); }

/**
 * 1. ЦЕПЛЯЕМ КО ВСЕМ ГРУППАМ — И ВНУТРЕННЕЙ ТОЖЕ.
 *
 * 🔴 ЗАМЕР 03.09.2026, ВТОРАЯ ПОЛОВИНА ТОЙ ЖЕ БЕДЫ. Первая редакция цепляла только
 * ко внешней группе — и Денис всё равно видел в TestFlight 2.34.2. Оказалось,
 * сборки 2.34.4, 2.34.5 и 2.35.0 не состояли НИ В ОДНОЙ группе: внутренней ревью не
 * нужно вовсе, но без группы она не видна и внутреннему тестировщику.
 *
 * То есть я починил половину задачи и отчитался за целую. Теперь сборка идёт во все
 * группы приложения: внутренние показывают её сразу, внешняя — после ревью.
 */
const группы = await get(`apps/${APP_ID}/betaGroups?limit=20`);
if (!группы.data.length) { console.log('⚠️  групп тестировщиков нет — пропускаю'); process.exit(0); }

for (const г of группы.data) {
  const прикрепить = await fetch(`${API}betaGroups/${г.id}/relationships/builds`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ data: [{ type: 'builds', id: build.id }] }),
  });
  const внутр = г.attributes.isInternalGroup ? 'внутренняя, видна сразу' : 'внешняя, после ревью';
  console.log(прикрепить.ok
    ? `✅ ${версия} → «${г.attributes.name}» (${внутр})`
    : `⚠️  «${г.attributes.name}»: ${прикрепить.status}`);
}

const группа = группы.data.find((g) => !g.attributes.isInternalGroup);
if (!группа) { console.log('ℹ️  внешних групп нет — ревью подавать не для кого'); process.exit(0); }

// 2. Подаём на внешнее ревью. Уже поданная отвечает 409 — это не ошибка.
const подать = await fetch(`${API}betaAppReviewSubmissions`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } }),
});
if (подать.ok) console.log(`✅ ${версия} подана на внешнее ревью TestFlight`);
else if (подать.status === 409) console.log(`ℹ️  ${версия} уже подана на ревью`);
else console.log(`⚠️  подать не удалось: ${подать.status} ${await подать.text()}`);
