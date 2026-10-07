const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.psygames.app';
const STORE_DIR = './store/google-play';

const LANG_MAP = {
  'ar':  'ar',
  'de':  'de-DE',
  'en':  'en-US',
  'es':  'es-419',
  'fr':  'fr-FR',
  'hi':  'hi-IN',
  'it':  'it-IT',
  'ja':  'ja-JP',
  'ko':  'ko-KR',
  'pt':  'pt-BR',
  'ru':  'ru-RU',
  'zh':  'zh-CN',
};

/**
 * 🔴 ПОЛЕ БЕРЁТСЯ ИЗ СВОЕГО РАЗДЕЛА, А НЕ «ПЕРВЫЙ БЛОК КОРОЧЕ 80» (07.10.2026).
 * Раньше краткое описание = первый блок после заголовка длиной ≤ 80. Под «## 1. ЗАГОЛОВОК»
 * стоит ещё «Запасной» вариант заголовка — он короче 80 и шёл в магазин вместо краткого
 * описания: в живой карточке en-US и ru-RU стоял запасной заголовок, в de-DE —
 * «PsyGames: Konzentration». Теперь каждое поле — первый блок под своим разделом
 * («## 1.», «## 2.», «## 3.»); старый разбор — только запасной путь для файла без разделов.
 */
function firstBlockAfter(content, headerRe) {
  const m = headerRe.exec(content);
  if (!m) return null;
  const b = /```\n([\s\S]*?)\n```/.exec(content.slice(m.index));
  return b ? b[1].trim() : null;
}

function extract(content) {
  const blocks = [...content.matchAll(/```\n([\s\S]*?)\n```/g)].map(m => m[1].trim());
  if (blocks.length < 2) return null;
  const title = firstBlockAfter(content, /^## 1\. /m) ?? blocks[0];
  const short = firstBlockAfter(content, /^## 2\. /m) ?? (blocks.slice(1).find(b => b.length <= 80) || blocks[1]);
  const full = firstBlockAfter(content, /^## 3\. /m) ?? blocks.reduce((a, b) => b.length > a.length ? b : a);
  return { title, shortDescription: short, fullDescription: full };
}

async function main() {
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_PLAY_SA_JSON),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const pub = google.androidpublisher({ version: 'v3', auth });

  const listings = {};
  for (const [suffix, playLang] of Object.entries(LANG_MAP)) {
    const file = path.join(STORE_DIR, `listing-${suffix}.md`);
    if (!fs.existsSync(file)) continue;
    const d = extract(fs.readFileSync(file, 'utf8'));
    if (d) listings[playLang] = d;
  }

  console.log(`Found ${Object.keys(listings).length} languages:`, Object.keys(listings).join(', '));

  const { data: { id: editId } } = await pub.edits.insert({ packageName: PACKAGE, requestBody: {} });
  try {
    for (const [language, d] of Object.entries(listings)) {
      await pub.edits.listings.update({
        packageName: PACKAGE, editId, language,
        requestBody: { language, title: d.title, shortDescription: d.shortDescription, fullDescription: d.fullDescription },
      });
      process.stdout.write(`${language} ✓  `);
    }
    await pub.edits.commit({ packageName: PACKAGE, editId });
    console.log('\n✅ All listings updated in Play Console');
  } catch (err) {
    console.error('\n❌', err.message);
    if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
    await pub.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { extract, LANG_MAP, STORE_DIR };
