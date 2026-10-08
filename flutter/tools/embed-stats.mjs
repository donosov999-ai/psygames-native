#!/usr/bin/env node
// ПРАВИЛА «ПРОГРЕССА» ДЛЯ НАТИВНОГО РАСЧЁТА — КОНСТАНТЫ ВЕБА, А НЕ ВТОРАЯ КОПИЯ (d6a60b02, вариант Б).
//
// «Прогресс» считает модель на Dart (`lib/shell/stats_model.dart` и соседи), а числа его правил живут
// у веба в пяти файлах: пороги уровней (`services/tokens.ts`), «меньше — лучше» и дни истории
// (`services/trainingHistory.ts`), окно сдвига области (`services/analytics.ts`), старые имена партий
// (`services/api.ts`). Скрипт вырезает их в `assets/stats_rules.json`; правка на вебе без пересборки
// краснеет в CI.
//
// Запуск: node flutter/tools/embed-stats.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICES = join(HERE, '..', '..', 'frontend', 'src', 'services');

/** Значение константы `name` из файла: литерал после `=` до `;` верхнего уровня. */
function constant(file, name) {
  const src = readFileSync(join(SERVICES, file), 'utf8');
  const m = new RegExp(`\\bconst\\s+${name}\\b[^=]*=`).exec(src);
  if (!m) throw new Error(`нет ${name} в ${file}`);
  const start = m.index + m[0].length;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) return new Function(`return (${src.slice(start, i)})`)();
  }
  throw new Error(`не закрыт ${name} в ${file}`);
}

const out = {
  levelThresholds: constant('tokens.ts', 'LEVEL_THRESH'),
  lowerIsBetter: Object.keys(constant('trainingHistory.ts', 'LOWER_IS_BETTER')).sort(),
  maxHistoryDays: constant('trainingHistory.ts', 'MAX_HISTORY_DAYS'),
  defaultRoad: constant('trainingHistory.ts', 'DEFAULT_ROAD'),
  minForTrend: constant('analytics.ts', 'MIN_FOR_TREND'),
  halfWindowMs: constant('analytics.ts', 'HALF_WINDOW_MS'),
  legacyGameTypes: constant('api.ts', 'LEGACY_GAME_TYPE_MAP'),
};
writeFileSync(join(HERE, '..', 'assets', 'stats_rules.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(`правил «Прогресса»: ${Object.keys(out).length} → assets/stats_rules.json`);
