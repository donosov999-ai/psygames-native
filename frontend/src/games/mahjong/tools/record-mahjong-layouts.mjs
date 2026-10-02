// VER 1 · 01.10.2026 · psygames-search-claude-mac
// РАСКЛАДКИ МАДЖОНГА ДЛЯ FLUTTER — flutter/assets/levels/mahjong_layouts.json прогоном ЖИВОГО
// layoutCatalogue() (frontend/src/games/mahjong/layouts.ts). Источник раскладок — ffalt/mah, MIT.
//
// 🔴 ВЫГРУЗЧИК ВОССТАНОВЛЕН (задача 34d94c30, опись 0cc437af). Ассет развернули 23.09.2026 для переноса
// на Flutter (87bc3f37), а скрипт в репозиторий не положили. Ручную правку стёрла бы первая пересборка,
// а пересобрать было нечем. `--check` повторяет нынешний файл ПОБАЙТНО — значит, собран он тем же путём.
//
// Запись: { id, name, cat, layers, width, height, zxy } — места раскладки подряд тройками
// (слой, x, y) в полуклетках, в порядке layoutCatalogue(). Читатель — MahjongLayouts.fromJson
// (flutter/lib/games/mahjong/model.dart).
//
// Запуск (из корня репозитория):
//   node frontend/src/games/mahjong/tools/record-mahjong-layouts.mjs           — записать;
//   node frontend/src/games/mahjong/tools/record-mahjong-layouts.mjs --check   — сверить без записи.
// Нужен node, который сам снимает типы TypeScript (v22.18+ или v23.6+): layouts.ts грузится как есть.
import {existsSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../../../..');
const OUT = resolve(FRONTEND, '../flutter/assets/levels/mahjong_layouts.json');

// Псевдоним '@/…' (tsconfig paths) и импорты без расширения — так их понимает сборщик веба,
// а голый node нет. Других отличий от сборки у выгрузчика быть не должно.
const TRY = ['', '.ts', '.tsx', '.js', '/index.ts'];
registerHooks({
  resolve(specifier, context, next) {
    let base = null;
    if (specifier.startsWith('@/')) base = join(FRONTEND, specifier.slice(2));
    else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith('file:')) {
      base = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      for (const ext of TRY) {
        const file = base + ext;
        if (existsSync(file) && statSync(file).isFile()) return next(pathToFileURL(file).href, context);
      }
    }
    return next(specifier, context);
  },
});

const {layoutCatalogue} = await import('../layouts.ts');

const doc = {
  source: 'https://github.com/ffalt/mah · src/assets/data/boards.json',
  license: 'MIT — Copyright (c) 2016 ffalt. Полный текст: frontend/src/games/mahjong/vendor/LICENSE-mah',
  note: 'Развёрнуто прогоном layoutCatalogue() 23.09.2026 для переноса на Flutter (задача 87bc3f37).',
  layouts: layoutCatalogue().map((l) => ({
    id: l.id,
    name: l.name,
    cat: l.cat,
    layers: l.layers,
    width: l.width,
    height: l.height,
    zxy: l.places.flatMap((p) => [p.layer, p.x, p.y]),
  })),
};
const text = `${JSON.stringify(doc)}\n`;

if (process.argv.includes('--check')) {
  const now = readFileSync(OUT, 'utf8');
  if (now === text) {
    console.log(`✓ ${doc.layouts.length} раскладок — совпадает побайтно (${text.length} знаков)`);
  } else {
    let i = 0;
    while (i < now.length && now[i] === text[i]) i += 1;
    console.error(`✗ расходится с ${OUT} с позиции ${i}:\n  было:  …${now.slice(i, i + 60)}\n  стало: …${text.slice(i, i + 60)}`);
    process.exit(1);
  }
} else {
  writeFileSync(OUT, text);
  console.log(`записано ${doc.layouts.length} раскладок → ${OUT}`);
}
