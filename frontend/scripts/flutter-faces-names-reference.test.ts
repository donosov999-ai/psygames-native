/* psygames-flutter-faces-names-reference · VER 1 · 23.09.2026 */
/**
 * ВЫГРУЗКА «ЛИЦ И ИМЁН» ИЗ ЖИВОГО TS: библиотека людей в ассет + эталоны для сверки.
 *
 * 🔴 ЗАЧЕМ ПРОГОН, А НЕ «ПЕРЕПИСАТЬ И СРАВНИТЬ». Проверять перенос той же
 * формулой, которой переносил, нельзя: такая проба зелена всегда. Числа здесь
 * снимаются прогоном НАСТОЯЩИХ модулей `src/games/faces-names/core/*`, а Dart
 * обязан повторить их до знака.
 *
 * 🔴 БИБЛИОТЕКА ЛЮДЕЙ ТОЖЕ ВЫГРУЖАЕТСЯ, А НЕ ПЕРЕПИСЫВАЕТСЯ. Сорок восемь
 * портретов собираются из индекса (`createFace`), имена и факты лежат на
 * двенадцати языках. Перенести это руками — значит завести второй источник
 * правды, который начнёт отставать молча. Здесь он один: TS.
 *
 * ⚠️ ПОРЯДОК ОБРАЩЕНИЙ К СЛУЧАЙНОСТИ ВАЖЕН НЕ МЕНЬШЕ ФОРМУЛ. Генератор
 * перемешивает и сортирует, и сортировка в JS СТАБИЛЬНА: равные ключи остаются
 * в порядке перемешивания. В Dart `List.sort` нестабилен — перенос обязан
 * сортировать с оглядкой на индекс, иначе тот же seed даст другие варианты
 * ответа. Эталон это и ловит.
 *
 * ЭТО НЕ ПРОБА, А ПРИБОР: в обычный прогон не попадает (jest берёт только
 * `src/__tests__/**`). Перевыпуск — этой командой из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-faces-names-reference.test.ts'
 */
import {
  FACES_NAMES_LOCALES,
  FACT_LIBRARY,
  SYNTHETIC_PERSON_LIBRARY,
  advanceFacesNamesStudy,
  describeSyntheticFace,
  getFacesNamesStrings,
  answerFacesNamesInterference,
  createFacesNamesSession,
  currentFacesNamesTrial,
  currentInterferencePrompt,
  faceDistance,
  generateFacesNamesPuzzle,
  nameDistance,
  nameScript,
  personById,
  selectRecalledFact,
  selectRecalledName,
  selectRecognizedFace,
  startFacesNamesRound,
  type FacesNamesLocale,
  type FacesNamesSession,
} from '@/src/games/faces-names/core';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, data: string, enc: string): void;
};
const path = require('path') as { resolve(...p: string[]): string };

const FLUTTER = path.resolve(__dirname, '..', '..', 'flutter');

/** Уровни выбраны по ПОРОГАМ правил, а не «каждый третий». */
const LEVELS = [1, 4, 5, 7, 8, 9, 12, 17, 20, 25, 33];

/** Партия до конца: всюду верный ответ, чтобы сверить и метрики. */
function playPerfect(seed: string, level: number) {
  let s: FacesNamesSession = startFacesNamesSession(seed, level);
  const шаги: string[] = [];
  while (s.phase === 'study') { шаги.push(`study:${s.studyIndex}`); s = advanceFacesNamesStudy(s); }
  while (s.phase === 'interference') {
    const p = currentInterferencePrompt(s)!;
    шаги.push(`interference:${p.left}+${p.right}=${p.answer}`);
    s = answerFacesNamesInterference(s, p.answer);
  }
  let охрана = 0;
  while (s.phase !== 'result' && охрана < 200) {
    охрана += 1;
    const trial = currentFacesNamesTrial(s)!;
    if (s.phase === 'recognition') { шаги.push(`recognition:${trial.targetPersonId}`); s = selectRecognizedFace(s, trial.targetPersonId); continue; }
    if (s.phase === 'name-recall') { шаги.push(`name:${trial.targetPersonId}`); s = selectRecalledName(s, trial.targetPersonId, 60_000); continue; }
    if (s.phase === 'fact-recall') {
      const target = personById(s.puzzle, trial.targetPersonId)!;
      шаги.push(`fact:${target.factId}`);
      s = selectRecalledFact(s, target.factId, 60_000);
      continue;
    }
    break;
  }
  return { шаги, phase: s.phase, result: s.result };
}

/** Партия с промахами: первый вариант списка, каким бы он ни был. */
function playFirstOption(seed: string, level: number) {
  let s: FacesNamesSession = startFacesNamesSession(seed, level);
  while (s.phase === 'study') s = advanceFacesNamesStudy(s);
  while (s.phase === 'interference') {
    const p = currentInterferencePrompt(s)!;
    s = answerFacesNamesInterference(s, p.options[0] as number);
  }
  let охрана = 0;
  while (s.phase !== 'result' && охрана < 200) {
    охрана += 1;
    const trial = currentFacesNamesTrial(s)!;
    if (s.phase === 'recognition') { s = selectRecognizedFace(s, trial.recognitionPersonIds[0] as string); continue; }
    if (s.phase === 'name-recall') { s = selectRecalledName(s, trial.namePersonIds[0] as string, 45_000); continue; }
    if (s.phase === 'fact-recall') { s = selectRecalledFact(s, trial.factIds[0] as string, 45_000); continue; }
    break;
  }
  return { phase: s.phase, result: s.result };
}

function startFacesNamesSession(seed: string, level: number): FacesNamesSession {
  return startFacesNamesRound(createFacesNamesSession({ seed, level }), 0);
}

it('выгружает библиотеку людей и эталоны «Лиц и имён»', () => {
  /* ── 1. Библиотека в ассет: один источник правды на оба приложения ── */
  const library = {
    meta: {
      source: 'frontend/src/games/faces-names/core',
      note: 'Выгружено прогоном живого TS: frontend/scripts/flutter-faces-names-reference.test.ts',
      people: SYNTHETIC_PERSON_LIBRARY.length,
      facts: FACT_LIBRARY.length,
      locales: FACES_NAMES_LOCALES,
    },
    people: SYNTHETIC_PERSON_LIBRARY.map((p) => ({
      id: p.id,
      name: p.name,
      factId: p.factId,
      face: p.face,
      scripts: Object.fromEntries(
        (['ru', 'zh', 'ja', 'ko', 'ar', 'hi'] as FacesNamesLocale[])
          .map((l) => [l, nameScript(l, p.name)])
          .filter(([, v]) => v !== null),
      ),
    })),
    facts: FACT_LIBRARY.map((f) => ({ id: f.id, category: f.category, text: f.text })),
    /**
     * 🔴 ПОДПИСИ ЭКРАНА — ТОЖЕ ДАННЫЕ, А НЕ ЛИТЕРАЛЫ В КОДЕ. У приложения
     * двенадцать языков, и строка, зашитая в экран, знает ровно один: немец и
     * кореец увидели бы русскую подпись посреди переведённого экрана. Словарь
     * этой игры уже есть в вебе (`core/i18n.ts`) — он и переносится целиком,
     * чтобы обе половины говорили одними словами.
     */
    strings: Object.fromEntries(FACES_NAMES_LOCALES.map((l) => [l, getFacesNamesStrings(l)])),
    /** Описания портретов для экранного диктора: собраны заранее на каждом языке. */
    portraits: Object.fromEntries(FACES_NAMES_LOCALES.map((l) => [
      l,
      Object.fromEntries(SYNTHETIC_PERSON_LIBRARY.map((p) => [p.id, describeSyntheticFace(l, p.face)])),
    ])),
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'assets'), { recursive: true });
  fs.writeFileSync(path.resolve(FLUTTER, 'assets', 'faces-names.json'), JSON.stringify(library), 'utf8');
  expect(library.people).toHaveLength(48);
  expect(library.facts).toHaveLength(48);

  /* ── 2. Эталоны: расклады по уровням и две сыгранные партии ── */
  const puzzles = LEVELS.map((level) => {
    const puzzle = generateFacesNamesPuzzle('flutter-ref', level);
    return {
      level,
      id: puzzle.id,
      difficulty: puzzle.difficulty,
      studiedPersonIds: puzzle.studiedPersonIds,
      peopleIds: puzzle.people.map((p) => p.id),
      trials: puzzle.trials,
      interferencePrompts: puzzle.interferencePrompts,
      factRecallEnabled: puzzle.factRecallEnabled,
      immediateRecall: puzzle.immediateRecall,
      meanFaceSimilarity: puzzle.meanFaceSimilarity,
      meanNameSimilarity: puzzle.meanNameSimilarity,
      meanRecognitionDistractorSimilarity: puzzle.meanRecognitionDistractorSimilarity,
    };
  });

  /** Расстояния — отдельно: на них стоит весь подбор похожих вариантов. */
  const pairs = [[0, 1], [0, 6], [0, 7], [3, 9], [12, 18], [5, 41], [20, 47], [30, 31]];
  const distances = pairs.map(([a, b]) => ({
    a: SYNTHETIC_PERSON_LIBRARY[a as number].id,
    b: SYNTHETIC_PERSON_LIBRARY[b as number].id,
    face: faceDistance(SYNTHETIC_PERSON_LIBRARY[a as number], SYNTHETIC_PERSON_LIBRARY[b as number]),
    name: nameDistance(SYNTHETIC_PERSON_LIBRARY[a as number], SYNTHETIC_PERSON_LIBRARY[b as number]),
  }));

  const reference = {
    meta: {
      source: 'frontend/src/games/faces-names/core',
      note: 'Прогон живого TS. Dart обязан повторить до знака.',
      seed: 'flutter-ref',
      levels: LEVELS,
    },
    distances,
    puzzles,
    plays: [
      { level: 5, kind: 'perfect', ...playPerfect('flutter-ref', 5) },
      { level: 8, kind: 'perfect', ...playPerfect('flutter-ref', 8) },
      { level: 12, kind: 'perfect', ...playPerfect('flutter-ref', 12) },
      { level: 8, kind: 'first-option', ...playFirstOption('flutter-ref', 8) },
      { level: 20, kind: 'first-option', ...playFirstOption('flutter-ref', 20) },
    ],
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'test', 'fixtures'), { recursive: true });
  fs.writeFileSync(
    path.resolve(FLUTTER, 'test', 'fixtures', 'faces-names-reference.json'),
    JSON.stringify(reference, null, 1),
    'utf8',
  );

  expect(reference.puzzles.map((p) => p.studiedPersonIds.length)).toEqual([2, 3, 3, 4, 4, 4, 5, 7, 8, 10, 12]);
  expect(reference.plays.filter((p) => p.result === null)).toEqual([]);
  expect((reference.plays[0] as any).result.accuracy).toBe(1);
});
