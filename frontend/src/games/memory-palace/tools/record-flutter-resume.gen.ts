/* psygames-memory-palace-record-flutter-resume · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН НЕДОИГРАННОЙ ПАРТИИ «ДВОРЦА ПАМЯТИ» ДЛЯ FLUTTER-ПОЛОВИНЫ.
 *
 * 🔴 ЗАЧЕМ. Экран нативный с 24.09, а продолжение партии (веб: `saveResume` + `useResumeBoot`,
 * снимок `snapshotForResume`) при переносе потерялось: свернул приложение посреди раскладки —
 * партия начинается заново (задача 1077f0ae). Запись лежит в ОБЩЕМ ключе
 * `psygames_resume_memory_palace_<профиль>`, и одну партию открывают обе половины: снимок,
 * записанный вебом, обязан подниматься нативно, и наоборот.
 *
 * Пишет `flutter/test/fixtures/memory-palace-resume-reference.json`: партии в разных фазах —
 * СПИСОК ДЕЙСТВИЙ, который к ним привёл, снимок `snapshotForResume` и подъём `restoreFromResume`.
 * Dart-проба проигрывает те же действия на своей сессии и обязана дать тот же снимок, а веб-снимок
 * — поднять.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `frontend/src/games/memory-palace/{core/session,integration}.ts` — ПЕРЕЗАПУСТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/memory-palace/tools/record-flutter-resume.gen.ts'
 */
import {
  confirmMemoryPalacePlacements,
  continueToPlacement,
  continueToReverseRecall,
  createMemoryPalaceSession,
  pauseMemoryPalaceSession,
  placeSelectedItemAtLocus,
  selectPlacementItem,
  selectRecallItem,
  startMemoryPalaceRecall,
  startMemoryPalaceRound,
} from '../core/session';
import type { MemoryPalaceSession } from '../core/types';
import { makeSeed, restoreFromResume, snapshotForResume } from '../integration';

declare const __dirname: string;
declare function require(m: string): any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mkdirSync, writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dirname, join } = require('path');
const ROOT = join(__dirname, '../../../../..');

/** Действие партии — ровно то, что умеет и нативная сессия. */
type Действие =
  | ['start', number]
  | ['toPlace']
  | ['item', string]
  | ['locus', number]
  | ['confirm']
  | ['recall']
  | ['answer', string, number]
  | ['reverse']
  | ['pause', number];

function применить(s: MemoryPalaceSession, д: Действие): MemoryPalaceSession {
  switch (д[0]) {
    case 'start': return startMemoryPalaceRound(s, д[1]);
    case 'toPlace': return continueToPlacement(s);
    case 'item': return selectPlacementItem(s, д[1]);
    case 'locus': return placeSelectedItemAtLocus(s, д[1]);
    case 'confirm': return confirmMemoryPalacePlacements(s);
    case 'recall': return startMemoryPalaceRecall(s);
    case 'answer': return selectRecallItem(s, д[1], д[2]);
    case 'reverse': return continueToReverseRecall(s);
    case 'pause': return pauseMemoryPalaceSession(s, д[1]);
  }
}

describe('эталон продолжения «Дворца памяти» для Flutter', () => {
  it('пишет партии в разных фазах: действия, снимок, подъём', () => {
    const cases: unknown[] = [];
    for (const level of [1, 4, 9]) {
      const seed = makeSeed(level, `fixture${level}`);
      const база = createMemoryPalaceSession({ seed, level });
      const t = база.round.targetItems.map((i) => i.id);
      const n = база.round.lociCount;
      const всё: Действие[] = [];
      for (let i = 0; i < n; i += 1) всё.push(['item', t[i]!], ['locus', i]);
      // Вспоминание: верные ответы по порядку мест (прямо), затем обратно.
      const прямо: Действие[] = t.slice(0, n).map((id, i) => ['answer', id, 200_000 + i * 1000]);
      const обратно: Действие[] = [...t.slice(0, n)].reverse().map((id, i) => ['answer', id, 300_000 + i * 1000]);

      const сценарии: Array<{ name: string; actions: Действие[]; now: number }> = [
        { name: 'route', actions: [['start', 1000]], now: 5000 },
        { name: 'place-partial-hand', actions: [['start', 1000], ['toPlace'], ['item', t[0]!], ['locus', 0], ['item', t[1]!], ['locus', 1], ['item', t[2]!]], now: 61_000 },
        { name: 'place-locus-first', actions: [['start', 1000], ['toPlace'], ['locus', 2], ['item', t[0]!], ['locus', 1]], now: 40_000 },
        { name: 'place-revision', actions: [['start', 1000], ['toPlace'], ['item', t[0]!], ['locus', 0], ['item', t[1]!], ['locus', 1], ['item', t[0]!], ['locus', 1]], now: 50_000 },
        { name: 'paused-in-place', actions: [['start', 1000], ['toPlace'], ['item', t[0]!], ['locus', 0], ['pause', 30_000]], now: 45_000 },
        { name: 'study', actions: [['start', 1000], ['toPlace'], ...всё, ['confirm']], now: 120_000 },
        { name: 'recall-forward', actions: [['start', 1000], ['toPlace'], ...всё, ['confirm'], ['recall'], ...прямо.slice(0, 2)], now: 210_000 },
        { name: 'recall-reverse', actions: [['start', 1000], ['toPlace'], ...всё, ['confirm'], ['recall'], ...прямо, ['reverse'], ...обратно.slice(0, 1)], now: 310_000 },
      ];
      for (const с of сценарии) {
        let s = база;
        for (const д of с.actions) s = применить(s, д);
        const snapshot = snapshotForResume(s, level, с.now);
        const restored = snapshot ? restoreFromResume(snapshot, 900_000) : null;
        cases.push({
          name: с.name,
          level,
          seed,
          actions: с.actions,
          now: с.now,
          phaseBefore: s.phase,
          snapshot,
          restoredAt: 900_000,
          restored: restored ? { seed: restored.seed, level: restored.level, session: restored.session } : null,
        });
      }
    }
    const путь = join(ROOT, 'flutter/test/fixtures/memory-palace-resume-reference.json');
    mkdirSync(dirname(путь), { recursive: true });
    writeFileSync(путь, `${JSON.stringify({ source: 'frontend/src/games/memory-palace/tools/record-flutter-resume.gen.ts', cases }, null, 1)}\n`);
    expect(cases.length).toBe(24);
  });
});
