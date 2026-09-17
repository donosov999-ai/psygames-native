/* psygames-game-mental-rotation · VER 10 · 17.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.3 · psygames-codex-mac · not an app release */
/**
 * Mental Rotation — три вида пространственных заданий на одной геометрии
 *
 * Парадигма (Shepard & Metzler 1971): человек видит эталонную 3D-фигуру и
 * варианты — повёрнутые копии и зеркала. Выбрать ту, что является ВАЛИДНЫМ
 * ПОВОРОТОМ эталона. Это ядро игры, и оно осталось прежним.
 *
 * ЧТО ДОБАВЛЕНО (редакция 2, 23.08.2026) — ещё два вида заданий и разбор ответа:
 *
 *  1. ПРОЕКЦИЯ. «Как эта фигура выглядит сверху / спереди / справа?» Варианты —
 *     плоские сетки клеток. Правильная ВЫЧИСЛЯЕТСЯ из тех же координат кубиков
 *     (`projectShape`), неверные — проекция вдоль другой оси либо проекция
 *     фигуры с одним переставленным кубиком: то, что человек и правда путает.
 *  2. РАЗВЁРТКА. «Какой кубик сложится из этой выкройки?» Сборка считается
 *     катящимся по выкройке кубиком (`foldNet`), а не таблицей, выписанной
 *     руками. Подделки — зеркальная сборка и перестановка двух граней.
 *  3. РАЗБОР ОТВЕТА. После промаха эталон ПРОВОРАЧИВАЕТСЯ шаг за шагом к
 *     правильному варианту: видно, ПОЧЕМУ он правильный. Раньше человек видел
 *     только красную рамку и не узнавал ничего.
 *
 * 🔴 БИОМАРКЕР НЕ ИСПОРЧЕН СМЕСЬЮ ЗАДАНИЙ. Ключевая величина игры —
 * `angle_response_slope`, линейная регрессия RT по углу поворота (мс/градус).
 * Угол определён ТОЛЬКО у поворотных проб; сложи в ту же регрессию время ответа
 * на проекцию — и наклон станет шумом, который выглядит как измерение. Поэтому
 * вид задания пишется в КАЖДУЮ запись пробы, отбор точек живёт в ядре
 * (`slopeSamples`), а доля поворотных проб в партии не опускается ниже 60%.
 *
 * Реализация геометрии вынесена в `src/games/mental-rotation/core` — там же
 * лежат её доказательства (`src/__tests__/mental-rotation-tasks.test.ts`):
 * проекция сверяется с множеством проекций кубиков, сборка выкройки — с
 * настоящим кубом, зеркальный вариант — перебором всех 24 ориентаций.
 *
 * Difficulty (уровни):
 *  - L1-5:   4-5 кубиков, ось Z, 3 варианта; с L3 подмешивается проекция
 *  - L6-10:  5-6 кубиков, оси X+Y, 4 варианта; с L5 подмешивается развёртка
 *  - L11-15: 6-8 кубиков, оси X+Y+Z, с L13 составные (косые) ракурсы
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Polygon, G, Rect, Defs, LinearGradient as SvgGradient, Stop, Line } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import {useWarmup} from '@/src/contexts/WarmupContext';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useScreenSize } from '@/src/hooks/useScreenWidth';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import {ViewpointReference} from '@/src/components/ViewpointReference';
import {RotationShape,RotationTransition} from '@/src/components/RotationShape';
import {stillUnit} from '@/src/games/mental-rotation/core/surface';
import { isRTLLang } from '@/src/services/rtl';
import { LANDSCAPE_PROMPT_LINE, LANDSCAPE_REF_PADDING, optionLayout, LANDSCAPE_REVIEW_BUTTON, LANDSCAPE_REVIEW_NOTE_LINE, LANDSCAPE_REVIEW_NOTE_GAP, landscapeRowWidth, reviewSideWidth, LANDSCAPE_REVIEW_GAP } from '@/src/games/mental-rotation/optionLayout';
import RotationWorkbench from '@/src/components/RotationWorkbench';
import {spatialFrame} from '@/src/games/spatial-core/frame';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { clearGameTimer, gameNow, gameTimeout } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';
import {
  angleResponseSlope,
  buildTask,
  getMentalRotationStrings,
  gridSize,
  interpolateMentalRotation,
  levelSummary,
  meanSlopeRt,
  fitPolygon,
  netCellKey,
  netSize,
  planTaskKinds,
  rotationReplay,
  slopeSamples,
  taskKindCounts,
  type Axis,
  type Cell2D,
  type CubeNet,
  type FaceMap,
  type FaceMark,
  type MentalRotationLocale,
  type MentalRotationTask,
  type ObliqueOption,
  type Shape,
  type TaskKind,
  type TrialRecord,
} from '@/src/games/mental-rotation/core';
import { ObliquePolygonOption, ObliqueSectionReference } from '@/src/components/ObliqueSectionReference';

const GRADIENT = ['#5614b0', '#dbd65c'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 1.52 (норма AA 4.5), стало 4.54.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #f1efbe @0.36 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
// Цвет 3D-фигур: тёмно-фиолетовый GRADIENT[0] сливался с тёмной темой (образец не виден).
// Светлый насыщенный фиолет читается и на светлой, и на тёмной теме.
const SHAPE_BASE = '#9B6BFF';
const OK_COLOR = '#22c55e';
const BAD_COLOR = '#f43f5e';
const MR_BENEFITS = [
  { icon: 'cube-outline', textKey: 'benefitMr1' },
  { icon: 'sync-outline', textKey: 'benefitMr2' },
  { icon: 'eye-outline', textKey: 'benefitMr3' },
];

/**
 * Правила-по-уровням (аудит «молчаливых механик», v1.112.0), переписаны под лестницу
 * пространственного пакета 09.09.2026. Замер `ROTATION_LEVELS`: узор поворота ходит по
 * кругу каждые пять уровней (Z → Z·Z → X·Y → X·Y·Y с четырьмя вариантами → подделки
 * «один кубик»), а число кубиков растёт монотонно: 4 на L1–5, 5 на L6–10 … 13 на L46–50.
 * Правило «с уровня N» честно только для монотонной оси — поэтому одно правило, про кубики;
 * узор каждого уровня объясняет его собственная строка `change` в `ROTATION_LEVELS`.
 * Порог сторожит `level-rule-threshold` исполнением `levelParams(L).maxC`.
 */
export const MR_RULES: LevelRule[] = [
  { key: 'cubes', fromLevel: 6 },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';

// ─── isometric projection + SVG render ────────────────────────────────────

const ISO_X_DX = Math.cos(Math.PI / 6);   // ~0.866
const ISO_X_DY = Math.sin(Math.PI / 6);   // 0.5
const ISO_Z_DX = -Math.cos(Math.PI / 6);
const ISO_Z_DY = Math.sin(Math.PI / 6);

interface Pt { sx: number; sy: number }

function project([x, y, z]: [number, number, number], scale: number, ox: number, oy: number): Pt {
  const sx = ox + (x * ISO_X_DX + z * ISO_Z_DX) * scale;
  const sy = oy + (-y + x * ISO_X_DY + z * ISO_Z_DY) * scale * 1.0;
  return { sx, sy };
}

/** Восемь углов кубика с началом в (x,y,z). Порядок важен: по нему собраны грани. */
function cubeCorners([x, y, z]: [number, number, number]): [number, number, number][] {
  return [
    [x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z],
    [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1],
  ];
}

/**
 * Видимые грани кубика и рамка для значка на каждой.
 *
 * `fill` — четыре угла грани в порядке обхода; `a/b/d` — угол-начало и два
 * направления, по которым значок кладётся на грань (`a` — левый верхний,
 * `b` — «вправо» вдоль грани, `d` — «вниз» по экрану). Без этой рамки значок
 * пришлось бы рисовать в экранных координатах, и на скошенной грани он поехал бы
 * мимо неё.
 */
const FACE_FRAME = {
  up:    { fill: [3, 2, 6, 7], a: 7, b: 3, d: 6 },
  front: { fill: [4, 5, 6, 7], a: 7, b: 6, d: 4 },
  right: { fill: [1, 5, 6, 2], a: 6, b: 2, d: 5 },
} as const;

/**
 * Значки на гранях — очертанием, а не цветом (дальтонизм + разная заливка
 * граней). Координаты в долях грани: (0,0) — левый верх, (1,1) — правый низ.
 */
const MARK_SHAPES: Record<FaceMark, { points: [number, number][]; hollow?: boolean }> = {
  dot: { points: ringPoints(0.3) },
  ring: { points: ringPoints(0.32), hollow: true },
  square: { points: [[0.26, 0.26], [0.74, 0.26], [0.74, 0.74], [0.26, 0.74]] },
  triangle: { points: [[0.5, 0.2], [0.8, 0.76], [0.2, 0.76]] },
  plus: { points: [[0.42, 0.2], [0.58, 0.2], [0.58, 0.42], [0.8, 0.42], [0.8, 0.58], [0.58, 0.58], [0.58, 0.8], [0.42, 0.8], [0.42, 0.58], [0.2, 0.58], [0.2, 0.42], [0.42, 0.42]] },
  bar: { points: [[0.16, 0.43], [0.84, 0.43], [0.84, 0.57], [0.16, 0.57]] },
};

function ringPoints(r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
  }
  return pts;
}

/** Цвет значка. Вторичный признак: форма различает и без него. */
const MARK_COLORS: Record<FaceMark, string> = {
  dot: '#1f2937',
  ring: '#b91c1c',
  square: '#1d4ed8',
  triangle: '#15803d',
  plus: '#7c2d12',
  bar: '#6b21a8',
};

/** Значок, положенный на грань: точки в долях грани → экранные координаты. */
function markPolygon(mark: FaceMark, a: Pt, b: Pt, d: Pt): string {
  return MARK_SHAPES[mark].points
    .map(([u, v]) => {
      const sx = a.sx + u * (b.sx - a.sx) + v * (d.sx - a.sx);
      const sy = a.sy + u * (b.sy - a.sy) + v * (d.sy - a.sy);
      return `${sx},${sy}`;
    })
    .join(' ');
}

function renderShape(shape: Shape, size: number, _baseColor: string, axis?: Axis, degrees?: number, unit?: number) {
  return <RotationShape shape={shape} size={size} axis={axis} degrees={degrees} unit={unit}/>;
}

/**
 * Один кубик со значками на трёх видимых гранях — вариант ответа в пробе на
 * развёртку. Заливка граней светлее, чем у фигур: по ней читаются значки, а
 * объём держит обводка.
 */
function renderMarkedCube(faces: FaceMap, size: number, _baseColor: string) {
  const artId=`marked-${size}-${faces.up}-${faces.front}-${faces.right}`;
  const scale = size / 2.5;
  const p = cubeCorners([0, 0, 0]).map(c => project(c, scale, size / 2, size / 2));
  return (
    <Svg width={size} height={size}>
      <Defs>{(Object.keys(FACE_FRAME) as (keyof typeof FACE_FRAME)[]).map(face=><SvgGradient key={face} id={`${artId}-${face}`} x1="0%" y1="0%" x2="80%" y2="100%"><Stop offset="0%" stopColor="#fffaff"/><Stop offset="100%" stopColor={face==='up'?'#e5daf5':face==='front'?'#d2bfe9':'#bca2d8'}/></SvgGradient>)}</Defs>
      <G>
        {(Object.keys(FACE_FRAME) as (keyof typeof FACE_FRAME)[]).map((face) => {
          const frame = FACE_FRAME[face];
          const mark = faces[face];
          return (
            <G key={face}>
              <Polygon
                points={frame.fill.map(k => `${p[k].sx},${p[k].sy}`).join(' ')}
                fill={`url(#${artId}-${face})`} stroke="#6d5587" strokeWidth={1.2} strokeLinejoin="round"
              />
              <Polygon
                points={markPolygon(mark, p[frame.a], p[frame.b], p[frame.d])}
                fill={MARK_SHAPES[mark].hollow ? 'none' : MARK_COLORS[mark]}
                stroke={MARK_COLORS[mark]}
                strokeWidth={MARK_SHAPES[mark].hollow ? 2.4 : 0.8}
                strokeLinejoin="round"
              />
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

/**
 * Плоская сетка — вариант ответа в пробе на проекцию. Рисуется ВЕСЬ габарит:
 * пустые клетки показаны рамкой, иначе «дырка» внутри фигуры была бы неотличима
 * от края и два разных ответа выглядели бы одинаково.
 */
function renderGrid(cells: Cell2D[], size: number, fill: string, edge: string) {
  const { cols, rows } = gridSize(cells);
  const cell = (size * 0.86) / Math.max(cols, rows, 2);
  const ox = (size - cols * cell) / 2;
  const oy = (size - rows * cell) / 2;
  const filled = new Set(cells.map(c => `${c.col},${c.row}`));
  const all: Cell2D[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) all.push({ col, row });
  return (
    <Svg width={size} height={size}>
      <G>
        {all.map((c) => (
          <Rect
            key={`${c.col},${c.row}`}
            x={ox + c.col * cell} y={oy + c.row * cell}
            width={cell} height={cell}
            fill={filled.has(`${c.col},${c.row}`) ? fill : 'none'}
            stroke={edge} strokeWidth={1.2}
          />
        ))}
      </G>
    </Svg>
  );
}

/** Выкройка: шесть помеченных квадратов на листе. */
function renderNet(net: CubeNet, markOfCell: Record<string, FaceMark>, size: number, faceFill: string, edge: string) {
  const paperId=`net-paper-${net.id}-${size}`;
  const occupied=new Set(net.cells.map(netCellKey));
  const { cols, rows } = netSize(net);
  const cell = (size * 0.9) / Math.max(cols, rows);
  const ox = (size - cols * cell) / 2;
  const oy = (size - rows * cell) / 2;
  return (
    <Svg testID="mental-cube-net" width={size} height={size}>
      <Defs><SvgGradient id={paperId} x1="0%" y1="0%" x2="65%" y2="100%"><Stop offset="0%" stopColor="#ffffff"/><Stop offset="55%" stopColor={faceFill}/><Stop offset="100%" stopColor="#ded0ee"/></SvgGradient></Defs>
      <G>
        {net.cells.map((c) => {
          const key = netCellKey(c);
          const mark = markOfCell[key];
          const x = ox + c.col * cell;
          const y = oy + c.row * cell;
          const a: Pt = { sx: x, sy: y };
          const b: Pt = { sx: x + cell, sy: y };
          const d: Pt = { sx: x, sy: y + cell };
          return (
            <G key={key}>
              <Rect x={x} y={y+1.5} width={cell} height={cell} fill="#665077" opacity={.14}/>
              <Rect x={x} y={y} width={cell} height={cell} fill={`url(#${paperId})`} stroke={edge} strokeWidth={1.2} />
              <Polygon
                points={markPolygon(mark, a, b, d)}
                fill={MARK_SHAPES[mark].hollow ? 'none' : MARK_COLORS[mark]}
                stroke={MARK_COLORS[mark]}
                strokeWidth={MARK_SHAPES[mark].hollow ? 2.4 : 0.8}
                strokeLinejoin="round"
              />
            </G>
          );
        })}
        {net.cells.flatMap(c=>{
          const x=ox+c.col*cell,y=oy+c.row*cell;
          return [occupied.has(`${c.col+1},${c.row}`)?<Line key={`${c.col},${c.row}-r`} x1={x+cell} y1={y} x2={x+cell} y2={y+cell} stroke="#795b96" strokeWidth={1.4} strokeDasharray="3 3"/>:null,
            occupied.has(`${c.col},${c.row+1}`)?<Line key={`${c.col},${c.row}-d`} x1={x} y1={y+cell} x2={x+cell} y2={y+cell} stroke="#795b96" strokeWidth={1.4} strokeDasharray="3 3"/>:null];
        })}
      </G>
    </Svg>
  );
}


// ─── component ────────────────────────────────────────────────────────────

export default function MentalRotationGame() {
  const { colors } = useTheme();
  /*
   * ⚠️ НЕ `useWindowDimensions` (правка при переносе 09.09.2026). На первом кадре
   * он отдаёт 0, а по высоте здесь считается компактность вёрстки: `0 < 560`
   * истинно, и экран рисуется компактным ещё до того, как узнал свой размер.
   * `useScreenSize` — общая защита проекта, её же требует гейт `screen-width-guard`.
   */
  const { h: viewportHeight, w: viewportWidth } = useScreenSize();
  const [answerWidth,setAnswerWidth]=useState(208);
  /**
   * Сколько строк занял вопрос задания — живым замером. В альбоме высота поделена между эталоном
   * и вариантами с запасом на ДВЕ строки вопроса; замер 17.09.2026 по 12 языкам: из 156 вопросов
   * три строки даже в ширину 600 у трёх — «Срез» на хинди. Лишняя строка отнимается у эталона.
   * Высота вопроса от размеров рисунков не зависит, поэтому замер не зацикливается.
   */
  const [promptLines,setPromptLines]=useState(2);
  /**
   * «Память» (задача 69f1810f): эталон спрятан. Пока `false`, эталон виден, а вариантов нет —
   * отвечать не на что. Прячет его игровой таймер (`gameTimeout`): на паузе и в окне отзыва
   * время показа не идёт, иначе человек вернулся бы к уже спрятанной фигуре.
   */
  const [memoryHidden,setMemoryHidden]=useState(false);
  const { t, language } = useLanguage();
  const strings = getMentalRotationStrings(language as MentalRotationLocale);
  // Разбор поворота — это движение. Человеку, попросившему систему «меньше
  // движения», кадры показываются все сразу и без проезда: смысл сохранён,
  // мельтешения нет.
  /*
   * 🔴 СИСТЕМНАЯ НАСТРОЙКА «МЕНЬШЕ ДВИЖЕНИЯ» СЮДА НЕ ДОТЯГИВАЕТСЯ — И ЭТО ПРАВИЛО,
   * А НЕ НЕДОСМОТР. Здесь поворот фигуры это САМО УПРАЖНЕНИЕ и объяснение ошибки:
   * без него разбор замирает на той самой картинке, из-за которой человек ошибся.
   *
   * ЧТО БЫЛО. Экран читал `useReducedMotion()` и передавал значение в
   * `RotationTransition` и `RotationWorkbench`. У обоих внутри есть честная ветка
   * «показать мгновенно», и на устройстве с включённой настройкой разбор переставал
   * вращаться вовсе — ровно жалоба Дениса 16.09.2026 «вращение не работает после
   * ошибки» и отчёт тестировщика 11.09 «просто слайдшоу из картинок стало».
   *
   * ⚠️ ПОЧЕМУ ЭТОГО НЕ ВИДЕЛ ГЕЙТ. `reduced-motion.test.ts` уже вносил
   * `RotationShape.tsx` и `RotationWorkbench.tsx` в исключения и прямо писал:
   * «экран может форсировать мгновенный показ пропом, но системная настройка сюда
   * не дотягивается». Гейт проверяет файлы, которые АНИМИРУЮТ, — а экран не
   * анимирует, он только передаёт чужое значение. Слепое пятно ровно в один проп.
   *
   * Проп у обоих остался: он для случая «покажи сразу», который когда-нибудь
   * понадобится осознанно. Системная настройка в него больше не течёт.
   */

  const lvl = usePersistentLevel('mental_rotation');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  const selectedLevel = Math.min(50, lvl.level);
  const warmup = useWarmup();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [trials, setTrials] = useState(() => num('trials', 10));

  const [round, setRound] = useState(0);
  // План партии: какой пробе быть каким заданием. Считается один раз на старте —
  // иначе доля поворотных проб (на них держится биомаркер) плавала бы от броска
  // к броску и в короткой партии могла бы обнулиться.
  const planRef = useRef<TaskKind[]>([]);
  const [task, setTask] = useState<MentalRotationTask>(() => buildTask('rotation', 1, Math.random));
  const levelRef = useRef(1);
  const [playedLevel,setPlayedLevel]=useState(1);
  // Единственный журнал партии: вид задания, угол, время, верно/нет. Из него
  // считаются и счётчики на экране, и наклон RT по углу — двух источников правды
  // тут быть не должно.
  const [records, setRecords] = useState<TrialRecord[]>([]);
  const [feedback, setFeedback] = useState<{ idx: number; ok: boolean } | null>(null);
  const [animatedStep, setReviewStep] = useState(0);
  const [manualReview,setManualReview] = useState(false);
  const [clearedPassed, setClearedPassed] = useState(true);
  const [startTime, setStartTime] = useState(0);
  const [trialStartTime, setTrialStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hits = records.filter(r => r.correct).length;
  const errors = records.length - hits;
  // Разбор показывается после ПРОМАХА: верный ответ объяснять нечего, а лишняя
  // задержка на верном ответе ломает темп партии и портит замер времени.
  const reviewing = feedback !== null && !feedback.ok;
  const frames = useMemo(() => (task.kind === 'rotation' || task.kind === 'memory' ? rotationReplay(task) : []), [task]);
  // «Память»: эталон виден, варианты ещё не показаны — время ответа не идёт, нажимать нечего.
  const studying = phase === 'playing' && task.kind === 'memory' && !memoryHidden && feedback === null;
  useEffect(() => {
    if (!studying || task.kind !== 'memory') return undefined;
    const таймер = gameTimeout(() => {
      setMemoryHidden(true);
      // Время ответа считается с появления вариантов, а не с показа фигуры.
      setTrialStartTime(gameNow());
    }, task.exposureMs);
    return () => clearGameTimer(таймер);
  }, [studying, task]);
  const reviewStep=animatedStep;   // разбор всегда идёт кадрами: поворот и есть объяснение ошибки

  // Справка правил уровня (в пресете не всплываем — там свой поток)
  const levelRules = useLevelRules('mental_rotation', selectedLevel, MR_RULES, phase === 'playing' && !isPreset);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
  }, []);

  // Прокрутка кадров разбора. Шаг крупный (850 мс): поворот надо успеть увидеть,
  // а не проводить глазами смазанное движение.
  useEffect(() => {
    if (!reviewing || manualReview || frames.length < 2) return;
    /*
     * 🔴 ВРАЩЕНИЕ В РАЗБОРЕ — ЭТО ОБЪЯСНЕНИЕ, А НЕ УКРАШЕНИЕ (возврат 09.09.2026).
     * При «меньше движения» я поставил `return` — и разбор замирал на ПЕРВОМ кадре:
     * человек, ошибившийся с поворотом, видел ту же картинку, из-за которой ошибся.
     * Было (и снова есть): без анимации показываем СРАЗУ КОНЕЧНЫЙ кадр — ответ виден,
     * движения нет. Крутить вручную кнопкой можно в обоих режимах.
     */
    /*
     * 🔴 РАЗБОР КРУТИТСЯ ВСЕГДА, БЕЗ ОГЛЯДКИ НА «МЕНЬШЕ ДВИЖЕНИЯ» (09.09.2026).
     * Я подчинил его этой настройке ради гейта — и разбор замирал, показывая ровно ту
     * картинку, из-за которой человек ошибся. Поворот здесь — объяснение, а не украшение.
     */
    const id = setInterval(() => {
      setReviewStep((s) => (s + 1 < frames.length ? s + 1 : s));
    }, 850);
    return () => clearInterval(id);
  }, [reviewing, frames, manualReview]);

  const startGame = () => {
    levelRef.current = selectedLevel;
    setPlayedLevel(selectedLevel);setManualReview(false);
    setRecords([]); setRound(1);
    planRef.current = planTaskKinds(selectedLevel, trials, Math.random);
    setTask(buildTask(planRef.current[0] ?? 'rotation', selectedLevel, Math.random));
    setMemoryHidden(false);
    setFeedback(null);
    setReviewStep(0);
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    setTrialStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
  };
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  const finishGame = async (log: TrialRecord[]) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (gameNow() - startTime) / 1000;
    setElapsedTime(finalTime);
    const newHits = log.filter(r => r.correct).length;
    const newErrors = log.length - newHits;
    // Наклон и среднее время — по ОДНОЙ И ТОЙ ЖЕ выборке: верные поворотные
    // пробы с известным углом. Проекция и развёртка в неё не попадают.
    const slope = Number(angleResponseSlope(log).toFixed(2));
    const passed = newHits / trials >= 0.7;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — экран статистики, уровень не трогаем
    } else {
      if (passed) lvl.reach(Math.min(50,levelRef.current + 1));
      else lvl.fail();   // гистерезис понижения (−1 после трёх провалов подряд) — канон каркаса, гейт passed-coverage
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток: провал → тот же уровень ещё раз, без тупика
    }
    try {
      if (isPreset && warmup.active && warmup.localSpatial) {
        if (warmup.currentStep?.game_id === 'mental_rotation') {
          await warmup.recordResult({game_type:'mental_rotation',score:0,time_seconds:finalTime,errors:newErrors,
            details:{level:levelRef.current,hits:newHits,trials,localSpatialLab:true}});
          warmup.advanceToNext(warmup.currentIdx);
        }
        return;
      }
      await saveSession({
        passed,
        game_type: 'mental_rotation',
        score: Math.max(0, newHits * 100 - newErrors * 30 - Math.floor(finalTime)),
        time_seconds: finalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}-3D`,
        errors: newErrors,
        details: {
          level: levelRef.current,
          hits: newHits,
          errors: newErrors,
          trials,
          mean_rt: meanSlopeRt(log),
          angle_response_slope: slope,
          // На скольких пробах посчитан наклон и из чего вообще состояла партия —
          // без этого нельзя отличить «наклон 0, потому что человек ровный» от
          // «наклон 0, потому что точек было меньше двух».
          slope_trials: slopeSamples(log).length,
          task_kinds: taskKindCounts(log),
          version: '3D',
        },
      });
    } catch (e) { console.error(e); }
  };

  const advance = (log: TrialRecord[]) => {
    if (advanceRef.current) { clearTimeout(advanceRef.current); advanceRef.current = null; }
    if (log.length >= trials) { void finishGame(log); return; }
    setRound(log.length + 1);
    setManualReview(false);
    setTask(buildTask(planRef.current[log.length] ?? 'rotation', levelRef.current, Math.random));
    setMemoryHidden(false);
    setFeedback(null);
    setReviewStep(0);
    setTrialStartTime(gameNow());
  };

  const handlePick = (idx: number) => {
    if (feedback !== null || studying) return;
    const ok = idx === task.correctIdx;
    const rt = gameNow() - trialStartTime;
    // Угол есть только у поворотной пробы. У проекции и развёртки он равен нулю,
    // и отбор в ядре такие записи в регрессию не берёт.
    const record: TrialRecord = {
      kind: task.kind,
      angle: task.kind === 'rotation' ? task.angleSum : 0,
      rt,
      correct: ok,
    };
    const log = [...records, record];
    setRecords(log);
    setFeedback({ idx, ok });
    setReviewStep(0);
    // Верно — короткая пауза и дальше. Промах — разбор, и закрывает его человек
    // кнопкой: чтение поворота торопить нельзя.
    if (ok) advanceRef.current = setTimeout(() => advance(log), 700);
  };

  const kindWord = (kind: TaskKind): string => (
    kind === 'rotation' ? strings.taskRotation
      : kind === 'projection' ? strings.taskProjection
      : kind === 'viewpoint' ? strings.taskViewpoint
      : kind === 'same' ? strings.taskSame
      : kind === 'missing' ? strings.taskMissing
      : kind === 'assembly' ? strings.taskAssembly
      : kind === 'formation' ? strings.taskFormation
      : kind === 'section' ? strings.taskSection
      : kind === 'memory' ? strings.taskMemory
      : kind === 'oblique' ? strings.taskOblique
      : strings.taskNet
  );
  /** Секунды показа для подписи «Память»: 4,5 — с запятой там, где так пишут дроби. */
  const секунды = (ms: number): string => {
    const с = ms / 1000;
    const текст = Number.isInteger(с) ? String(с) : с.toFixed(1);
    return ['ru', 'es', 'de', 'pt', 'fr', 'it'].includes(language) ? текст.replace('.', ',') : текст;
  };
  const axisWord = (axis: Axis): string => (
    axis === 'x' ? strings.axisX : axis === 'y' ? strings.axisY : strings.axisZ
  );
  /** Подпись под вариантом после ответа: чем он хорош или плох. */
  const optionNote = (opt: { isMatch: boolean; flaw?: string }): string => {
    if (!feedback) return '';
    if (opt.isMatch) return strings.optionCorrect;
    if (opt.flaw === 'mirror') return strings.optionMirror;
    // «Сечение»: «другая» — это другая плоскость, а не другая фигура.
    if (opt.flaw === 'other' && task.kind === 'oblique') return strings.optionOtherPlane;
    if (opt.flaw === 'seen') return strings.optionSeenAtAngle;
    if (opt.flaw === 'shadow') return strings.optionShadow;
    if (opt.flaw === 'other') return strings.optionOther;
    if (opt.flaw === 'other-view') return strings.optionOtherView;
    if (opt.flaw === 'edited-shape' || opt.flaw === 'one-cube' || opt.flaw === 'one-cell') return strings.optionEditedShape;
    if (opt.flaw === 'whole') return strings.optionWholeFigure;
    if (opt.flaw === 'neighbour') return strings.optionNeighbourLayer;
    if (opt.flaw === 'turned') return strings.optionTurned;
    if (opt.flaw === 'swap') return strings.optionSwap;
    return '';
  };
  const optionBorder = (i: number): string => {
    if (!feedback) return colors.border;
    if (i === task.correctIdx) return OK_COLOR;      // правильный подсвечивается ВСЕГДА
    return feedback.idx === i ? BAD_COLOR : colors.border;
  };

  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="cube" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('mentalRotation')}</Text>
        <Text style={styles.configDesc}>{t('mentalRotationDesc')}</Text>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>3D · Shepard-Metzler</Text>
        </View>
      </GradientSurface>
      <GameAbout descriptionKey="mentalRotationIntroDesc" benefits={MR_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap maxLevel={50} bestLevel={Math.min(50,lvl.best)} gameId="mental_rotation" currentLevel={selectedLevel} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>{t('level')} {selectedLevel}/50</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {levelSummary(selectedLevel, strings)}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>{strings.kindsSummary}</Text>
        {lvl.level > 1 && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[5, 10, 15].map((n) => (
            <TouchableOpacity
              accessibilityRole="button" key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
      <View style={[styles.configSticky, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        accessibilityRole="button" style={styles.startBtn} onPress={startGame}>
        <GradientSurface colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </GradientSurface>
      </TouchableOpacity>
      </View>
    </View>
  );

  // игровая фаза — на едином каркасе GameShell: варианты-ответы прибиты к низу,
  // эталон в центре поля; модалка правил поверх каркаса (паттерн digit-span)
  if (phase === 'playing') {
    const compactScreen=viewportHeight<560;
    const compactReview=reviewing&&(isPreset||viewportHeight<720);
    // Measure the actual answer slot: split panels/zoom can make it much
    // narrower than the window. Never let minWidth force a one-column tower.
    // Размер вариантов — от той стороны экрана, которой не хватает (отчёт c8903296): см. optionLayout.
    // В альбоме оттуда же и размер эталона: эталон и варианты делят одну высоту (срез эталона 34 px на 844×390 в 2.54.15).
    const { optSize, oneRow: wideShort, refSize, reviewNoteLines = 0 } = optionLayout({ viewportWidth, viewportHeight, answerWidth, count: task.options.length, compactReview, refCap: isPreset ? 80 : 104, promptLines });
    // Альбом, разбор: подпись и «Следующий раунд» колонкой справа от ряда — полоса не растёт поверх эталона,
    // а ряд не сдвигается с центра (задача 5de33bb4, см. LANDSCAPE_REVIEW_SIDE).
    const reviewSide = reviewing && wideShort;
    const ширинаКолонки = reviewSide ? reviewSideWidth(viewportWidth, task.options.length, optSize) : 0;
    // Кнопка отзыва висит слева, а в RTL-языках справа — колонка встаёт с другой стороны ряда.
    // left/right на вебе не зеркалятся сами (src/services/rtl.ts), поэтому сторона выбирается здесь.
    const колонкаСлева = isRTLLang(language);
    const отступКолонки = landscapeRowWidth(task.options.length, optSize) / 2 + LANDSCAPE_REVIEW_GAP;
    const baseSize = refSize ?? (compactScreen?(isPreset?80:104):130);
    /*
     * Доли для эталона из нескольких рисунков. В портрете их держит ширина: три вида и два куска
     * встают в ряд, отсюда 0,62 и 0,8. В альбоме ширины с избытком, а высоту уже поделили с
     * вариантами — и такие эталоны недобирали её: замер 740×360 и 667×375 — у «Трёх видов»
     * оставалось 15 px, у «Сборки» 26–27, у «Одинаковы?» 41. Строка подписей видов (16 px)
     * встаёт на место подписи «эталон» (17 px), поэтому в альбоме хватает полной доли.
     */
    const viewShare = refSize !== undefined ? 1 : 0.62;
    const partShare = refSize !== undefined ? 1 : 0.8;
    /*
     * Неподвижные варианты рисуются по контуру и ОДНИМ масштабом на все варианты задания:
     * по описанной сфере рисунок занимал 53–84 % своего квадрата (запас под поворот, которого
     * у варианта нет), а свой масштаб у каждого выдавал бы пару «фигура + зеркало» одинаковым
     * габаритом.
     */
    const optUnit = task.kind === 'rotation' || task.kind === 'memory' || task.kind === 'missing' || task.kind === 'assembly' || task.kind === 'formation'
      ? stillUnit(task.options.map((o) => (o as { shape: Shape }).shape), optSize)
      : undefined;
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          frame={isPreset?spatialFrame(viewportHeight):undefined}
          headerActions={isPreset?<Text numberOfLines={2} style={{fontSize:12,textAlign:'center',color:colors.text}}>{strings.taskLabel}: {kindWord(task.kind)}</Text>:undefined}
          title={t('mentalRotation')}
          onBack={() => goBackOrHome()}
          scrollableField
          stats={
            <View style={[styles.statsRow,compactScreen?{gap:6}:null]}>
              <Text style={[styles.statText, { color: colors.text }]}>{t('round')} {round}/{trials}</Text>
              <Text style={[styles.statText, { color: OK_COLOR }]}>{t('hud_correct')} {hits}</Text>
              <Text style={[styles.statText, { color: BAD_COLOR }]}>{t('hud_errors')} {errors}</Text>
              <Text style={[styles.statText, { color: colors.text }]}>{t('time')} {elapsedTime.toFixed(1)}{t('secShort')}</Text>
              {!isPreset && !compactScreen && <LevelRuleBadge lr={levelRules} color={colors.primary} ru={language === 'ru'} />}
            </View>
          }
          toolbar={
            <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
            <View style={[styles.optionsRow,compactReview&&!wideShort?{flexWrap:'nowrap',gap:6}:null,wideShort?{flexWrap:'nowrap',maxWidth:760}:null]} onLayout={e=>setAnswerWidth(e.nativeEvent.layout.width)}>
              {task.options.map((opt, i) => (
                <TouchableOpacity
                  accessibilityRole="button" key={i}
                  accessibilityLabel={interpolateMentalRotation(strings.a11yOption, { n: i + 1 })}
                  disabled={feedback !== null || studying}
                  onPress={() => handlePick(i)}
                  style={[styles.optionBox, {
                    ...(compactReview?{width:(answerWidth-(task.options.length-1)*6)/task.options.length}:{}),
                    // В альбоме рамка ответа (3 вместо 1) съедает поля, а не высоту полосы: карточка снаружи того же размера.
                    ...(wideShort?{width:optSize+12,padding:feedback?4:6}:{}),
                    backgroundColor: colors.surface,
                    borderColor: optionBorder(i),
                    borderWidth: feedback ? 3 : 1,
                  }]}
                >
                  {/*
                    «Память»: пока эталон виден, в карточке пустое место РАЗМЕРОМ С РИСУНОК. Без него пустая
                    карточка схлопывалась в полоску (живой кадр 17.09.2026, 390×844), а после скрытия
                    вырастала — ряд прыгал ровно в тот момент, когда человек переводит взгляд на варианты.
                  */}
                  {task.kind === 'memory' && studying && <View testID="memory-option-blank" style={{ width: optSize, height: optSize }} />}
                  {(task.kind === 'rotation' || (task.kind === 'memory' && !studying)) && renderShape((opt as { shape: Shape }).shape, optSize, GRADIENT[1], undefined, undefined, optUnit)}
                  {(task.kind === 'projection' || task.kind === 'section') && renderGrid((opt as { cells: Cell2D[] }).cells, optSize, GRADIENT[1], colors.border)}
                  {task.kind === 'net' && renderMarkedCube((opt as { faces: FaceMap }).faces, optSize, GRADIENT[1])}
                  {task.kind === 'oblique' && <ObliquePolygonOption points={fitPolygon((opt as ObliqueOption).points, optSize, 8)} size={optSize} fill={GRADIENT[1]} />}
                  {task.kind === 'viewpoint' && renderShape(task.shape, optSize, GRADIENT[1], task.axis, (opt as { degrees: number }).degrees)}
                  {(task.kind === 'missing' || task.kind === 'assembly' || task.kind === 'formation') && renderShape((opt as { shape: Shape }).shape, optSize, GRADIENT[1], undefined, undefined, optUnit)}
                  {task.kind === 'same' && <Text style={{fontSize:Math.max(16,Math.min(26,optSize/3)),fontWeight:'700',color:colors.text}}>
                    {(opt as { answer: boolean }).answer ? strings.answerYes : strings.answerNo}
                  </Text>}
                  {/*
                    🔴 ПОДПИСЬ ПОД ВАРИАНТОМ ОБРЕЗАЛАСЬ (замер 17.09.2026, экспорт-сборка). Все подписи
                    разбора, 108 строк на 12 языках, подставлены в живой элемент: на 390×844 в одну
                    строку не влезали 18 (7 языков: «вид с другой стороны», «Ansicht von einer anderen
                    Seite»…), а в сжатом разборе на 375×667 — 86 из 108, от «друг…» до «верн…».
                    Поэтому в обычном разборе подпись в две строки, а в сжатом её под карточкой нет:
                    там одна строка под рядом — чем плох выбранный вариант (красная рамка и так видна).
                  */}
                  {feedback&&!compactReview&&!wideShort&&<Text numberOfLines={2} style={[styles.optionLabel2, { color: colors.textSecondary }]}>
                    {optionNote(opt)}
                  </Text>}
                </TouchableOpacity>
              ))}
            </View>
            {reviewSide && feedback ? (
              <View testID="mental-review-side" style={[{ position: 'absolute', top: 0, bottom: 0, width: ширинаКолонки, gap: LANDSCAPE_REVIEW_NOTE_GAP, justifyContent: 'center' },
                колонкаСлева ? { right: '50%', marginRight: отступКолонки } : { left: '50%', marginLeft: отступКолонки }]}>
                {reviewNoteLines > 0 && (
                  <Text testID="mental-picked-note" numberOfLines={reviewNoteLines} style={[styles.optionLabel2, { color: BAD_COLOR, fontSize: 13, lineHeight: LANDSCAPE_REVIEW_NOTE_LINE, minHeight: 0 }]}>
                    {optionNote(task.options[feedback.idx])}
                  </Text>
                )}
                <TouchableOpacity
                  testID="mental-review-next"
                  accessibilityRole="button"
                  onPress={() => advance(records)}
                  style={[styles.nextBtn, { minHeight: LANDSCAPE_REVIEW_BUTTON, paddingVertical: 4, paddingHorizontal: 12, alignItems: 'center', backgroundColor: GRADIENT[0], borderColor: GRADIENT[0] }]}
                >
                  <Text numberOfLines={2} style={{ color: '#FFF', fontWeight: '700', fontSize: 14, lineHeight: 17, textAlign: 'center' }}>
                    {round < trials ? strings.reviewNextRound : strings.reviewFinishLevel}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (<>
            {reviewing && compactReview && feedback ? (
              <Text testID="mental-picked-note" numberOfLines={2} style={[styles.optionLabel2, { color: BAD_COLOR, fontSize: 13 }]}>
                {optionNote(task.options[feedback.idx])}
              </Text>
            ) : null}
            {reviewing && (
              <TouchableOpacity
                testID="mental-review-next"
                accessibilityRole="button"
                onPress={() => advance(records)}
                style={[styles.nextBtn, { width: '100%', maxWidth: 480, minHeight: 48, alignItems: 'center', backgroundColor: GRADIENT[0], borderColor: GRADIENT[0] }]}
              >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
                  {round < trials ? strings.reviewNextRound : strings.reviewFinishLevel}
                </Text>
              </TouchableOpacity>
            )}
            </>)}
            </View>
          }
        >
          <View style={[styles.fieldCol,compactScreen?{gap:6}:null]}>
            {/* Вид задания подписан в поле, а не в шапке: шапка — про счётчики,
                а смена задания посреди партии должна быть видна рядом с вопросом. */}
            {!compactScreen&&!isPreset&&<Text style={[styles.taskBadge, { color: colors.text, borderColor: colors.border }]}>
              {strings.taskLabel}: {kindWord(task.kind)}
            </Text>}
            <Text style={[styles.hintText, { color: colors.textSecondary }, refSize !== undefined ? { maxWidth: 600, lineHeight: LANDSCAPE_PROMPT_LINE } : null]}
              onLayout={refSize !== undefined ? (e) => setPromptLines(Math.max(1, Math.round(e.nativeEvent.layout.height / LANDSCAPE_PROMPT_LINE))) : undefined}>
              {task.kind === 'rotation'
                ? (compactScreen ? strings.hintCompact : t('mentalRotationHint'))
                : task.kind === 'memory'
                  ? (studying ? interpolateMentalRotation(strings.memoryStudyPrompt, { s: секунды(task.exposureMs) }) : strings.memoryPrompt)
                : task.kind === 'projection'
                  ? interpolateMentalRotation(strings.projectionPrompt, {
                      view: task.view === 'top' ? strings.viewTop : task.view === 'front' ? strings.viewFront : strings.viewSide,
                    })
                  : task.kind === 'viewpoint' ? strings.viewpointPrompt
                  : task.kind === 'same' ? strings.samePrompt
                  : task.kind === 'missing' ? strings.missingPrompt
                  : task.kind === 'assembly' ? strings.assemblyPrompt
                  : task.kind === 'formation' ? strings.formationPrompt
                  : task.kind === 'oblique' ? strings.obliquePrompt
                  : task.kind === 'section'
                  ? interpolateMentalRotation(strings.sectionPrompt, {
                      view: task.view === 'top' ? strings.viewTop : task.view === 'front' ? strings.viewFront : strings.viewSide,
                    })
                  : strings.netPrompt}
            </Text>
            <View testID="mental-reference" style={[styles.baseBox, { backgroundColor: colors.surface, borderColor: SHAPE_BASE }, refSize !== undefined ? { padding: LANDSCAPE_REF_PADDING } : null]}>
              {task.kind === 'net'
                ? renderNet(task.net, task.markOfCell, baseSize, '#F3F0FF', SHAPE_BASE)
                : (task.kind==='rotation'||task.kind==='memory')&&reviewing&&manualReview
                  ? <RotationWorkbench key={round} initial={frames[reviewStep]?.shape??task.base} target={task.options[task.correctIdx].shape} size={baseSize} reduceMotion={false} ink={colors.text} accent={colors.primary} ru={language==='ru'}/>
                  : (task.kind==='rotation'||task.kind==='memory')&&reviewing&&reviewStep>0
                  ? <RotationTransition key={`${round}-${reviewStep}`} from={frames[reviewStep-1].shape} to={frames[reviewStep].shape} axis={frames[reviewStep].axis!} size={baseSize}/>
                  : task.kind === 'oblique'
                  // «Сечение»: рёбра тела и закрашенная косая плоскость, как в учебнике стереометрии.
                  ? <View testID="oblique-reference"><ObliqueSectionReference dims={task.dims} section={task.section} size={baseSize}/></View>
                  : task.kind === 'memory'
                  // «Память»: фигура видна при показе и в разборе; спрятанной её нет в разметке вовсе —
                  // не прозрачность, а пустая карточка со знаком вопроса.
                  ? (studying || reviewing
                    ? <View testID="memory-figure"><RotationShape shape={reviewing ? (frames[reviewStep]?.shape ?? task.base) : task.base} size={baseSize}/></View>
                    : <View testID="memory-hidden" style={{width:baseSize,height:baseSize,alignItems:'center',justifyContent:'center'}}>
                        <Text style={{fontSize:Math.round(baseSize*0.4),fontWeight:'800',color:colors.textSecondary}}>?</Text>
                      </View>)
                  : task.kind === 'viewpoint'
                  ? <ViewpointReference shape={task.shape} degrees={task.degrees} size={baseSize} accent={colors.primary}/>
                  : task.kind === 'missing'
                  ? <View testID="missing-whole"><RotationShape shape={task.whole} ghost={task.hole} size={baseSize}/></View>
                  : task.kind === 'section'
                  // Срез: кубики слоя сплошные, остальная фигура пунктиром — слой виден внутри фигуры.
                  ? <View testID="section-layer"><RotationShape shape={task.shape} ghost={task.rest} size={baseSize}/></View>
                  : task.kind === 'formation'
                  ? <View testID="formation-views" style={{flexDirection:'row',alignItems:'flex-start',justifyContent:'center',gap:10}}>
                      {([['top', strings.viewTop], ['front', strings.viewFront], ['side', strings.viewSide]] as const).map(([view, label]) => (
                        <View key={view} style={{alignItems:'center',gap:2}}>
                          {renderGrid(task.views[view], baseSize*viewShare, GRADIENT[1], colors.border)}
                          <Text style={{fontSize:12,color:colors.textSecondary}}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  : task.kind === 'assembly'
                  ? <View testID="assembly-parts" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}>
                      <RotationShape shape={task.parts[0]} size={baseSize*partShare}/>
                      <Text style={{fontSize:20,fontWeight:'700',color:colors.textSecondary}}>+</Text>
                      <RotationShape shape={task.parts[1]} size={baseSize*partShare}/>
                    </View>
                  : task.kind === 'same'
                  ? <View testID="same-pair" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}>
                      <RotationShape shape={task.left} size={baseSize*partShare}/>
                      <Text style={{fontSize:20,fontWeight:'700',color:colors.textSecondary}}>?</Text>
                      <RotationShape shape={task.right} size={baseSize*partShare}/>
                    </View>
                  : <RotationShape shape={
                    task.kind === 'rotation'
                      ? (frames[reviewStep]?.shape ?? task.base)   // в разборе эталон сам поворачивается
                      : task.shape} size={baseSize}/>}
              <Text style={[styles.baseLabel, { color: colors.textSecondary }]}>
                {task.kind === 'net' ? strings.taskNet : task.kind === 'assembly' || task.kind === 'formation' || task.kind === 'oblique' ? '' : t('label_reference')}
              </Text>
            </View>
            {reviewing&&(task.kind==='rotation'||task.kind==='memory')&&!manualReview?<TouchableOpacity testID="rotation-manual-start" accessibilityRole="button" onPress={()=>setManualReview(true)} style={{minHeight:48,justifyContent:'center',paddingHorizontal:16}}><Text style={{color:colors.primary,fontWeight:'700'}}>{strings.rotateManually}</Text></TouchableOpacity>:null}
            {reviewing && (
              <View style={[styles.reviewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.reviewTitle, { color: colors.text }]}>{strings.reviewTitle}</Text>
                <Text style={[styles.reviewHint, { color: colors.textSecondary }]}>
                  {task.kind === 'rotation'
                    ? strings.reviewRotationHint
                    : task.kind === 'projection' ? strings.reviewProjectionHint
                    : task.kind === 'viewpoint' ? strings.reviewViewpointHint
                    : task.kind === 'same' ? strings.reviewSameHint
                    : task.kind === 'missing' ? strings.reviewMissingHint
                    : task.kind === 'assembly' ? strings.reviewAssemblyHint
                    : task.kind === 'formation' ? strings.reviewFormationHint
                    : task.kind === 'section' ? strings.reviewSectionHint
                    : task.kind === 'memory' ? strings.reviewMemoryHint
                    : task.kind === 'oblique' ? strings.reviewObliqueHint
                    : strings.reviewNetHint}
                </Text>
                {(task.kind === 'rotation' || task.kind === 'memory') && (
                  <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    style={styles.frameScroll} contentContainerStyle={styles.frameRow}
                  >
                    {frames.map((f, i) => (
                      <View
                        key={i}
                        style={[styles.frameBox, {
                          borderColor: i === reviewStep ? OK_COLOR : colors.border,
                          opacity: i <= reviewStep ? 1 : 0.3,
                        }]}
                      >
                        {renderShape(f.shape, 42, SHAPE_BASE)}
                      </View>
                    ))}
                  </ScrollView>
                )}
                {(task.kind === 'rotation' || task.kind === 'memory') && frames[reviewStep]?.axis && (
                  <Text style={[styles.reviewStepText, { color: colors.text }]}>
                    {interpolateMentalRotation(strings.reviewStep, {
                      n: reviewStep,
                      axis: axisWord(frames[reviewStep].axis as Axis),
                    })}
                  </Text>
                )}
              </View>
            )}
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('mentalRotation')}</Text>
        {/* Отступ под угловые кнопки (справка, питомец): на 360 px заголовок уходил под них на 45 px — веб-гейт pan-audit. */}
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="mental_rotation" level={playedLevel} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 30 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', flex: 1, minWidth: 0, textAlign: 'center' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  // Прибитый низ настроек: кнопка «начать» всегда на экране, над системной навигацией.
  // Раньше она была последней в прокрутке — на невысоком экране до неё приходилось
  // доскроллить, а решение «во что играю» оказывалось в двух разных местах.
  // Отступ слева — под плавающую кнопку отзыва, она висит поверх и накрывала бы её.
  configSticky: { paddingTop: 10, paddingHorizontal: 16, paddingLeft: 68, borderTopWidth: StyleSheet.hairlineWidth },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  versionBadge: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  versionText: { color: ON_GRAD.color, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'column', gap: 8 },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  fieldCol: { alignItems: 'center', gap: 12 },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  taskBadge: { fontSize: 12, fontWeight: '800', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  baseBox: { padding: 12, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
  baseLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  optionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', width:'100%', maxWidth: 480 },
  optionBox: { padding: 6, borderRadius: 12, alignItems: 'center', gap: 4, width:'47%', minWidth:0 },
  optionLabel2: { fontSize: 11, fontWeight: '600', minHeight: 14, textAlign: 'center' },
  // Разбор ответа: живёт в поле, а не в нижней полосе — низ в этой игре занят
  // ответом игрока, и служебному действию там не место (см. slot-meaning).
  reviewBox: { padding: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 6, maxWidth: 360 },
  reviewTitle: { fontSize: 13, fontWeight: '800' },
  reviewHint: { fontSize: 12, textAlign: 'center' },
  frameScroll: { maxHeight: 62 },
  frameRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 2 },
  frameBox: { borderWidth: 2, borderRadius: 8, padding: 2 },
  reviewStepText: { fontSize: 12, fontWeight: '700' },
  nextBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
});
