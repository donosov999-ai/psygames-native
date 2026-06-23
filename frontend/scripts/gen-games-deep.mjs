import { readFileSync, writeFileSync } from 'fs';
const SITE = JSON.parse(readFileSync('/Users/denisonosov/dev/psygames-astro/src/data/games-deep.json', 'utf8'));
const LANGS = ['ru', 'en', 'es', 'de', 'pt', 'hi', 'zh'];   // языки приложения (сайт шире — берём пересечение)
// app gameId (роут без /games/) → слаг сайта. eye-gym/goods-sort — только в приложении (нет на сайте).
const MAP = {
  anagrams: 'anagrams', ant: 'ant-attention-networks', 'attention-conflict': 'attention-conflict',
  bart: 'bart-risk-balloon', 'choice-rt': 'choice-rt-speed', corsi: 'corsi-blocks', counter: 'counter-math',
  cpt: 'cpt-sustained-attention', 'digit-span': 'digit-span', 'find-differences': 'find-differences',
  flanker: 'flanker-arrows', 'go-no-go': 'go-no-go-inhibition', hanoi: 'tower-of-hanoi', inhibition: 'inhibition',
  iowa: 'iowa-4-decks', 'math-sprint': 'mental-math-sprint', 'memory-matrix': 'memory-matrix',
  'mental-rotation': 'mental-rotation', mnemonics: 'mnemonics-sequence', 'n-back': 'n-back-working-memory',
  'number-bonds': 'number-bonds-math', ospan: 'ospan-math-memory', pattern: 'patterns-reasoning',
  'phonemic-fluency': 'phonemic-fluency-cowat', 'picture-pairs': 'picture-pairs', posner: 'posner-cuing-attention',
  prl: 'prl-reversal-learning', proofreading: 'proofread-focus', 'reading-span': 'reading-span-memory',
  rmet: 'reading-the-mind-in-the-eyes', schulte: 'schulte-attention', sdmt: 'sdmt-symbol-digit',
  'set-game': 'set-triples', simon: 'simon-color-vs-position', span: 'span-sequence-memory',
  'spatial-span': 'spatial-span-backward', 'stop-signal': 'stop-signal-inhibition', 'story-recall': 'story-recall-detail-memory',
  stroop: 'stroop-inhibition', 'stroop-emotional': 'emotional-stroop', sudoku: 'sudoku-6-6',
  'switching-task': 'task-switching', targets: 'targets-reaction', 'tower-london': 'tower-of-london',
  'trail-making': 'trail-making', 'visual-search': 'visual-search', wcst: 'wcst-rules', 'word-pairs': 'word-pairs-memory',
};
const BLOCKS = ['about', 'benefit', 'history', 'creator', 'methods', 'duration', 'research', 'rec', 'faq', 'variants'];
const out = {}; let missing = [], games = 0, langsHit = 0;
for (const [appId, slug] of Object.entries(MAP)) {
  const perLang = {};
  for (const lang of LANGS) {
    const src = SITE[lang]?.[slug];
    if (!src) { missing.push(`${lang}/${slug}`); continue; }
    const o = {};
    for (const b of BLOCKS) if (src[b] != null) o[b] = src[b];
    perLang[lang] = o; langsHit++;
  }
  if (Object.keys(perLang).length) { out[appId] = perLang; games++; }
}
writeFileSync('/Users/denisonosov/dev/psygames/frontend/src/constants/gamesDeep.json', JSON.stringify(out));
console.log(`игр: ${games} | язык-слотов: ${langsHit} | пропусков: ${missing.length}`);
if (missing.length) console.log('ПРОПУСКИ:', missing.slice(0, 20).join(', '));
console.log('размер:', (JSON.stringify(out).length / 1024 / 1024).toFixed(2), 'МБ');
