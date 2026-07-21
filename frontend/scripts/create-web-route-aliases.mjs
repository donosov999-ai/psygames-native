import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Expo static export writes /games/schulte.html, while Expo Router hydrates
// against /games/schulte. Static hosts without extensionless rewrites then
// serve the HTML but the client falls into Unmatched Route. Directory aliases
// give both the server and the router the same stable URL: /games/schulte/.
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = path.join(frontendRoot, 'dist', 'games');
const entries = await readdir(gamesDir, { withFileTypes: true });
let created = 0;

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const route = entry.name.slice(0, -5);
  const targetDir = path.join(gamesDir, route);
  await mkdir(targetDir, { recursive: true });
  await copyFile(path.join(gamesDir, entry.name), path.join(targetDir, 'index.html'));
  created += 1;
}

console.log(`Created ${created} directory route aliases in dist/games`);
