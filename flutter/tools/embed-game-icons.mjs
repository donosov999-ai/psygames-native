#!/usr/bin/env node
// ИКОНКИ ИГР — В ПРИЛОЖЕНИЕ ИЗ ТОГО ЖЕ РЕЕСТРА, ЧТО У ВЕБА.
//
// 🔴 ЧТО БЫЛО. Иконки «поле игры в миниатюре» (решение Дениса 13.09.2026: «иконка
// должна быть мини-экраном приложения») лежали только в вебе:
// `frontend/assets/images/game_icons/*.webp` + реестр `frontend/src/constants/gameIcons.ts`.
// Развилки приложения нативные (Flutter, `lib/shell/hub_screen.dart`), и строки там
// рисовали значок Material по имени — замер 01.10.2026: картинок-иконок в
// `flutter/assets` 0. Денис 01.10: показывать иконки В ПРИЛОЖЕНИИ, в строках развилок.
//
// Вторая копия реестра руками начала бы отставать молча, поэтому — выгрузка:
//   · каждая картинка реестра → `flutter/assets/game_icons/<файл>.webp` (байт в байт);
//   · `flutter/assets/game_icons/index.json`: nameKey → файл и адрес → файл. Строка
//     развилки знает nameKey, а не id игры, — тот же путь, что у веба (`gameIconByNameKey`).
//     Но 7 строк подписаны своим ключом (`suiteStroop` ведёт на `/games/stroop`), поэтому
//     второй путь — по адресу. Адрес сверяется ЦЕЛИКОМ, с режимом после `?`: «Башни»
//     судоку не получат иконку обычного судоку.
//   · 01.10.2026 (решение Дениса «да делай»): у режимов своя иконка — `MODE_ICONS` в том же
//     `gameIcons.ts`, ключ = адрес строки целиком (41 головоломка Тэтхэма, «Башни» и «Неравенства»
//     судоку, «Найди ход»). Они идут во второй путь, по адресу.
// Свежесть сторожит `flutter/test/hub_game_icons_test.dart` (тем же правилом пересчитывает карту).
//
// Запуск: node flutter/tools/embed-game-icons.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const FRONT = join(FLUTTER, '..', 'frontend');
const ICONS_TS = join(FRONT, 'src', 'constants', 'gameIcons.ts');
const GAMES_TS = join(FRONT, 'src', 'constants', 'games.ts');
const SRC_DIR = join(FRONT, 'assets', 'images', 'game_icons');
const OUT_DIR = join(FLUTTER, 'assets', 'game_icons');

/** id → файл из реестра `GAME_ICONS` (строки вида `id: require('…/game_icons/file.webp')`;
 * id с дефисом пишется в кавычках: `'sudoku-samurai': require(…)`). */
export function readRegistry(text) {
  const out = {};
  const re = /^\s*'?([a-z0-9_-]+)'?:\s*require\('\.\.\/\.\.\/assets\/images\/game_icons\/([^']+)'\)/gm;
  for (let m; (m = re.exec(text)); ) out[m[1]] = m[2];
  return out;
}

/** Адрес строки → файл из `MODE_ICONS` (режимы и экраны без записи в GAMES; ключ — адрес целиком). */
export function readModes(text) {
  const out = {};
  // Адрес — любой экран приложения (07.10.2026: «Ночная» развилки «Релаксация» живёт на `/warmup-night`).
  const re = /^\s*'(\/[^']+)':\s*require\('\.\.\/\.\.\/assets\/images\/game_icons\/([^']+)'\)/gm;
  for (let m; (m = re.exec(text)); ) out[m[1]] = m[2];
  return out;
}

/** Из `GAMES`: nameKey → id и route → id (поля того же объекта, что идут после его `id:`). */
export function readGames(text) {
  const body = text.slice(text.indexOf('export const GAMES'));
  const byNameKey = {};
  const byRoute = {};
  let id = null;
  for (const line of body.split('\n')) {
    const i = line.match(/^\s*id:\s*'([^']+)'/);
    if (i) { id = i[1]; continue; }
    if (!id) continue;
    const n = line.match(/^\s*nameKey:\s*'([^']+)'/);
    if (n && !(n[1] in byNameKey)) byNameKey[n[1]] = id;
    const r = line.match(/^\s*route:\s*'([^']+)'/);
    if (r && !(r[1] in byRoute)) byRoute[r[1]] = id;
  }
  return { byNameKey, byRoute };
}

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export function buildIndex(registry, games, modes = {}) {
  const pick = (m) => Object.fromEntries(Object.entries(m).filter(([, id]) => registry[id]).map(([k, id]) => [k, registry[id]]));
  const byRoute = pick(games.byRoute);
  // Адрес режима не должен спорить с адресом игры: две иконки на одну строку — ошибка реестра.
  for (const [route, file] of Object.entries(modes)) {
    if (byRoute[route] && byRoute[route] !== file) throw new Error(`${route}: в GAMES ${byRoute[route]}, в MODE_ICONS ${file}`);
    byRoute[route] = file;
  }
  return { byNameKey: sorted(pick(games.byNameKey)), byRoute: sorted(byRoute) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const iconsTs = readFileSync(ICONS_TS, 'utf8');
  const registry = readRegistry(iconsTs);
  const modes = readModes(iconsTs);
  const games = readGames(readFileSync(GAMES_TS, 'utf8'));
  const index = buildIndex(registry, games, modes);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const files = [...new Set([...Object.values(registry), ...Object.values(modes)])].sort();
  const have = new Set(readdirSync(SRC_DIR));
  const lost = files.filter((f) => !have.has(f));
  if (lost.length) throw new Error(`в реестре есть, на диске нет: ${lost.join(', ')}`);
  for (const f of files) copyFileSync(join(SRC_DIR, f), join(OUT_DIR, f));
  writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify({
    source: 'frontend/src/constants/gameIcons.ts + games.ts (flutter/tools/embed-game-icons.mjs)',
    ...index,
  }, null, 1)}\n`);
  console.log(`иконок ${files.length}, ключей названий ${Object.keys(index.byNameKey).length}, адресов ${Object.keys(index.byRoute).length}`);
}
