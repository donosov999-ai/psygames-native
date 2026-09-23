/* psygames-flutter-memory-palace-reference · VER 1 · 24.09.2026 */
/**
 * ВЫГРУЗКА «ДВОРЦА ПАМЯТИ» ИЗ ЖИВОГО TS: содержимое в ассет + эталоны для сверки.
 *
 * 🔴 ЗАЧЕМ ПРОГОН, А НЕ «ПЕРЕПИСАТЬ И СРАВНИТЬ». Проверять перенос той же
 * формулой, которой переносил, нельзя: такая проба зелена всегда. Числа здесь
 * снимаются прогоном НАСТОЯЩИХ модулей `src/games/memory-palace/core/*`.
 *
 * 🔴 У ЭТОЙ ИГРЫ ДВА ГЕНЕРАТОРА СЛУЧАЙНОСТИ, И ПУТАТЬ ИХ НЕЛЬЗЯ. Маршрут
 * перемешивается ОТДЕЛЬНОЙ веткой (`:route:`): возьми общую — и наборы
 * предметов поменялись бы на всех уровнях разом, включая первые пять, где
 * маршрут вообще не трогают. Эталон ловит и это.
 *
 * ЭТО НЕ ПРОБА, А ПРИБОР: в обычный прогон не попадает. Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-memory-palace-reference.test.ts'
 */
import {
  FIXED_PALACE_ROUTE,
  MEMORY_PALACE_LOCALES,
  PALACE_ITEM_LIBRARY,
  confirmMemoryPalacePlacements,
  continueToPlacement,
  continueToReverseRecall,
  createMemoryPalaceSession,
  currentRecallLocus,
  generateMemoryPalaceRound,
  getMemoryPalaceStrings,
  memoryPalaceLociCountForLevel,
  memoryPalaceRouteIsShuffled,
  placeSelectedItemAtLocus,
  selectPlacementItem,
  selectRecallItem,
  startMemoryPalaceRecall,
  startMemoryPalaceRound,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, data: string, enc: string): void;
};
const path = require('path') as { resolve(...p: string[]): string };
const FLUTTER = path.resolve(__dirname, '..', '..', 'flutter');

/** Уровни по порогам: 5 — последний с постоянным маршрутом, 6 — первый с перемешанным. */
const LEVELS = [1, 3, 5, 6, 7, 9, 11, 13, 15];

/**
 * Партия целиком: разложить предметы по порядку и назвать их верно в обе стороны.
 * `shift` сдвигает ответ припоминания — так снимается и НЕидеальная партия.
 */
function play(seed: string, level: number, shift: number) {
  let s: MemoryPalaceSession = startMemoryPalaceRound(
    createMemoryPalaceSession({ seed, level }), 0,
  );
  s = continueToPlacement(s);
  const targets = s.round.targetItems;
  for (let i = 0; i < s.round.lociCount; i += 1) {
    s = selectPlacementItem(s, targets[i]!.id);
    s = placeSelectedItemAtLocus(s, i);
  }
  s = confirmMemoryPalacePlacements(s);
  const placements = [...(s.finalizedPlacements ?? [])];
  s = startMemoryPalaceRecall(s);

  const шагиПрямо: string[] = [];
  for (let i = 0; i < s.round.lociCount; i += 1) {
    const locus = currentRecallLocus(s);
    const ответ = placements[(i + shift) % placements.length]!;
    шагиПрямо.push(`${locus?.id ?? '—'}→${ответ}`);
    s = selectRecallItem(s, ответ, 30_000);
  }
  s = continueToReverseRecall(s);
  const обратно = [...placements].reverse();
  for (let i = 0; i < s.round.lociCount; i += 1) {
    s = selectRecallItem(s, обратно[(i + shift) % обратно.length]!, 60_000);
  }
  return { phase: s.phase, placements, шагиПрямо, result: s.result };
}

it('выгружает содержимое и эталоны «Дворца памяти»', () => {
  /* ── 1. Содержимое в ассет: места, предметы и подписи на 12 языках ── */
  const content = {
    meta: {
      source: 'frontend/src/games/memory-palace/core',
      note: 'Выгружено прогоном живого TS: frontend/scripts/flutter-memory-palace-reference.test.ts',
      loci: FIXED_PALACE_ROUTE.length,
      items: PALACE_ITEM_LIBRARY.length,
      locales: MEMORY_PALACE_LOCALES,
    },
    route: FIXED_PALACE_ROUTE.map((l) => ({
      id: l.id, order: l.order, motif: l.motif, color: l.color, label: l.label,
    })),
    items: PALACE_ITEM_LIBRARY.map((i) => ({
      id: i.id, shape: i.shape, color: i.color, accent: i.accent, label: i.label,
    })),
    /**
     * 🔴 ПОДПИСИ ЭКРАНА — ДАННЫМИ, А НЕ ЛИТЕРАЛАМИ В КОДЕ. У приложения
     * двенадцать языков; строка, зашитая в экран, знает ровно один.
     */
    strings: Object.fromEntries(MEMORY_PALACE_LOCALES.map((l) => [l, getMemoryPalaceStrings(l)])),
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'assets'), { recursive: true });
  fs.writeFileSync(path.resolve(FLUTTER, 'assets', 'memory-palace.json'), JSON.stringify(content), 'utf8');
  expect(content.route.length).toBeGreaterThanOrEqual(12);
  expect(content.items.length).toBeGreaterThanOrEqual(16);

  /* ── 2. Эталоны: расклады по уровням и три сыгранные партии ── */
  const rounds = LEVELS.map((level) => {
    const r = generateMemoryPalaceRound('flutter-ref', level);
    return {
      level,
      id: r.id,
      difficulty: r.difficulty,
      lociCount: r.lociCount,
      routeShuffled: memoryPalaceRouteIsShuffled(level),
      lociIds: r.loci.map((l) => l.id),
      lociOrder: r.loci.map((l) => l.order),
      targetItemIds: r.targetItems.map((i) => i.id),
      distractorItemIds: r.distractorItems.map((i) => i.id),
      recallCandidateIds: r.recallCandidates.map((i) => i.id),
    };
  });

  const reference = {
    meta: {
      source: 'frontend/src/games/memory-palace/core',
      note: 'Прогон живого TS. Dart обязан повторить до знака.',
      seed: 'flutter-ref',
      levels: LEVELS,
      lociForLevel: LEVELS.map((l) => memoryPalaceLociCountForLevel(l)),
    },
    rounds,
    plays: [
      { level: 3, shift: 0, ...play('flutter-ref', 3, 0) },
      { level: 7, shift: 0, ...play('flutter-ref', 7, 0) },
      { level: 7, shift: 1, ...play('flutter-ref', 7, 1) },
    ],
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'test', 'fixtures'), { recursive: true });
  fs.writeFileSync(
    path.resolve(FLUTTER, 'test', 'fixtures', 'memory-palace-reference.json'),
    JSON.stringify(reference, null, 1),
    'utf8',
  );

  expect(reference.plays.map((p) => p.phase)).toEqual(['result', 'result', 'result']);
  expect((reference.plays[0] as any).result.accuracy).toBe(1);
  expect((reference.plays[2] as any).result.accuracy).toBeLessThan(1);
  /* Маршрут до пятого уровня постоянный, с шестого перемешан — это и есть лестница. */
  expect(rounds.find((r) => r.level === 5)!.routeShuffled).toBe(false);
  expect(rounds.find((r) => r.level === 6)!.routeShuffled).toBe(true);
});
