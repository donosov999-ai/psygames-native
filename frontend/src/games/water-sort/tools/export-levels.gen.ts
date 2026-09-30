/* psygames-water-sort-export-levels · VER 2 · 30.09.2026 */
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
 * Теперь на каждую ступень с L4 раздаётся до `КАНДИДАТОВ` вариантов, и берётся
 * тот, у кого развилок ближе всего к цели лестницы (`цельРазвилок`).
 *
 * ⚠️ ПОЧЕМУ НЕ ТОЛЬКО ХВОСТ L33–L60, ГДЕ КОНЧАЮТСЯ ПАРАМЕТРЫ. Отбери только хвост —
 * и стык с L32 провалится: у прежней L32 развилок 68, а нижняя цель хвоста около
 * тридцати. Та же беда, что на стыке лестницы Лондонской башни.
 *
 * 🔴 УРОВНИ С ЛИМИТОМ ХОДОВ ДОКАЗЫВАЮТСЯ, А НЕ ПРЕДПОЛАГАЮТСЯ. Лимит — формула от
 * размера доски; отбор нарочно берёт трудные раздачи, и для каждой принятой на
 * уровне с лимитом найдено решение не длиннее лимита (`решениеНеДлиннее`).
 *
 * 📌 ЧТО ПЕРЕНЕСЕНО ИЗ ПРЕЖНЕЙ ВЫГРУЗКИ КАК ЕСТЬ: раздачи ступеней обучения
 * L1–L3 (см. `собрать`) и `palette` с `draw`. Последние два — не
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
import { развилкиСоСмертью, решениеНеДлиннее } from '../core/difficulty';
import type { Field } from '../core/tubes';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const СТУПЕНЕЙ = 60;
const ЗЕРНО = Number(process.env.TUBES_SEED ?? 20260930);
const ФАЙЛ = path.resolve(__dirname, '../../../../../flutter/assets/levels/sort_tubes.json');
/** Прежняя выгрузка — с ней сверяются поля, не зависящие от раздачи. */
const ПРЕЖНЯЯ = process.env.TUBES_FROM ?? ФАЙЛ;
const ВЫХОД = process.env.TUBES_OUT ?? ФАЙЛ;
/** Для пробного прогона: собрать только первые N ступеней (в файл уровней не писать!). */
const СОБРАТЬ = Number(process.env.TUBES_LEVELS ?? СТУПЕНЕЙ);

/**
 * С какой ступени раздача отбирается по развилкам. Первые три — обучение на трёх–
 * пяти цветах, развилок там 0–3, отбирать нечего.
 *
 * ⚠️ ОТБОР ИДЁТ И ДО L14, ХОТЯ ТАМ РАСТУТ ПАРАМЕТРЫ. Пробный прогон 30.09.2026
 * без отбора на ранних ступенях: L9 — 17 развилок, L10 — 8, L13 — 22, и на
 * стыке с отбираемой L14 провал 22 → 18. Параметры растят РАЗМЕР доски, а
 * трудность внутри размера всё равно решает случай.
 */
export const ОТБОР_С = 4;
/** Ступень, с которой доска перестаёт расти по цветам (12 цветов по 5 — `ХОДЫ_С`). */
export const ПЛАТО_С = 14;
/**
 * Цель по развилкам — два отрезка по прямой, чтобы стык не проваливался:
 * L4…L13 — от 3 до 16, пока растёт доска; L14…L60 — от 17 до 65.
 * Нижняя точка плато — медиана голой базы L14 (замер 30.09.2026: 17 у пяти раздач
 * 12×5 с двумя свободными), верхняя — край того, что раздача даёт без новых
 * параметров (у десяти раздач L60 максимум 65, у L47 — 68).
 */
export const ЦЕЛЬ_НА_СТАРТЕ = 17;
/**
 * ⚠️ 65 → 60 ПО ПЕРВОЙ ВЫГРУЗКЕ 30.09.2026. С верхом 65 четыре последние ступени
 * исчерпали все 30 раздач и не попали в цель (L57 57 при цели 62, L59 55 при 64),
 * а «ближайшая к цели» дала провалы 62 → 57 и 68 → 55. Верх ставится по тому,
 * что отбор берёт НАДЁЖНО: L50–L56 первой выгрузки попадали в 55–61 за 5–22
 * раздачи.
 */
export const ЦЕЛЬ_НАВЕРХУ = 60;
const КАНДИДАТОВ = 30;
/** Верхние ступени: подходящая раздача там реже, перебор длиннее. */
const КАНДИДАТОВ_НАВЕРХУ = 60;
const ВЕРХ_С = 50;
const ДОПУСК = 2;
/**
 * 🔴 СЛЕДУЮЩАЯ СТУПЕНЬ НЕ ЛЕГЧЕ ПРЕДЫДУЩЕЙ БОЛЬШЕ ЧЕМ НА ЭТО ЧИСЛО. Человек идёт
 * по лестнице подряд, и «ближайшая к цели» без взгляда на соседа давала провалы.
 */
const ПРОВАЛ_НЕ_БОЛЬШЕ = 2;

export function цельРазвилок(L: number): number {
  if (L < ОТБОР_С) return 0;
  if (L < ПЛАТО_С) return Math.round(3 + (L - ОТБОР_С) * (16 - 3) / (ПЛАТО_С - 1 - ОТБОР_С));
  const t = (L - ПЛАТО_С) / (СТУПЕНЕЙ - ПЛАТО_С);
  return Math.round(ЦЕЛЬ_НА_СТАРТЕ + t * (ЦЕЛЬ_НАВЕРХУ - ЦЕЛЬ_НА_СТАРТЕ));
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

interface Ступень {
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

function собрать(L: number, rnd: () => number, предыдущая: number, прежняя: { levels: Ступень[] }): Ступень {
  const p = levelParams(L);
  const лимит = moveLimitFor(L);
  const цель = цельРазвилок(L);
  /*
   * 🔴 СТУПЕНИ ОБУЧЕНИЯ ПЕРЕНОСЯТСЯ ИЗ ПРЕЖНЕЙ ВЫГРУЗКИ КАК ЕСТЬ. Отбирать там
   * нечего (развилок 0–3), а на раздаче L1 держатся пробы экрана во Flutter
   * (`sort_tubes_screen_test.dart`: ходы в них взяты из этой доски) и первое
   * знакомство человека с игрой. Меру для записи считаем, доску не трогаем.
   */
  const была = прежняя.levels[L - 1];
  if (L < ОТБОР_С && была) {
    const r = solve(была.field, 300000);
    return {
      level: L, field: была.field, colors: p.colors, empty: p.empty, minMoves: p.minMoves,
      moveLimit: лимит, reference: levelMoveReference(L), hidden: была.hidden ?? [],
      hiddenLevel: скрытоНаУровне(L), starsByMoves: звёздыПоХодам(L),
      solutionMoves: была.solutionMoves, attempts: была.attempts,
      forks: r.outcome === 'solved' ? развилкиСоСмертью(была.field, r.moves) : 0,
      forksTarget: 0, candidates: 0, provenMoves: решениеНеДлиннее(была.field, лимит > 0 ? лимит : 200),
    };
  }
  // Не легче предыдущей больше чем на допуск — это условие ПРИЁМКИ, а цель — выбор
  // среди принятых. Не нашлось принятых — берём самую трудную из годных.
  const пол = L > ОТБОР_С ? предыдущая - ПРОВАЛ_НЕ_БОЛЬШЕ : -Infinity;
  type Вариант = { g: ReturnType<typeof generateLevel>; fk: number; proven: number | null };
  let лучший: Вариант | null = null;
  let запасной: Вариант | null = null;
  let перебрано = 0;
  const сколько = L < ОТБОР_С ? 1 : L >= ВЕРХ_С ? КАНДИДАТОВ_НАВЕРХУ : КАНДИДАТОВ;
  for (let k = 0; k < сколько; k += 1) {
    const g = generateLevel(L, rnd);
    перебрано += 1;
    const r = solve(g.field, 300000);
    if (r.outcome !== 'solved') continue;
    // Доказательство под лимитом — только там, где лимит есть; иначе для записи.
    const proven = решениеНеДлиннее(g.field, лимит > 0 ? лимит : 200);
    if (лимит > 0 && proven === null) continue;
    const fk = развилкиСоСмертью(g.field, r.moves);
    const в: Вариант = { g, fk, proven };
    if (!запасной || fk > запасной.fk) запасной = в;
    if (fk < пол) continue;
    if (!лучший || Math.abs(fk - цель) < Math.abs(лучший.fk - цель)) лучший = в;
    if (L >= ОТБОР_С && Math.abs(fk - цель) <= ДОПУСК) break;
  }
  if (!лучший) лучший = запасной;
  if (!лучший) throw new Error(`L${L}: ни одной годной раздачи из ${перебрано}`);
  const скрыт = скрытоНаУровне(L);
  return {
    level: L,
    field: лучший.g.field,
    colors: p.colors,
    empty: p.empty,
    minMoves: p.minMoves,
    moveLimit: лимит,
    reference: levelMoveReference(L),
    hidden: скрыт ? [...скрытыеСлои(лучший.g.field, rnd)].sort((a, b) => a - b) : [],
    hiddenLevel: скрыт,
    starsByMoves: звёздыПоХодам(L),
    solutionMoves: лучший.g.solutionMoves,
    attempts: лучший.g.attempts,
    forks: лучший.fk,
    forksTarget: цель,
    candidates: перебрано,
    provenMoves: лучший.proven,
  };
}

describe('выгрузка лестницы сосудов для приложения', () => {
  it('отбирает раздачи по развилкам и пишет JSON', () => {
    if (СОБРАТЬ < СТУПЕНЕЙ && ВЫХОД === ФАЙЛ) throw new Error('пробный прогон пишет только в TUBES_OUT, не в файл уровней');
    const прежняя = JSON.parse(fs.readFileSync(ПРЕЖНЯЯ, 'utf8'));
    const rnd = mulberry32(ЗЕРНО);
    const levels: Ступень[] = [];
    const t0 = Date.now();
    for (let L = 1; L <= СОБРАТЬ; L += 1) {
      levels.push(собрать(L, rnd, levels.length ? levels[levels.length - 1]!.forks : 0, прежняя));
      const s = levels[levels.length - 1]!;
      console.log(`L${L}: развилок ${s.forks} (цель ${s.forksTarget}) · раздач ${s.candidates} · `
        + `лимит ${s.moveLimit || '—'} · решение лучом ${s.provenMoves ?? '—'} · ${Math.round((Date.now() - t0) / 1000)} с`);
    }

    /* 🔴 ВЫГРУЗКА ПРОВЕРЯЕТ СЕБЯ ДО ЗАПИСИ. */
    const беды: string[] = [];
    // 1. Поля, которые от раздачи НЕ зависят, обязаны совпасть с прежней выгрузкой:
    //    так доказывается, что инструмент делает ТЕ ЖЕ уровни, а не похожие.
    for (const s of levels) {
      const old = прежняя.levels[s.level - 1];
      for (const k of ['colors', 'empty', 'minMoves', 'moveLimit', 'reference', 'hiddenLevel', 'starsByMoves'] as const) {
        if (old && JSON.stringify(old[k]) !== JSON.stringify(s[k])) беды.push(`L${s.level} ${k}: было ${old[k]}, стало ${s[k]}`);
      }
      if (s.moveLimit > 0 && (s.provenMoves === null || s.provenMoves > s.moveLimit)) {
        беды.push(`L${s.level}: под лимитом ${s.moveLimit} решение не доказано`);
      }
    }
    for (let i = 1; i < levels.length; i += 1) {
      const a = levels[i - 1]!, b = levels[i]!;
      if (b.level > ОТБОР_С && b.forks < a.forks - ПРОВАЛ_НЕ_БОЛЬШЕ - 1) беды.push(`L${a.level}→L${b.level}: провал ${a.forks} → ${b.forks}`);
    }
    const пороги = { короткие: КОРОТКИЕ_С, камни: КАМНИ_С, отложенный: ОТЛОЖЕННЫЙ_С, строго: СТРОГО_С, ходы: ХОДЫ_С, скрыто: СКРЫТО_С };
    if (JSON.stringify(пороги) !== JSON.stringify(прежняя.thresholds)) беды.push(`пороги разошлись: ${JSON.stringify(пороги)} против ${JSON.stringify(прежняя.thresholds)}`);
    expect(беды).toEqual([]);

    const данные = {
      generator: 'water-sort generateLevel (живой TS) + отбор по развилкам со смертью с L4 — один движок на переливалку, шарики и гайки',
      exportedAt: new Date().toISOString().slice(0, 10),
      seed: ЗЕРНО,
      palette: прежняя.palette,
      draw: прежняя.draw,
      thresholds: пороги,
      difficulty: { metric: 'развилки со смертью', from: ОТБОР_С, plateauFrom: ПЛАТО_С, targetStart: ЦЕЛЬ_НА_СТАРТЕ, targetTop: ЦЕЛЬ_НАВЕРХУ },
      levels,
    };
    // Отступ в один пробел: схлопнутый JSON читается так же, но диффы мертвы.
    fs.writeFileSync(ВЫХОД, `${JSON.stringify(данные, null, 1)}\n`);
    console.log(`ВЫГРУЗКА: ${levels.length} ступеней, зерно ${ЗЕРНО} → ${ВЫХОД}, ${Math.round((Date.now() - t0) / 60000)} мин`);
  }, 7200000);
});
