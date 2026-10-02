#!/usr/bin/env node
// НАБОРЫ ИГР — ИЗ ВЕБА, А НЕ ВТОРОЙ КОПИЕЙ В DART.
//
// Набор (`frontend/src/constants/gameSuites.ts`) — ярлык над маршрутами: одна карточка в развилке,
// а внутри экрана настройки плашки «Режим» переключают маршрут. В нативе наборов не было вовсе:
// у каждого набора одна карточка на первый режим, переключателя нет ни в одном экране, и 11 игр
// не открывались из развилок (замер 02.10.2026: Корси, «Наоборот», Simon, ANT, go/no-go, …).
// Нативный переключатель (`lib/shell/suite_switch.dart`) читает этот ассет; сторож
// `frontend/src/__tests__/native-suites-asset.test.ts` держит его равным источнику.
//
// Запуск: node flutter/tools/embed-suites.mjs   (после — node flutter/tools/embed-l10n.mjs:
// подписи режимов он берёт из этого ассета, `labelKey`).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const SRC = join(FLUTTER, '..', 'frontend', 'src', 'constants', 'gameSuites.ts');
const OUT = join(FLUTTER, 'assets', 'game_suites.json');

const src = readFileSync(SRC, 'utf8');

/** Литерал массива из TS читаем вычислением, как `embed-hubs.mjs`: комментарии и юникод внутри. */
function evalArrayAfter(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`не найдено: ${marker}`);
  const open = text.indexOf('[', text.indexOf('=', start));
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) {
      return new Function('return ' + text.slice(open, i + 1))();
    }
  }
  throw new Error(`не закрыт массив: ${marker}`);
}

const suites = evalArrayAfter(src, 'export const GAME_SUITES').map((s) => ({
  id: s.id,
  titleKey: s.titleKey,
  descKey: s.descKey,
  modes: s.modes.map((m) => ({ route: m.route, labelKey: m.labelKey })),
}));
if (!suites.length) throw new Error('наборов 0 — разбор сломан');

// По набору на строку: два PR, добавивших по набору, git сведёт сам (урок hubs.json, 01.10.2026).
const body = suites.map((s) => '  ' + JSON.stringify(s)).join(',\n');
writeFileSync(OUT, `{\n"source": "frontend/src/constants/gameSuites.ts",\n"suites": [\n${body}\n]\n}\n`);
console.log(`✅ наборов ${suites.length}, режимов ${suites.reduce((n, s) => n + s.modes.length, 0)} → assets/game_suites.json`);
