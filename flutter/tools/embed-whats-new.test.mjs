import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { archiveJson, archiveFromSource } from './embed-whats-new.mjs';

test('standalone generator reproduces every byte of the bundled full archive', () => {
  const source = readFileSync(new URL('../../frontend/src/constants/whatsNew.ts', import.meta.url), 'utf8');
  const output = readFileSync(new URL('../assets/whats_new.json', import.meta.url), 'utf8');
  assert.equal(archiveJson(source), output);
  assert.ok(Buffer.byteLength(output) > 50 * 1024);
});

test('quotes, brackets, multiline notes and duplicate versions retain order/content', () => {
  const source = `export const WHATS_NEW: WhatsNewEntry[] = [
    {version: 'x', date: 'date', ru: ['[test] \\'quote\\''], en: ['line\\nline']},
    {version: 'x', date: 'next', ru: [], en: ['last']},
  ];`;
  const data = JSON.parse(JSON.stringify(archiveFromSource(source)));
  assert.deepEqual(data.entries, [
    {version: 'x', date: 'date', ru: ["[test] 'quote'"], en: ['line\nline']},
    {version: 'x', date: 'next', ru: [], en: ['last']},
  ]);
});

test('nonliteral/empty/malformed archives fail instead of silently truncating', () => {
  for (const literal of ['[]', '[{version: 1, date: "x", ru: [], en: []}]', '[{version: "1", date: "x", ru: [], en: [null]}]']) {
    assert.throws(() => archiveFromSource(`export const WHATS_NEW: WhatsNewEntry[] = ${literal};`));
  }
  assert.throws(() => archiveFromSource('export const WHATS_NEW = getArchive();'));
});
