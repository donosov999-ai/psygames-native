#!/usr/bin/env node
// УРОВНИ «ТОРТОВ» И «ПИЦЦЫ» ДЛЯ НАТИВНОГО ЭКРАНА — ПОБАЙТНОЙ КОПИЕЙ ИЗ ВЕБА, А НЕ РУКАМИ.
//
// 🔴 ПОЧЕМУ СКРИПТОМ (задача 87ca926a, 02.10.2026). Два файла лежали в Flutter с 23.09
// побайтными копиями веб-данных, а копировщика в репозитории не было: копию делала разовая
// проба переноса и удалялась. Вшитые данные без выгрузчика не чинятся — пересобрали в вебе
// расклады (`tools/generate-levels.gen.ts`) или пути (`tools/record-solutions.gen.ts`), и
// приложение молча играло бы старыми. Расхождение ловит проба
// `flutter/test/cake_levels_match_web_test.dart`; этот скрипт его чинит.
//
// ⚠️ КОПИЯ, А НЕ ПЕРЕВОД. Расклады уже доказаны решателем веба (`proven`), а пути записаны
// им же; генератор и решатель в Dart не переносятся. Любая правка «по дороге» сделала бы из
// доказанного недоказанное.
//
// Что пишет:
//   flutter/assets/levels/cake_sort.json      ← frontend/src/games/cake-sort/core/levels.json
//   flutter/assets/levels/cake_solutions.json ← frontend/src/games/cake-sort/core/solutions.json
//
// Запуск: node flutter/tools/embed-cake-levels.mjs   (из корня дерева)
import { copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const ROOT = join(FLUTTER, '..');
const CORE = join(ROOT, 'frontend', 'src', 'games', 'cake-sort', 'core');
const OUT = join(FLUTTER, 'assets', 'levels');

const PAIRS = [
  ['levels.json', 'cake_sort.json'],
  ['solutions.json', 'cake_solutions.json'],
];

for (const [from, to] of PAIRS) {
  const src = join(CORE, from);
  const dst = join(OUT, to);
  const before = (() => {
    try {
      return readFileSync(dst);
    } catch {
      return null;
    }
  })();
  copyFileSync(src, dst);
  const after = readFileSync(dst);
  const changed = before === null || !before.equals(after);
  console.log(`${to}: ${after.length} байт${changed ? ' — обновлён' : ' — без изменений'}`);
}
