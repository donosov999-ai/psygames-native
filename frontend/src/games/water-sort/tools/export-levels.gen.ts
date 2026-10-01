/* psygames-water-sort-export-levels · VER 3 · 30.09.2026 */
/**
 * 🔴 ВЫГРУЗКА ЛЕСТНИЦЫ СОСУДОВ ДЛЯ ПРИЛОЖЕНИЯ — ТЕПЕРЬ ПОВТОРЯЕМАЯ И С ОТБОРОМ.
 *
 * ⚠️ ЗАЧЕМ ЭТОТ ФАЙЛ. `flutter/assets/levels/sort_tubes.json` лежит в репозитории
 * с 23.09.2026, а инструмента, которым его сделали, в репозитории НЕ БЫЛО: прогон
 * был разовым. Ровно та беда, что 24.09 нашлась у товаров и Лондонской башни, —
 * данные есть, пересобрать нечем.
 *
 * 🔴 ОТБОР ПО РАЗВИЛКАМ (решение Дениса 30.09.2026, путь D). С L14 параметры
 * доски почти не растут («уровни отличаются только раскладом», `generate.ts`), а с
 * L33 не растут вовсе — 28 ступеней с одной настройкой. Замер 30.09.2026 показал,
 * что при этом ТРУДНОСТЬ раздач одной ступени различается больше чем вдвое
 * (развилок со смертью у 10 раздач L47 — от 30 до 68), и прежняя выгрузка брала
 * первую решаемую: по лестнице трудность скакала случайно — L32 68, L35 30.
 * Теперь на каждую ступень с L4 раздаётся до `CANDIDATES` вариантов, и берётся
 * тот, у кого развилок ближе всего к цели лестницы (`forkTarget`).
 *
 * ⚠️ ПОЧЕМУ НЕ ТОЛЬКО ХВОСТ L33–L60, ГДЕ КОНЧАЮТСЯ ПАРАМЕТРЫ. Отбери только хвост —
 * и стык с L32 провалится: у прежней L32 развилок 68, а нижняя цель хвоста около
 * тридцати. Та же беда, что на стыке лестницы Лондонской башни.
 *
 * 🔴 УРОВНИ С ЛИМИТОМ ХОДОВ ДОКАЗЫВАЮТСЯ, А НЕ ПРЕДПОЛАГАЮТСЯ. Лимит — формула от
 * размера доски; отбор нарочно берёт трудные раздачи, и для каждой принятой на
 * уровне с лимитом найдено решение не длиннее лимита (`solutionWithin`).
 *
 * 📌 ЧТО ПЕРЕНЕСЕНО ИЗ ПРЕЖНЕЙ ВЫГРУЗКИ КАК ЕСТЬ: раздачи ступеней обучения
 * L1–L3 (см. `buildLevel`) и `palette` с `draw`. Последние два — не
 * данные генератора, а константы экрана: цвета и значки порций
 * (`app/games/water-sort.tsx:154`) и доли рисунка стекла и гайки, снятые с
 * картинок. Пересчитывать их здесь незачем, а потерять при пересборке — легко.
 * `thresholds` пересчитываются из констант ядра и сверяются с прежними.
 *
 * ЗАПУСК (из frontend), долгий — отбор решает сотни досок:
 *   npx jest --testMatch '**\/water-sort/tools/*.gen.ts' --testTimeout 7200000
 * Переменные: TUBES_SEED (зерно), TUBES_OUT (куда писать), TUBES_FROM (прежняя выгрузка:
 * с ней сверяются параметры и из неё переносятся L1–L3),
 * TUBES_LEVELS (пробный прогон первых N ступеней — только вместе с TUBES_OUT).
 *
 * ⚠️ ЭТО ИНСТРУМЕНТ, А НЕ ПРОБА: обычный `testMatch` берёт только `src/__tests__`.
 */
import {
  generateLevel, levelMoveReference, levelParams, moveLimitFor, solve,
  КАМНИ_С, КОРОТКИЕ_С, ОТЛОЖЕННЫЙ_С, СТРОГО_С, ХОДЫ_С,
} from '../core/generate';
import { СКРЫТО_С, скрытоНаУровне, скрытыеСлои, звёздыПоХодам } from '../core/hidden';
import { deathForks, solutionWithin } from '../core/difficulty';
import type { Field } from '../core/tubes';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const LEVEL_COUNT = 60;
const SEED = Number(process.env.TUBES_SEED ?? 20260930);
const ASSET_FILE = path.resolve(__dirname, '../../../../../flutter/assets/levels/sort_tubes.json');
/** Прежняя выгрузка — с ней сверяются поля, не зависящие от раздачи. */
const PREVIOUS_FILE = process.env.TUBES_FROM ?? ASSET_FILE;
const OUT_FILE = process.env.TUBES_OUT ?? ASSET_FILE;
/** Для пробного прогона: собрать только первые N ступеней (в файл уровней не писать!). */
const LEVELS_TO_BUILD = Number(process.env.TUBES_LEVELS ?? LEVEL_COUNT);

/**
 * С какой ступени раздача отбирается по развилкам. Первые три — обучение на трёх–
 * пяти цветах, развилок там 0–3, отбирать нечего.
 *
 * ⚠️ ОТБОР ИДЁТ И ДО L14, ХОТЯ ТАМ РАСТУТ ПАРАМЕТРЫ. Пробный прогон 30.09.2026
 * без отбора на ранних ступенях: L9 — 17 развилок, L10 — 8, L13 — 22, и на
 * стыке с отбираемой L14 провал 22 → 18. Параметры растят РАЗМЕР доски, а
 * трудность внутри размера всё равно решает случай.
 */
export const SELECT_FROM = 4;
/** Ступень, с которой доска перестаёт расти по цветам (12 цветов по 5 — `ХОДЫ_С`). */
export const PLATEAU_FROM = 14;
/**
 * Цель по развилкам — два отрезка по прямой, чтобы стык не проваливался:
 * L4…L13 — от 3 до 16, пока растёт доска; L14…L60 — от 17 до 65.
 * Нижняя точка плато — медиана голой базы L14 (замер 30.09.2026: 17 у пяти раздач
 * 12×5 с двумя свободными), верхняя — край того, что раздача даёт без новых
 * параметров (у десяти раздач L60 максимум 65, у L47 — 68).
 */
export const TARGET_AT_START = 17;
/**
 * ⚠️ 65 → 60 ПО ПЕРВОЙ ВЫГРУЗКЕ 30.09.2026. С верхом 65 четыре последние ступени
 * исчерпали все 30 раздач и не попали в цель (L57 57 при цели 62, L59 55 при 64),
 * а «ближайшая к цели» дала провалы 62 → 57 и 68 → 55. Верх ставится по тому,
 * что отбор берёт НАДЁЖНО: L50–L56 первой выгрузки попадали в 55–61 за 5–22
 * раздачи.
 */
export const TARGET_AT_TOP = 60;
const CANDIDATES = 30;
/** Верхние ступени: подходящая раздача там реже, перебор длиннее. */
const CANDIDATES_AT_TOP = 60;
const TOP_FROM = 50;
const TOLERANCE = 2;
/**
 * 🔴 СЛЕДУЮЩАЯ СТУПЕНЬ НЕ ЛЕГЧЕ ПРЕДЫДУЩЕЙ БОЛЬШЕ ЧЕМ НА ЭТО ЧИСЛО. Человек идёт
 * по лестнице подряд, и «ближайшая к цели» без взгляда на соседа давала провалы.
 */
const MAX_DIP = 2;

export function forkTarget(L: number): number {
  if (L < SELECT_FROM) return 0;
  if (L < PLATEAU_FROM) return Math.round(3 + (L - SELECT_FROM) * (16 - 3) / (PLATEAU_FROM - 1 - SELECT_FROM));
  const t = (L - PLATEAU_FROM) / (LEVEL_COUNT - PLATEAU_FROM);
  return Math.round(TARGET_AT_START + t * (TARGET_AT_TOP - TARGET_AT_START));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LevelEntry {
  level: number;
  field: Field;
  colors: number;
  empty: number;
  minMoves: number;
  moveLimit: number;
  reference: number;
  hidden: number[];
  hiddenLevel: boolean;
  starsByMoves: boolean;
  solutionMoves: number;
  attempts: number;
  /** Развилок со смертью по пути решателя — мера отбора. */
  forks: number;
  /** Цель лестницы на этой ступени (0 — ступень не отбирается). */
  forksTarget: number;
  /** Сколько раздач перебрано, пока нашлась подходящая. */
  candidates: number;
  /** Найденное лучом решение (не минимум, а доказательство длины). */
  provenMoves: number | null;
}

function buildLevel(L: number, rnd: () => number, prevForks: number, previous: { levels: LevelEntry[] }): LevelEntry {
  const p = levelParams(L);
  const limit = moveLimitFor(L);
  const target = forkTarget(L);
  /*
   * 🔴 СТУПЕНИ ОБУЧЕНИЯ ПЕРЕНОСЯТСЯ ИЗ ПРЕЖНЕЙ ВЫГРУЗКИ КАК ЕСТЬ. Отбирать там
   * нечего (развилок 0–3), а на раздаче L1 держатся пробы экрана во Flutter
   * (`sort_tubes_screen_test.dart`: ходы в них взяты из этой доски) и первое
   * знакомство человека с игрой. Меру для записи считаем, доску не трогаем.
   */
  const prior = previous.levels[L - 1];
  if (L < SELECT_FROM && prior) {
    const r = solve(prior.field, 300000);
    return {
      level: L, field: prior.field, colors: p.colors, empty: p.empty, minMoves: p.minMoves,
      moveLimit: limit, reference: levelMoveReference(L), hidden: prior.hidden ?? [],
      hiddenLevel: скрытоНаУровне(L), starsByMoves: звёздыПоХодам(L),
      solutionMoves: prior.solutionMoves, attempts: prior.attempts,
      forks: r.outcome === 'solved' ? deathForks(prior.field, r.moves) : 0,
      forksTarget: 0, candidates: 0, provenMoves: solutionWithin(prior.field, limit > 0 ? limit : 200),
    };
  }
  // Не легче предыдущей больше чем на допуск — это условие ПРИЁМКИ, а цель — выбор
  // среди принятых. Не нашлось принятых — берём самую трудную из годных.
  const minForks = L > SELECT_FROM ? prevForks - MAX_DIP : -Infinity;
  type Candidate = { g: ReturnType<typeof generateLevel>; fk: number; proven: number | null };
  let best: Candidate | null = null;
  let fallback: Candidate | null = null;
  let tried = 0;
  const howMany = L < SELECT_FROM ? 1 : L >= TOP_FROM ? CANDIDATES_AT_TOP : CANDIDATES;
  for (let k = 0; k < howMany; k += 1) {
    const g = generateLevel(L, rnd);
    tried += 1;
    const r = solve(g.field, 300000);
    if (r.outcome !== 'solved') continue;
    // Доказательство под лимитом — только там, где лимит есть; иначе для записи.
    const proven = solutionWithin(g.field, limit > 0 ? limit : 200);
    if (limit > 0 && proven === null) continue;
    const fk = deathForks(g.field, r.moves);
    const cand: Candidate = { g, fk, proven };
    if (!fallback || fk > fallback.fk) fallback = cand;
    if (fk < minForks) continue;
    if (!best || Math.abs(fk - target) < Math.abs(best.fk - target)) best = cand;
    if (L >= SELECT_FROM && Math.abs(fk - target) <= TOLERANCE) break;
  }
  if (!best) best = fallback;
  if (!best) throw new Error(`L${L}: ни одной годной раздачи из ${tried}`);
  const hiddenOn = скрытоНаУровне(L);
  return {
    level: L,
    field: best.g.field,
    colors: p.colors,
    empty: p.empty,
    minMoves: p.minMoves,
    moveLimit: limit,
    reference: levelMoveReference(L),
    hidden: hiddenOn ? [...скрытыеСлои(best.g.field, rnd)].sort((a, b) => a - b) : [],
    hiddenLevel: hiddenOn,
    starsByMoves: звёздыПоХодам(L),
    solutionMoves: best.g.solutionMoves,
    attempts: best.g.attempts,
    forks: best.fk,
    forksTarget: target,
    candidates: tried,
    provenMoves: best.proven,
  };
}

describe('выгрузка лестницы сосудов для приложения', () => {
  it('отбирает раздачи по развилкам и пишет JSON', () => {
    if (LEVELS_TO_BUILD < LEVEL_COUNT && OUT_FILE === ASSET_FILE) throw new Error('пробный прогон пишет только в TUBES_OUT, не в файл уровней');
    const previous = JSON.parse(fs.readFileSync(PREVIOUS_FILE, 'utf8'));
    const rnd = mulberry32(SEED);
    const levels: LevelEntry[] = [];
    const t0 = Date.now();
    for (let L = 1; L <= LEVELS_TO_BUILD; L += 1) {
      levels.push(buildLevel(L, rnd, levels.length ? levels[levels.length - 1]!.forks : 0, previous));
      const s = levels[levels.length - 1]!;
      console.log(`L${L}: развилок ${s.forks} (цель ${s.forksTarget}) · раздач ${s.candidates} · `
        + `лимит ${s.moveLimit || '—'} · решение лучом ${s.provenMoves ?? '—'} · ${Math.round((Date.now() - t0) / 1000)} с`);
    }

    /* 🔴 ВЫГРУЗКА ПРОВЕРЯЕТ СЕБЯ ДО ЗАПИСИ. */
    const problems: string[] = [];
    // 1. Поля, которые от раздачи НЕ зависят, обязаны совпасть с прежней выгрузкой:
    //    так доказывается, что инструмент делает ТЕ ЖЕ уровни, а не похожие.
    for (const s of levels) {
      const old = previous.levels[s.level - 1];
      for (const k of ['colors', 'empty', 'minMoves', 'moveLimit', 'reference', 'hiddenLevel', 'starsByMoves'] as const) {
        if (old && JSON.stringify(old[k]) !== JSON.stringify(s[k])) problems.push(`L${s.level} ${k}: было ${old[k]}, стало ${s[k]}`);
      }
      if (s.moveLimit > 0 && (s.provenMoves === null || s.provenMoves > s.moveLimit)) {
        problems.push(`L${s.level}: под лимитом ${s.moveLimit} решение не доказано`);
      }
    }
    for (let i = 1; i < levels.length; i += 1) {
      const a = levels[i - 1]!, b = levels[i]!;
      if (b.level > SELECT_FROM && b.forks < a.forks - MAX_DIP - 1) problems.push(`L${a.level}→L${b.level}: провал ${a.forks} → ${b.forks}`);
    }
    const thresholdsNow = { короткие: КОРОТКИЕ_С, камни: КАМНИ_С, отложенный: ОТЛОЖЕННЫЙ_С, строго: СТРОГО_С, ходы: ХОДЫ_С, скрыто: СКРЫТО_С };
    if (JSON.stringify(thresholdsNow) !== JSON.stringify(previous.thresholds)) problems.push(`пороги разошлись: ${JSON.stringify(thresholdsNow)} против ${JSON.stringify(previous.thresholds)}`);
    expect(problems).toEqual([]);

    const payload = {
      generator: 'water-sort generateLevel (живой TS) + отбор по развилкам со смертью с L4 — один движок на переливалку, шарики и гайки',
      exportedAt: new Date().toISOString().slice(0, 10),
      seed: SEED,
      palette: previous.palette,
      draw: previous.draw,
      thresholds: thresholdsNow,
      difficulty: { metric: 'развилки со смертью', from: SELECT_FROM, plateauFrom: PLATEAU_FROM, targetStart: TARGET_AT_START, targetTop: TARGET_AT_TOP },
      levels,
    };
    // Отступ в один пробел: схлопнутый JSON читается так же, но диффы мертвы.
    fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 1)}\n`);
    console.log(`ВЫГРУЗКА: ${levels.length} ступеней, зерно ${SEED} → ${OUT_FILE}, ${Math.round((Date.now() - t0) / 60000)} мин`);
  }, 7200000);
});
