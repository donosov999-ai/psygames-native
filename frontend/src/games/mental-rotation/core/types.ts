/* psygames-mental-rotation-types · VER 1 · 23.08.2026 */
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

/** Вид задания. Пишется в сессию: по нему отбираются пробы для наклона RT по углу. */
export type TaskKind = 'rotation' | 'projection' | 'net';

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

export type MentalRotationTask = RotationTask | ProjectionTask | NetTask;
