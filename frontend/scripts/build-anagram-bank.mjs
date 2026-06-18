// Парсер словаря анаграмм: anagram_dictionary.md → src/constants/anagramWords.json
// Формат входа: "## Русский" / "## English" → "### N букв(ы)/letters" → "- слово — подсказка".
// Тема (t) проставляется по ключевым словам подсказки. Принцип: ВЫСОКАЯ ТОЧНОСТЬ —
// если уверенного совпадения нет, тема не ставится (слово только в «Все»), чтобы в
// конкретной теме не было мусора. Запуск: node scripts/build-anagram-bank.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MD = join(__dirname, '../../anagram_dictionary.md');
const OUT = join(__dirname, '../src/constants/anagramWords.json');

// Порядок важен: первое совпадение выигрывает. Точные ключи подсказок.
// Порядок: животные → дом/предметы (перехватывает посуду/мебель до «еды») → еда → природа → транспорт.
const THEME_RULES = [
  ['animals', /птиц|хищник|рыба(?!к)|зверь|зверёк|насеком|грызун|млекопит|пресмыка|земновод|животн|паук\b|бабочк|стрекоз|водоплав|пингвин|дельфин|panda|animal|bird|fish(?!ing)|insect|reptile|mammal|rodent|predator|farm animal| pet\b/i],
  ['home', /инструмент|крепёж|посуд|прибор|мебель|одежд|обув|кухонн|столов|шкаф|для (резк|перевязк|письм|рисов|шить|уборк|сна|чая|кофе|еды|супа|напитк|цветов|воды)|спальн|вкручива|строгает|tool\b|cutlery|tableware|furniture|clothes|shoe|kitchen|household/i],
  ['food', /фрукт|овощ|ягод|блюдо|пекут|варень|джем|сладк|десерт|конфет|выпечк|приправ|орех|молочн|мясо|крупа|злак|колбас|сосиск|хлеб|гриб|суп(?!ер)|сыр|fruit|vegetable|berry|dish\b|bake|sweet|dessert|soup|bread|nut\b|mushroom|meal\b/i],
  ['nature', /река|реки|море\b|морск|океан|гора\b|горн|вершин|лес\b|озеро|остров|радуга|гроза|закат|рассвет|водопад|ручей|поляна|болото|пустын|цветок|роза\b|ромашк|фиалк|ландыш|одуванчик|тюльпан|василёк|подсолн|растени|трав[аы]|river|sea\b|ocean|mountain|forest|lake\b|island|rainbow|sunset|waterfall|flower|grass|meadow|desert/i],
  ['transport', /транспорт|машина|автомобил|самолёт|вертолёт|корабл|поезд|велосипед|ракета|мотоцикл|автобус|трактор|метро\b|трамвай|троллейбус|vehicle|car\b|airplane|plane\b|helicopter|ship\b|train\b|bicycle|rocket|subway|\btram/i],
];
// Точечные override'ы там, где подсказка обманывает правила (среда обитания животного →
// «природа»; «посуда для супа» → «еда» и т.п.). null = слово остаётся только в «Все».
const OVERRIDE = {
  ветеринар: null, музыкант: null, экскурсия: null, молотилка: null, природа: null, стая: null, крошка: null,
  ложка: 'home', корзина: 'home', кастрюля: 'home', мясорубка: 'home',
  краб: 'animals', креветка: 'animals', крокодил: 'animals', крокодилы: 'animals', осьминог: 'animals',
  nest: null, barn: null, aquarium: null, scarecrow: null, wing: null, hunter: null, green: null,
  deck: null, mast: null, driver: null, sailor: null, garage: null,
  bowl: 'home', spoon: 'home', fork: 'home', screw: 'home',
  ship: 'transport', anchor: 'transport',
  lobster: 'animals', jellyfish: 'animals', starfish: 'animals', seahorse: 'animals', octopus: 'animals',
  bridge: null, mushroom: 'food',
};
function themeFor(hint) {
  for (const [t, re] of THEME_RULES) if (re.test(hint)) return t;
  return null;
}

const lines = readFileSync(MD, 'utf8').split('\n');
const out = { themes: ['all', 'animals', 'food', 'nature', 'home', 'transport'], ru: {}, en: {} };
let lang = null, len = null;
for (const raw of lines) {
  const line = raw.trim();
  if (line === '## Русский') { lang = 'ru'; len = null; continue; }
  if (line === '## English') { lang = 'en'; len = null; continue; }
  const mh = line.match(/^###\s+(\d+)\s+(?:букв|letters?)/i);
  if (mh) { len = mh[1]; if (lang) out[lang][len] = out[lang][len] || []; continue; }
  if (line.startsWith('- ') && lang && len) {
    const body = line.slice(2);
    const parts = body.split(' — ');
    if (parts.length >= 2) {
      const w = parts[0].trim();
      const h = parts.slice(1).join(' — ').trim();
      const entry = { w, h };
      const t = Object.prototype.hasOwnProperty.call(OVERRIDE, w) ? OVERRIDE[w] : themeFor(h);
      if (t) entry.t = t;
      out[lang][len].push(entry);
    }
  }
}

let ruN = 0, enN = 0;
for (const k in out.ru) ruN += out.ru[k].length;
for (const k in out.en) enN += out.en[k].length;
writeFileSync(OUT, JSON.stringify(out), 'utf8');

const dist = {};
for (const lg of ['ru', 'en']) for (const k in out[lg]) for (const e of out[lg][k]) { const t = e.t || '(all-only)'; dist[t] = (dist[t] || 0) + 1; }
console.log(`RU=${ruN} EN=${enN} total=${ruN + enN}`);
console.log('themes:', JSON.stringify(dist));
