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

const [откуда] = process.argv.slice(2).filter(x => x !== '--check');
const проверка = process.argv.includes('--check');
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

const текущий = JSON.parse(readFileSync(ЦЕЛЬ, 'utf8'));
// Older versions of the graphical editor did not round-trip the recipes.
// Preserve the single file's current recipes, never fall back to TS arrays.
данные.зарядки ??= текущий.зарядки;
const { запас, темы, языки, политика } = данные.зарядки ?? {};
const проблемы = [];
for (const id of Object.keys(текущий.профили)) {
  const профиль = данные.профили?.[id];
  for (const day of [0, 1, 2, 3, 4, 5, 6]) for (const slot of ['утро', 'день', 'вечер', 'ночь']) {
    for (const min of [5, 10, 15]) if (!Array.isArray(профиль?.сетка?.[day]?.[slot]?.[min])) {
      проблемы.push(`${id}/${day}/${slot}/${min}: нет клетки (пустую задайте [])`);
    }
  }
}
if (данные.format !== 1 || !запас || !темы || !Array.isArray(языки) || !языки.length || !политика?.замены) {
  проблемы.push('неполный формат или раздел «зарядки»');
}
for (const key of Object.keys(текущий.зарядки?.запас ?? {})) if (запас?.[key] == null) проблемы.push(`зарядки/запас/${key}: нет значения`);
for (const key of Object.keys(текущий.зарядки?.темы ?? {})) if (!темы?.[key]?.length) проблемы.push(`зарядки/темы/${key}: нет шагов`);
const запрет = новыйЗапрет(политика);
function новыйЗапрет(p) { return new Set(p?.тихо ? Object.keys(p.замены ?? {}) : []); }
function проверить(x, место) {
  if (!x || typeof x !== 'object') return;
  if (запрет.has(x.game_id ?? x.id)) проблемы.push(`${место}: ${x.game_id ?? x.id} несовместим с тихой зарядкой`);
  for (const [k, v] of Object.entries(x)) проверить(v, `${место}/${k}`);
}
проверить(данные.профили, 'профили');
проверить(данные.наборы, 'наборы');
проверить([запас, темы, языки, политика?.варианты], 'зарядки');
if (проблемы.length) {
  console.error(`🔴 Заводской JSON не заменён. Ошибок: ${проблемы.length}\n${проблемы.slice(0, 12).join('\n')}`);
  process.exit(1);
}
const текст = JSON.stringify(данные);
if (!проверка) writeFileSync(ЦЕЛЬ, текст + '\n', 'utf8');

const профилей = Object.keys(данные.профили ?? {}).length;
const наборов = (данные.наборы ?? []).length;
const клеток = Object.values(данные.профили ?? {})
  .flatMap((п) => Object.values(п.сетка ?? {}))
  .flatMap((д) => Object.values(d0(д)))
  .reduce((с, дл) => с + Object.keys(дл).length, 0);
function d0(x) { return x; }

console.log(`✅ ${проверка ? 'проверка без записи' : path.relative(path.join(ЗДЕСЬ, '..'), ЦЕЛЬ)}`);
console.log(`   профилей ${профилей} · серий ${наборов} · клеток зарядки ${клеток} · ${(текст.length / 1024 / 1024).toFixed(2)} МБ`);
console.log('   проверить: npx jest src/__tests__/default-playlists-ship.test.ts');
