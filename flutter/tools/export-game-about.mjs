#!/usr/bin/env node
/**
 * «ОБ ИГРЕ» — ДАННЫЕ ИЗ ВЕБ-ЭКРАНОВ В `assets/game_about.json` (задача 3a365b5d).
 *
 * У веба блок `GameAbout` подключала каждая игра сама: `descriptionKey` и список пользы `*_BENEFITS`
 * лежали в её экране. Во Flutter блок — один в каркасе (`lib/shell/game_about.dart`), а игре остаются
 * только данные. Скрипт вынимает их из `frontend/app/games/*.tsx` и пишет по id игры из каталога
 * (`assets/catalog.json`, поле `route`): описание, польза (значок Ionicons + ключ словаря).
 *
 * Запуск из `flutter/`: `node tools/export-game-about.mjs`. `--check` — не писать, а упасть, если файл
 * разошёлся с вебом (для пробы).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const flutter = path.resolve(here, '..');
const games = path.resolve(flutter, '../frontend/app/games');
const out = path.join(flutter, 'assets/game_about.json');

const catalog = JSON.parse(fs.readFileSync(path.join(flutter, 'assets/catalog.json'), 'utf8'));
const byRoute = new Map();
for (const g of catalog.games) if (g.route) byRoute.set(g.route, g.id);

const frontend = path.resolve(flutter, '../frontend');

/** Значение `const NAME = [...]`: массив `{ icon, textKey }` — в экране или в модуле, откуда он импортирован. */
function benefitsOf(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*(?::[^=]+)?=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`, 'u');
  let m = src.match(re);
  if (!m) {
    for (const imp of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/([^']+)'/g)) {
      if (!new RegExp(`\\b${name}\\b`, 'u').test(imp[1])) continue;
      for (const ext of ['.ts', '.tsx']) {
        const f = path.join(frontend, imp[2] + ext);
        if (fs.existsSync(f)) m = fs.readFileSync(f, 'utf8').match(re);
        if (m) break;
      }
      if (m) break;
    }
  }
  if (!m) return null;
  const items = [];
  const item = /\{\s*icon:\s*['"]([^'"]+)['"]\s*(?:as\s+[^,]+)?,\s*textKey:\s*['"]([^'"]+)['"]\s*\}/g;
  for (const x of m[1].matchAll(item)) items.push({ icon: x[1], key: x[2] });
  return items;
}

const result = {};
const problems = [];
for (const file of fs.readdirSync(games).filter((f) => f.endsWith('.tsx')).sort()) {
  const src = fs.readFileSync(path.join(games, file), 'utf8');
  if (!src.includes('<GameAbout')) continue;
  const call = src.match(/<GameAbout\s+descriptionKey=(?:"([^"]+)"|\{`\$\{(\w+)\}([A-Za-z]+)`\})\s+benefits=\{([\p{L}\w]+)\}/u);
  if (!call) { problems.push(`${file}: вызов GameAbout не разобран`); continue; }
  const benefits = benefitsOf(src, call[4]);
  if (!benefits) { problems.push(`${file}: не найден список ${call[4]}`); continue; }
  if (call[1]) {
    const route = `/games/${file.replace(/\.tsx$/, '')}`;
    const id = byRoute.get(route);
    if (!id) { problems.push(`${file}: игры с route ${route} нет в каталоге`); continue; }
    result[id] = { description: call[1], benefits };
    continue;
  }
  // Общий экран нескольких игр (`SortGameScreen`): описание `${titleKey}IntroDesc`, игры — по вызовам
  // экрана с `titleKey` в соседних файлах.
  let found = 0;
  for (const other of fs.readdirSync(games).filter((f) => f.endsWith('.tsx'))) {
    const o = fs.readFileSync(path.join(games, other), 'utf8');
    // Игра — по маршруту файла, где экран вызван (id в каталоге), а не по `gameId` экрана: у
    // «Воды» он с дефисом (`water-sort`), каталог зовёт её `water_sort`.
    const use = o.match(new RegExp(`<SortGameScreen[^>]*?\\b${call[2]}="([^"]+)"`));
    const id = use && byRoute.get(`/games/${other.replace(/\.tsx$/, '')}`);
    if (!use) continue;
    if (!id) { problems.push(`${other}: игры нет в каталоге`); continue; }
    result[id] = { description: use[1] + call[3], benefits };
    found++;
  }
  if (!found) problems.push(`${file}: не найдены игры общего экрана (${call[2]})`);
}
const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const text = JSON.stringify(
  { source: 'frontend/app/games/*.tsx <GameAbout> (tools/export-game-about.mjs)', games: sorted },
  null,
  2,
) + '\n';
if (process.argv.includes('--check')) {
  const now = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (now !== text) { console.error('assets/game_about.json разошёлся с вебом — перезапусти без --check'); process.exit(1); }
  console.log(`ok: ${Object.keys(result).length} игр`);
} else {
  fs.writeFileSync(out, text);
  console.log(`записано: ${Object.keys(result).length} игр`);
}
