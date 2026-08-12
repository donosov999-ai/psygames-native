import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const slugs = [
  '3-minute-brain-check',
  'schulte-speed',
  'reaction-duel',
  'memory-matrix',
  'stroop-challenge',
  'n-back-daily',
  'impulse-control',
  'tower-puzzle',
  'focus-defender',
];

const html = await readFile(path.join(dist, 'index.html'), 'utf8');

for (const slug of slugs) {
  const entryDir = path.join(dist, slug);
  await mkdir(entryDir, { recursive: true });
  await writeFile(path.join(entryDir, 'index.html'), html, 'utf8');
}

await writeFile(
  path.join(dist, 'miniapps-manifest.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), slugs }, null, 2)}\n`,
  'utf8',
);

console.log(`Generated ${slugs.length} standalone route entries.`);
