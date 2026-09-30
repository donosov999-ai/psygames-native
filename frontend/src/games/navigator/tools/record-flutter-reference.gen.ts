/* psygames-navigator-record-flutter-reference · VER 2 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН И СЛОВАРЬ ДЛЯ FLUTTER-ПОЛОВИНЫ «НАВИГАТОРА». Пишет три файла:
 *   · `flutter/test/fixtures/navigator-reference.json` — раздача партий (генератор);
 *   · `flutter/test/fixtures/navigator-session-reference.json` — ввод (клавиши и свайпы),
 *     счёт и ПАРТИИ ЦЕЛИКОМ: каждое действие и состояние сессии после него;
 *   · `flutter/assets/l10n/navigator.json` — словарь модуля на двенадцать языков. Источник
 *     перевода один — `core/i18n.ts`: перевод, сделанный для веба, приезжает в приложение сам.
 *
 * 🔴 ЗАЧЕМ. Партия раздаётся по зерну, и одно зерно обязано дать ОДНУ И ТУ ЖЕ партию в вебе и
 * в приложении. Dart-перенос ядра (`flutter/lib/games/navigator/`) сверяется с этими файлами,
 * снятыми прогоном ЖИВОГО TS-ядра.
 *
 * 🔴 ПОЧЕМУ В ЭТАЛОНЕ ЕСТЬ ВВОД, А НЕ ТОЛЬКО ПРАВИЛА. Урок 30.09.2026: перенос «Лаборатории»
 * потерял двойное нажатие, добавленное по отчёту Дениса, — эталон сверял правила, а жест в него
 * не попадал. Здесь свайпы и клавиши сверяются наравне с раздачей, включая точки ровно на
 * пороге свайпа: там «корень из суммы квадратов» и `Math.hypot` V8 расходятся у каждой пятой.
 *
 * ⚠️ ПОЧЕМУ ЭКСПОРТЁР ЛЕЖИТ В РЕПО, А НЕ ВРЕМЕННОЙ ПРОБОЙ. Урок проекта: вшитые данные без
 * экспортёра не чинятся — у 14 лестниц в assets/levels экспортёра не было ни к одной, и после
 * правки ядра эталон переснять было нечем. А ещё урок 23.09: эталон замораживает ПЕРЕНОС, а не
 * источник — правка TS после снятия расходит половины молча. Поэтому:
 *   ПОСЛЕ ЛЮБОЙ ПРАВКИ `frontend/src/games/navigator/core/*` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ ВСЕ ТРИ.
 * У «Стоп-сигнала» словарь вырезала временная проба, которой в репо нет, — переснять его нечем.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/navigator/tools/record-flutter-reference.gen.ts'
 */
import { generateNavigatorRound, navigatorModeForLevel } from '../core/generator';
import {
  getCardinalLabel, getHomeSectorLabel, getNavigatorModeLabel, getNavigatorStrings, getTurnLabel,
} from '../core/i18n';
import { homeSectorAngle, homeSectorForBearing, rotateCardinal, rotateHomeSector } from '../core/geometry';
import {
  cardinalFromKey, cardinalFromSwipe, homeSectorFromKey, homeSectorFromSwipe, turnFromKey, turnFromSwipe,
} from '../core/input';
import { isPassed, scoreNavigatorCompletion, type NavigatorScoreState } from '../core/scoring';
import {
  advanceNavigatorDelay, completeNavigatorStudy, createNavigatorSession, disposeNavigatorSession,
  handleNavigatorKey, handleNavigatorSwipe, inputNavigatorHomeSector, inputNavigatorRouteDirection,
  inputNavigatorTurn, navigatorSessionFingerprint, pauseNavigatorSession, restartNavigatorSession,
  resumeNavigatorSession, startNavigatorRound,
} from '../core/session';
import {
  CARDINAL_DIRECTIONS, HOME_SECTORS, LEVELS, NAVIGATOR_LOCALES, NAVIGATOR_MODES, TURN_INSTRUCTIONS,
  type CardinalDirection, type HomeSector, type NavigatorMetrics, type NavigatorMode,
  type NavigatorRound, type NavigatorSession, type NavigatorSessionConfig, type TurnInstruction,
} from '../core/types';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const FIXTURES = join(__dirname, '../../../../../flutter/test/fixtures');
const ROUNDS_PATH = join(FIXTURES, 'navigator-reference.json');
const SESSION_PATH = join(FIXTURES, 'navigator-session-reference.json');
const STRINGS_PATH = join(__dirname, '../../../../../flutter/assets/l10n/navigator.json');

/** Зёрна подобраны под причёсывание: пробелы, подчёркивания, регистр, пустое. */
const SEEDS = ['nav-a', 'nav-b', '  Mixed_Case__Seed  ', ''];

const cellPair = (c: { x: number; y: number }) => [c.x, c.y];

function dumpRound(r: NavigatorRound) {
  return {
    id: r.id, seed: r.seed, level: r.level, mode: r.mode, difficulty: r.difficulty,
    gridSize: r.gridSize, routeSteps: r.routeSteps,
    route: r.route.map(cellPair), routeDirections: r.routeDirections,
    startingFacing: r.startingFacing, turns: r.turns,
    landmarks: r.landmarks.map((l) => ({ id: l.id, cell: cellPair(l.cell), symbol: l.symbol })),
    falseBranches: r.falseBranches.map((b) => ({ from: cellPair(b.from), to: cellPair(b.to) })),
    mapRotation: r.mapRotation, hideMapDuringRecall: r.hideMapDuringRecall,
    delaySteps: r.delaySteps, homeBearingDeg: r.homeBearingDeg,
    correctHomeSector: r.correctHomeSector,
  };
}

it('выгрузка эталона генератора «Навигатора»', () => {
  const rounds: unknown[] = [];
  for (const seed of SEEDS) {
    for (let level = 1; level <= LEVELS; level += 1) {
      rounds.push({ request: { seed, level, mode: null }, round: dumpRound(generateNavigatorRound(seed, level)) });
    }
  }
  // Принудительный режим: партия не по лестнице, а выбранного вида.
  for (const mode of NAVIGATOR_MODES) {
    for (const level of [1, 10, 25]) {
      rounds.push({ request: { seed: 'nav-mode', level, mode }, round: dumpRound(generateNavigatorRound('nav-mode', level, mode)) });
    }
  }
  const modeForLevel = [-3, 0, 0.5, 1, 2.9, 7, 33, 34, 99].map((level) => ({ level, mode: navigatorModeForLevel(level) }));
  const sectors = Array.from({ length: 72 }, (_, i) => i * 5 - 20).map((bearing) => ({ bearing, sector: homeSectorForBearing(bearing) }));
  writeFileSync(ROUNDS_PATH, JSON.stringify({ generatorVersion: 'navigator-generator-v1', rounds, modeForLevel, sectors }, null, 1) + '\n');
  expect(rounds.length).toBe(SEEDS.length * LEVELS + NAVIGATOR_MODES.length * 3);
});

// ───────────────────────────── ввод, счёт, партии ─────────────────────────────

/** Своя простая случайность: эталон обязан сниматься одинаково при каждом запуске. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function flatMetrics(m: NavigatorMetrics | null) {
  if (!m) return null;
  return {
    accuracy: m.accuracy, durationMs: m.durationMs, difficulty: m.difficulty, errors: m.errors,
    score: m.score, seed: m.seed, generatorVersion: m.generatorVersion, level: m.details.level,
    ...m.specific, passed: isPassed(m),
  };
}

function snapshot(s: NavigatorSession) {
  return {
    fp: navigatorSessionFingerprint(s),
    config: s.config,
    pausedFrom: s.pausedFrom,
    startedAt: s.startedAt,
    pauseStartedAt: s.pauseStartedAt,
    pausedMs: s.pausedMs,
    result: flatMetrics(s.result),
  };
}

type Action =
  | { op: 'start'; now: number }
  | { op: 'study' }
  | { op: 'delay' }
  | { op: 'key'; key: string; now: number }
  | { op: 'swipe'; dx: number; dy: number; now: number }
  | { op: 'route'; dir: CardinalDirection; now: number }
  | { op: 'turn'; turn: TurnInstruction; now: number }
  | { op: 'sector'; sector: HomeSector; now: number }
  | { op: 'pause'; now: number }
  | { op: 'resume'; now: number }
  | { op: 'restart'; now: number }
  | { op: 'dispose' };

function apply(s: NavigatorSession, a: Action): NavigatorSession {
  switch (a.op) {
    case 'start': return startNavigatorRound(s, a.now);
    case 'study': return completeNavigatorStudy(s);
    case 'delay': return advanceNavigatorDelay(s);
    case 'key': return handleNavigatorKey(s, a.key, a.now);
    case 'swipe': return handleNavigatorSwipe(s, a.dx, a.dy, a.now);
    case 'route': return inputNavigatorRouteDirection(s, a.dir, a.now);
    case 'turn': return inputNavigatorTurn(s, a.turn, a.now);
    case 'sector': return inputNavigatorHomeSector(s, a.sector, a.now);
    case 'pause': return pauseNavigatorSession(s, a.now);
    case 'resume': return resumeNavigatorSession(s, a.now);
    case 'restart': return restartNavigatorSession(s, a.now);
    case 'dispose': return disposeNavigatorSession(s);
  }
}

const DIRECTION_KEYS: Record<CardinalDirection, string[]> = {
  north: ['ArrowUp', 'w', 'W'], east: ['ArrowRight', 'd', 'D'],
  south: ['ArrowDown', 's', 'S'], west: ['ArrowLeft', 'a', 'A'],
};
const TURN_KEYS: Record<TurnInstruction, string[]> = {
  left: ['ArrowLeft', 'a', 'A'], right: ['ArrowRight', 'd'], straight: ['ArrowUp', 'w', ' '],
};
const SECTOR_KEYS: Record<HomeSector, string[]> = {
  north: ['8', 'ArrowUp', 'w'], 'north-east': ['9'], east: ['6', 'ArrowRight', 'd'], 'south-east': ['3'],
  south: ['2', 'ArrowDown', 's'], 'south-west': ['1'], west: ['4', 'ArrowLeft', 'a'], 'north-west': ['7'],
};

function recordSession(config: NavigatorSessionConfig, rnd: () => number) {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;
  /** Шаг часов с десятыми: длительность партии проходит через Math.round по-настоящему. */
  const tick = () => 50 + Math.round(rnd() * 9000) / 10;
  const length = () => 30 + rnd() * 60;
  let s = createNavigatorSession(config);
  let now = 1000 + Math.floor(rnd() * 1000);
  const steps: { a: Action; s: ReturnType<typeof snapshot> }[] = [];
  const run = (a: Action) => {
    s = apply(s, a);
    steps.push({ a, s: snapshot(s) });
  };

  const directionSwipe = (dir: CardinalDirection) => {
    const along = length();
    const across = (rnd() - 0.5) * along * 0.8;
    const [dx, dy] = dir === 'north' ? [across, -along] : dir === 'south' ? [across, along]
      : dir === 'east' ? [along, across] : [-along, across];
    return { dx, dy };
  };
  const turnSwipe = (turn: TurnInstruction) => directionSwipe(turn === 'left' ? 'west' : turn === 'right' ? 'east' : 'north');
  const sectorSwipe = (sector: HomeSector) => {
    const bearing = (homeSectorAngle(sector) + (rnd() - 0.5) * 40) * Math.PI / 180;
    const len = length();
    return { dx: len * Math.sin(bearing), dy: -len * Math.cos(bearing) };
  };

  /** Ответ на экране: верный (с учётом поворота карты) или случайный. */
  const answer = (correct: boolean): Action => {
    const round = s.round;
    const via = rnd();
    if (round.mode === 'route-recall') {
      const expected = round.routeDirections[s.routeIndex]!;
      const dir = correct ? rotateCardinal(expected, round.mapRotation) : pick(CARDINAL_DIRECTIONS);
      if (via < 0.4) return { op: 'key', key: pick(DIRECTION_KEYS[dir]), now };
      if (via < 0.8) return { op: 'swipe', ...directionSwipe(dir), now };
      return { op: 'route', dir, now };
    }
    if (round.mode === 'turn-sequence') {
      const turn = correct ? round.turns[s.turnIndex]! : pick(TURN_INSTRUCTIONS);
      if (via < 0.4) return { op: 'key', key: pick(TURN_KEYS[turn]), now };
      if (via < 0.8) return { op: 'swipe', ...turnSwipe(turn), now };
      return { op: 'turn', turn, now };
    }
    const sector = correct ? rotateHomeSector(round.correctHomeSector, round.mapRotation) : pick(HOME_SECTORS);
    if (via < 0.4) return { op: 'key', key: pick(SECTOR_KEYS[sector]), now };
    if (via < 0.8) return { op: 'swipe', ...sectorSwipe(sector), now };
    return { op: 'sector', sector, now };
  };
  /** Ввод, который ничего не должен менять: мусорная клавиша, короткий свайп, свайп вниз в поворотах. */
  const junk = (): Action => {
    const mode = s.round.mode;
    const keys = mode === 'turn-sequence' ? ['Enter', 'x', 'ArrowDown', 's', 'Escape'] : ['Enter', 'x', 'Escape', 'q', 'Tab'];
    const r = rnd();
    if (r < 0.5) return { op: 'key', key: pick(keys), now };
    if (r < 0.8 || mode !== 'turn-sequence') return { op: 'swipe', dx: (rnd() - 0.5) * 30, dy: (rnd() - 0.5) * 30, now };
    return { op: 'swipe', dx: (rnd() - 0.5) * 20, dy: 40 + rnd() * 40, now };
  };
  /** Ответ чужого режима: сессия обязана его не заметить. */
  const foreign = (): Action => {
    const mode = s.round.mode;
    if (mode === 'route-recall') return rnd() < 0.5 ? { op: 'turn', turn: pick(TURN_INSTRUCTIONS), now } : { op: 'sector', sector: pick(HOME_SECTORS), now };
    if (mode === 'turn-sequence') return rnd() < 0.5 ? { op: 'route', dir: pick(CARDINAL_DIRECTIONS), now } : { op: 'sector', sector: pick(HOME_SECTORS), now };
    return rnd() < 0.5 ? { op: 'route', dir: pick(CARDINAL_DIRECTIONS), now } : { op: 'turn', turn: pick(TURN_INSTRUCTIONS), now };
  };

  run({ op: 'key', key: 'w', now });            // до старта ввод не принимается
  run({ op: 'study' });                          // не та фаза
  run({ op: 'start', now });
  run({ op: 'start', now: now + 5 });            // повторный старт ничего не сбрасывает
  now += tick(); run({ op: 'pause', now });
  now += tick(); run({ op: 'pause', now });      // двойная пауза не сдвигает её начало
  now += tick(); run({ op: 'resume', now });
  now += tick(); run({ op: 'study' });
  for (let guard = 0; s.phase === 'delay' && guard < 20; guard += 1) {
    now += tick();
    if (rnd() < 0.25) {
      run({ op: 'pause', now });
      now += tick(); run({ op: 'delay' });       // на паузе отвлечение не идёт
      now += tick(); run({ op: 'resume', now });
    }
    run({ op: 'delay' });
  }
  for (let guard = 0; s.phase === 'recall' && guard < 80; guard += 1) {
    now += tick();
    const r = rnd();
    if (r < 0.1) {
      run({ op: 'pause', now });
      now += tick(); run(answer(true));          // на паузе ответ не принимается
      now += tick(); run({ op: 'resume', now });
    } else if (r < 0.2) run(junk());
    else if (r < 0.27) run(foreign());
    else run(answer(r < 0.75));
  }
  now += tick(); run({ op: 'key', key: 'w', now }); // после итога — ничего
  now += tick(); run({ op: 'pause', now });          // итог не ставится на паузу
  now += tick(); run({ op: 'restart', now });        // заново: та же раздача, свежие счётчики
  now += tick(); run({ op: 'study' });
  run({ op: 'dispose' });
  now += tick(); run({ op: 'restart', now });        // из закрытой — снова изучение
  return { config, steps };
}

it('выгрузка эталона ввода, счёта и партий «Навигатора»', () => {
  const rnd = makeRandom(20260930);

  const keyList = [
    'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ARROWUP', 'arrowleft', 'w', 'W', 'a', 'A', 's', 'S',
    'd', 'D', ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Enter', 'Escape', 'x', 'q', 'Space', 'Up', '',
  ];
  const keys = keyList.map((key) => ({ key, cardinal: cardinalFromKey(key), turn: turnFromKey(key), sector: homeSectorFromKey(key) }));

  const swipePairs: [number, number][] = [
    [0, 0], [24, 0], [-24, 0], [0, 24], [0, -24], [23.999, 0], [0, -23.999], [16.97, 16.97], [17, 17], [-17, 17],
    [30, -30], [-30, -30], [30, 30], [40, -5], [-5, 40], [5, -40], [-40, 5],
    // На окружности порога: по V8 ровно 24 (засчитан), по «корню из суммы квадратов» — меньше.
    [23.567700267527236, 4.534700001102221], [16.417425354501166, -17.506231597045158], [20.68283512643786, -12.174577246565411],
  ];
  for (let i = 0; i < 300; i += 1) swipePairs.push([(rnd() - 0.5) * 160, (rnd() - 0.5) * 160]);
  for (let i = 0; i < 200; i += 1) {
    const t = rnd() * 2 * Math.PI;
    swipePairs.push([24 * Math.cos(t), 24 * Math.sin(t)]);
  }
  const swipes = swipePairs.map(([dx, dy]) => ({
    dx, dy, cardinal: cardinalFromSwipe(dx, dy), turn: turnFromSwipe(dx, dy), sector: homeSectorFromSwipe(dx, dy),
  }));

  const scores: unknown[] = [];
  for (const mode of NAVIGATOR_MODES) {
    for (const level of [1, 7, 16, 25, 33]) {
      const round = generateNavigatorRound('nav-score', level, mode);
      const durations = [0, 1234.5, -5, 999.4999, 2.5, 0.5, -0.5, 87654.49];
      const base = { routeHits: 0, extraSteps: 0, turnHits: 0, selectedHomeSector: null as HomeSector | null };
      const states: NavigatorScoreState[] = mode === 'route-recall'
        ? [0, 1, 2, 5, 40].map((extraSteps, i) => ({ ...base, durationMs: durations[i]!, routeHits: round.routeSteps, extraSteps }))
        : mode === 'turn-sequence'
          ? [0, 1, round.routeSteps - 1, round.routeSteps].map((turnHits, i) => ({ ...base, durationMs: durations[i + 3]!, turnHits }))
          : [...HOME_SECTORS, null].map((selectedHomeSector, i) => ({ ...base, durationMs: durations[i % durations.length]!, selectedHomeSector }));
      for (const state of states) {
        scores.push({ request: { seed: 'nav-score', level, mode }, state, metrics: flatMetrics(scoreNavigatorCompletion(round, state)) });
      }
    }
  }

  const sessions: ReturnType<typeof recordSession>[] = [];
  for (const seed of ['nav-s1', 'nav-s2']) {
    for (const level of [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33]) sessions.push(recordSession({ seed, level }, rnd));
  }
  for (const mode of NAVIGATOR_MODES as readonly NavigatorMode[]) {
    for (const level of [4, 18, 31]) sessions.push(recordSession({ seed: 'nav-s3', level, mode }, rnd));
  }
  // Уровень не целый и вне лестницы — сессия выправляет его сама.
  sessions.push(recordSession({ seed: 'nav-s4', level: 7.9 }, rnd));
  sessions.push(recordSession({ seed: 'nav-s4', level: 99 }, rnd));
  // Перезапуск с экрана правил — новая сессия, а не свежий раунд.
  const fromRules = createNavigatorSession({ seed: 'nav-s5', level: 5 });
  const restartedFromRules = restartNavigatorSession(fromRules, 1234);

  const head = JSON.stringify({
    generatorVersion: 'navigator-generator-v1',
    keys, swipes, scores,
    restartFromRules: { config: { seed: 'nav-s5', level: 5 }, now: 1234, s: snapshot(restartedFromRules) },
  });
  // Партия — строкой: diff эталона после правки ядра читается по партиям, а не по символам.
  const body = sessions.map((session) => JSON.stringify(session)).join(',\n');
  writeFileSync(SESSION_PATH, `${head.slice(0, -1)},\n"sessions":[\n${body}\n]}\n`);

  // Эталон, в котором ничего не происходит, ничего и не сторожит: партии обязаны дойти до итога.
  const finished = sessions.filter((session) => session.steps.some((step) => step.s.result !== null)).length;
  expect(finished).toBe(sessions.length);
  expect(swipes.filter((w) => w.cardinal === null).length).toBeGreaterThan(0);
});

// ───────────────────────────── словарь модуля ─────────────────────────────

it('выгрузка словаря «Навигатора» для приложения', () => {
  const all: Record<string, Record<string, string>> = {};
  for (const locale of NAVIGATOR_LOCALES) {
    const flat: Record<string, string> = { ...getNavigatorStrings(locale) };
    // Подписи кнопок ответа — самое читаемое место игры; ключ несёт имя значения из ядра.
    for (const mode of NAVIGATOR_MODES) flat[`mode.${mode}`] = getNavigatorModeLabel(locale, mode);
    for (const direction of CARDINAL_DIRECTIONS) flat[`direction.${direction}`] = getCardinalLabel(locale, direction);
    for (const turn of TURN_INSTRUCTIONS) flat[`turn.${turn}`] = getTurnLabel(locale, turn);
    for (const sector of HOME_SECTORS) flat[`home.${sector}`] = getHomeSectorLabel(locale, sector);
    all[locale] = flat;
  }
  writeFileSync(STRINGS_PATH, JSON.stringify(all, null, 1) + '\n');
  // `getNavigatorStrings` молча падает на английский, если языка нет. Язык, совпавший с
  // английским в заголовке правил, — не перевод, а этот самый провал.
  const fellBack = NAVIGATOR_LOCALES.filter((locale) => locale !== 'en' && all[locale]!.rulesTitle === all.en!.rulesTitle);
  expect(fellBack).toEqual([]);
});
