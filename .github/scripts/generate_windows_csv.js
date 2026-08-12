const fs = require('fs');
const path = require('path');

const STORE_DIR = path.join(__dirname, '../../store/windows');
const OUTPUT    = path.join(STORE_DIR, 'store-listing.csv');

const LANG_NAMES = {
  ar: 'Arabic', de: 'German', en: 'English', es: 'Spanish',
  fr: 'French',  hi: 'Hindi',  it: 'Italian', ja: 'Japanese',
  ko: 'Korean',  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese Simplified',
};

const LICENSE = {
  ru: 'Использование данного приложения регулируется стандартными условиями лицензионного соглашения Microsoft Store.',
  en: 'Use of this application is governed by the standard Microsoft Store licence agreement terms.',
};
const COPYRIGHT = '©2026 PsyGames';

const IMG_TYPE = 'Provide the file name only if it is in the same folder. Provide relative path to image starting with the subfolder name otherwise';

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function section(content, ...headings) {
  for (const h of headings) {
    const re = new RegExp(`##\\s+${escRe(h)}[\\s\\S]*?(?=\\n##|$)`, 'i');
    const m = content.match(re);
    if (!m) continue;
    const bm = m[0].match(/```\n([\s\S]*?)\n```/);
    if (bm) return bm[1].trim();
  }
  return '';
}

function parse(content) {
  const features   = section(content, 'Features');
  const searchTerms = section(content, 'Search terms');
  return {
    title:            section(content, 'Title'),
    description:      section(content, 'Description'),
    whatsNew:         section(content, "What's new in this version", 'Что нового в этой версии'),
    shortDescription: section(content, 'Short description'),
    features:   features    ? features.split('\n').filter(l => l.trim())    : [],
    searchTerms: searchTerms ? searchTerms.split('\n').filter(l => l.trim()) : [],
  };
}

function cell(val) {
  const s = String(val ?? '');
  return (s.includes('"') || s.includes(',') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function main() {
  const files = fs.readdirSync(STORE_DIR)
    .filter(f => /^listing-[a-z]{2}\.md$/.test(f))
    .sort();

  const langs = files.map(f => f.replace('listing-', '').replace('.md', ''));
  const data  = {};
  for (const lang of langs) {
    data[lang] = parse(fs.readFileSync(path.join(STORE_DIR, `listing-${lang}.md`), 'utf8'));
  }

  const colNames = langs.map(l => LANG_NAMES[l] || l);
  const rows = [['Field', 'Type', ...colNames].join(',')];

  const row = (field, type, fn) => rows.push(
    [cell(field), cell(type), ...langs.map(fn)].join(',')
  );
  const v = (lang, fn) => { try { return fn(data[lang]) ?? ''; } catch { return ''; } };

  row('ProductName',    'Text', l => v(l, d => d.title));
  row('Description',   'Text', l => v(l, d => d.description));
  row('WhatsNew',      'Text', l => v(l, d => d.whatsNew));

  for (let i = 1; i <= 20; i++)
    row(`ProductFeatures${i}`, 'Text', l => v(l, d => d.features[i - 1] ?? ''));

  row('ShortDescription', 'Text', l => v(l, d => d.shortDescription));

  for (let i = 1; i <= 7; i++)
    row(`SearchTerms${i}`, 'Text', l => v(l, d => d.searchTerms[i - 1] ?? ''));

  row('Applicable license terms', 'Text', l => LICENSE[l] || LICENSE.en);
  row('Copyright',   'Text', () => COPYRIGHT);
  row('DevelopedBy', 'Text', () => '');

  for (let i = 1; i <= 11; i++) row(`RequirementsMinimum${i}`,    'Text', () => '');
  for (let i = 1; i <= 11; i++) row(`RequirementsRecommended${i}`, 'Text', () => '');
  for (let i = 1; i <= 2;  i++) row(`StoreLogos${i}`,    IMG_TYPE, () => '');
  for (let i = 1; i <= 10; i++) row(`Screenshots${i}`,   IMG_TYPE, () => '');
  row('HeroArts', 'Text', () => '');
  row('Trailers',  'Text', () => '');

  fs.writeFileSync(OUTPUT, '﻿' + rows.join('\n') + '\n', 'utf8');
  console.log(`✅ ${OUTPUT}`);
  console.log(`   Languages: ${colNames.join(', ')}`);
}

main();
