const { google } = require('googleapis');
const fs = require('fs');

const PACKAGE = 'com.psygames.app';
const AAB_PATH = process.env.AAB_PATH || './aab/PsyGames-android.aab';
const VERSION_NAME = process.env.VERSION_NAME || 'unknown';
const SA_JSON = process.env.GOOGLE_PLAY_SA_JSON;

if (!SA_JSON) { console.error('GOOGLE_PLAY_SA_JSON not set'); process.exit(1); }

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SA_JSON),
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const TRACKS = ['internal', 'alpha', 'closed-test1'];

async function main() {
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
              { language: 'en-US', text: `${VERSION_NAME} — see full changelog on GitHub.` },
              { language: 'ru-RU', text: `${VERSION_NAME} — полный список изменений на GitHub.` },
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
