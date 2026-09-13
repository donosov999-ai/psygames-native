#!/usr/bin/env node
/* psygames-set-default-playlists · VER 1 · 13.09.2026 */
/**
 * ОБНОВИТЬ ЗАВОДСКОЙ СОСТАВ, КОТОРЫЙ ЕДЕТ В СБОРКЕ.
 *
 *   node scripts/set-default-playlists.mjs "~/Downloads/Code claude/psygames-playlist-editor/psygames-playlists.json"
 *   npx jest src/__tests__/default-playlists-ship.test.ts     ← проверка, что состав читается
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ КОМАНДА. Правило Дениса 13.09.2026: «они вынесены с целью,
 * чтобы код не трогать». Состав — ДАННЫЕ: обновление заводского файла меняет ровно
 * один `.json` и не касается ни одной строки кода. Чтобы это осталось правдой,
 * копирование делается командой, а не руками через редактор кода.
 *
 * ⚠️ Файл кладётся МИНИФИЦИРОВАННЫМ: он попадает в бандл целиком, и отступы в нём —
 * это лишние сотни килобайт у каждого, кто скачал приложение.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const ЦЕЛЬ = path.join(ЗДЕСЬ, '..', 'src', 'constants', 'defaultPlaylists.json');

const откуда = process.argv[2];
if (!откуда) {
  console.error('Укажи путь к файлу состава: node scripts/set-default-playlists.mjs <файл.json>');
  process.exit(1);
}

let данные;
try {
  данные = JSON.parse(readFileSync(откуда.replace(/^~/, process.env.HOME ?? '~'), 'utf8'));
} catch (e) {
  console.error('🔴 файл не читается как JSON:', String(e.message ?? e));
  process.exit(1);
}
if (данные?.app !== 'PsyGames-Playlists') {
  console.error('🔴 это не файл состава: в нём нет метки PsyGames-Playlists');
  process.exit(1);
}

const текст = JSON.stringify(данные);
writeFileSync(ЦЕЛЬ, текст, 'utf8');

const профилей = Object.keys(данные.профили ?? {}).length;
const наборов = (данные.наборы ?? []).length;
const клеток = Object.values(данные.профили ?? {})
  .flatMap((п) => Object.values(п.сетка ?? {}))
  .flatMap((д) => Object.values(d0(д)))
  .reduce((с, дл) => с + Object.keys(дл).length, 0);
function d0(x) { return x; }

console.log(`✅ ${path.relative(path.join(ЗДЕСЬ, '..'), ЦЕЛЬ)}`);
console.log(`   профилей ${профилей} · серий ${наборов} · клеток зарядки ${клеток} · ${(текст.length / 1024 / 1024).toFixed(2)} МБ`);
console.log('   проверить: npx jest src/__tests__/default-playlists-ship.test.ts');
