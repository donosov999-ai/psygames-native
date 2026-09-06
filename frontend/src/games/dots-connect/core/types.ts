/* psygames-dots-connect-types · VER 4 · 23.08.2026 */
/**
 * Ступени рассуждения объявлены ОДИН РАЗ — списком `DOTS_TIERS` в `core/solver.ts`,
 * там же, где решатель, который их различает. Здесь тип только ИСПОЛЬЗУЕТСЯ и
 * берётся оттуда же: `import type` стирается при сборке, поэтому кольца импортов
 * не возникает, а второго списка ступеней, который однажды разойдётся с первым,
 * не заводим.
 *
 * ⚠️ И НЕ ПЕРЕЭКСПОРТИРУЕТСЯ ОТСЮДА. `core/index.ts` раскрывает `./types` и
 * `./solver` целиком; отдай `DotsTier` оба — и получишь `Multiple exports of
 * name` от линта на ровном месте. Наружу тип идёт из `solver`, где объявлен.
 */
import type { DotsTier } from './solver';

/**
 * ⚠️ ВЕРСИЯ ГЕНЕРАТОРА ПОДНЯТА ДО v3 — РАСКЛАДКИ ДРУГИЕ.
 *
 * v1 резал на куски ОДНУ И ТУ ЖЕ змейку (или один и тот же гамильтонов цикл);
 * v2 стал трясти её backbite-ом и резать с нижней границей длины; v3 вдобавок
 * ОТБИРАЕТ доску по требуемому рассуждению — собирает и проверяет решателем
 * заданной ступени, пока не попадёт (см. `dotsLevelTier`). Одно и то же зерно на
 * одном и том же уровне даёт РАЗНУЮ доску в v2 и v3, поэтому версия обязана
 * смениться: она уезжает в `saveSession` и по ней разбирают старые партии.
 */
export const DOTS_CONNECT_GENERATOR_VERSION = 'dots-connect-generator-v3';
export const LEVELS = 40;

/**
 * Языки собственного словаря модуля. Раньше было `'ru' | 'en'`, и человек с
 * интерфейсом на японском читал внутри партии английские подписи — ровно та
 * дыра, из-за которой заведён гейт `games-module-i18n`. Список совпадает с
 * `LANGUAGES` приложения.
 */
export type DotsLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

export interface Cell {
  row: number;
  col: number;
}

export interface DotsPair {
  id: string;
  color: string;
  symbol: string;
  endpoints: readonly [Cell, Cell];
}

export type DotsConstruction = 'hamiltonian-cycle' | 'serpentine-path' | 'shaken-hamiltonian-path';

export interface DotsPuzzle {
  id: string;
  seed: string;
  level: number;
  size: number;
  pairCount: number;
  /**
   * Нижняя граница длины пути пары в клетках. Третья ось сложности рядом с
   * размером и числом пар: пара из двух соседних точек соединяется одним
   * движением и подарком не является.
   */
  minPathLength: number;
  /**
   * 🔴 СТЕНЫ — КЛЕТКИ, КОТОРЫХ НА ДОСКЕ НЕТ. Заведены 06.09.2026: поле перестало
   * быть обязательно квадратным, и «занять всю сетку» означает «занять всё, что
   * не стена».
   *
   * ⚠️ ОНИ ВЫХОДЯТ ОДНИМ СВЯЗНЫМ КУСКОМ ПО ПОСТРОЕНИЮ, а не по проверке.
   * Генератор берёт под поле ПРЕФИКС встряхнутого гамильтонова пути, и остаток
   * этого же пути — тоже связная змейка. Замер на 8×8 и 9×9: кусок ровно один в
   * каждой из шести проверенных раздач. Разбросанные дырки читались бы как
   * поломка, а не как форма поля.
   */
  walls?: Cell[];
  difficulty: number;
  /**
   * СТУПЕНЬ РАССУЖДЕНИЯ, КОТОРУЮ ДОСКА РЕАЛЬНО ТРЕБУЕТ — замерена решателем на
   * этой самой доске, а не обещана таблицей уровней. Четвёртая ось сложности
   * рядом с размером, числом пар и длиной пути, и единственная, которая говорит
   * не про размер задачи, а про то, ЧТО НАДО СООБРАЗИТЬ. Список ступеней и сам
   * замер — в `core/solver.ts`.
   */
  tier: DotsTier;
  /**
   * Сколько рёбер у этой доски пришлось доказать от противного — ЗАМЕР, а не
   * назначение. Растущая ось верхней полосы: ступень выше «длинной цепи» не
   * идёт, а длина идёт. Лежит на раздаче, чтобы разбор партий и гейт читали
   * померенное число, а не считали его заново каждый своим способом.
   */
  chainLength: number;
  construction: DotsConstruction;
  generatorVersion: typeof DOTS_CONNECT_GENERATOR_VERSION;
  pairs: DotsPair[];
  /**
   * 🔴 РАЗДАЧА НЕСЁТ ПОЛНЫЕ ПУТИ ПАР, А НЕ ТОЛЬКО ИХ КОНЦЫ.
   *
   * ЧТО БЫЛО. Поле `solution` лежало этажом ниже — в `GeneratedDotsPuzzle`, а
   * наружу (в `getCurrentPuzzle`, в доску, в экран) уезжал `DotsPuzzle` БЕЗ
   * него. То есть генератор знал ответ в момент раздачи — он строит доску от
   * гамильтонова пути и режет его на пары, — а игра этого ответа не видела: она
   * получала два конца каждой пары и всё. Человек, который встал, мог только
   * бросить уровень и НЕ УЗНАТЬ, как было. У образца (SPAN, дуэли по
   * Numberlink) в тренировочном режиме ровно наоборот: «застряли? найдите
   * решение и изучите закономерность».
   *
   * ПОЧЕМУ ПОЛЕ ОБЯЗАТЕЛЬНОЕ, А НЕ `solution?`. Необязательное поле означало бы
   * «решение бывает, а бывает нет», и показ пришлось бы обвешивать проверками
   * на пустоту в трёх местах. Решение есть ВСЕГДА и по построению (см.
   * `buildPuzzle`), поэтому тип говорит то же самое.
   */
  solution: DotsSolution;
}

export type DotsPaths = Record<string, Cell[]>;
export type DotsSolution = DotsPaths;

/**
 * Раздача прямо из генератора. Отдельным именем оставлена ради читаемости
 * подписей (`generateDotsPuzzle` возвращает именно её), но отличий от
 * `DotsPuzzle` больше нет: решение теперь несёт сама раздача.
 */
export type GeneratedDotsPuzzle = DotsPuzzle;

export interface SolutionValidation {
  valid: boolean;
  complete: boolean;
  coveredCells: number;
  totalCells: number;
  issues: string[];
}

export interface DotsMetrics {
  accuracy: number;
  durationMs: number;
  difficulty: number;
  errors: number;
  score: number;
  seed: string;
  generatorVersion: typeof DOTS_CONNECT_GENERATOR_VERSION;
  /**
   * 🔴 РЕШЕНИЕ СМОТРЕЛИ — ПАРТИЯ НЕ В ЗАЧЁТ. Метка едет в метрике, а не остаётся
   * в состоянии экрана, ровно по той же причине, что и `details.level`: экран
   * читает результат ПОСЛЕ того, как модуль ушёл со сцены, и любое соседнее
   * состояние к этому моменту уже может быть переставлено. Порог прохождения
   * (`isPassed`) читает эту метку, поэтому «подсмотрел и обвёл» уровень не
   * поднимает и в общую бухгалтерию как пройденный не уходит.
   */
  solutionShown: boolean;
  details: {
    level: number;
  };
  specific: {
    gridSize: number;
    pairCount: number;
    forwardMoves: number;
    backtracks: number;
    undoCount: number;
    invalidMoves: number;
    optimalEdges: number;
    pathEfficiency: number;
    coverage: number;
  };
}

export interface DotsSessionConfig {
  seed: string;
  level: number;
}

export type DotsDrawingPhase = 'training' | 'playing';

export type DotsSessionPhase =
  | 'rules'
  | DotsDrawingPhase
  | 'training-complete'
  | 'paused'
  | 'result'
  | 'disposed';

export interface DotsSession {
  config: Required<DotsSessionConfig>;
  trainingPuzzle: GeneratedDotsPuzzle;
  puzzle: GeneratedDotsPuzzle;
  phase: DotsSessionPhase;
  pausedFrom: DotsDrawingPhase | null;
  paths: DotsPaths;
  activePairId: string | null;
  /**
   * ЛАТЧ: решение этой ЗАЧЁТНОЙ доски показывали хоть раз. Обратно не гаснет —
   * ни от «скрыть», ни от «Заново» (перезапуск даёт ТУ ЖЕ раскладку, зерно
   * фиксировано номером уровня, так что «подсмотрел → перезапустил → обвёл»
   * было бы бесплатным прохождением). Гаснет только вместе с самой доской:
   * новый заход с экрана уровня — новая сессия.
   */
  solutionShown: boolean;
  /** Показана ли подложка решения ПРЯМО СЕЙЧАС. Это переключатель показа. */
  solutionVisible: boolean;
  history: DotsPaths[];
  startedAt: number | null;
  pauseStartedAt: number | null;
  pausedMs: number;
  forwardMoves: number;
  backtracks: number;
  undoCount: number;
  invalidMoves: number;
  result: DotsMetrics | null;
}
