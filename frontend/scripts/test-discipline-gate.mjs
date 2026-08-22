#!/usr/bin/env node
/**
 * ДИСЦИПЛИНА ПРОВЕРОК — то, чего не видит ни tsc, ни сам jest.
 *
 * 🔴 ДВА КЛАССА, КОТОРЫЕ ПРОХОДЯТ МИМО ЗЕЛЁНОЙ СБОРКИ.
 *
 * 1. `it.only` / `describe.only`. Один такой вызов ВЫКЛЮЧАЕТ ВЕСЬ ОСТАЛЬНОЙ ФАЙЛ:
 *    jest прогонит одну проверку из тридцати и напишет «PASS». Забытый после отладки
 *    `.only` — обычное дело, а стоит он целого гейта, который считается работающим.
 *    Туда же `it.skip` / `xit`: выключенная проверка выглядит как существующая.
 *
 * 2. Прогон, в котором почти ничего не запустилось. Сломанная настройка, отвалившийся
 *    трансформер, опечатка в шаблоне путей — и jest честно сообщает «0 упавших»,
 *    потому что запускать было нечего. Выход нулевой, сборка зелёная, проверок нет.
 *    Поэтому здесь стоит ПОЛ: сколько файлов и объявленных проверок должно быть.
 *
 * 3. Проверка, которую никто не запускает. Обычный прогон ищет `src/__tests__/**\/*.test.ts`,
 *    а `npm run test:levels` — `src/__gates__/*.gate.ts`. Файл, положенный не туда или
 *    названный не так, не попадает НИ ПОД ОДИН шаблон: он лежит в репозитории, читается
 *    как проверка, обсуждается как проверка — и не выполняется никогда.
 *
 * Пол поднимается вместе с набором — он не должен становиться формальностью.
 * Считаем статически, по исходникам: скрипт обязан работать и до прогона.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/__tests__', 'src/__gates__'];
/**
 * Пол: набор растёт, и опускать эти числа нельзя без явного решения.
 *
 * ⚠️ СЧЁТ ЗДЕСЬ СТАТИЧЕСКИЙ И МЕНЬШЕ ПРОГОННОГО. `it.each([...])` объявляется
 * ОДИН раз, а запускается по разу на каждый случай: на 22.08.2026 в исходниках
 * 2395 объявлений против 2911 запущенных проверок. Пол сравнивается с первым
 * числом. Он ловит «почти ничего не осталось», а не мелкие изменения набора.
 */
const MIN_FILES = 170;
const MIN_TESTS = 2200;

const files = [];
for (const root of ROOTS) {
  let entries;
  try { entries = readdirSync(root); } catch { continue; }
  for (const name of entries) {
    const path = join(root, name);
    if (statSync(path).isFile() && /\.(test|gate)\.ts$/.test(name)) files.push(path);
  }
}

const bad = [];
const orphans = [];
let tests = 0;

// Файл проверки, который не попадает ни под один шаблон запуска.
for (const root of ROOTS) {
  let entries;
  try { entries = readdirSync(root); } catch { continue; }
  for (const name of entries) {
    if (!statSync(join(root, name)).isFile()) continue;
    if (!/\.ts$/.test(name)) continue;
    const isTest = /\.test\.ts$/.test(name);
    const isGate = /\.gate\.ts$/.test(name);
    if (root.endsWith('__tests__') && !isTest) orphans.push(`${join(root, name)}: в __tests__ запускаются только *.test.ts`);
    if (root.endsWith('__gates__') && !isGate) orphans.push(`${join(root, name)}: в __gates__ запускаются только *.gate.ts`);
  }
}
for (const path of files) {
  const src = readFileSync(path, 'utf8');
  // Комментарии режем: упоминание `.only` в пояснении — не вызов.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const m of code.matchAll(/(^|[^\w$.])(it|test|describe)\.(only|skip)\s*\(/g)) {
    bad.push(`${path}: ${m[2]}.${m[3]}(`);
  }
  for (const m of code.matchAll(/(^|[^\w$.])(xit|xdescribe)\s*\(/g)) bad.push(`${path}: ${m[2]}(`);
  tests += [...code.matchAll(/(^|[^\w$.])(it|test)(\.each\([\s\S]*?\))?\s*\(/g)].length;
}

const problems = [];
if (bad.length) problems.push(`выключенные или одиночные проверки:\n  ${bad.join('\n  ')}`);
if (orphans.length) problems.push(`проверки, которые никто не запускает:\n  ${orphans.join('\n  ')}`);
if (files.length < MIN_FILES) problems.push(`файлов проверок ${files.length}, ожидалось не меньше ${MIN_FILES}`);
if (tests < MIN_TESTS) problems.push(`объявленных проверок ${tests}, ожидалось не меньше ${MIN_TESTS}`);

if (problems.length) {
  console.error('Дисциплина проверок нарушена:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Дисциплина проверок: файлов ${files.length}, объявленных проверок ${tests} — порядок.`);
