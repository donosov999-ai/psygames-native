// Usage: node flutter/tools/srs-ipa-expansion.mjs (prints the generated JSON)
import {readFileSync} from 'node:fs';

const revision = '972cd67dd5f96bc5660e28070cde26e3928abcd7';
const source = 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/' + revision + '/data';
const vocab = (name) => JSON.parse(
  readFileSync(new URL('../assets/vocab/' + name + '.json', import.meta.url), 'utf8'),
);
const coreIpa = vocab('srs-ipa-en-es');
const expansion = [...vocab('word-bank-expansion'), ...vocab('word-bank-shestov-reviewed')];

// Forms absent from the pinned corpus. English uses US pronunciation;
// Spanish uses the same ES variety as the corpus.
const checked = {
  en: {
    abolishment: '/əˈbɑlɪʃmənt/',
    bootblack: '/ˈbutˌblæk/',
    carfare: '/ˈkɑɹˌfɛɹ/',
  },
  es: {
    bistec: '/bisˈtek/',
    piragüismo: '/piɾaˈɣwismo/',
    'melón cantalupo': '/meˈlon kantaˈlupo/',
    'capitolio de estados unidos': '/kapiˈtoljo ðe esˈtaðos uˈniðos/',
    chovinismo: '/tʃoβiˈnismo/',
    claus: '/klaus/',
  },
};

function forms(value) {
  return [...new Set((value ?? '').split(', ').filter((form) => /^\/[^/]+\/$/u.test(form)))];
}

const result = {};
for (const [lang, locale] of [['en', 'en_US'], ['es', 'es_ES']]) {
  const target = [...new Set(expansion.map((row) => row[lang].trim().toLowerCase()))]
    .filter((word) => !coreIpa[lang][word])
    .sort();
  const wanted = new Set([...target, ...target.flatMap((word) => word.match(/\p{L}+/gu) ?? [])]);
  const response = await fetch(source + '/' + locale + '.txt', {signal: AbortSignal.timeout(30_000)});
  if (!response.ok) throw new Error(locale + ': HTTP ' + response.status);
  const dictionary = new Map();
  for (const line of (await response.text()).split('\n')) {
    const [word, ipa] = line.trim().split('\t');
    if (wanted.has(word) && ipa) dictionary.set(word, forms(ipa));
  }
  result[lang] = Object.fromEntries(target.map((word) => {
    const fromDictionary = dictionary.get(word)?.join(' · ');
    if (fromDictionary) return [word, fromDictionary];
    if (checked[lang][word]) return [word, checked[lang][word]];
    // Broad read-aloud pronunciation: use the components for multiword terms.
    const parts = word.split(/\s+/u);
    if (lang === 'es' && parts.length > 1 && parts.every((part) => dictionary.get(part)?.length)) {
      return [word, '/' + parts.map((part) => dictionary.get(part)[0].slice(1, -1)).join(' ') + '/'];
    }
    throw new Error('Missing checked ' + lang + ' pronunciation: ' + word);
  }));
  process.stderr.write(locale + ': ' + target.length + ' additional spellings covered\n');
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
