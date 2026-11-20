#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY_ID = process.env.APPLE_API_KEY_ID;
const ISSUER = process.env.APPLE_API_ISSUER;
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.psygames.app';
const VERSION = process.env.APPSTORE_VERSION || JSON.parse(readFileSync('frontend/app.json', 'utf8')).expo.version;
const BUILD_NUMBER = String(process.env.APPSTORE_BUILD_NUMBER || '');
const CONFIRM = process.env.APPSTORE_CONFIRM || '';
const API = 'https://api.appstoreconnect.apple.com/v1';

if (!KEY_ID || !ISSUER) throw new Error('Нет ключей App Store Connect');
if (!/^\d+$/.test(BUILD_NUMBER)) throw new Error('Нужен номер уже загруженной сборки');

function token() {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const body = b64({ iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 600, aud: 'appstoreconnect-v1' });
  const signer = createSign('SHA256');
  signer.update(`${header}.${body}`);
  const signature = signer.sign({
    key: readFileSync(`${process.env.HOME}/private_keys/AuthKey_${KEY_ID}.p8`, 'utf8'),
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${body}.${signature.toString('base64url')}`;
}

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = result.errors?.map((error) => `${error.code}: ${error.title} — ${error.detail}`).join('; ') || text;
    const error = new Error(`${method} ${path} → ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

const notesEntry = JSON.parse(readFileSync('flutter/assets/whats_new.json', 'utf8'))
  .entries.find((entry) => entry.version === VERSION);
if (!notesEntry) throw new Error(`В whats_new.json нет примечаний ${VERSION}`);
const notes = {
  'en-US': notesEntry.en.map((item) => `• ${item}`).join('\n'),
  ru: notesEntry.ru.map((item) => `• ${item}`).join('\n'),
};
for (const [locale, text] of Object.entries(notes)) {
  if (text.length > 4000) throw new Error(`${locale}: примечания длиннее 4000 символов`);
}

const apps = await call('GET', `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=2`);
const app = apps.data?.[0];
if (!app) throw new Error(`Приложение ${BUNDLE_ID} не найдено`);

const builds = await call('GET', `/builds?filter[app]=${app.id}&limit=50&include=preReleaseVersion`);
const included = new Map((builds.included || []).map((item) => [`${item.type}:${item.id}`, item]));
const build = builds.data.find((candidate) => {
  const relation = candidate.relationships?.preReleaseVersion?.data;
  const preRelease = relation && included.get(`${relation.type}:${relation.id}`);
  return preRelease?.attributes?.version === VERSION
    && String(candidate.attributes?.version) === BUILD_NUMBER;
});
if (!build) throw new Error(`Сборка ${VERSION} (${BUILD_NUMBER}) не найдена`);
if (build.attributes.processingState !== 'VALID') {
  throw new Error(`Сборка ${VERSION} (${BUILD_NUMBER}) ещё ${build.attributes.processingState}`);
}
console.log(`Сборка: ${VERSION} (${BUILD_NUMBER}), ${build.attributes.processingState}`);

const versions = await call('GET', `/apps/${app.id}/appStoreVersions?limit=50`);
let version = versions.data.find((candidate) => candidate.attributes.versionString === VERSION);
console.log(`Версия App Store: ${version ? version.attributes.appStoreState : 'ещё не создана'}`);
const editableStates = new Set(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW']);
if (version && !editableStates.has(version.attributes.appStoreState)) {
  console.log(`Изменение не требуется: ${VERSION} уже ${version.attributes.appStoreState}`);
  process.exit(0);
}
if (CONFIRM !== `submit-${VERSION}`) {
  console.log(`Только проверка. Для отправки нужен APPSTORE_CONFIRM=submit-${VERSION}`);
  process.exit(0);
}

if (version?.attributes.appStoreState !== 'READY_FOR_REVIEW') {
  for (const state of ['READY_FOR_REVIEW', 'WAITING_FOR_REVIEW']) {
    const previous = await call('GET', `/reviewSubmissions?filter[app]=${app.id}&filter[state]=${state}&limit=10`);
    for (const submission of previous.data.filter((candidate) => candidate.attributes.platform === 'IOS')) {
      await call('DELETE', `/reviewSubmissions/${submission.id}`);
      console.log(`Прежняя проверка iOS снята: ${state}`);
    }
  }
}

let submissionId;
if (version?.attributes.appStoreState === 'READY_FOR_REVIEW') {
  const submissions = await call('GET', `/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW&limit=10`);
  const submission = submissions.data.find((candidate) => candidate.attributes.platform === 'IOS');
  if (!submission) throw new Error(`${VERSION}: нет открытого пакета проверки`);
  submissionId = submission.id;
} else {
  if (!version) {
    const created = await call('POST', '/appStoreVersions', { data: {
      type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString: VERSION, releaseType: 'MANUAL' },
      relationships: { app: { data: { type: 'apps', id: app.id } } },
    } });
    version = created.data;
    console.log(`Создана версия ${VERSION}, выпуск после одобрения — вручную`);
  } else {
    await call('PATCH', `/appStoreVersions/${version.id}`, { data: {
      type: 'appStoreVersions', id: version.id, attributes: { releaseType: 'MANUAL' },
    } });
  }

  await call('PATCH', `/appStoreVersions/${version.id}/relationships/build`, { data: {
    type: 'builds', id: build.id,
  } });
  console.log(`К версии прикреплена сборка ${BUILD_NUMBER}`);

  const localizations = await call('GET', `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`);
  const existing = new Map(localizations.data.map((item) => [item.attributes.locale, item]));
  for (const [locale, whatsNew] of Object.entries(notes)) {
    const localization = existing.get(locale);
    if (localization) {
      await call('PATCH', `/appStoreVersionLocalizations/${localization.id}`, { data: {
        type: 'appStoreVersionLocalizations', id: localization.id, attributes: { whatsNew },
      } });
    } else {
      await call('POST', '/appStoreVersionLocalizations', { data: {
        type: 'appStoreVersionLocalizations',
        attributes: { locale, whatsNew },
        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
      } });
    }
    console.log(`Примечания ${locale} записаны`);
  }

  const submission = await call('POST', '/reviewSubmissions', { data: {
    type: 'reviewSubmissions',
    attributes: { platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: app.id } } },
  } });
  submissionId = submission.data.id;
  try {
    await call('POST', '/reviewSubmissionItems', { data: {
      type: 'reviewSubmissionItems',
      relationships: {
        appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
      },
    } });
  } catch (error) {
    await call('DELETE', `/reviewSubmissions/${submissionId}`).catch(() => {});
    throw error;
  }
}

await call('PATCH', `/reviewSubmissions/${submissionId}`, { data: {
  type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true },
} });
console.log(`✅ ${VERSION} (${BUILD_NUMBER}) отправлена на проверку App Store`);
