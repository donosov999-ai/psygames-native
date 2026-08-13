/**
 * Уровни фрактальной судоку: сколько клеток выколото и сколько нужно решить,
 * чтобы дочерняя сетка отдала цифру наверх.
 *
 * ЗАЧЕМ. Игра вышла без уровней вообще — сразу «hard» и всегда одинаково. Это моя
 * же дыра: выкатил новую игру мимо формата, на который сам жалуюсь.
 *
 * ЧТО ЗДЕСЬ ТРУДНО. Не количество сеток (их всегда девять), а две вещи:
 *
 *   сколько клеток выколото — чем больше, тем меньше опор для вывода;
 *   сколько верных клеток нужно набрать до открытия корневой — чем выше порог,
 *     тем дольше идёшь без промежуточной награды и тем глубже приходится решать.
 *
 * ⚠️ ПОРОГ НЕ ПОДНИМАЕМ ДО ПОЛНОГО РЕШЕНИЯ. Если открывать корневую клетку только
 * за полностью решённую дочернюю, фрактал превращается в девять судоку подряд без
 * единой промежуточной награды — ровно то, от чего порог и заведён. Потолок 34 из
 * 81, то есть меньше половины.
 */

export const FRACTAL_MAX_LEVEL = 15;

const CHILD_BLANKS_MIN = 38;   // первый уровень: опор много
const CHILD_BLANKS_MAX = 56;   // последний: выколото больше двух третей
const ROOT_BLANKS_MIN = 44;
const ROOT_BLANKS_MAX = 58;
const UNLOCK_MIN = 17;         // нынешний порог — он и есть первый уровень
const UNLOCK_MAX = 34;         // меньше половины сетки: награда всё ещё промежуточная

export interface FractalLevelCfg {
  /** Выколото в корневой сетке. */
  rootBlanks: number;
  /** Выколото в каждой дочерней. */
  childBlanks: number;
  /** Сколько верных клеток дочерней нужно, чтобы отдать цифру наверх. */
  unlockCells: number;
}

export function clampFractalLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(FRACTAL_MAX_LEVEL, Math.floor(level)));
}

function lerp(a: number, b: number, k: number): number {
  return Math.round(a + k * (b - a));
}

export function fractalLevel(level: number): FractalLevelCfg {
  const n = clampFractalLevel(level);
  const k = (n - 1) / (FRACTAL_MAX_LEVEL - 1);
  return {
    rootBlanks: lerp(ROOT_BLANKS_MIN, ROOT_BLANKS_MAX, k),
    childBlanks: lerp(CHILD_BLANKS_MIN, CHILD_BLANKS_MAX, k),
    unlockCells: lerp(UNLOCK_MIN, UNLOCK_MAX, k),
  };
}
