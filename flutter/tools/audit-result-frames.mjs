// Source census, not a claim that every route has been played on a device.
// From flutter/: node tools/audit-result-frames.mjs [--check]
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');
const canon = JSON.parse(read('test/fixtures/outcome-canonical-145.json'));

function* dartFiles(dir) {
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = path.posix.join(dir, e.name);
    if (e.isDirectory()) yield* dartFiles(file);
    else if (e.name.endsWith('.dart')) yield file;
  }
}

const sources = new Map();
const classes = new Map();
for (const file of dartFiles('lib/games')) {
  const body = read(file);
  sources.set(file, body);
  for (const [, name] of body.matchAll(/^class ([A-Z]\w+) extends\b/gm)) classes.set(name, file);
}

const calls = source => [...source.matchAll(/^\s*'(\/[^']+)':\s*\([^\n]*?\)\s*=>\s*(?:const\s+)?(\w+)\(/gm)]
  .map(([, route, type]) => [route, type]);
const hybrid = read('lib/shell/hybrid_app.dart').split(' get native =>')[1];
const registrations = new Map([...calls(hybrid), ...calls(read('lib/shell/puzzle_routes.g.dart'))]);
const adapterDelegate = new Map([['PauseScreen', 'lib/games/pause/pause_extras.dart']]);

const counts = new Map();
const rows = [];
for (const { number, route, name_ru: name } of canon) {
  const type = registrations.get(route) ?? registrations.get(route.split('?')[0]);
  const owner = adapterDelegate.get(type) ?? classes.get(type);
  const source = sources.get(owner) ?? '';
  const surface = route === '/warmup-night' ? 'program-not-game'
    : /LevelResult\.adapt\(/.test(source) ? 'adapter-call'
      : /\bLevelResult\(/.test(source) ? 'shared-call'
        : 'needs-review';
  counts.set(surface, (counts.get(surface) ?? 0) + 1);
  rows.push([number, surface, route, name, owner ?? '—'].join('  |  '));
}

console.log('Canonical outcome routes · source inventory (not gameplay/visual coverage)');
console.log([...counts].map(([name, n]) => `${name}=${n}`).join(' · '));
if (!process.argv.includes('--check')) console.log(rows.join('\n'));
if ((counts.get('needs-review') ?? 0) !== 0) {
  console.error(rows.filter(row => row.includes('  |  needs-review  |  ')).join('\n'));
  if (process.argv.includes('--check')) process.exitCode = 1;
}
