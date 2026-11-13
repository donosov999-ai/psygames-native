// Mechanical staging only; originals and existing app icons are never overwritten.
// node tools/stage-hub-art.mjs /absolute/design-refresh-20261024
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const design = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw Error('Pass absolute design folder');
const flutter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = path.join(design, 'game-icons-codex-20261028');
const staging = path.join(art, 'staging-all-145-20261030');
const inventory = JSON.parse(fs.readFileSync(path.join(design, 'all-hubs-3col-20261113/inventory.json')));
const old = JSON.parse(fs.readFileSync(path.join(staging, 'route-map.json')));
const extraPath = path.join(design, 'hub-art-20261113/extra-art.json');
const extras = fs.existsSync(extraPath) ? JSON.parse(fs.readFileSync(extraPath)) : {};
const byRoute = Object.fromEntries(old.items.map(item => [item.route, item]));
const cards = [...new Map(inventory.hubs.flatMap(h => h.cards).map(c => [c.route, c])).values()];
const out = path.join(flutter, 'assets/hub_art');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const index = { version: 1, status: 'local-review-candidate-not-published', byRoute: {} };
const provenance = [];
const missing = [];
for (const theme of ['light', 'dark']) fs.mkdirSync(path.join(out, theme), { recursive: true });
for (const card of cards) {
  const candidate = byRoute[card.route];
  const extra = extras[card.route];
  if (!candidate && !extra) { missing.push(card.route); continue; }
  const entry = {};
  const files = {};
  for (const theme of ['light', 'dark']) {
    const source = candidate ? path.join(staging, candidate[theme]) : extra[theme];
    if (!fs.existsSync(source)) throw Error(`Missing source: ${source}`);
    const file = path.basename(source);
    const target = path.join(out, theme, file);
    // A basename shared by aliases is permitted only for identical bytes.
    if (fs.existsSync(target) && digest(source) !== digest(target)) throw Error(`Collision: ${target}`);
    fs.copyFileSync(source, target);
    entry[theme] = `assets/hub_art/${theme}/${file}`;
    files[theme] = { source, target: entry[theme], sha256: digest(target) };
  }
  index.byRoute[card.route] = entry;
  provenance.push({
    route: card.route, title: card.titleEn,
    mapping: candidate ? 'exact-route-in-existing-atlas-map' : 'new-dedicated-hub-art',
    acceptance: card.route === '/games/mental-rotation'
      ? 'Denis accepted FIRST Codex light illustration 2026-11-13; dark companion remains candidate'
      : 'candidate; not individual visual acceptance',
    originalPng: candidate ? Object.fromEntries(['light', 'dark'].map(t => [t, path.join(art, candidate[t].replace(/\.webp$/, '.png'))])) : extra.original,
    files,
  });
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
const review = path.join(flutter, '../review');
fs.mkdirSync(review, { recursive: true });
fs.writeFileSync(path.join(review, 'hub-art-provenance.json'), JSON.stringify({ sourceCommit: inventory.commit, cards: cards.length, mapped: provenance.length, missing, items: provenance }, null, 2) + '\n');
const modes = path.join(design, 'hub-art-20261113/mental-modes');
if (fs.existsSync(modes)) {
  fs.mkdirSync(path.join(out, 'mental_modes'), { recursive: true });
  const names = ['mixed', 'rotation', 'projection', 'net', 'viewpoint', 'same', 'assembly', 'memory', 'formation', 'section', 'missing', 'oblique'];
  const modeProvenance = names.map(name => {
    const source = path.join(modes, `${name}.webp`);
    const target = path.join(out, 'mental_modes', `${name}.webp`);
    fs.copyFileSync(source, target);
    return { name, source, target: path.relative(flutter, target), sha256: digest(target), status: 'new-illustration-candidate-not-approved' };
  });
  fs.writeFileSync(path.join(review, 'mental-mode-art-provenance.json'), JSON.stringify(modeProvenance, null, 2) + '\n');
}
console.log(JSON.stringify({ cards: cards.length, mapped: provenance.length, missing }, null, 2));
