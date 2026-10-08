#!/usr/bin/env node
// КАРТИНКИ РЕЖИМОВ АНАГРАММ И СТИЛЬ ПРОФИЛЯ — ИЗ ВЕБА, А НЕ ВТОРОЙ КОПИЕЙ В DART.
//
// Веб показывает на выборе режима картинку, разную под профиль (`превьюРежима`,
// `frontend/src/games/anagrams/core/modeThumbs.ts`): 4 режима × 7 материальных стилей, 13 профилей
// сведены в 7 стилей картой `СТИЛЬ_ПРОФИЛЯ`. Ту же карту берёт «Корректура»
// (`frontend/src/games/fillwords/core/modeThumbs.ts` импортирует `стильПрофиля`).
// Экспорт пишет:
//   · `flutter/assets/anagram_modes/<режим>__<стиль>.webp` — картинки как есть, байт в байт;
//   · `flutter/lib/games/anagrams/mode_thumbs.g.dart` — режимы, стили, запасной стиль, карта профилей.
// Сторож `flutter/test/anagram_mode_switch_test.dart` держит копии равными источнику.
//
// Запуск: node flutter/tools/embed-anagram-modes.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const WEB = join(FLUTTER, '..', 'frontend');
const SRC = join(WEB, 'src', 'games', 'anagrams', 'core', 'modeThumbs.ts');
const IMAGES = join(WEB, 'assets', 'images', 'anagram-modes');
const OUT_DIR = join(FLUTTER, 'assets', 'anagram_modes');
const OUT_DART = join(FLUTTER, 'lib', 'games', 'anagrams', 'mode_thumbs.g.dart');

const src = readFileSync(SRC, 'utf8');

/** Литерал после `marker =` читаем вычислением: комментарии и юникод внутри не мешают. */
function evalLiteralAfter(text, marker, open, close) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`не найдено: ${marker}`);
  const from = text.indexOf(open, text.indexOf('=', start));
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return new Function('return ' + text.slice(from, i + 1))();
  }
  throw new Error(`не закрыт литерал: ${marker}`);
}

const modes = evalLiteralAfter(src, 'export const ВСЕ_РЕЖИМЫ', '[', ']');
const styles = evalLiteralAfter(src, 'export const ВСЕ_СТИЛИ', '[', ']');
const profiles = evalLiteralAfter(src, 'const СТИЛЬ_ПРОФИЛЯ', '{', '}');
const fallback = /export const СТИЛЬ_ПО_УМОЛЧАНИЮ[^=]*=\s*'([a-z]+)'/.exec(src)?.[1];
if (!fallback) throw new Error('не найден СТИЛЬ_ПО_УМОЛЧАНИЮ');
for (const s of Object.values(profiles)) if (!styles.includes(s)) throw new Error(`стиль ${s} не в ВСЕ_СТИЛИ`);

mkdirSync(OUT_DIR, { recursive: true });
let copied = 0;
for (const m of modes) {
  for (const s of styles) {
    copyFileSync(join(IMAGES, `${m}__${s}.webp`), join(OUT_DIR, `${m}__${s}.webp`));
    copied++;
  }
}

const q = (s) => `'${s}'`;
writeFileSync(OUT_DART, [
  '// СГЕНЕРИРОВАНО: flutter/tools/embed-anagram-modes.mjs — руками не править.',
  '// Источник: frontend/src/games/anagrams/core/modeThumbs.ts (ВСЕ_РЕЖИМЫ, ВСЕ_СТИЛИ, СТИЛЬ_ПРОФИЛЯ).',
  '',
  `const anagramThumbModesData = <String>[${modes.map(q).join(', ')}];`,
  '',
  `const anagramThumbStylesData = <String>[${styles.map(q).join(', ')}];`,
  '',
  `const anagramThumbFallbackStyleData = ${q(fallback)};`,
  '',
  `const anagramThumbProfileStyleData = <String, String>{${Object.entries(profiles).map(([p, s]) => `${q(p)}: ${q(s)}`).join(', ')}};`,
  '',
].join('\n'));

console.log(`картинок ${copied}, профилей ${Object.keys(profiles).length}, стилей ${styles.length}, запасной ${fallback}`);
