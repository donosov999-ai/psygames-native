#!/usr/bin/env node
/* psygames-cake-record-paths · VER 1 · 16.09.2026 */
/**
 * Записывает длины предъявленных партий (луч, `beamPath`) в `levels.json`.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ ГЕНЕРАТОРА. Генератор пересчитывает и минимум, и доску, и
 * доказательство решаемости — полный прогон на 120 уровней идёт десятки минут и
 * переписывает файл целиком. Здесь добавляется ОДНО поле по уже снятым журналам
 * замера, остальные поля и формат не трогаются: дифф — только `path`.
 * Генератор при следующей пересборке запишет то же самое сам (та же функция,
 * та же ширина).
 *
 *   node scripts/measure/cake-record-paths.mjs <журнал> [<журнал> …]
 * Строки журнала — вывод `cake-three-star-margin.measure.ts` («L 45 · … · путь 76 · …»).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const ФАЙЛ = path.join(ЗДЕСЬ, '../../src/games/cake-sort/core/levels.json');
const журналы = process.argv.slice(2);
if (!журналы.length) { console.error('нужен хотя бы один журнал'); process.exit(2); }

const пути = new Map();
for (const ж of журналы) {
  for (const строка of fs.readFileSync(ж, 'utf8').split('\n')) {
    const m = /^L\s*(\d+) · .*? · путь\s+(\d+|—) ·/.exec(строка);
    if (!m) continue;
    if (m[2] === '—') { console.error(`🔴 L${m[1]}: луч не дошёл — записывать нечего`); process.exit(1); }
    const L = Number(m[1]); const p = Number(m[2]);
    if (пути.has(L) && пути.get(L) !== p) { console.error(`🔴 L${L}: два журнала дают разное (${пути.get(L)} и ${p}) — ширина разная?`); process.exit(1); }
    пути.set(L, p);
  }
}

const данные = JSON.parse(fs.readFileSync(ФАЙЛ, 'utf8'));
const нет = [];
данные.levels = данные.levels.map((u) => {
  const p = пути.get(u.level);
  if (p === undefined) нет.push(u.level);
  /* Порядок ключей — как пишет генератор: …, min, path, tries, proven. */
  const { level, types, plates, queue, min, tries, proven, ...прочее } = u;
  delete прочее.path;
  return { level, types, plates, queue, min, path: p ?? null, tries, proven, ...прочее };
});
if (нет.length) { console.error(`🔴 без длины партии: ${нет.join(',')}`); process.exit(1); }
/* ⚠️ Отступ 1 — формат origin/main (сверено байт в байт 16.09.2026); тот же, что пишет генератор. */
fs.writeFileSync(ФАЙЛ, `${JSON.stringify(данные, null, 1)}\n`, 'utf8');
console.log(`записано: ${пути.size} уровней · файл ${path.relative(process.cwd(), ФАЙЛ)}`);
