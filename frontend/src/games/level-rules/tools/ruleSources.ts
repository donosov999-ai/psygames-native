/* psygames-level-rules-native-sources · VER 4 · 08.10.2026 */
/**
 * ПРАВИЛА УРОВНЕЙ ДЛЯ НАТИВНОЙ ПОЛОВИНЫ — ТАБЛИЦА «УРОВЕНЬ → ДЕЙСТВУЮЩЕЕ ПРАВИЛО».
 *
 * 🔴 ПОВОД (задача e371fd3a, 30.09.2026). В вебе правило уровня объявляет новую механику
 * до партии (`useLevelRules` + `LevelRuleModal`). Во Flutter такого не было: у 16
 * перенесённых игр 56 механик включались молча — ровно та беда, ради которой правила
 * заводили (анти-конь в судоку у Вали).
 *
 * ⚠️ ПОЧЕМУ ТАБЛИЦА, А НЕ ОПИСАНИЯ ПРАВИЛ. У «Сортировки товаров» правило действует не
 * отрезком уровней, а по предикату (`strictPlacement(L)`, `hiddenInfo(L)`), и повторить
 * его в Dart — значит написать вторую копию логики, которая разойдётся с первой молча.
 * Поэтому считает ЖИВОЙ TS: для каждого уровня берётся ровно то правило, что покажет
 * веб (`activeLevelRule`), и в файл уходят отрезки «с какого по какой уровень — какое».
 */
import { activeLevelRule, type LevelRule } from '@/src/components/LevelRules';

/** Потолок перебора. Длиннее лестницы нет ни у одной игры с правилами; последний отрезок открыт. */
export const MAX_LEVEL = 400;

/** Отрезок: [с уровня, по уровень (null — до конца), ключ правила (null — правила нет)]. */
export type Range = [number, number | null, string | null];

export function levelRanges(rulesAt: (level: number) => LevelRule[], max = MAX_LEVEL): Range[] {
  const out: Range[] = [];
  for (let level = 1; level <= max; level += 1) {
    const key = activeLevelRule(rulesAt(level), level)?.key ?? null;
    const last = out[out.length - 1];
    if (last && last[2] === key) last[1] = level;
    else out.push([level, level, key]);
  }
  const tail = out[out.length - 1];
  if (tail) tail[1] = null;
  return out;
}

export interface RuleSource { ids: string[]; rulesAt: (level: number) => LevelRule[] }

/**
 * Откуда брать правила. Модули грузятся ТОЛЬКО внутри функции: экраны тянут expo-router и
 * прочее, и вызывающий файл обязан поставить заглушки до первого `require`.
 *
 * Один экран — несколько игр: торты и пицца на одном движке, переливалка — на три игры.
 * Проба свежести сверяет список с экранами, где стоит `useLevelRules(`, — новая игра с
 * правилами без строки здесь краснеет, а не выпадает молча.
 */
export function ruleSources(): RuleSource[] {
  /* eslint-disable @typescript-eslint/no-require-imports -- после заглушек вызывающего файла */
  const s = (ids: string[], rules: LevelRule[]): RuleSource => {
    if (!Array.isArray(rules)) throw new Error(`правила ${ids.join(', ')}: массив не загрузился — имя экспорта сменилось?`);
    return { ids, rulesAt: () => rules };
  };
  const игра = (имя: string) => require(`@/app/games/${имя}`);
  const товары = require('@/src/games/goods-sort/core/level');
  const отличия = require('@/src/games/find-differences/core/levelRules');
  const зрительный = require('@/src/games/visual-search/core/nativeRules');
  const сет = require('@/src/games/set-game/core/nativeRules');
  const шульте = require('@/src/games/schulte/core/levelRules');
  const маджонг = require('@/src/games/mahjong/nativeRules');
  const счёт = require('@/src/games/quick-count/core/levelRules');
  // Игры без веб-экрана: механика в Dart, таблица уровней — в списке нативных игр.
  const nativeOnly = require('@/src/constants/nativeOnlyGames');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return [
    s(['animal_queue'], nativeOnly.ANIMAL_QUEUE_RULES),
    s(['cake_sort', 'pizza_sort'], игра('cake-sort').CS_RULES),
    s(['chess_blind'], игра('chess-blind').CHESSBLIND_RULES),
    s(['corsi'], игра('corsi').CORSI_RULES),
    s(['counter'], игра('counter').COUNTER_RULES),
    s(['cpt'], игра('cpt').CPT_RULES),
    s(['digit_span'], игра('digit-span').DS_RULES),
    s(['find_differences'], отличия.FD_RULES),
    { ids: ['goods_sort'], rulesAt: товары.gsRulesForLevel },
    s(['hanoi'], игра('hanoi').HN_RULES),
    s(['kids_sort'], nativeOnly.KIDS_SORT_RULES),
    s(['listening_span'], игра('listening-span').LISTENINGSPAN_RULES),
    // Веб-правила первыми, нативные следом: на 29-м и выше действует последнее подошедшее.
    s(['mahjong'], [...игра('mahjong').MAHJONG_RULES, ...маджонг.MJ_NATIVE_RULES]),
    s(['math_sprint'], игра('math-sprint').MS_RULES),
    s(['memory_matrix'], игра('memory-matrix').MEMORYMATRIX_RULES),
    s(['mental_rotation'], игра('mental-rotation').MR_RULES),
    s(['mnemonics'], игра('mnemonics').MNEMONICS_RULES),
    s(['n_back'], игра('n-back').NB_RULES),
    s(['ospan'], игра('ospan').OSPAN_RULES),
    s(['picture_pairs'], игра('picture-pairs').PAIRS_RULES),
    s(['prl'], игра('prl').PRL_RULES),
    s(['pseudoword_echo'], игра('pseudoword-echo').PSEUDOWORDECHO_RULES),
    s(['quick_count'], счёт.QC_RULES),
    s(['reading_span'], игра('reading-span').READINGSPAN_RULES),
    s(['schulte_table'], шульте.SCHULTE_RULES),
    s(['semantic_sort'], игра('semantic-sort').SEMANTICSORT_RULES),
    s(['set_game'], [...игра('set-game').SG_RULES, ...сет.SG_NATIVE_RULES]),
    s(['spatial_span'], игра('spatial-span').SS_RULES),
    s(['stroop'], игра('stroop').STROOP_RULES),
    s(['switching_task'], игра('switching-task').SWITCH_RULES),
    // Веб-правила первыми, нативные следом: на 32-м и выше действует последнее подошедшее.
    s(['visual_search'], [...игра('visual-search').VS_RULES, ...зрительный.VS_NATIVE_RULES]),
    s(['water_sort', 'ball_sort', 'nut_sort'], игра('water-sort').WATER_SORT_RULES),
    s(['word_pairs'], игра('word-pairs').WORDPAIRS_RULES),
  ];
}

/** Вся таблица: игра → отрезки. Порядок ключей стабильный — файл не дрожит от прогона к прогону. */
export function levelRulesTable(): Record<string, Range[]> {
  const out: Record<string, Range[]> = {};
  for (const src of ruleSources()) {
    if (typeof src.rulesAt !== 'function') throw new Error(`правила для ${src.ids.join(',')} не загрузились`);
    const ranges = levelRanges(src.rulesAt);
    for (const id of src.ids) out[id] = ranges;
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}
