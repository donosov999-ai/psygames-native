/* psygames-boss-record-flutter-reference · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН БОЯ С БОССОМ ДЛЯ FLUTTER-ПОЛОВИНЫ. Пишет `flutter/test/fixtures/boss-round-reference.json`.
 *
 * 🔴 ЗАЧЕМ. Босс во Flutter (`flutter/lib/shell/boss_round.dart`) — перенос `bossTask.ts`, а
 * перенос проверяется не той же формулой, которой переносили (такая проба зелёная всегда), а
 * раздачами, снятыми прогоном ЖИВОГО веб-кода. Сверяется всё: сетка, подсветка, варианты и их
 * порядок, ответ, клетки-нарушители — и ЧИСЛО бросков. Лишний или пропавший бросок сдвигает
 * все следующие раздачи, и без счётчика такая ошибка выглядела бы «похожей» раздачей.
 *
 * 🔴 СЛУЧАЙНОСТЬ. Веб зовёт `Math.random` напрямую — на время выгрузки он подменён зерновым
 * `createRng` (FNV-1a + mulberry32, та же арифметика, что `flutter/lib/shell/js_compat.dart`)
 * и возвращается в `finally`. Тащить генератор параметром сквозь веб-экран значило бы менять
 * игру под инструмент.
 *
 * ⚠️ ПОЧЕМУ ЭКСПОРТЁР ЛЕЖИТ В РЕПО. Эталон замораживает ПЕРЕНОС, а не источник: правка
 * `bossTask.ts` после снятия эталона расходит веб и приложение молча. Поэтому:
 *   ПОСЛЕ ЛЮБОЙ ПРАВКИ `frontend/src/components/bossTask.ts` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/components/tools/record-boss-reference.gen.ts'
 */
import { makeTask, type BossTask, type BossType } from '../bossTask';
import { createRng } from '../../games/faces-names/core/rng';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const OUT = join(__dirname, '../../../../flutter/test/fixtures/boss-round-reference.json');
const TYPES: BossType[] = ['counting', 'lightning', 'completeline', 'finderror', 'oddletter', 'gonogo'];
const SEEDS = 40;

type Case = { type: BossType; seed: string; draws: number; task: BossTask };

function deal(type: BossType, seed: string): Case {
  const rng = createRng(seed);
  let draws = 0;
  const original = Math.random;
  Math.random = () => { draws += 1; return rng(); };
  let task: BossTask;
  try {
    task = makeTask(type);
  } finally {
    Math.random = original;
  }
  return { type, seed, draws, task };
}

/** Проверка раздачи ДО записи: эталон, в котором ответа нет среди вариантов, сверял бы брак. */
function check(c: Case): void {
  const t = c.task;
  if (t.kind === 'choose') {
    const opts = t.options ?? [];
    if (opts.length !== 4 || new Set(opts).size !== 4) throw Error(`${c.seed}: вариантов не 4 разных`);
    if (!opts.includes(t.answer as number)) throw Error(`${c.seed}: ответа нет среди вариантов`);
    if (opts.some((o) => o <= 0)) throw Error(`${c.seed}: вариант не больше нуля`);
  } else {
    const grid = t.grid ?? [];
    const bad = t.badCells ?? [];
    if (!bad.length || bad.some((i) => i < 0 || i >= grid.length)) throw Error(`${c.seed}: нарушитель вне сетки`);
  }
}

test('эталон боя с боссом для Flutter', () => {
  const cases: Case[] = [];
  for (const type of TYPES) {
    for (let i = 0; i < SEEDS; i += 1) {
      const c = deal(type, `boss:${type}:${i}`);
      check(c);
      cases.push(c);
    }
  }
  // Раздача детерминирована по зерну: второй прогон обязан совпасть с первым.
  const again = deal('counting', 'boss:counting:0');
  expect(again).toEqual(cases[0]);
  writeFileSync(OUT, JSON.stringify({ source: 'frontend/src/components/bossTask.ts', types: TYPES, seedsPerType: SEEDS, cases }, null, 2) + '\n');
  expect(cases).toHaveLength(TYPES.length * SEEDS);
});
