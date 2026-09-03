/* psygames-feature-ladder · VER 1 · 03.09.2026 */
/**
 * ВТОРАЯ ЛЕСТНИЦА: ЧТО ОТКРЫВАЕТСЯ ПО УРОВНЮ ИГРОКА. Бесплатная, параллельно платным
 * профилям.
 *
 * 🔴 ЗАЧЕМ. Задача b96bfc4b. Замер по кадрам эталона: девять замков на первых
 * шестидесяти уровнях, разнесённых по всему приложению — рейтинг ур.5, бустеры
 * ур.6/8/9, команда ур.10, событие ур.25, коллекция ур.28, турнир ур.40, режим
 * ур.60. Между пятым и десятым их ЧЕТЫРЕ: где бы игрок ни стоял, ближайший замок в
 * одном-пяти уровнях впереди.
 *
 * У нас лестница была одна и открывалась ДЕНЬГАМИ (профили free → тематические).
 * Бесплатному игроку впереди не заперто ничего: он видит ровно то, что получил на
 * старте, и повода вернуться завтра у него нет.
 *
 * ⚠️ ДВЕ ЛЕСТНИЦЫ НЕ КОНКУРИРУЮТ, А ДЕЛЯТ ОБЯЗАННОСТИ: профиль решает, СКОЛЬКО игр
 * доступно; уровень решает, что открывается ВНУТРИ. Поэтому здесь нет ни одной
 * игры — только приёмы, которые уже написаны и лежат мёртвыми.
 *
 * ⚠️ УРОВЕНЬ СЧИТАЕТСЯ ПО ПРОЙДЕННОМУ, А НЕ ПО ВРЕМЕНИ В ПРИЛОЖЕНИИ. Иначе замок
 * открывается за то, что человек оставил экран включённым.
 */

export interface FeatureLock {
  /** Ключ приёма — по нему экраны спрашивают «уже открыто?». */
  key: string;
  /** Уровень игрока, с которого приём доступен. */
  level: number;
  /** Ключ словаря для названия. Обещание показывается ДО открытия — в этом смысл замка. */
  titleKey: string;
}

/**
 * Порядок и шаг взяты с замера эталона: густо в начале (между 2 и 10 — пять замков),
 * реже дальше. Первый на втором уровне, а не на первом: на первом человек ещё не
 * понял, что уровни вообще есть, и замок читается как поломка.
 */
export const FEATURE_LADDER: readonly FeatureLock[] = [
  { key: 'hint',        level: 2,  titleKey: 'ladderHint' },
  { key: 'undo',        level: 3,  titleKey: 'ladderUndo' },
  { key: 'roundStats',  level: 5,  titleKey: 'ladderRoundStats' },
  { key: 'petSkins',    level: 8,  titleKey: 'ladderPetSkins' },
  { key: 'eveningMode', level: 12, titleKey: 'ladderEvening' },
  { key: 'records',     level: 18, titleKey: 'ladderRecords' },
  { key: 'streakMap',   level: 25, titleKey: 'ladderStreakMap' },
] as const;

/**
 * Уровень игрока = сколько уровней он прошёл во ВСЕХ играх, вместе.
 *
 * Складываем, а не берём максимум по одной игре: иначе человек, ровно идущий по
 * пяти играм, стоит на месте, хотя сделал больше, чем прошедший одну игру далеко.
 */
export function playerLevel(completedByGame: Record<string, { completed: number }>): number {
  let n = 0;
  for (const g of Object.values(completedByGame ?? {})) n += Math.max(0, g?.completed ?? 0);
  return n;
}

/** Открыт ли приём на этом уровне. Неизвестный ключ — открыт: замок должен быть явным. */
export function isUnlocked(key: string, level: number): boolean {
  const lock = FEATURE_LADDER.find((l) => l.key === key);
  return !lock || level >= lock.level;
}

/**
 * Ближайший запертый приём — то, ради чего лестница и нужна: впереди всегда видно
 * следующую дверь. `null` означает, что открыто всё.
 */
export function nextLock(level: number): FeatureLock | null {
  return FEATURE_LADDER.filter((l) => level < l.level)
    .sort((a, b) => a.level - b.level)[0] ?? null;
}

/** Сколько уровней осталось до ближайшего замка. `null` — открыто всё. */
export function levelsToNextLock(level: number): number | null {
  const l = nextLock(level);
  return l ? l.level - level : null;
}
