// node flutter/tools/word-bank-open-sources.mjs [--write]
// Allowlisted concepts only. Keep both provenance and IPA with the data.
import {readFileSync, writeFileSync} from 'node:fs';

const cldrRevision = '7d2b9cb11cec08f4d333ad73209deb3df0711c3b';
const ipaRevision = '972cd67dd5f96bc5660e28070cde26e3928abcd7';
const cldr = 'https://raw.githubusercontent.com/unicode-org/cldr-json/' + cldrRevision;
const ipa = 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/' + ipaRevision;
const languages = ['en', 'ru', 'es', 'pt', 'de', 'zh', 'hi', 'fr', 'it', 'ja', 'ko', 'ar'];
const glyphs = [
  // Household, school, hobbies, sport, places and travel.
  '🪞 🪟 🪑 🛋️ 🛏️ 🛁 🚿 🪥 🧽 🧹 🪣 🧴 🧼 🧺 🧯 🪜 🧰 🔧 🪚 🔩 🔨 🔦 🔋 🧲 🪝 🧵 🧶 🧷 🪡 🧤 🧣 🧦 🧢 👓 🥽 👔 👗 👒 🎒 🧳 🥾 👢 👟 🥼 🦺 🧥',
  '📌 📎 📏 📐 ✂️ ✏️ 🖊️ 📝 📓 📔 📒 📚 🗂️ 📁 🗃️ 🗄️ 🗑️ 🔍 🔬 🔭 🧭 🌡️ ⚗️ ⚖️ 🧪 🧬 🔑 🔒 🪪 🎟️ 🎫 🏷️ 🎁 🕯️ 🎈 🎀',
  '🎻 🎸 🎹 🥁 🎺 🎷 🪗 🪕 🪈 🥁 🪇 🎧 🎤 🎬 🎨 🧩 🎲 🪀 🪁 🛹 🛷 ⛸️ 🎿 🏓 🏸 🎾 🥏 🥊 🏐 🏀 ⚽ 🏉 🎳 🏹 🥅 🛶 🏆 🏅',
  '🚲 🛴 🛵 🏍️ 🚕 🚍 🚎 🚒 🚑 🚜 🚚 🚐 🚆 🚊 🚇 🚉 🚁 ✈️ 🛩️ 🛫 🛬 🪂 🚀 🛸 ⛵ 🚤 🛟 ⚓ 🚦 🚧 ⛽ 🛞 🗺️',
  '🏡 🏢 🏥 🏦 🏨 🏪 🏫 🏭 🏰 🏟️ 🏗️ ⛲ 🗼 🌉 🎡 🎠 🎢 ⛺ ⛱️ 🏝️ 🏔️ 🌋 🏜️ 🏕️ 🏖️ 🌁 💧 ❄️ 🌈 🌪️ 🌊',
  // Concrete animals and food; select specific meanings via their CLDR key.
  '🦊 🦝 🐺 🦁 🐯 🐆 🐴 🫎 🫏 🦄 🦓 🦌 🦬 🐄 🐖 🐗 🐏 🐑 🐐 🐪 🦙 🦒 🐘 🦣 🦏 🦛 🐁 🐀 🐹 🐇 🦔 🦇 🐻 🐨 🐼 🦥 🦦 🦨 🦘 🦡 🦃 🐓 🐣 🐧 🕊️ 🦅 🦆 🦢 🦉 🦩 🦚 🦜 🐸 🐊 🐢 🦎 🐍 🦕 🐳 🐬 🦭 🐟 🐡 🦈 🐙 🐌 🦋 🐛 🐜 🐝 🪲 🐞 🦗 🪳 🕷️ 🦂 🦟 🪰 🪱',
  '🍇 🍈 🍉 🍊 🍋 🍌 🍍 🥭 🍎 🍐 🍑 🍒 🍓 🫐 🥝 🍅 🫒 🥥 🥑 🍆 🥔 🥕 🌽 🫑 🥒 🥬 🥦 🧄 🧅 🥜 🌰 🫚',
  '🥐 🧇 🥨 🧀 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🧆 🥚 🫕 🥗 🍿 🧈 🧂 🍚 🍛 🍝 🍣 🍡 🥟 🍦 🍩 🍪 🧁 🥧 🍫 🍯 🥛 🫖 ☕',
].flatMap(line => line.split(' '));
const topics = [
  'Q11660', 'Q117246174', 'Q115305900', 'Q2539', 'Q192776',
  'Q870780', 'Q49473179', 'Q1281199', 'Q12203', 'Q483639',
  'Q914359', 'Q238354', 'Q1135326', 'Q220499', 'Q20899',
  'Q5362345', 'Q22645', 'Q170519', 'Q254183', 'Q128093',
  'Q1130645', 'Q202833', 'Q1147226', 'Q625903', 'Q456632',
  'Q17233037', 'Q135005', 'Q926331', 'Q170963', 'Q13629441',
  'Q2140665', 'Q12705', 'Q217941', 'Q132580', 'Q1224980',
  'Q1049294', 'Q15852209', 'Q17086335', 'Q18922759',
  'Q118213879', 'Q2208745', 'Q2611270', 'Q64865818', 'Q20026619',
  'Q39531', 'Q123349905', 'Q212930',
];
// Keep the sense of the QID; smooth labels that name the activity/app or use
// a regional synonym, and fill a few explicitly reviewed missing columns.
const modernLabels = {
  Q870780: {ru: 'чат-бот', fr: 'agent conversationnel', ko: '챗봇'},
  Q49473179: {zh: '深度伪造', hi: 'डीपफ़ेक'},
  Q20899: {ru: 'подкаст', it: 'podcast'},
  Q1135326: {zh: '远程工作'},
  Q238354: {ru: 'видеоконференция'},
  Q914359: {es: 'almacenamiento en la nube'},
  Q625903: {hi: 'संपर्करहित भुगतान'},
  Q17086335: {hi: 'दो-कारक प्रमाणीकरण', ko: '이중 인증'},
  Q1281199: {hi: 'पासवर्ड प्रबंधक', pt: 'gerenciador de senhas', zh: '密码管理器'},
  Q212930: {ru: 'покупки в интернете', es: 'compras en línea'},
};
const extraIpa = {
  en: {
    chatbot: '/ˈtʃætˌbɑt/',
    deepfake: '/ˈdipˌfeɪk/',
    smartwatch: '/ˈsmɑɹtˌwɑtʃ/',
    qr: '/ˌkju ˈɑɹ/',
    podcast: '/ˈpɑdˌkæst/',
    emoji: '/iˈmoʊdʒi/',
    contactless: '/ˈkɑntæktləs/',
  },
  es: {
    bot: '/bot/',
    deepfake: '/dipˈfeik/',
    pódcast: '/ˈpodkast/',
    emoji: '/eˈmoxi/',
    qr: '/ku ˈere/',
    videoconferencia: '/biðeokonfeˈɾenθja/',
  },
};

const asset = (name) => new URL('../assets/vocab/' + name, import.meta.url);
const read = (name) => JSON.parse(readFileSync(asset(name + '.json'), 'utf8'));
const write = (name, body) => writeFileSync(asset(name), body);
const key = (word) => word.trim().normalize('NFC').toLowerCase().replace(/^to\s+/u, '');
async function get(url) {
  const r = await fetch(url, {
    headers: {'User-Agent': 'PsyGamesLexiconPrep/1.0 (https://psy-games.pro/)'},
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r;
}

const annotations = Object.fromEntries(await Promise.all(languages.map(async lang => {
  const url = cldr + '/cldr-json/cldr-annotations-full/annotations/' + lang + '/annotations.json';
  return [lang, (await (await get(url)).json()).annotations.annotations];
})));
const endpoint = 'https://www.wikidata.org/w/api.php?';
const request = new URLSearchParams({
  action: 'wbgetentities', format: 'json', props: 'labels|info',
  ids: topics.join('|'), languages: [...languages, 'zh-hans'].join('|'),
});
const entities = (await (await get(endpoint + request)).json()).entities;
const candidates = [
  ...[...new Set(glyphs)].map(id => ({
    source: 'cldr', id,
    row: Object.fromEntries(languages.map(lang => [
      lang, (annotations[lang][id] ?? annotations[lang][id.replaceAll('\ufe0f', '')])?.tts?.[0],
    ])),
  })),
  ...topics.map(id => ({
    source: 'wikidata', id, revision: entities[id]?.lastrevid,
    row: Object.fromEntries(languages.map(lang => [
      lang, modernLabels[id]?.[lang] ??
        entities[id]?.labels?.[lang === 'zh' ? 'zh-hans' : lang]?.value ??
        entities[id]?.labels?.[lang]?.value,
    ])),
  })),
];
const existing = new Set(['translation-vocab', 'word-bank-expansion', 'word-bank-shestov-reviewed']
  .flatMap(read).map(x => key(x.en)));
const priorIpa = [read('srs-ipa-en-es'), read('srs-ipa-expansion-en-es')];
const complete = candidates.filter(({row}) =>
  languages.every(lang => typeof row[lang] === 'string' && /\p{L}/u.test(row[lang]) &&
    !/[\p{Cc}\p{Cf}|<>{}]/u.test(row[lang]) && row[lang].length <= 100));
const ipaByLang = Object.fromEntries(await Promise.all([['en', 'en_US'], ['es', 'es_ES']]
  .map(async ([lang, file]) => {
    const spellings = new Set(complete.flatMap(({row}) => {
      const text = row[lang].trim().toLowerCase();
      return [text, ...text.match(/\p{L}+/gu) ?? []];
    }));
    const dict = new Map();
    for (const line of (await (await get(ipa + '/data/' + file + '.txt')).text()).split('\n')) {
      const [word, values] = line.split('\t');
      if (!spellings.has(word) || !values) continue;
      const valid = values.split(', ').filter(x => /^\/[^/]+\/$/u.test(x));
      if (valid.length) dict.set(word, valid);
    }
    return [lang, dict];
  })));
function pronunciation(lang, word) {
  const text = word.trim().normalize('NFC').toLowerCase();
  for (const bank of priorIpa) if (bank[lang][text]) return bank[lang][text];
  const dict = ipaByLang[lang];
  if (dict.has(text)) return dict.get(text).join(' · ');
  if (extraIpa[lang][text]) return extraIpa[lang][text];
  const parts = text.split(/[\s-]+/u);
  const sounds = parts.map(x => dict.get(x)?.[0] ?? extraIpa[lang][x]);
  if (parts.length < 2 || sounds.some(x => !x)) return null;
  return '/' + sounds.map(x => x.slice(1, -1)).join(' ') + '/';
}

const out = {cldr: [], wikidata: []};
const pronunciations = {en: {}, es: {}};
const ledger = [];
for (const {row, source, id, revision} of complete) {
  // Nouns and clear concepts, not letter variants, proper nouns or symbols.
  if (existing.has(key(row.en)) || !/^[a-z][a-z -]+$/i.test(row.en)) continue;
  if (source === 'cldr' && /^[a-c]/i.test(row.en)) continue;
  const en = pronunciation('en', row.en);
  const es = pronunciation('es', row.es);
  if (!en || !es) continue;
  const clean = Object.fromEntries(languages.map(lang => [lang, row[lang].trim().normalize('NFC')]));
  out[source].push(clean);
  existing.add(key(clean.en));
  pronunciations.en[clean.en.toLowerCase()] = en;
  pronunciations.es[clean.es.toLowerCase()] = es;
  ledger.push({id, source, revision, en: clean.en});
}
const rows = list => '[\n' + list.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]\n';
if (process.argv.includes('--write')) {
  if (out.cldr.length < 70 || out.wikidata.length < 12) {
    throw new Error('Too few reviewed candidates: ' + JSON.stringify(Object.values(out).map(x => x.length)));
  }
  const license = await (await get(cldr + '/LICENSE')).text();
  write('word-bank-cldr.json', rows(out.cldr));
  write('word-bank-modern.json', rows(out.wikidata));
  write('srs-ipa-open-sources.json', JSON.stringify(pronunciations, null, 2) + '\n');
  write('word-bank-open-ledger.json', JSON.stringify({cldrRevision, ipaRevision, ledger}, null, 2) + '\n');
  write('word-bank-open-notices.txt', 'PsyGames open vocabulary subset\n\n' +
    'Selected Unicode CLDR short names (adapted and combined into multilingual cards).\n' +
    cldrRevision + ' https://github.com/unicode-org/cldr-json\n\n' + license +
    '\nModern concept labels: Wikidata structured data (CC0 1.0).\n' +
    'https://www.wikidata.org/wiki/Wikidata:Licensing\n\n' +
    'Pronunciations: ipa-dict (see srs-ipa-notices.txt), with selected manual IPA; multiword entries combine broad forms.\n');
}
console.log(JSON.stringify({
  cldr: out.cldr.map(row => [row.en, row.ru, row.es]),
  modern: out.wikidata,
}, null, 1));
