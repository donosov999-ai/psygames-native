const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.psygames.app';
const AAB_PATH = process.env.AAB_PATH || './aab/PsyGames-android.aab';
const VERSION_NAME = process.env.VERSION_NAME || 'unknown';
const SA_JSON = process.env.GOOGLE_PLAY_SA_JSON;

if (!SA_JSON) { console.error('GOOGLE_PLAY_SA_JSON not set'); process.exit(1); }

/**
 * Текст «Что нового» для карточки в Play.
 *
 * ЗАЧЕМ. Раньше сюда уезжала заглушка «see full changelog on GitHub» — то есть
 * тестировщику, который открыл карточку приложения, предлагали пойти читать
 * коммиты. Человеческое описание релиза у нас уже написано, в whatsNew.ts, и
 * второй раз писать его для Play незачем: один источник, одна правка.
 *
 * ПОЧЕМУ РЕГУЛЯРКОЙ, А НЕ import. Скрипт — обычный CommonJS в раннере, а
 * whatsNew.ts это TypeScript; тащить сюда сборщик ради одного массива строк
 * дороже, чем прочитать файл текстом. Формат файла наш собственный и стабилен,
 * а если он всё-таки изменится — см. ниже: молча заглушку не подставим.
 */
// Разбор «Что нового» и нарезка под лимит Play вынесены отдельно: тем же кодом
// пользуется гейт `scripts/release-notes-gate.mjs`, который гоняется ДО сборки.
// Иначе ошибка чтения всплывает на последнем шаге, когда собрано уже всё.
const { extractNotes, format, PLAY_NOTES_LIMIT } = require('./whatsnew-notes');

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SA_JSON),
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const TRACKS = ['production'];

async function main() {
  // Сначала текст, только потом загрузка: если описания нет, лучше не залить
  // ничего и переспросить, чем залить сборку с пустой карточкой.
  const version = VERSION_NAME.replace(/^v/, '');
  const notes = extractNotes(version);
  if (notes.error) {
    console.error(`❌ ${notes.error}.

   В Play эта строка — единственное, что тестировщик читает про обновление.
   Добавь запись { version: '${version}', date, ru: [...], en: [...] } и перевыпусти тег.`);
    process.exit(1);
  }
  const ruText = format(notes.ru);
  const enText = format(notes.en);
  console.log(`Release notes (ru, ${ruText.length} симв.):\n${ruText}`);

  const pub = google.androidpublisher({ version: 'v3', auth });

  console.log('Opening edit...');
  const { data: { id: editId } } = await pub.edits.insert({ packageName: PACKAGE, requestBody: {} });

  try {
    console.log('Uploading AAB...');
    const { data: { versionCode } } = await pub.edits.bundles.upload({
      packageName: PACKAGE,
      editId,
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(AAB_PATH) },
    });
    console.log('versionCode:', versionCode);

    for (const track of TRACKS) {
      console.log(`Assigning to ${track}...`);
      await pub.edits.tracks.update({
        packageName: PACKAGE,
        editId,
        track,
        requestBody: {
          track,
          releases: [{
            name: VERSION_NAME,
            status: 'completed',
            versionCodes: [String(versionCode)],
            releaseNotes: [
              { language: 'en-US', text: enText },
              { language: 'ru-RU', text: ruText },
            ],
          }],
        },
      });
    }

    console.log('Committing...');
    await pub.edits.commit({ packageName: PACKAGE, editId });
    console.log(`✅ ${VERSION_NAME} → ${TRACKS.join(', ')}`);
  } catch (err) {
    console.error('❌', err.message);
    if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
    await pub.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});
    process.exit(1);
  }
}

main();
