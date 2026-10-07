#!/usr/bin/env node
// ЛИГИ И РАМКИ ДЛЯ НАТИВНОГО РАСЧЁТА — ТАБЛИЦЫ ВЕБА, А НЕ ВТОРАЯ КОПИЯ НА DART (d6a60b02, вариант Б).
//
// «Лиги» считают модель на Dart (`lib/shell/progression.dart`), а пороги лиг, ранги, рамки и длина
// сезона живут у веба в `frontend/src/services/progression.ts`. Скрипт вырезает их в
// `assets/progression.json`; правка порога на вебе без пересборки краснеет в CI («Сгенерированное
// совпадает с исходниками»). Ключи названий (`nameKey`) подбирает `embed-l10n.mjs`.
//
// Запуск: node flutter/tools/embed-progression.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', '..', 'frontend', 'src', 'services', 'progression.ts'), 'utf8');

/** Литерал после `export const <ИМЯ>…= ` — вычислением (массив или число). */
function literal(name) {
  const start = SRC.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`нет ${name}`);
  const eq = SRC.indexOf('= ', start) + 2;
  if (SRC[eq] !== '[') return Number(/^[\d_]+/.exec(SRC.slice(eq))[0].replace(/_/g, ''));
  let depth = 0;
  for (let i = eq; i < SRC.length; i++) {
    if (SRC[i] === '[') depth++;
    else if (SRC[i] === ']' && --depth === 0) return new Function(`return ${SRC.slice(eq, i + 1)}`)();
  }
  throw new Error(`не закрыт ${name}`);
}

const out = {
  leagues: literal('LEAGUES').map((l) => ({ id: l.id, from: l.from, nameKey: l.nameKey })),
  ranksPerLeague: literal('RANKS_PER_LEAGUE'),
  frames: literal('FRAMES').map((f) => ({ id: f.id, nameKey: f.nameKey, league: f.league })),
  seasonDays: literal('SEASON_DAYS'),
};
writeFileSync(join(HERE, '..', 'assets', 'progression.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(`лиг: ${out.leagues.length}, рамок: ${out.frames.length}, сезон ${out.seasonDays} дн. → assets/progression.json`);
