#!/usr/bin/env node
// АДРЕСА 42 ГОЛОВОЛОМОК — ИЗ РЕЕСТРА РЕЖИМОВ, А НЕ РУКАМИ В КАРТЕ ПЕРЕХВАТА.
//
// 🔴 ЗАЧЕМ ГЕНЕРАТОР, А НЕ 42 СТРОКИ. Карта перехвата в `hybrid_app.dart` пишется
// руками, и это правильно, пока экран один на адрес. Головоломки устроены иначе:
// экран ОДИН, а адресов 42, и отличает их только хвост `?mode=`. Сорок две строки,
// переписанные с `modes.json`, — это сорок два места, где карта может молча
// разойтись с реестром: режим переименуют, а перехват останется на старом имени и
// человек попадёт в веб-версию поверх уже перенесённой игры.
//
// 🔴 ХВОСТ КОДИРУЕТСЯ. У четырёх игр в имени пробел («Light Up», «Train Tracks»,
// «Black Box», «Same Game»), и веб-версия ходит на `?mode=Light%20Up` — ровно так
// же лежит в `hubs.json`. Ключ карты обязан совпасть с адресом БУКВА В БУКВУ,
// поэтому здесь `encodeURIComponent`, а разбор адреса умеет и раскодированный вид.
//
// Запуск: node flutter/tools/embed-puzzle-routes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const MODES = join(FLUTTER, 'assets', 'puzzles', 'modes.json');
const OUT = join(FLUTTER, 'lib', 'shell', 'puzzle_routes.g.dart');

/** Режим без хвоста: веб-экран берёт его при пустом `?mode=` (`names.ts:69`). */
const DEFAULT_MODE = 'Unruly';

const modes = JSON.parse(readFileSync(MODES, 'utf8'));
const names = Object.keys(modes);
if (names.length !== 42) {
  console.error(`🔴 в реестре ${names.length} режимов, а их 42 — чинить надо embed-puzzle-modes.mjs`);
  process.exit(1);
}
if (!names.includes(DEFAULT_MODE)) {
  console.error(`🔴 режима «${DEFAULT_MODE}» нет в реестре, а он стоит за голым /games/puzzles`);
  process.exit(1);
}

const lines = [`  '/games/puzzles': (s) => PuzzlesScreen(state: s, mode: '${DEFAULT_MODE}'),`];
for (const name of names.sort()) {
  const tail = encodeURIComponent(name);
  lines.push(`  '/games/puzzles?mode=${tail}': (s) => PuzzlesScreen(state: s, mode: ${JSON.stringify(name)}),`);
}

writeFileSync(OUT, `// СГЕНЕРИРОВАНО tools/embed-puzzle-routes.mjs — руками не править.
// Источник: assets/puzzles/modes.json (${names.length} режимов).
//
// Экран головоломок один, а адресов ${names.length + 1}: голый /games/puzzles ведёт на
// «${DEFAULT_MODE}», остальные отличаются хвостом ?mode=. Имя режима в хвосте закодировано
// так же, как его пишет веб-версия, — иначе четыре игры с пробелом в имени
// («Light Up», «Train Tracks», «Black Box», «Same Game») перехватываться не будут.
library;

import 'package:flutter/widgets.dart';

import '../games/puzzles/screen.dart';
import 'shared_state.dart';

Map<String, Widget Function(SharedState)> puzzleRoutes() => {
${lines.join('\n')}
};
`);
console.log(`адресов головоломок: ${lines.length} (режимов ${names.length} + голый /games/puzzles)`);
