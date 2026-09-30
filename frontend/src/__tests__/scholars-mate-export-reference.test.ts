/* ВЫГРУЗКА ЭТАЛОНОВ «Детского мата» — тем, с чем сверяется нативная половина.
 *
 * Правила переносятся СО СВЕРКОЙ: эталон снимается прогоном ЖИВОГО TS, а не
 * переписыванием чисел руками (flutter/test/scholars_mate_check_test.dart
 * сверяет вердикты позиция в позицию).
 *
 * 🔴 ПРОБА НЕ ПИШЕТ ФАЙЛ САМА, И ЭТО НАРОЧНО. Соседи свои выгрузки удаляли
 * после переноса — тогда повторно снять эталон нечем, а он нужен каждый раз,
 * когда правила в вебе меняются. Здесь файл переписывается только по явному
 * ключу, иначе проба просто проверяет, что набор читается:
 *
 *   SCHOLARS_EXPORT=1 npx jest --runTestsByPath \
 *     src/__tests__/scholars-mate-export-reference.test.ts
 */
/*
 * ⚠️ Типов Node в этом проекте нет (@types/node не стоит), и tsc на импортах
 * `fs`/`path` краснеет — пре-коммит хук останавливает выпуск ВСЕМ чатам.
 * Поэтому файловые вызовы объявлены здесь же и живут ТОЛЬКО под ключом.
 */
import {
  puzzlesOf,
  buildDeck,
  buildFlowDeck,
  buildMixedMotifDeck,
  buildNamedDeck,
  levelParams,
  mixedMotifCount,
  namedMotifCount,
  NAMED_MOTIFS,
  видыРежима,
} from '../games/scholars-mate/core/deck';
import { звёздыПодхода, прятатьВид, ступеньПоМедиане } from '../games/scholars-mate/core/run';
import {
  shownFen,
  sideToMove,
  check,
  bestDefence,
  threatAnswer,
  естьМатВОдин,
  матующийХод,
  movesFrom,
  дополнитьХод,
} from '../games/scholars-mate/core/check';
import type { ScholarsKind, ScholarsPuzzle } from '../games/scholars-mate/core/types';
declare const require: (id: string) => {
  writeFileSync: (path: string, data: string, enc: string) => void;
  mkdirSync: (path: string, opts: { recursive: boolean }) => void;
  dirname: (path: string) => string;
  resolve: (...parts: string[]) => string;
};
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };

/** Сколько задач каждого вида уходит в эталон. */
const НА_ВИД = 40;

/** Заведомо неверный ход — чтобы в эталоне был и отрицательный вердикт. */
function неверныйХод(p: ScholarsPuzzle): string {
  const fen = shownFen(p);
  const свои = new Set(p.solutions ?? []);
  for (const поле of ['a1', 'a2', 'b1', 'g1', 'g8', 'b8', 'h1']) {
    const ходы = movesFrom(fen, поле);
    for (const куда of ходы) {
      const uci = дополнитьХод(fen, `${поле}${куда}`);
      if (!свои.has(uci)) return uci;
    }
  }
  return 'a1a2';
}

const ВИДЫ: ScholarsKind[] = ['mate', 'fromGames', 'sacrifice', 'defend', 'threat'];

describe('эталон «Детского мата»', () => {
  it('набор читается, вердикты считаются', () => {
    const эталон: Record<string, unknown> = {};
    for (const kind of ВИДЫ) {
      const все = puzzlesOf(kind);
      expect(все.length).toBeGreaterThan(0);
      const строки = [];
      for (const p of все.slice(0, НА_ВИД)) {
        const показанный = shownFen(p);
        const верный = (p.solutions ?? [])[0];
        строки.push({
          kind,
          fen: p.fen,
          pre: p.pre ?? null,
          solutions: p.solutions ?? [],
          san: p.san ?? [],
          line: p.line ?? [],
          mateIn: p.mateIn,
          rating: p.rating,
          threatFlag: p.threat ?? null,
          shownFen: показанный,
          sideToMove: sideToMove(p),
          threatAnswer: threatAnswer(p),
          mateInOne: естьМатВОдин(показанный),
          matingMove: матующийХод(показанный) ?? null,
          bestDefence: kind === 'defend' ? (bestDefence(p) ?? null) : null,
          verdictRight: верный ? стройВердикт(p, верный) : null,
          verdictWrong: стройВердикт(p, неверныйХод(p)),
        });
      }
      эталон[kind] = строки;
    }

    // Колоды: те же уровни и семена должны давать те же позиции в том же
    // порядке. Сверяется показанная позиция — она и есть то, что видит человек.
    const колоды: Record<string, unknown> = {};
    for (const level of [1, 5, 12, 25, 40]) {
      const п = levelParams(level);
      колоды[`L${level}`] = {
        kinds: п.kinds,
        count: п.count,
        seconds: п.seconds,
        minRating: п.minRating,
        maxRating: п.maxRating,
        motifs: п.motifs,
        deck: buildDeck(level, 1).map((x) => `${x.fen}|${x.pre ?? ''}`),
      };
    }
    эталон['decks'] = колоды;

    // Режимы экрана: узор, микс, поток, жертва — и то, что решает итог подхода.
    // Сверяется то же, что видит человек: показанные позиции в порядке подачи.
    const ключ = (x: ScholarsPuzzle) => `${x.fen}|${x.pre ?? ''}`;
    const узоры = NAMED_MOTIFS.slice(0, 3).concat(NAMED_MOTIFS.slice(-1));
    const режимы: Record<string, unknown> = {
      namedMotifs: NAMED_MOTIFS,
      namedCounts: Object.fromEntries(NAMED_MOTIFS.map((и) => [и, namedMotifCount(и)])),
      mixedCount: mixedMotifCount(),
      named: Object.fromEntries(узоры.flatMap((и) => [
        [`${и}|L1|s1`, buildNamedDeck(и, 1, 1).map(ключ)],
        [`${и}|L20|s2`, buildNamedDeck(и, 20, 2).map(ключ)],
        [`${и}|L8|s3|200`, buildNamedDeck(и, 8, 3, 200).map(ключ)],
      ])),
      mixed: {
        'L1|s1': buildMixedMotifDeck(1, 1).map(ключ),
        'L20|s3': buildMixedMotifDeck(20, 3).map(ключ),
        'L8|s5|200': buildMixedMotifDeck(8, 5, 200).map(ключ),
      },
      flow: {
        'L5|s1': buildFlowDeck(5, 1, 600000).map(ключ),
        'L30|s2|sacrifice': buildFlowDeck(30, 2, 600000, 'sacrifice').map(ключ),
      },
      sacrifice: { 'L12|s4': buildDeck(12, 4, 'sacrifice').map(ключ) },
      kindsOfMode: [
        [3, null, null, false], [10, null, null, false], [20, 'sacrifice', null, false],
        [20, null, NAMED_MOTIFS[0], false], [20, null, null, true], [35, null, null, false],
      ].map(([л, т, у, м]) => ({
        level: л, only: т, motif: у, mix: м,
        kinds: видыРежима(л as number, т as ScholarsKind | null, у as string | null, м as boolean),
      })),
      hide: [1, 28, 29, 40].flatMap((л) => ВИДЫ.map((к) => ({ level: л, kind: к, hide: прятатьВид(л, к) }))),
      step: [0, 900, 1500, 2500, 4000, 7000].flatMap((мс) => [1, 15, 40].map((л) => ({
        medianMs: мс, level: л, step: ступеньПоМедиане(мс, л),
      }))),
      stars: [900, 2500, 7000].flatMap((мс) => [1, 40].flatMap((л) => [0, 1, 3].map((h) => ({
        medianMs: мс, level: л, hints: h, stars: звёздыПодхода(мс, л, h),
      })))),
    };
    эталон['modes'] = режимы;

    if (!process.env.SCHOLARS_EXPORT) return;
    const fs = require('fs');
    const path = require('path');
    const куда = path.resolve(
      __dirname,
      '../../../flutter/test/fixtures/scholars-mate-check-reference.json',
    );
    fs.mkdirSync(path.dirname(куда), { recursive: true });
    fs.writeFileSync(куда, JSON.stringify(эталон, null, 1), 'utf8');
  });
});

function стройВердикт(p: ScholarsPuzzle, uci: string) {
  const v = check(p, uci);
  return {
    uci,
    correct: v.correct,
    best: v.best ?? null,
    reply: v.reply ?? null,
    fenAfter: v.fenAfter ?? null,
    mated: v.mated ?? false,
    refutation: v.refutation ?? null,
  };
}
