import { readFileSync } from 'fs';
import { resolve } from 'path';
import { WHATS_NEW } from '@/src/constants/whatsNew';

test('full Dart archive equals the actual TS export: every version/date/RU+EN item, in order', () => {
  const file = resolve(__dirname, '../../../flutter/assets/whats_new.json');
  const bytes = readFileSync(file);
  expect(bytes.length).toBeGreaterThan(50 * 1024);
  expect(JSON.parse(bytes.toString('utf8'))).toEqual({ entries: WHATS_NEW });
});
