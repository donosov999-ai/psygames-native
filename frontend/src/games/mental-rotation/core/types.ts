/* psygames-mental-rotation-types · VER 2 · 17.09.2026 */
/**
 * ТИПЫ ЯДРА «МЕНТАЛЬНОЙ РОТАЦИИ» — ТРИ ВИДА ЗАДАНИЙ НА ОДНОЙ ГЕОМЕТРИИ.
 *
 * Экран умел ровно одно задание — классику Шепарда-Метцлера («какой из вариантов
 * законный поворот эталона, а не зеркало»). Сюда добавлены ещё два вида, и оба
 * считаются ИЗ ТЕХ ЖЕ координат кубиков, а не рисуются на глаз:
 *
 *   `rotation`   — классика: угол поворота известен, и только на ней считается
 *                  биомаркер `angle_response_slope` (наклон времени ответа по углу);
 *   `projection` — «как фигура выглядит сверху/спереди/справа»: правильный ответ
 *                  ВЫЧИСЛЯЕТСЯ как множество клеток, занятых кубиками вдоль оси взгляда;
 *   `net`        — «какой кубик сложится из этой выкройки»: своя модель сборки,
 *                  выкройка → грани куба, отвлекающие варианты — зеркало и
 *                  перестановка двух граней.
 *
 * ⚠️ ПОЧЕМУ ВИД ЗАДАНИЯ ЛЕЖИТ В ТИПЕ, А НЕ ВЫВОДИТСЯ ПО ФОРМЕ ДАННЫХ. Биомаркер
 * осмыслен ТОЛЬКО там, где угол определён. Смешать в одну регрессию время ответа
 * на проекцию (угла нет вовсе) — значит тихо испортить единственную настоящую
 * величину этой игры. Поэтому вид задания — явное поле, оно же уезжает в сессию.
 */

/** Языки приложения. Список ОДИН в один с `type Language` в LanguageContext. */
export type MentalRotationLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяются словари в тестах. */
export const MENTAL_ROTATION_LOCALES: readonly MentalRotationLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

/** Единичный кубик: целые координаты [x, y, z]. y — вертикаль экрана (см. изометрию). */
export type Cube = [number, number, number];

/** Фигура — набор кубиков. Порядок внутри набора значения не имеет. */
export type Shape = Cube[];

export type Axis = 'x' | 'y' | 'z';

/**
 * Вид задания. Пишется в сессию: по нему отбираются пробы для наклона RT по углу.
 *
 * ⚠️ ДОБАВЛЯЯ СЮДА СЛОВО, НЕ ТРОГАЙ ФИЛЬТР БИОМАРКЕРА. `slopeSamples` в
 * `session.ts` отбирает пробы БЕЛЫМ СПИСКОМ (`kind === 'rotation'`), поэтому новый
 * вид в регрессию не попадёт сам собой — но и снимать этот фильтр нельзя: у
 * ракурса, пары «да/нет», проекции и развёртки угла поворота нет вовсе, и одна
 * такая проба портит единственную настоящую величину игры.
 */
export type TaskKind = 'rotation' | 'projection' | 'net' | 'viewpoint' | 'same' | 'missing' | 'assembly' | 'formation' | 'section' | 'memory';

/**
 * Направление взгляда для проекции.
 *   `top`   — сверху, вдоль оси Y  → клетки (x, z);
 *   `front` — спереди, вдоль оси Z → клетки (x, y);
 *   `side`  — справа, вдоль оси X  → клетки (z, y).
 * Раскладка «строка/столбец» задана в `projectShape` и ОДНА И ТА ЖЕ для правильного
 * варианта и для отрисовки: иначе «правильный» ответ на экране был бы повёрнут.
 */
export type ProjectionView = 'top' | 'front' | 'side';

/** Клетка плоской сетки-ответа. row растёт ВНИЗ по экрану, col — вправо. */
export interface Cell2D { col: number; row: number }

/** Грань куба в собственной системе координат куба. */
export type CubeFace = 'up' | 'down' | 'front' | 'back' | 'right' | 'left';

/**
 * Значок на грани. Шесть форм, различимых по ОЧЕРТАНИЮ, а не по цвету: цвет —
 * вторичный признак (дальтонизм), и на грани куба он к тому же ложится на разную
 * заливку.
 *
 * ⚠️ ПОЧЕМУ НЕ «РОМБ». Ромб и квадрат на изометрической грани — оба
 * параллелограммы: скос превращает один в другой, и два варианта ответа
 * становятся неразличимы глазом. Вместо ромба взято КОЛЬЦО (тот же круг, но
 * пустой внутри) — при любом скосе оно остаётся кольцом.
 */
export type FaceMark = 'dot' | 'ring' | 'square' | 'triangle' | 'plus' | 'bar';

export const FACE_MARKS: readonly FaceMark[] = ['dot', 'ring', 'square', 'triangle', 'plus', 'bar'];

export const CUBE_FACES: readonly CubeFace[] = ['up', 'down', 'front', 'back', 'right', 'left'];

/** Раскраска куба: на каждой грани — свой значок. */
export type FaceMap = Record<CubeFace, FaceMark>;

/** Источник случайности. Своя функция → проба воспроизводима по семени. */
export type Rng = () => number;

// ─── задание на поворот (классика) ────────────────────────────────────────

/** Один шаг разбора: поворот на 90° вокруг оси. Кадры разбора строятся по этим шагам. */
export interface RotationStep { axis: Axis }

export type RotationFlaw = 'none' | 'mirror' | 'other';

export interface RotationOption {
  shape: Shape;
  isMatch: boolean;
  /** Чем именно вариант неверен — показывается в разборе после ответа. */
  flaw: RotationFlaw;
}

export interface RotationTask {
  kind: 'rotation';
  base: Shape;
  options: RotationOption[];
  correctIdx: number;
  /** Путь от эталона к правильному варианту, по 90° за шаг. Пустым не бывает. */
  steps: RotationStep[];
  /** Суммарный угол в градусах = 90 × число шагов. Ось абсциссы биомаркера. */
  angleSum: number;
}

// ─── задание на проекцию ──────────────────────────────────────────────────

export type ProjectionFlaw = 'none' | 'other-view' | 'edited-shape';

export interface ProjectionOption {
  cells: Cell2D[];
  isMatch: boolean;
  /**
   * Откуда взят неверный вариант. Обе подделки ПРАВДОПОДОБНЫ по построению:
   * это проекция той же фигуры вдоль другой оси либо проекция фигуры, у которой
   * переставлен один кубик, — а не случайный узор.
   */
  flaw: ProjectionFlaw;
}

export interface ProjectionTask {
  kind: 'projection';
  shape: Shape;
  view: ProjectionView;
  options: ProjectionOption[];
  correctIdx: number;
}

// ─── задание на развёртку ─────────────────────────────────────────────────

export interface NetCell { col: number; row: number }

export interface CubeNet {
  id: string;
  /** Ровно шесть клеток, связных по рёбрам. Складываемость проверяется `foldNet`. */
  cells: NetCell[];
}

export type NetFlaw = 'none' | 'mirror' | 'swap';

export interface NetOption {
  /** Куб в ракурсе показа: рисуются грани up/front/right. */
  faces: FaceMap;
  isMatch: boolean;
  flaw: NetFlaw;
}

export interface NetTask {
  kind: 'net';
  net: CubeNet;
  /** Значок на каждой клетке выкройки, ключ — `col,row`. */
  markOfCell: Record<string, FaceMark>;
  /** Куб, который РЕАЛЬНО складывается из выкройки. */
  cube: FaceMap;
  options: NetOption[];
  correctIdx: number;
}

// ─── задание на точку зрения ─────────────────────────────────────

/**
 * Вариант ракурса. Фигура во ВСЕХ вариантах одна и та же — отличается только угол,
 * с которого она нарисована. Поэтому вариант не носит фигуру: носить одно и то же
 * четыре раза — приглашение когда-нибудь подменить её в одном из вариантов.
 */
export interface ViewpointOption {
  /** Угол обхода в градусах вокруг `ViewpointTask.axis`. */
  degrees: number;
  isMatch: boolean;
}

export interface ViewpointTask {
  kind: 'viewpoint';
  /** Одна фигура на всё задание: и эталон, и все варианты — она же. */
  shape: Shape;
  /** Ось обхода. Сейчас всегда вертикаль экрана — обход кругом, как вокруг предмета. */
  axis: Axis;
  /** Угол правильного ракурса. Эталон показан под 0°, поэтому нулём не бывает. */
  degrees: number;
  options: ViewpointOption[];
  correctIdx: number;
}

// ─── задание «одинаковая фигура» ────────────────────────────────

/** Чем правая фигура отличается от левой, когда ответ «нет». Показывается в разборе. */
export type SameFlaw = 'none' | 'mirror' | 'one-cube';

/**
 * Кнопка ответа. Порядок ФИКСИРОВАН (сначала «да», потом «нет») и не перемешивается:
 * прыгающие кнопки меряют чтение подписи, а не мысленный поворот.
 */
export interface SameOption {
  answer: boolean;
  isMatch: boolean;
}

export interface SameTask {
  kind: 'same';
  left: Shape;
  right: Shape;
  /** Ответ задания. Считается `isValidRotation`, а не назначается генератором. */
  isSame: boolean;
  flaw: SameFlaw;
  options: SameOption[];
  correctIdx: number;
}

// ─── задания на куски: «недостающая часть» и «сборка» ─────────────

/**
 * Чем неверный кусок (или неверное целое) отличается от верного. Показывается в разборе.
 * `one-cube` — один кубик переставлен, `mirror` — зеркальная копия, `other` — другая фигура,
 * `other-view` — та же фигура, но повёрнутая (в «Трёх видах» её тени другие).
 */
export type PieceFlaw = 'none' | 'mirror' | 'one-cube' | 'other' | 'other-view';

export interface PieceOption {
  shape: Shape;
  isMatch: boolean;
  flaw: PieceFlaw;
}

/**
 * «Недостающая часть»: целая фигура, в которой кубики `hole` нарисованы пустыми.
 * Варианты — куски в случайных ориентациях; верный — ровно тот, что заполняет пустоту.
 */
export interface MissingTask {
  kind: 'missing';
  whole: Shape;
  /** Кубики недостающей части — в координатах `whole`, по ним рисуется пустота. */
  hole: Shape;
  options: PieceOption[];
  correctIdx: number;
}

/** «Сборка»: два куска, каждый в своей ориентации; варианты — целые фигуры. */
export interface AssemblyTask {
  kind: 'assembly';
  parts: [Shape, Shape];
  options: PieceOption[];
  correctIdx: number;
}

/**
 * «Три вида» (задача 0d96f48e, «Формирование»): виды сверху, спереди, справа → какая фигура
 * их даёт. Варианты НЕ повёрнуты: виды считаются в осях экрана.
 */
export interface FormationTask {
  kind: 'formation';
  views: { top: Cell2D[]; front: Cell2D[]; side: Cell2D[] };
  options: PieceOption[];
  correctIdx: number;
}

/**
 * «Срез» (задача 4f85b6a9, ортогональный вариант): в фигуре выделен один слой — как выглядит
 * этот срез с той стороны, что поперёк слоя. Варианты — сетки, как у «Проекции».
 * `whole` — проекция всей фигуры, `neighbour` — соседний слой, `mirror` / `turned` — зеркало и
 * четверть оборота среза, `one-cell` — одна клетка переставлена.
 */
export type SectionFlaw = 'none' | 'whole' | 'neighbour' | 'mirror' | 'turned' | 'one-cell';

export interface SectionOption {
  cells: Cell2D[];
  isMatch: boolean;
  flaw: SectionFlaw;
}

export interface SectionTask {
  kind: 'section';
  shape: Shape;
  view: ProjectionView;
  /** Координата слоя по оси вида (`SECTION_AXIS`). */
  layer: number;
  /** Кубики слоя — рисуются сплошными. */
  cubes: Shape;
  /** Остальные кубики фигуры — рисуются пунктиром. */
  rest: Shape;
  options: SectionOption[];
  correctIdx: number;
}

/**
 * «ПАМЯТЬ» (17.09.2026, задача 69f1810f): фигуру показали и спрятали, потом варианты —
 * ПОВЁРНУТЫЕ. Решение Дениса: «все упражнения на ментальное вращение используют память,
 * чтобы повернуть в уме, надо помнить». Поэтому это то же поворотное задание, у которого
 * эталон виден только `exposureMs`, а варианты появляются после.
 *
 * ⚠️ В НАКЛОН ВРЕМЕНИ ПО УГЛУ НЕ ИДЁТ. Время ответа здесь складывается из вспоминания и
 * поворота; `slopeSamples` берёт только `kind === 'rotation'`, и так должно остаться.
 */
export interface MemoryTask extends Omit<RotationTask, 'kind'> {
  kind: 'memory';
  /** Сколько миллисекунд эталон виден до того, как спрятать его. Ось лестницы режима. */
  exposureMs: number;
}

export type MentalRotationTask =
  | RotationTask
  | MemoryTask
  | ProjectionTask
  | NetTask
  | ViewpointTask
  | SameTask
  | MissingTask
  | AssemblyTask
  | FormationTask
  | SectionTask;
