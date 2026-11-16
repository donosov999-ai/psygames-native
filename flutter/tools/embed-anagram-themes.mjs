#!/usr/bin/env node
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flutter = dirname(fileURLToPath(import.meta.url));
copyFileSync(
  join(flutter, '..', '..', 'frontend', 'src', 'constants', 'anagramWords.json'),
  join(flutter, '..', 'assets', 'words', 'themes.json'),
);
console.log('assets/words/themes.json обновлён из frontend/src/constants/anagramWords.json');
