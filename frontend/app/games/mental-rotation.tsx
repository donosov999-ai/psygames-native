/* psygames-game-mental-rotation · VER 2 · 23.08.2026 */
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
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import Svg, { Polygon, G, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { gameNow } from '@/src/services/gamePause';
import {
  angleResponseSlope,
  buildTask,
  getMentalRotationStrings,
  gridSize,
  interpolateMentalRotation,
  levelParams,
  meanSlopeRt,
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
  type Shape,
  type TaskKind,
  type TrialRecord,
} from '@/src/games/mental-rotation/core';

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

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const MR_RULES: LevelRule[] = [
  { key: 'axes2', fromLevel: 6, toLevel: 10 },   // lr_mental_rotation_axes2_*
  { key: 'axes3', fromLevel: 11 },   // lr_mental_rotation_axes3_*
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

function renderShape(shape: Shape, size: number, baseColor: string) {
  if (shape.length === 0) return null;
  const xs = shape.map(c => c[0]), ys = shape.map(c => c[1]), zs = shape.map(c => c[2]);
  const w = (Math.max(...xs) - Math.min(...xs) + 1);
  const h = (Math.max(...ys) - Math.min(...ys) + 1);
  const d = (Math.max(...zs) - Math.min(...zs) + 1);
  const span = Math.max(w + d, h + (w + d) * 0.3);
  const scale = size / (span * 1.4);
  const ox = size / 2 + d * scale * ISO_X_DX * 0.3;
  const oy = size / 2 + h * scale * 0.3;

  // sort cubes back-to-front (painter's algorithm).
  // Viewer near-corner is (max-x, max-y, max-z) → cube with HIGHER (x+y+z)
  // is closer and must be drawn LATER (on top). Sort ascending = far first.
  const sorted = [...shape].sort((a, b) => {
    const da = a[0] + a[1] + a[2];
    const db = b[0] + b[1] + b[2];
    return da - db;
  });

  // Color shading
  const colorTop = baseColor;
  const colorFront = shadeColor(baseColor, -0.24);
  const colorRight = shadeColor(baseColor, -0.44);
  const stroke = shadeColor(baseColor, -0.62);

  return (
    <Svg width={size} height={size}>
      <G>
        {sorted.map((cube, i) => {
          const p = cubeCorners(cube).map(c => project(c, scale, ox, oy));
          // Три видимые грани сходятся в ближнем углу (1,1,1) = corners[6]:
          // верх (y=max), перед (z=max — та, что СМОТРИТ на зрителя, не z=min),
          // право (x=max).
          const topPts   = FACE_FRAME.up.fill.map(k => `${p[k].sx},${p[k].sy}`).join(' ');
          const frontPts = FACE_FRAME.front.fill.map(k => `${p[k].sx},${p[k].sy}`).join(' ');
          const rightPts = FACE_FRAME.right.fill.map(k => `${p[k].sx},${p[k].sy}`).join(' ');
          return (
            <G key={i}>
              <Polygon points={frontPts} fill={colorFront} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
              <Polygon points={rightPts} fill={colorRight} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
              <Polygon points={topPts}   fill={colorTop}   stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

/**
 * Один кубик со значками на трёх видимых гранях — вариант ответа в пробе на
 * развёртку. Заливка граней светлее, чем у фигур: по ней читаются значки, а
 * объём держит обводка.
 */
function renderMarkedCube(faces: FaceMap, size: number, baseColor: string) {
  const scale = size / 2.5;
  const p = cubeCorners([0, 0, 0]).map(c => project(c, scale, size / 2, size / 2));
  const stroke = shadeColor(baseColor, -0.62);
  const shades: Record<keyof typeof FACE_FRAME, string> = {
    up: baseColor,
    front: shadeColor(baseColor, -0.12),
    right: shadeColor(baseColor, -0.24),
  };
  return (
    <Svg width={size} height={size}>
      <G>
        {(Object.keys(FACE_FRAME) as (keyof typeof FACE_FRAME)[]).map((face) => {
          const frame = FACE_FRAME[face];
          const mark = faces[face];
          return (
            <G key={face}>
              <Polygon
                points={frame.fill.map(k => `${p[k].sx},${p[k].sy}`).join(' ')}
                fill={shades[face]} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round"
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
  const { cols, rows } = netSize(net);
  const cell = (size * 0.9) / Math.max(cols, rows);
  const ox = (size - cols * cell) / 2;
  const oy = (size - rows * cell) / 2;
  return (
    <Svg width={size} height={size}>
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
              <Rect x={x} y={y} width={cell} height={cell} fill={faceFill} stroke={edge} strokeWidth={1.4} />
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
      </G>
    </Svg>
  );
}

function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent * 100);
  let R = (num >> 16) + amt;
  let G = ((num >> 8) & 0x00FF) + amt;
  let B = (num & 0x0000FF) + amt;
  R = Math.max(0, Math.min(255, R));
  G = Math.max(0, Math.min(255, G));
  B = Math.max(0, Math.min(255, B));
  return '#' + ((R << 16) | (G << 8) | B).toString(16).padStart(6, '0');
}

// ─── component ────────────────────────────────────────────────────────────

export default function MentalRotationGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const strings = getMentalRotationStrings(language as MentalRotationLocale);
  // Разбор поворота — это движение. Человеку, попросившему систему «меньше
  // движения», кадры показываются все сразу и без проезда: смысл сохранён,
  // мельтешения нет.
  const reduceMotion = useReducedMotion();

  const lvl = usePersistentLevel('mental_rotation');
  const { isPreset, autostart, num, isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame()); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [trials, setTrials] = useState(() => num('trials', 10));

  const [round, setRound] = useState(0);
  // План партии: какой пробе быть каким заданием. Считается один раз на старте —
  // иначе доля поворотных проб (на них держится биомаркер) плавала бы от броска
  // к броску и в короткой партии могла бы обнулиться.
  const planRef = useRef<TaskKind[]>([]);
  const [task, setTask] = useState<MentalRotationTask>(() => buildTask('rotation', 1, Math.random));
  const levelRef = useRef(1);
  // Единственный журнал партии: вид задания, угол, время, верно/нет. Из него
  // считаются и счётчики на экране, и наклон RT по углу — двух источников правды
  // тут быть не должно.
  const [records, setRecords] = useState<TrialRecord[]>([]);
  const [feedback, setFeedback] = useState<{ idx: number; ok: boolean } | null>(null);
  const [reviewStep, setReviewStep] = useState(0);
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
  const frames = useMemo(() => (task.kind === 'rotation' ? rotationReplay(task) : []), [task]);

  // Справка правил уровня (в пресете не всплываем — там свой поток)
  const levelRules = useLevelRules('mental_rotation', lvl.level, MR_RULES, phase === 'playing' && !isPreset);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
  }, []);

  // Прокрутка кадров разбора. Шаг крупный (850 мс): поворот надо успеть увидеть,
  // а не проводить глазами смазанное движение.
  useEffect(() => {
    if (!reviewing || frames.length < 2) return;
    if (reduceMotion) { setReviewStep(frames.length - 1); return; }
    const id = setInterval(() => {
      setReviewStep((s) => (s + 1 < frames.length ? s + 1 : s));
    }, 850);
    return () => clearInterval(id);
  }, [reviewing, frames, reduceMotion]);

  const startGame = () => {
    levelRef.current = lvl.level;
    setRecords([]); setRound(1);
    planRef.current = planTaskKinds(lvl.level, trials, Math.random);
    setTask(buildTask(planRef.current[0] ?? 'rotation', lvl.level, Math.random));
    setFeedback(null);
    setReviewStep(0);
    setPhase('playing');
    const start = gameNow();
    setStartTime(start);
    setTrialStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((gameNow() - start) / 1000), 100);
  };

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
      if (passed) lvl.reach(levelRef.current + 1);   // прошёл уровень → следующий
      setClearedPassed(passed);
      setPhase('cleared');   // непрерывный поток: провал → тот же уровень ещё раз, без тупика
    }
    try {
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
    setTask(buildTask(planRef.current[log.length] ?? 'rotation', levelRef.current, Math.random));
    setFeedback(null);
    setReviewStep(0);
    setTrialStartTime(gameNow());
  };

  const handlePick = (idx: number) => {
    if (feedback !== null) return;
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
    kind === 'rotation' ? strings.taskRotation : kind === 'projection' ? strings.taskProjection : strings.taskNet
  );
  const axisWord = (axis: Axis): string => (
    axis === 'x' ? strings.axisX : axis === 'y' ? strings.axisY : strings.axisZ
  );
  /** Подпись под вариантом после ответа: чем он хорош или плох. */
  const optionNote = (opt: { isMatch: boolean; flaw: string }): string => {
    if (!feedback) return '';
    if (opt.isMatch) return strings.optionCorrect;
    if (opt.flaw === 'mirror') return strings.optionMirror;
    if (opt.flaw === 'other') return strings.optionOther;
    if (opt.flaw === 'other-view') return strings.optionOtherView;
    if (opt.flaw === 'edited-shape') return strings.optionEditedShape;
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
      <LevelProgressMap bestLevel={lvl.best} gameId="mental_rotation" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>{t('level')} {lvl.level}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {(() => {
            const p = levelParams(lvl.level);
            const axesTxt = t(p.axes.length === 1 ? 'mrAxisZ' : p.axes.length === 2 ? 'mrAxisXY' : 'mrAxisXYZ');
            return `${p.minC}–${p.maxC} ${t('mrCubes')} · ${axesTxt}${p.compound ? ` · ${t('mrOblique')}` : ''}`;
          })()}
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
    const baseSize = 130;
    const optSize = 110;
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('mentalRotation')}
          onBack={() => goBackOrHome()}
          stats={
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: colors.text }]}>{t('round')} {round}/{trials}</Text>
              <Text style={[styles.statText, { color: OK_COLOR }]}>{t('hud_correct')} {hits}</Text>
              <Text style={[styles.statText, { color: BAD_COLOR }]}>{t('hud_errors')} {errors}</Text>
              <Text style={[styles.statText, { color: colors.text }]}>{t('time')} {elapsedTime.toFixed(1)}{t('secShort')}</Text>
              {!isPreset && <LevelRuleBadge lr={levelRules} color={colors.primary} ru={language === 'ru'} />}
            </View>
          }
          toolbar={
            <View style={styles.optionsRow}>
              {task.options.map((opt, i) => (
                <TouchableOpacity
                  accessibilityRole="button" key={i}
                  accessibilityLabel={interpolateMentalRotation(strings.a11yOption, { n: i + 1 })}
                  disabled={feedback !== null}
                  onPress={() => handlePick(i)}
                  style={[styles.optionBox, {
                    backgroundColor: colors.surface,
                    borderColor: optionBorder(i),
                    borderWidth: feedback ? 3 : 1,
                  }]}
                >
                  {task.kind === 'rotation' && renderShape((opt as { shape: Shape }).shape, optSize, GRADIENT[1])}
                  {task.kind === 'projection' && renderGrid((opt as { cells: Cell2D[] }).cells, optSize, GRADIENT[1], colors.border)}
                  {task.kind === 'net' && renderMarkedCube((opt as { faces: FaceMap }).faces, optSize, GRADIENT[1])}
                  <Text style={[styles.optionLabel2, { color: colors.textSecondary }]}>
                    {optionNote(opt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        >
          <View style={styles.fieldCol}>
            {/* Вид задания подписан в поле, а не в шапке: шапка — про счётчики,
                а смена задания посреди партии должна быть видна рядом с вопросом. */}
            <Text style={[styles.taskBadge, { color: colors.text, borderColor: colors.border }]}>
              {strings.taskLabel}: {kindWord(task.kind)}
            </Text>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              {task.kind === 'rotation'
                ? t('mentalRotationHint')
                : task.kind === 'projection'
                  ? interpolateMentalRotation(strings.projectionPrompt, {
                      view: task.view === 'top' ? strings.viewTop : task.view === 'front' ? strings.viewFront : strings.viewSide,
                    })
                  : strings.netPrompt}
            </Text>
            <View style={[styles.baseBox, { backgroundColor: colors.surface, borderColor: SHAPE_BASE }]}>
              {task.kind === 'net'
                ? renderNet(task.net, task.markOfCell, baseSize, '#F3F0FF', SHAPE_BASE)
                : renderShape(
                    task.kind === 'rotation'
                      ? (frames[reviewStep]?.shape ?? task.base)   // в разборе эталон сам поворачивается
                      : task.shape,
                    baseSize, SHAPE_BASE,
                  )}
              <Text style={[styles.baseLabel, { color: colors.textSecondary }]}>
                {task.kind === 'net' ? strings.taskNet : t('label_reference')}
              </Text>
            </View>
            {reviewing && (
              <View style={[styles.reviewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.reviewTitle, { color: colors.text }]}>{strings.reviewTitle}</Text>
                <Text style={[styles.reviewHint, { color: colors.textSecondary }]}>
                  {task.kind === 'rotation'
                    ? strings.reviewRotationHint
                    : task.kind === 'projection' ? strings.reviewProjectionHint : strings.reviewNetHint}
                </Text>
                {task.kind === 'rotation' && (
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
                {task.kind === 'rotation' && frames[reviewStep]?.axis && (
                  <Text style={[styles.reviewStepText, { color: colors.text }]}>
                    {interpolateMentalRotation(strings.reviewStep, {
                      n: reviewStep,
                      axis: axisWord(frames[reviewStep].axis as Axis),
                    })}
                  </Text>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => advance(records)}
                  style={[styles.nextBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{strings.reviewNext}</Text>
                </TouchableOpacity>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('mentalRotation')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="mental_rotation" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
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
  title: { fontSize: 20, fontWeight: '700' },
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
  optionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 },
  optionBox: { padding: 8, borderRadius: 12, alignItems: 'center', gap: 4, minWidth: 120 },
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
