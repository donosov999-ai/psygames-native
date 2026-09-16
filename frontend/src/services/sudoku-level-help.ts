/* psygames-sudoku-level-help · VER 2 · 12.09.2026 */
import type { Variant } from './sudoku-core';
import { variantLabel, variantRule } from './sudoku-core';

/**
 * Справка ТЕКУЩЕГО уровня, а не игры вообще.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. До 07.09.2026 кнопка «Правила» показывала правило
 * ВАРИАНТА: на 54-м уровне — «блоки кривые, а не квадраты». Это правда, и она
 * бесполезна: кривые блоки игрок и так видит нарисованными. Живой замер (доска
 * Ур.54, 3 ч 18 мин на часах, «Подсказка 0», 1 ошибка) показал, что человек
 * встаёт не на правиле, а на ПРИЁМЕ — «как этим правилом пользоваться».
 *
 * Поэтому справка собирается из четырёх разных источников, и три из них
 * зависят от уровня:
 *   1. базовое правило           — от размера доски;
 *   2. правило варианта          — от варианта уровня (было и раньше);
 *   3. ПРИЁМ ЭТОЙ ДОСКИ          — от `tier`, который градатор посчитал для
 *      выданного расклада, а не вывел из номера уровня;
 *   4. КАК СМОТРЕТЬ НА ВАРИАНТЕ  — от варианта; это то, чего нет в правиле.
 *
 * Модуль чистый: ни состояния экрана, ни React. Всё, что ему нужно, приходит
 * аргументом, поэтому пробы гоняют его напрямую по всем 92 уровням.
 */

export type HelpMode = 'levels' | 'free' | 'killer' | 'towers' | 'unequal';

export interface LevelHelpInput {
  mode: HelpMode;
  /** Номер уровня основной лестницы либо ступень мини-лестницы режима. */
  level: number;
  N: number;
  variant: Variant;
  /**
   * Ступень техники, посчитанная градатором для ВЫДАННОЙ доски.
   * `null` — градатор промолчал: доска выше его лестницы приёмов.
   */
  tier: number | null;
  hintMax: number;
  errorMax: number;
  /** Сколько всего ступеней в мини-лестнице режима (killer / towers / unequal). */
  steps?: number;
}

export interface LevelHelp {
  title: string;
  body: string;
}

type Translate = (key: string) => string;

/** Наша лестница пояснений кончается там же, где лестница приёмов градатора. */
const HOW_KEYS = [
  'sudokuHowNakedSingle',   // 1
  'sudokuHowHiddenSingle',  // 2
  'sudokuHowLocked',        // 3
  'sudokuHowNakedPair',     // 4
  'sudokuHowHiddenPair',    // 5
  'sudokuHowXWing',         // 6
];

export function techniqueHowKey(tier: number): string {
  const i = Math.max(1, Math.min(HOW_KEYS.length, Math.round(tier)));
  return HOW_KEYS[i - 1];
}

/**
 * «Как смотреть» под вариант — приём, а не правило.
 *
 * ⚠️ Варианты, для которых приём ещё не сформулирован, отдают `null`, и раздел
 * в справке просто не появляется. Пустая строка была бы хуже отсутствия:
 * игрок счёл бы, что смотреть тут не на что.
 */
const SCAN_KEYS: Partial<Record<Variant, string>> = {
  jigsaw: 'sudokuScanJigsaw',
  diagonal: 'sudokuScanDiagonal',
  hyper: 'sudokuScanHyper',
  antiknight: 'sudokuScanAntiknight',
  antiking: 'sudokuScanAntiking',
  nonconsec: 'sudokuScanNonconsec',
  evenodd: 'sudokuScanEvenodd',
  kropki: 'sudokuScanKropki',
  thermo: 'sudokuScanThermo',
  thermocage: 'sudokuScanThermo',
  thermoknight: 'sudokuScanThermo',
  sandwich: 'sudokuScanSandwich',
  sandparity: 'sudokuScanSandwich',
  arrow: 'sudokuScanArrow',
  killerdiag: 'sudokuScanCages',
  towers: 'sudokuScanTowers',
  unequal: 'sudokuScanUnequal',
};

export function variantScanKey(v: Variant): string | null {
  return SCAN_KEYS[v] ?? null;
}

/**
 * Пояс уровня — когда градатор промолчал. Границы те же, что у подписи в HUD:
 * ALS (58–65), цепи (66–79), легенда (80), комбо (81+).
 */
export function beltKey(level: number): string | null {
  if (level >= 81) return 'sudokuBeltCombo';
  if (level >= 80) return 'sudokuBeltLegend';
  if (level >= 66) return 'sudokuBeltChains';
  if (level >= 58) return 'sudokuBeltAls';
  return null;
}

/**
 * ═══ РАСШИФРОВКА ПОЯСА — ЧТО ЭТИ ДОСКИ ТРЕБУЮТ (правка 12.09.2026) ═══
 *
 * 🔴 ПОВОД — ЖИВОЙ ОТЧЁТ. Валя, 12.09: «на 58 уровне не вижу нормальной
 * расшифровки и правил уровня». Замер подтвердил поштучно: справка уровня 57
 * состоит из ПЯТИ разделов (492 знака), справка 58-го — из ТРЁХ (362), и
 * заголовок теряет имя: «Ур.57 · ⧉ кривые блоки» против голого «Ур.58».
 * Так на 23 уровнях подряд — 58…80. Всего по лестнице: 61 уровень из 92 имеет
 * пять разделов, 31 — три (это L1–L8 и весь банковский пояс).
 *
 * 🔴 ПОЧЕМУ ЭТО ХУЖЕ, ЧЕМ ПРОСТО «МЕНЬШЕ ТЕКСТА». Беднеет справка ровно там, где
 * она нужнее всего: 58–80 — самые трудные доски лестницы, оценщик на них молчит
 * (замер 09.09: 92 доски из 92), и человеку доставался ТЕРМИН БЕЗ РАСШИФРОВКИ —
 * «Пояс ALS». Слово из решательских форумов вместо объяснения.
 *
 * ⚠️ ОТКУДА ВЗЯТЫ СЛОВА. Не сочинены: каждая строка `RATING_LADDER` в
 * services/sudoku-bank говорит, какое семейство приёмов стоит за полосой SE —
 * 6.3 ALS-XZ, 6.4 ALS-XY-Wing, 6.6–6.7 ALS-цепи, 6.8 короткие AIC, 7.0 Nishio.
 * Здесь это сказано по-человечески и сгруппировано по поясам, потому что внутри
 * пояса человеку важно одно и то же: чем этот пласт отличается от предыдущего.
 */
const BELT_HOW: Record<string, string> = {
  sudokuBeltAls: 'sudokuBeltAlsHow',
  sudokuBeltChains: 'sudokuBeltChainsHow',
  sudokuBeltLegend: 'sudokuBeltLegendHow',
};

export function beltHowKey(level: number): string | null {
  const belt = beltKey(level);
  return belt ? (BELT_HOW[belt] ?? null) : null;
}

function section(head: string, text: string): string {
  return `${head}\n${text}`;
}

export function buildLevelHelp(inp: LevelHelpInput, tr: Translate, language: string): LevelHelp {
  const { mode, level, N, variant, tier, hintMax, errorMax, steps } = inp;

  // ── заголовок: номер ступени всегда виден, иначе «текущий уровень» — слово ──
  let title: string;
  if (mode === 'killer') {
    title = steps ? `Killer · ${tr('label_level_short')}${level}/${steps}` : 'Killer';
  } else if (mode === 'towers' || mode === 'unequal') {
    const label = variantLabel(variant, language) || tr('btn_rules');
    title = steps ? `${label} · ${tr('label_level_short')}${level}/${steps}` : label;
  } else if (mode === 'free') {
    title = tr('btn_rules');
  } else {
    /**
     * ⚠️ У БАНКОВСКИХ УРОВНЕЙ ВАРИАНТА НЕТ, И ЗАГОЛОВОК ОСТАВАЛСЯ БЕЗЫМЯННЫМ.
     * «Ур.58» рядом с «Ур.57 · ⧉ кривые блоки» читается как шаг назад: уровень
     * труднее, а сказать о нём нечего. Имя пояса уже переведено — берём его.
     */
    const belt = variant === 'none' ? beltKey(level) : null;
    const label = variant !== 'none' ? variantLabel(variant, language) : (belt ? tr(belt) : '');
    title = `${tr('label_level_short')}${level}${label ? ` · ${label}` : ''}`;
  }

  const parts: string[] = [];

  // 1. базовое правило — размер берём фактический, а не 9 по умолчанию
  parts.push(tr('sudokuBaseRule').replace('{n}', String(N)));

  // 2. правило варианта (killer живёт отдельной строкой словаря)
  const rule = mode === 'killer' ? tr('sudokuKillerRule') : variantRule(variant, language);
  if (rule) parts.push(rule);

  // 3. приём ЭТОЙ доски — главное, чего в справке не было
  if (tier !== null) {
    parts.push(section(tr('sudokuHowLabel'), tr(techniqueHowKey(tier))));
  } else {
    const belt = mode === 'levels' ? beltKey(level) : null;
    const how = mode === 'levels' ? beltHowKey(level) : null;
    // Замер 07.09.2026: на 114 банковских досках из 115 (уровни 58–80, пять
    // профилей) со старта доступна скрытая одиночка. Поэтому совет «пройди одной
    // цифрой по блокам» — не общее место, а измеренный вход.
    const tail = tr('sudokuHowUnmeasured');
    // Имя пояса + ЧТО ОН ТРЕБУЕТ + измеренный вход. Раньше здесь стоял голый
    // термин и сразу вход — человек читал «Пояс ALS» и не узнавал ничего.
    const head = belt ? (how ? `${tr(belt)}. ${tr(how)}` : `${tr(belt)}.`) : '';
    parts.push(section(tr('sudokuHowLabel'), head ? `${head}\n\n${tail}` : tail));
  }

  // 4. как смотреть именно на этом варианте
  //
  // ⚠️ У КЛАССИКИ ВЫСОКОГО ПОЯСА ВАРИАНТА НЕТ, И РАЗДЕЛ ПРОПАДАЛ ЦЕЛИКОМ. Но
  // смотреть там надо ИНАЧЕ, чем на первых уровнях: без расставленных кандидатов
  // ни почти-запертая группа, ни цепь не видны вовсе. Это и есть «как смотреть»
  // для банковского пояса — он подставляется вместо отсутствующего варианта.
  const scan = mode === 'killer'
    ? 'sudokuScanCages'
    : (variantScanKey(variant) ?? (mode === 'levels' && variant === 'none' && beltKey(level) ? 'sudokuScanHighBelt' : null));
  if (scan) parts.push(section(tr('sudokuScanLabel'), tr(scan)));

  // 5. чем игрок располагает на этом уровне
  //
  // ⚠️ У длинных режимов (`failurePolicy('longform')`) жизней Infinity — сейчас
  // судоку такой политики не берёт, но подставить `Infinity` в текст экрану ничто
  // не мешает. Печатаем словом, а не числом.
  const errText = Number.isFinite(errorMax) ? String(errorMax) : tr('sudokuLevelHasNoLimit');
  parts.push(section(
    tr('sudokuLevelHasLabel'),
    tr('sudokuLevelHas').replace('{h}', String(hintMax)).replace('{e}', errText),
  ));

  return { title, body: parts.join('\n\n') };
}
