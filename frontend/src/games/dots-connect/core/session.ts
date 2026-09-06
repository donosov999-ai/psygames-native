/* psygames-dots-connect-session · VER 3 · 23.08.2026 */
import { generateDotsPuzzle, generateDotsTrainingPuzzle } from './generator';
import {
  cellKey,
  clonePaths,
  isAdjacent,
  pathOwnerAt,
  sameCell,
} from './grid';
import { scoreDotsCompletion } from './scoring';
import { validateDotsSolution } from './validator';
import type {
  Cell,
  DotsDrawingPhase,
  DotsPair,
  DotsPaths,
  DotsPuzzle,
  DotsSession,
  DotsSessionConfig,
} from './types';

function isDrawingPhase(phase: DotsSession['phase']): phase is DotsDrawingPhase {
  return phase === 'training' || phase === 'playing';
}

/**
 * Чистый круг на той же сессии.
 *
 * ⚠️ `keepSolutionShown` — НЕ ФЛАГ УДОБСТВА, А РАЗВИЛКА ЧЕСТНОСТИ. Круг заводится
 * из четырёх мест, и решение «помнить ли, что решение смотрели» у них разное:
 *   · `restartSession` зачётной партии — ПОМНИТЬ. Зерно фиксировано номером
 *     уровня, «Заново» даёт ТУ ЖЕ раскладку, и забывчивость здесь означала бы
 *     схему «подсмотрел → заново → обвёл по памяти → уровень взят»;
 *   · тренировка и переход из неё в партию — ЗАБЫТЬ. Тренировочная доска 4×4 —
 *     другая доска и в зачёт не идёт вовсе; тащить её подсказку в партию значило
 *     бы наказывать за то, что человек разобрался с правилом.
 */
function emptyRound(
  session: DotsSession,
  phase: DotsDrawingPhase,
  now: number | null,
  keepSolutionShown: boolean,
): DotsSession {
  return {
    ...session,
    phase,
    pausedFrom: null,
    paths: {},
    activePairId: null,
    solutionShown: keepSolutionShown && session.solutionShown,
    solutionVisible: false,
    // Тем же правилом, что и латч показа: «Заново» даёт ТУ ЖЕ раскладку (зерно
    // фиксировано номером уровня), поэтому открытые пары не забываются — иначе
    // «подсмотрел пару → перезапустил → обвёл» стоило бы ноль.
    revealedPairIds: keepSolutionShown ? session.revealedPairIds : [],
    history: [],
    startedAt: phase === 'playing' ? now : null,
    pauseStartedAt: null,
    pausedMs: 0,
    forwardMoves: 0,
    backtracks: 0,
    undoCount: 0,
    invalidMoves: 0,
    result: null,
  };
}

export function createDotsSession(config: DotsSessionConfig): DotsSession {
  const safeConfig: Required<DotsSessionConfig> = {
    seed: config.seed,
    level: Math.max(1, Math.floor(config.level)),
  };
  return {
    config: safeConfig,
    // Тренировка ЖИВЁТ ОТДЕЛЬНО ОТ ЛЕСЕНКИ: см. generateDotsTrainingPuzzle.
    trainingPuzzle: generateDotsTrainingPuzzle(`${safeConfig.seed}-training`),
    puzzle: generateDotsPuzzle(safeConfig.seed, safeConfig.level),
    phase: 'rules',
    pausedFrom: null,
    paths: {},
    activePairId: null,
    solutionShown: false,
    solutionVisible: false,
    revealedPairIds: [],
    history: [],
    startedAt: null,
    pauseStartedAt: null,
    pausedMs: 0,
    forwardMoves: 0,
    backtracks: 0,
    undoCount: 0,
    invalidMoves: 0,
    result: null,
  };
}

export function getCurrentPuzzle(session: DotsSession): DotsPuzzle {
  if (session.phase === 'training' || session.phase === 'training-complete') {
    return session.trainingPuzzle;
  }
  if (session.phase === 'paused' && session.pausedFrom === 'training') {
    return session.trainingPuzzle;
  }
  return session.puzzle;
}

function endpointPairAt(puzzle: DotsPuzzle, cell: Cell): DotsPair | null {
  return puzzle.pairs.find((pair) => pair.endpoints.some((endpoint) => sameCell(endpoint, cell))) ?? null;
}

function withHistory(session: DotsSession, paths: DotsPaths): Pick<DotsSession, 'history' | 'paths'> {
  return {
    history: [...session.history, clonePaths(session.paths)].slice(-128),
    paths,
  };
}

function invalidMove(session: DotsSession): DotsSession {
  return { ...session, invalidMoves: session.invalidMoves + 1 };
}

function finishIfComplete(session: DotsSession, now: number): DotsSession {
  const puzzle = getCurrentPuzzle(session);
  if (!validateDotsSolution(puzzle, session.paths).complete) return session;
  if (session.phase === 'training') {
    return { ...session, phase: 'training-complete', activePairId: null };
  }
  if (session.phase !== 'playing' || session.startedAt === null) return session;
  return {
    ...session,
    phase: 'result',
    activePairId: null,
    result: scoreDotsCompletion(session.puzzle, {
      durationMs: Math.max(0, now - session.startedAt - session.pausedMs),
      forwardMoves: session.forwardMoves,
      backtracks: session.backtracks,
      undoCount: session.undoCount,
      invalidMoves: session.invalidMoves,
      solutionShown: session.solutionShown,
    }),
  };
}

export function startTraining(session: DotsSession): DotsSession {
  if (session.phase !== 'rules') return session;
  return emptyRound(session, 'training', null, false);
}

/**
 * СРАЗУ В ПАРТИЮ, МИНУЯ ПРАВИЛА И ТРЕНИРОВКУ.
 *
 * ⚠️ ЭТО ДОБАВЛЕНО ПРИ СТЫКОВКЕ, В ЛАБОРАТОРНОМ МОДУЛЕ ЭТОГО НЕТ. Там путь один:
 * rules → training → playing, и он верен для первого знакомства — правила этой
 * игры («занять ВСЮ сетку», «пути не пересекаются») по доске не угадываются.
 * Но в приложении уровней сорок, и после каждого пройденного LevelCleared зовёт
 * следующий: без этой двери человек решал бы одну и ту же тренировочную сетку
 * 4×4 сорок раз подряд. Тренировка учит один раз, а не каждый заход.
 */
export function startRound(session: DotsSession, now: number): DotsSession {
  if (session.phase !== 'rules') return session;
  return emptyRound(session, 'playing', now, false);
}

export function advanceFromTraining(session: DotsSession, now: number): DotsSession {
  if (session.phase !== 'training-complete') return session;
  return emptyRound(session, 'playing', now, false);
}

export function beginPath(session: DotsSession, cell: Cell): DotsSession {
  if (!isDrawingPhase(session.phase)) return session;
  const puzzle = getCurrentPuzzle(session);
  const existingOwner = pathOwnerAt(session.paths, cell);
  if (existingOwner) {
    const existingPath = session.paths[existingOwner] as Cell[];
    const index = existingPath.findIndex((candidate) => sameCell(candidate, cell));
    const endpointPair = endpointPairAt(puzzle, cell);
    if (index === existingPath.length - 1) {
      // An unfinished tail resumes in place. A completed tail endpoint starts a
      // fresh redraw from that end, so both ends of a finished color are editable.
      if (existingPath.length === 1 || endpointPair?.id !== existingOwner) {
        return { ...session, activePairId: existingOwner };
      }
      const nextPaths = clonePaths(session.paths);
      nextPaths[existingOwner] = [{ ...cell }];
      return {
        ...session,
        ...withHistory(session, nextPaths),
        activePairId: existingOwner,
        backtracks: session.backtracks + existingPath.length - 1,
      };
    }
    const removed = existingPath.length - index - 1;
    const nextPaths = clonePaths(session.paths);
    nextPaths[existingOwner] = existingPath.slice(0, index + 1).map((candidate) => ({ ...candidate }));
    return {
      ...session,
      ...withHistory(session, nextPaths),
      activePairId: existingOwner,
      backtracks: session.backtracks + removed,
    };
  }

  const pair = endpointPairAt(puzzle, cell);
  if (!pair) return session;
  const existingPath = session.paths[pair.id] ?? [];
  const nextPaths = clonePaths(session.paths);
  nextPaths[pair.id] = [{ ...cell }];
  return {
    ...session,
    ...withHistory(session, nextPaths),
    activePairId: pair.id,
    backtracks: session.backtracks + Math.max(0, existingPath.length - 1),
  };
}

export function extendPath(session: DotsSession, cell: Cell, now: number): DotsSession {
  if (!isDrawingPhase(session.phase) || !session.activePairId) return session;
  const pairId = session.activePairId;
  const path = session.paths[pairId];
  const tail = path?.[path.length - 1];
  if (!path || !tail) return invalidMove(session);
  if (sameCell(tail, cell)) return session;
  if (!isAdjacent(tail, cell)) return invalidMove(session);
  const puzzle = getCurrentPuzzle(session);
  const pair = puzzle.pairs.find((candidate) => candidate.id === pairId);
  if (!pair) return invalidMove(session);

  const ownIndex = path.findIndex((candidate) => sameCell(candidate, cell));
  if (ownIndex >= 0) {
    if (ownIndex === path.length - 1) return session;
    const removed = path.length - ownIndex - 1;
    const nextPaths = clonePaths(session.paths);
    nextPaths[pairId] = path.slice(0, ownIndex + 1).map((candidate) => ({ ...candidate }));
    return {
      ...session,
      ...withHistory(session, nextPaths),
      backtracks: session.backtracks + removed,
    };
  }

  const oppositeEndpointReached = path.length > 1
    && pair.endpoints.some((endpoint) => sameCell(endpoint, tail));
  if (oppositeEndpointReached) return invalidMove(session);

  /**
   * 🔴 ЛИНИЯ НЕ ПРИЖИМАЕТСЯ К СЕБЕ — ЭТО ПРАВИЛО ИГРЫ С 06.09.2026.
   *
   * 📍 ЗАЧЕМ. Только на нём держится единственность решения: замер независимым
   * перебором показал, что без него с седьмого уровня доска решалась
   * НЕСКОЛЬКИМИ способами, то есть не выводилась, а угадывалась. Правило стоит
   * в четырёх местах — генератор, проверка, решатель и здесь; здесь оно нужно,
   * чтобы человек узнал о запрете ХОДОМ, а не отказом в конце партии.
   *
   * ⚠️ ХОД ОТКЛОНЯЕТСЯ ТАК ЖЕ, КАК ПЕРЕСЕЧЕНИЕ ЧУЖОЙ ЛИНИИ, — тем же
   * `invalidMove`. Отдельного наказания нет: палец на телефоне промахивается по
   * соседней клетке постоянно, и штрафовать за это значило бы наказывать за
   * толщину пальца.
   */
  const прижимается = path.some((c, i) => i !== path.length - 1 && isAdjacent(c, cell));
  if (прижимается) return invalidMove(session);

  /**
   * 🔴 В СТЕНУ ХОДА НЕТ. Стены знали генератор, решатель и проверка — то есть
   * ВСЕ, кроме того места, где ходит человек (замер 06.09.2026: ни одного
   * упоминания стен в `session.ts`). Доска молча позволяла провести путь сквозь
   * вырезанную клетку, и партия расходилась с собственным решением: проверка
   * такой путь забраковала бы, а игра приняла.
   *
   * Тот же урок, что со скрытым слоем и с рёберной доской: величина, ставшая
   * данными, обязана быть прочитана ВСЕМИ потребителями. Заслон у трёх из
   * четырёх — это заслон у нуля.
   */
  const вСтену = (puzzle.walls ?? []).some((w) => w.row === cell.row && w.col === cell.col);
  if (вСтену) return invalidMove(session);

  const occupiedBy = pathOwnerAt(session.paths, cell);
  if (occupiedBy && occupiedBy !== pairId) return invalidMove(session);
  const endpointOwner = endpointPairAt(puzzle, cell)?.id;
  if (endpointOwner && endpointOwner !== pairId) return invalidMove(session);

  const nextPaths = clonePaths(session.paths);
  nextPaths[pairId] = [...path, { ...cell }];
  return finishIfComplete({
    ...session,
    ...withHistory(session, nextPaths),
    forwardMoves: session.forwardMoves + 1,
  }, now);
}

export function endPath(session: DotsSession): DotsSession {
  if (!isDrawingPhase(session.phase) || !session.activePairId) return session;
  return { ...session, activePairId: null };
}

export function undoPath(session: DotsSession): DotsSession {
  if (!isDrawingPhase(session.phase) || session.history.length === 0) return session;
  const prior = session.history[session.history.length - 1] as DotsPaths;
  return {
    ...session,
    paths: clonePaths(prior),
    history: session.history.slice(0, -1),
    activePairId: null,
    undoCount: session.undoCount + 1,
  };
}

/**
 * 🔴 ПОКАЗ РЕШЕНИЯ — ДОСТУПЕН ТОЛЬКО ПОКА ДОСКУ РИСУЮТ.
 *
 * На правилах решения ещё нет на экране (доски нет вовсе), на паузе и на итоге
 * доску уже не ведут, а тренировочный круг после победы (`training-complete`)
 * заморожен. Кнопка в шапке живёт всегда — но там, где показывать нечего, она
 * гаснет: исчезающая и появляющаяся кнопка в шапке читается как поломка.
 */
export function canRevealDotsSolution(session: DotsSession): boolean {
  return isDrawingPhase(session.phase);
}

/**
 * ПОКАЗАТЬ / СКРЫТЬ РЕШЕНИЕ ТЕКУЩЕЙ ДОСКИ.
 *
 * 🔴 ПОЧЕМУ ПОДЛОЖКА, А НЕ «ЗАПОЛНИТЬ ДОСКУ ЗА ИГРОКА». Соблазн был записать
 * решение прямо в `paths`: одна строка, и доска сразу правильная. Но тогда
 * пропадали бы СВОИ пути — то самое, ради чего человек и открывает ответ
 * («где я запер себе клетку?»), — а партия оказывалась бы собранной чужими
 * руками и заканчивалась бы в тот же миг. Поэтому решение ложится ОТДЕЛЬНЫМ
 * слоем: свои пути остаются поверх, партия продолжается, сравнивать можно.
 *
 * 🔴 ЛАТЧ СТАВИТСЯ ТОЛЬКО НА ЗАЧЁТНОЙ ДОСКЕ И ТОЛЬКО ВПЕРЁД. Второе нажатие
 * прячет подложку, но метку не снимает: увиденное обратно не убирается, и
 * «показал → скрыл → уровень чистый» было бы дырой размером во всю игру.
 */
export function toggleDotsSolution(session: DotsSession): DotsSession {
  if (!canRevealDotsSolution(session)) return session;
  const nextVisible = !session.solutionVisible;
  return {
    ...session,
    solutionVisible: nextVisible,
    solutionShown: session.solutionShown || (session.phase === 'playing' && nextVisible),
    // Ведение пути обрывается: подложка появилась прямо под пальцем, и
    // «дотянуть на автомате» после этого значило бы вести уже по чужому пути.
    activePairId: nextVisible ? null : session.activePairId,
  };
}

/**
 * ЧТО ИМЕННО НАРИСОВАНО ПОДЛОЖКОЙ ПРЯМО СЕЙЧАС.
 *
 * ⚠️ ЕДИНСТВЕННЫЙ ИСТОЧНИК И ДЛЯ ДОСКИ, И ДЛЯ ПРОВЕРКИ. Доска рисует ровно то,
 * что вернула эта функция, и проверка читает её же — иначе «показанное решение»
 * и «решение из генератора» разъехались бы молча, и гейт стерёг бы не то, что
 * видит человек. Пустой объект означает «подложки нет».
 */
export function dotsRevealedSolution(session: DotsSession): DotsPaths {
  if (!canRevealDotsSolution(session)) return {};
  const решение = getCurrentPuzzle(session).solution;
  if (session.solutionVisible) return clonePaths(решение);
  // Поштучно открытое рисуется той же подложкой и тем же цветом — человеку не
  // нужно знать, что подсказки две; ему нужно видеть путь.
  const только: DotsPaths = {};
  for (const id of session.revealedPairIds) {
    const путь = решение[id];
    if (путь) только[id] = путь.map((c) => ({ ...c }));
  }
  return только;
}

/**
 * ПОДСКАЗКА ПО ОДНОЙ ПАРЕ — ДЕШЁВАЯ ПРОТИВ ДОРОГОЙ.
 *
 * 🔴 ПОЧЕМУ НЕ «ЛЮБАЯ НЕРЕШЁННАЯ». Наугад открытая пара чаще всего попадает
 * туда, где человек и так справился бы: подсказка тратится, а затык остаётся.
 * Правило выбора — от затыка:
 *   1. Сначала пара, которую человек УЖЕ ВЕДЁТ НЕ ТУДА (его путь разошёлся с
 *      решением). Это ровно то место, где он застрял, и открытие отвечает на
 *      вопрос «где я ошибся», а не «какой ответ».
 *   2. Если таких нет — самая КОРОТКАЯ из нетронутых: отдаётся меньше всего
 *      доски, а зацепка появляется.
 * При равенстве — по имени пары, чтобы подсказка не зависела от порядка
 * перебора и повторялась при том же состоянии.
 */
export function nextDotsHintPair(session: DotsSession): string | null {
  if (!canRevealDotsSolution(session) || session.solutionVisible) return null;
  const puzzle = getCurrentPuzzle(session);
  const открыты = new Set(session.revealedPairIds);
  const свои = session.paths;

  const разошлись: string[] = [];
  const нетронутые: { id: string; длина: number }[] = [];
  for (const pair of puzzle.pairs) {
    if (открыты.has(pair.id)) continue;
    const верный = puzzle.solution[pair.id];
    if (!верный) continue;
    const мой = свои[pair.id] ?? [];
    if (мой.length === 0) { нетронутые.push({ id: pair.id, длина: верный.length }); continue; }
    const совпал = мой.length <= верный.length
      && мой.every((c, i) => c.row === (верный[i] as Cell).row && c.col === (верный[i] as Cell).col);
    if (!совпал) разошлись.push(pair.id);
  }
  if (разошлись.length > 0) return [...разошлись].sort()[0] as string;
  if (нетронутые.length === 0) return null;
  нетронутые.sort((a, b) => (a.длина - b.длина) || (a.id < b.id ? -1 : 1));
  return (нетронутые[0] as { id: string }).id;
}

/**
 * Открыть путь одной пары. Ставит тот же латч `solutionShown`, что и показ
 * целиком: помощь взята, и уровень уже не чистый. Разница не в наказании, а в
 * том, сколько доски остаётся задачей.
 */
export function revealDotsPair(session: DotsSession): DotsSession {
  const id = nextDotsHintPair(session);
  if (!id) return session;
  return {
    ...session,
    revealedPairIds: [...session.revealedPairIds, id],
    solutionShown: session.solutionShown || session.phase === 'playing',
    // Ведение обрывается по той же причине, что и при показе целиком: подложка
    // появилась под пальцем.
    activePairId: null,
  };
}

export function pauseSession(session: DotsSession, now: number): DotsSession {
  if (!isDrawingPhase(session.phase)) return session;
  return {
    ...session,
    phase: 'paused',
    pausedFrom: session.phase,
    activePairId: null,
    pauseStartedAt: now,
  };
}

export function resumeSession(session: DotsSession, now: number): DotsSession {
  if (session.phase !== 'paused' || !session.pausedFrom) return session;
  const pauseDuration = session.pauseStartedAt === null ? 0 : Math.max(0, now - session.pauseStartedAt);
  return {
    ...session,
    phase: session.pausedFrom,
    pausedFrom: null,
    pauseStartedAt: null,
    pausedMs: session.pausedMs + pauseDuration,
  };
}

export function restartSession(session: DotsSession, now: number): DotsSession {
  if (session.phase === 'rules') return createDotsSession(session.config);
  const training = session.phase === 'training'
    || session.phase === 'training-complete'
    || (session.phase === 'paused' && session.pausedFrom === 'training');
  // Зачётную доску перезапускаем ПОМНЯ подсмотр, тренировочную — начисто.
  return emptyRound(session, training ? 'training' : 'playing', training ? null : now, !training);
}

export function disposeSession(session: DotsSession): DotsSession {
  return {
    ...session,
    phase: 'disposed',
    pausedFrom: null,
    activePairId: null,
    history: [],
    startedAt: null,
    pauseStartedAt: null,
  };
}

export function occupiedPairAt(session: DotsSession, cell: Cell): string | null {
  return pathOwnerAt(session.paths, cell);
}

export function endpointPairIdAt(session: DotsSession, cell: Cell): string | null {
  return endpointPairAt(getCurrentPuzzle(session), cell)?.id ?? null;
}

export function sessionFingerprint(session: DotsSession): string {
  return Object.entries(session.paths)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pairId, path]) => `${pairId}:${path.map(cellKey).join(';')}`)
    .join('|');
}
