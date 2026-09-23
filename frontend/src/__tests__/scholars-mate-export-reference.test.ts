/* ВЫГРУЗКА ЭТАЛОНОВ «Детского мата» — тем, с чем сверяется нативная половина.
 *
 * Как и у «Доски в уме»: правила переносятся СО СВЕРКОЙ, эталон снимается
 * прогоном ЖИВОГО TS. Файл пишется только по ключу, в CI ничего не пишет:
 *
 *   SCHOLARS_EXPORT=1 npx jest --runTestsByPath \
 *     src/__tests__/scholars-mate-export-reference.test.ts
 *
 * ⚠️ Типов Node в проекте нет (@types/node не стоит), поэтому файловые вызовы
 * объявлены здесь же и живут только под ключом.
 */
declare const require: (id: string) => {
  writeFileSync: (path: string, data: string, enc: string) => void;
  mkdirSync: (path: string, opts: { recursive: boolean }) => void;
  dirname: (path: string) => string;
  resolve: (...parts: string[]) => string;
};
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };

import {
  LEVELS,
  secondsAt,
  secondsFor,
  ВРЕМЯ_ПО_ВИДУ,
  motifsAt,
  видыУровня,
  видыРежима,
  подписиВидов,
  newMotifAt,
  levelParams,
  counts,
  namedMotifCount,
  mixedMotifCount,
  NAMED_MOTIFS,
} from '../games/scholars-mate/core/deck';
import {
  starsFor,
  звёздыПодхода,
  допускПромахов,
  порогУровня,
  объявлятьВид,
  медианаМс,
  размерКлетки,
  ширинаДоски,
} from '../games/scholars-mate/core/run';

test('лестница «Детского мата» читается целиком (и по ключу пишет эталон)', () => {
  const levels: Record<string, unknown> = {};
  for (let level = 1; level <= LEVELS; level++) {
    levels[String(level)] = {
      seconds: secondsAt(level),
      params: levelParams(level),
      motifs: motifsAt(level),
      kinds: видыУровня(level),
      labels: подписиВидов(видыУровня(level)),
      newMotif: newMotifAt(level) ?? null,
      announce: объявлятьВид(level),
      missAllowance: допускПромахов(level),
      threshold: порогУровня(level, 20),
    };
  }
  const reference = {
    source: 'живой TS: src/games/scholars-mate/core/{deck,run}.ts',
    levels: LEVELS,
    perLevel: levels,
    secondsByKind: ВРЕМЯ_ПО_ВИДУ,
    // Время у вида и уровня вместе: именно здесь лестница превращается в темп.
    secondsFor: ['mate', 'fromGames', 'threat', 'defend', 'sacrifice'].flatMap((kind) =>
      [1, 5, 18, 28, 40].map((level) => ({
        kind,
        level,
        seconds: secondsFor(kind as never, level),
      })),
    ),
    counts: counts(),
    namedMotifs: NAMED_MOTIFS,
    namedCounts: NAMED_MOTIFS.map((name) => ({ name, count: namedMotifCount(name) })),
    mixedCount: mixedMotifCount(),
    // Звёзды: пороги времени и цена подсказки.
    stars: [400, 1200, 1399, 1400, 2399, 2400, 5000].flatMap((ms) =>
      [1, 20, 40].map((level) => ({
        ms,
        level,
        stars: starsFor(ms, level),
        withHint: звёздыПодхода(ms, level, 1),
        withoutHint: звёздыПодхода(ms, level, 0),
      })),
    ),
    median: [
      { input: [], out: медианаМс([]) },
      { input: [100], out: медианаМс([100]) },
      { input: [300, 100, 200], out: медианаМс([300, 100, 200]) },
      { input: [400, 100, 200, 300], out: медианаМс([400, 100, 200, 300]) },
    ],
    board: [200, 300, 390].map((size) => ({
      size,
      cell: размерКлетки(size),
      width: ширинаДоски(size),
    })),
    modeKinds: [
      { level: 1, only: 'mate1', motif: '', mixed: false },
      { level: 20, only: '', motif: 'Детский мат', mixed: false },
      { level: 30, only: '', motif: '', mixed: true },
    ].map((c) => ({
      ...c,
      kinds: видыРежима(c.level, c.only as never, c.motif, c.mixed),
    })),
  };
  if (process.env.SCHOLARS_EXPORT === '1') {
    const fs = require('fs');
    const path = require('path');
    const out = path.resolve(
      __dirname,
      '../../../flutter/test/fixtures/scholars-mate-reference.json',
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(reference, null, 2)}\n`, 'utf8');
  }
  expect(Object.keys(levels)).toHaveLength(LEVELS);
});
