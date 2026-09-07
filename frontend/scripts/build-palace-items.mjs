/* psygames-build-palace-items · VER 1 · 07.09.2026 */
/**
 * Собирает карту картинок предметов «Дворца памяти» из assets/images/palace/.
 *
 * ЗАЧЕМ КАРТА, А НЕ ДИНАМИЧЕСКИЙ require. Metro разрешает require только по
 * литералу пути: `require('...' + id)` не соберётся. Поэтому карта пишется
 * файлом, а файл — скриптом, чтобы добавление картинки не требовало правки
 * руками и не забывалось.
 *
 * ЗАПУСК:  node scripts/build-palace-items.mjs
 * ВЫХОД:   src/games/memory-palace/palaceItems.generated.ts
 *
 * ⚠️ Имя предмета в игре и имя файла совпадают не всегда (в игре `cup`, файл
 * `teacup.webp`), поэтому расхождения перечислены в СООТВЕТСТВИЯХ ниже. Всё
 * остальное берётся по совпадению имени.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = join(dirname(fileURLToPath(import.meta.url)), '..');
const ПАПКА = join(корень, 'assets/images/palace');
const ВЫХОД = join(корень, 'src/games/memory-palace/palaceItems.generated.ts');

/** id предмета в игре → имя файла, когда они не совпадают. */
const СООТВЕТСТВИЯ = {
  cup: 'teacup',
  boat: 'paperboat',
  bell: 'handbell',
  clock: 'pocketwatch',
  shell: 'seashell',
};

const файлы = readdirSync(ПАПКА).filter((f) => f.endsWith('.webp')).sort();
const поИмени = new Set(файлы.map((f) => f.replace('.webp', '')));

const строки = [];
for (const [id, файл] of Object.entries(СООТВЕТСТВИЯ)) {
  if (!поИмени.has(файл)) throw new Error(`нет картинки ${файл}.webp для предмета ${id}`);
  строки.push(`  ${id}: require('@/assets/images/palace/${файл}.webp'),`);
}
for (const имя of poИмениОтсортировано()) {
  if (Object.values(СООТВЕТСТВИЯ).includes(имя)) continue;
  строки.push(`  ${имя}: require('@/assets/images/palace/${имя}.webp'),`);
}
function poИмениОтсортировано() { return [...поИмени].sort(); }

/**
 * ⚠️ ШТАМП ПИШЕТ ГЕНЕРАТОР, А НЕ ЧЕЛОВЕК. Гейт `core-module-stamp` требует его
 * ПЕРВОЙ строкой у каждого ядра; поставить руками в собранном файле мало —
 * следующая пересборка его снесёт, и гейт покраснеет у того, кто просто
 * перезапустил скрипт.
 */
const текст = `/* psygames-memory-palace-palace-items · VER 1 · 07.09.2026 */
/* СОБРАНО СКРИПТОМ scripts/build-palace-items.mjs — РУКАМИ НЕ ПРАВИТЬ. */
/**
 * Картинки предметов «Дворца памяти»: ключ — id предмета из core/content.ts
 * (или имя файла для запаса, ещё не заведённого в библиотеку).
 *
 * Пересобрать:  node scripts/build-palace-items.mjs
 * Источник:     frontend/assets/images/palace/*.webp (лист 7×8, kie + bg-cutout)
 */
export const PALACE_ITEM_IMAGES: Record<string, number> = {
${строки.join('\n')}
};

/** Есть ли картинка для этого предмета. */
export function palaceItemImage(id: string): number | null {
  return PALACE_ITEM_IMAGES[id] ?? null;
}
`;
writeFileSync(ВЫХОД, текст, 'utf8');
console.log(`собрано ${строки.length} картинок → ${ВЫХОД}`);
