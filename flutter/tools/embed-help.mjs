#!/usr/bin/env node
// Derive native help from the existing web registry; do not maintain a second list.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = readFileSync(new URL('../../frontend/src/constants/helpMap.ts', import.meta.url), 'utf8');
const marker = 'export const HELP_MAP: Record<string, HelpEntry> = ';
const start = source.indexOf(marker);
if (start < 0) throw new Error('HELP_MAP assignment missing');
const entries = JSON.parse(source.slice(start + marker.length).trim().replace(/;\s*$/, ''));
for (const [route, entry] of Object.entries(entries)) {
  if (!route.startsWith('/games/') || typeof entry.introKey !== 'string') {
    throw new Error(`Invalid help entry: ${route}`);
  }
}
const out = new URL('../assets/game_help_routes.json', import.meta.url);
writeFileSync(out, JSON.stringify(entries, null, 2) + '\n');
console.log(`${Object.keys(entries).length} help routes → ${fileURLToPath(out)}`);
