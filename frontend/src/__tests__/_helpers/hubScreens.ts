/* psygames-test-helper-hubs · VER 1 · 04.09.2026 */
/**
 * ИМЕНА РАЗВИЛОК ВЫВОДЯТСЯ ИЗ КАТАЛОГА, А НЕ ВЫПИСЫВАЮТСЯ В КАЖДОМ ГЕЙТЕ.
 *
 * 🔴 ЗАЧЕМ. У проекта уже есть запись об этой грабле: «имена хабов лежали в пяти
 * местах кода и в гейте шестым; третий хаб обязан был попасть в каждое»
 * (game-standard.test.ts). 04.09.2026 развилок стало девять разом — и три гейта
 * (`undo-honesty`, `game-task-line`, `games-registry-covers-all`) покраснели именно
 * потому, что держали список руками.
 *
 * Признак развилки один: `hub: true` в карточке каталога. Его и читаем.
 * Комментарии срезаем — слово «hub» в объяснении не должно сходить за пометку.
 */
declare function require(m: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

export function hubScreenFiles(): Set<string> {
  const каталог = path.join(__dirname, '../../constants/games.ts');
  const raw: string = fs.readFileSync(каталог, 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const из = new Set<string>();
  for (const m of src.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
    if (!/^\s*hub:\s*true,?\s*$/m.test(m[1]!)) continue;
    const r = /route:\s*'\/games\/([a-z0-9-]+)'/.exec(m[1]!);
    if (r) из.add(`${r[1]}.tsx`);
  }
  if (!из.size) throw new Error('в каталоге не нашлось ни одной развилки — разбор сломался');
  return из;
}
