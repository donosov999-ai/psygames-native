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
    /**
     * 🔴 ОТКАЗ PLAY НАДО ПЕРЕВОДИТЬ НА ЧЕЛОВЕЧЕСКИЙ, ИНАЧЕ ЕГО ЧИТАЮТ НЕВЕРНО.
     *
     * Разбор 27.08.2026. Из восьми последних тегов до магазина доехали три, и ДВА
     * из пяти провалов — v1.237.0 и v1.239.2 — упали вот с чем:
     *     "status": "PERMISSION_DENIED", "reason": "forbidden"
     *     "message": "Version code 1237000 has already been used."
     * Наверху дампа стоит PERMISSION_DENIED, и месяц это читалось как «сломался
     * доступ сервисного аккаунта». А на самом деле доступ в порядке: Play просто
     * не принимает ПОВТОРНУЮ заливку того же versionCode.
     *
     * Откуда берётся повтор: тег перезапустили. Сборка по тому же тегу даёт ту же
     * версию, значит тот же versionCode, значит отказ. Перезапуск тега в этом
     * проекте — не «повторить попытку», а «гарантированно не выпустить».
     *
     * ⚠️ И ВЫХОДИМ МЫ ВСЁ РАВНО С ОШИБКОЙ, хотя соблазн выйти нулём есть: раз код
     * «уже использован», значит когда-то доехал. Но если тег ПЕРЕДВИНУЛИ на новый
     * код, то в магазине лежит СТАРАЯ сборка под этим номером, а новая не уехала
     * никуда. Тихий успех здесь означал бы ровно ту потерю выпуска, ради которой
     * всё это и разбирается.
     */
    const данные = err.response ? err.response.data : null;
    const текст = JSON.stringify(данные || err.message || '');
    const уже = /has already been used/.test(текст);

    if (уже) {
      const код = (/Version code (\d+) has already been used/.exec(текст) || [])[1] || '?';
      console.error('::error title=Версия уже была залита::Play отказал НЕ по правам, хотя в ответе стоит PERMISSION_DENIED.');
      console.error('');
      console.error(`❌ versionCode ${код} уже использован в Google Play.`);
      console.error(`   Тег ${VERSION_NAME} собирается второй раз — а Play принимает каждый номер версии РОВНО ОДИН РАЗ.`);
      console.error('');
      console.error('   ЧТО ЭТО ЗНАЧИТ: если тег просто перезапустили, в магазине уже лежит эта сборка —');
      console.error('   заливать нечего. Если тег ПЕРЕДВИНУЛИ на новый код, новая сборка НЕ УЕХАЛА и не уедет:');
      console.error('   номер занят навсегда.');
      console.error('');
      console.error('   ЧИНИТЬ ТАК: поднять patch-версию в трёх манифестах (app.json, package.json,');
      console.error('   src-tauri/tauri.conf.json), добавить запись в CHANGELOG.md и whatsNew.ts, новый тег.');
      console.error('   ⚠️ Перезапускать тег бессмысленно — упадёт здесь же.');
    } else if (/PERMISSION_DENIED|forbidden|invalid_grant|unauthorized/i.test(текст)) {
      console.error('::error title=Play не пустил сервисный аккаунт::Похоже на настоящий отказ в доступе, а не на повтор версии.');
      console.error('❌', err.message);
      console.error('   Проверить: срок жизни ключа GOOGLE_PLAY_SA_JSON, права аккаунта в Play Console,');
      console.error('   не отозван ли доступ к приложению', PACKAGE);
    } else {
      console.error('::error title=Заливка в Play не удалась::' + String(err.message).slice(0, 180));
      console.error('❌', err.message);
    }
    if (данные) console.error(JSON.stringify(данные, null, 2));
    await pub.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});
    process.exit(1);
  }
}

main();
