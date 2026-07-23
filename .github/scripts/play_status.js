// Read-only: печатает текущие релизы по всем трекам Google Play.
// Ничего не меняет: edit создаётся только для чтения и удаляется.
const { google } = require('googleapis');

const PACKAGE = 'com.psygames.app';

async function main() {
  const sa = JSON.parse(process.env.GOOGLE_PLAY_SA_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const play = google.androidpublisher({ version: 'v3', auth });

  const edit = await play.edits.insert({ packageName: PACKAGE });
  const editId = edit.data.id;
  try {
    const tracks = await play.edits.tracks.list({ packageName: PACKAGE, editId });
    for (const t of tracks.data.tracks || []) {
      console.log(`=== track: ${t.track} ===`);
      for (const r of t.releases || []) {
        console.log(
          `  release: ${r.name || '(no name)'} | status: ${r.status} | versionCodes: ${(r.versionCodes || []).join(',')}`
        );
      }
      if (!t.releases || !t.releases.length) console.log('  (no releases)');
    }
  } finally {
    await play.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
