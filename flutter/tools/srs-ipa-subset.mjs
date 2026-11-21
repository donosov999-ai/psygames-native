// Refresh deliberately, never at app startup. Usage from flutter/:
// node tools/srs-ipa-subset.mjs
import {readFileSync} from 'node:fs';

const revision = '972cd67dd5f96bc5660e28070cde26e3928abcd7';
const source = `https://raw.githubusercontent.com/open-dict-data/ipa-dict/${revision}/data`;
const vocab = JSON.parse(readFileSync(new URL('../assets/vocab/translation-vocab.json', import.meta.url)));
const result = {};
// Infinitives require the verb (not the homograph adjective, noun or past).
const infinitiveSense = {close: 'ˈkɫoʊz', live: 'ˈɫɪv', read: 'ˈɹid'};
const phraseIpa = {
  en: {'thank you': '/ˈθæŋk ju/'},
  es: {'estar de pie': '/esˈtaɾ de ˈpje/', 'por favor': '/poɾ faˈβoɾ/'},
};
for (const [lang, locale] of [['en', 'en_US'], ['es', 'es_ES']]) {
  const words = new Set(vocab.map(entry => entry[lang]?.toLowerCase()).filter(Boolean));
  const stems = new Set(lang === 'en' ? [...words].filter(word => word.startsWith('to ')).map(word => word.slice(3)) : []);
  const res = await fetch(`${source}/${locale}.txt`);
  if (!res.ok) throw new Error(`${locale}: HTTP ${res.status}`);
  const found = new Map();
  const stemIpa = new Map();
  for (const line of (await res.text()).split('\n')) {
    const [word, ipa] = line.trim().split('\t');
    if ((!words.has(word) && !stems.has(word)) || !ipa) continue;
    const forms = ipa.split(', ').filter(form => /^\/[^/]+\/$/u.test(form));
    if (words.has(word) && forms.length > 0) found.set(word, [...new Set(forms)].join(' · '));
    if (stems.has(word)) stemIpa.set(word, forms.map(form => form.slice(1, -1)));
  }
  for (const stem of stems) {
    const entry = `to ${stem}`;
    if (found.has(entry)) continue;
    const forms = stemIpa.get(stem) ?? [];
    const verb = infinitiveSense[stem];
    const checked = verb ? forms.filter(form => form === verb) : forms;
    if (checked.length > 0) found.set(entry, checked.map(form => `/tə ${form}/`).join(' · '));
  }
  for (const [word, ipa] of Object.entries(phraseIpa[lang])) {
    if (words.has(word) && !found.has(word)) found.set(word, ipa);
  }
  result[lang] = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b, 'en')));
  const missing = [...words].filter(word => !found.has(word));
  process.stderr.write(`${locale}: ${found.size}/${words.size}; missing: ${missing.join(', ')}\n`);
  if (missing.length > 0) process.exitCode = 1;
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
