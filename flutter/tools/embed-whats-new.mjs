#!/usr/bin/env node
// One canonical archive. Standalone Node: Flutter freshness runs before npm ci.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function archiveFromSource(source) {
  // The export is a literal array through the final ];. Brackets/quotes inside
  // release notes must not be mistaken for its end by a bracket-counting regexp.
  const literal = source.match(/export const WHATS_NEW\s*:\s*WhatsNewEntry\[\]\s*=\s*(\[[\s\S]*\]);\s*$/)?.[1];
  if (!literal) throw new Error('WHATS_NEW must remain a standalone literal array');
  const entries = new Script(`(${literal})`).runInNewContext({}, { timeout: 1000 });
  if (!Array.isArray(entries) || !entries.length) throw new Error('Empty WHATS_NEW archive');
  for (const [idx, e] of entries.entries()) {
    if (!e || typeof e.version !== 'string' || typeof e.date !== 'string'
      || !['ru', 'en'].every(lang => Array.isArray(e[lang]) && e[lang].every(it => typeof it === 'string'))
      || Object.keys(e).sort().join(',') !== 'date,en,ru,version') {
      throw new Error(`Invalid WHATS_NEW entry ${idx}`);
    }
  }
  return { entries }; // no filtering, sorting, translating or deduplicating
}

export function archiveJson(source) {
  return `${JSON.stringify(archiveFromSource(source), null, 1)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = readFileSync(resolve(root, 'frontend/src/constants/whatsNew.ts'), 'utf8');
  const output = resolve(root, 'flutter/assets/whats_new.json');
  const json = archiveJson(source);
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== json) throw new Error('assets/whats_new.json is stale; run node flutter/tools/embed-whats-new.mjs');
  } else writeFileSync(output, json);
  console.log(`What's New: ${JSON.parse(json).entries.length} complete releases → assets/whats_new.json`);
}
