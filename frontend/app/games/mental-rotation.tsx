/**
 * Mental Rotation — 3D Shepard-Metzler version (Round 7 upgrade)
 *
 * Парадигма (Shepard & Metzler 1971): субъект видит эталонную 3D-фигуру и
 * варианты — повёрнутые версии и зеркальные копии. Выбрать ту что является
 * ВАЛИДНЫМ ПОВОРОТОМ эталона (не зеркалом, не другой фигурой).
 *
 * Ключевой биомаркер: `angle_response_slope` — линейная регрессия RT по углу
 * поворота. Чем меньше slope (мс/градус), тем быстрее ментальная ротация.
 * Тренируется → slope падает → измеримый прогресс.
 *
 * Implementation:
 *  - Фигуры из unit-cubes (4-8 кубиков) с координатами (x,y,z)
 *  - 3D-поворот через композицию 90°-rotations вокруг X/Y/Z
 *  - Различение валидной ротации vs зеркала через все 24 ориентации
 *  - Изометрическая проекция в SVG (3 видимые грани каждого куба с разной заливкой)
 *
 * Difficulty:
 *  - easy:   4 cubes, 1 ось поворота (Z only), углы 90°
 *  - medium: 5-6 cubes, 2 оси поворота (X+Y), углы 90°
 *  - hard:   7-8 cubes, 3 оси (X+Y+Z), углы 90° + случайная композиция
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import Svg, { Polygon, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#5614b0', '#dbd65c'];
const MR_BENEFITS = [
  { icon: 'cube-outline', textKey: 'benefitMr1' },
  { icon: 'sync-outline', textKey: 'benefitMr2' },
  { icon: 'eye-outline', textKey: 'benefitMr3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type Cube = [number, number, number];   // [x, y, z]
type Shape = Cube[];

// ─── 3D math ──────────────────────────────────────────────────────────────

function rotateX([x, y, z]: Cube): Cube { return [x, -z, y]; }
function rotateY([x, y, z]: Cube): Cube { return [z, y, -x]; }
function rotateZ([x, y, z]: Cube): Cube { return [-y, x, z]; }

function applyRotation(shape: Shape, axis: 'x' | 'y' | 'z', times: number): Shape {
  const fn = axis === 'x' ? rotateX : axis === 'y' ? rotateY : rotateZ;
  let r = shape;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) r = r.map(fn);
  return r;
}

function normalize(shape: Shape): Shape {
  if (shape.length === 0) return shape;
  const minX = Math.min(...shape.map(c => c[0]));
  const minY = Math.min(...shape.map(c => c[1]));
  const minZ = Math.min(...shape.map(c => c[2]));
  return shape.map(([x, y, z]) => [x - minX, y - minY, z - minZ] as Cube);
}

function shapeKey(shape: Shape): string {
  return shape.map(c => c.join(',')).sort().join('|');
}

// True if `b` is a valid 3D rotation (not mirror) of `a`
function isValidRotation(a: Shape, b: Shape): boolean {
  const targetKey = shapeKey(normalize(a));
  for (let rx = 0; rx < 4; rx++) {
    for (let ry = 0; ry < 4; ry++) {
      for (let rz = 0; rz < 4; rz++) {
        let cand = b;
        for (let i = 0; i < rx; i++) cand = cand.map(rotateX);
        for (let i = 0; i < ry; i++) cand = cand.map(rotateY);
        for (let i = 0; i < rz; i++) cand = cand.map(rotateZ);
        if (shapeKey(normalize(cand)) === targetKey) return true;
      }
    }
  }
  return false;
}

function mirror(shape: Shape): Shape {
  return shape.map(([x, y, z]) => [-x, y, z] as Cube);
}

// Base Shepard-Metzler-like shapes (4-8 cubes each)
const SHAPES_LIB: Shape[] = [
  // L (4)
  [[0,0,0],[1,0,0],[2,0,0],[2,1,0]],
  // T (5)
  [[0,0,0],[1,0,0],[2,0,0],[1,1,0],[1,2,0]],
  // Z (4)
  [[0,0,0],[1,0,0],[1,1,0],[2,1,0]],
  // Step (5)
  [[0,0,0],[1,0,0],[1,1,0],[2,1,0],[2,2,0]],
  // 3D step into Z (5)
  [[0,0,0],[1,0,0],[1,0,1],[1,1,1],[2,1,1]],
  // U (5)
  [[0,0,0],[0,1,0],[0,2,0],[1,2,0],[2,2,0]],
  // Plus on Z (6)
  [[1,0,0],[0,1,0],[1,1,0],[2,1,0],[1,2,0],[1,1,1]],
  // Snake 3D (6)
  [[0,0,0],[1,0,0],[1,1,0],[1,1,1],[2,1,1],[2,2,1]],
  // Branch (6)
  [[0,0,0],[1,0,0],[2,0,0],[2,1,0],[2,1,1],[2,2,1]],
  // Big L (5)
  [[0,0,0],[1,0,0],[2,0,0],[3,0,0],[3,1,0]],
  // Stair 3D (7)
  [[0,0,0],[1,0,0],[1,1,0],[2,1,0],[2,1,1],[3,1,1],[3,2,1]],
  // Cross 3D (7)
  [[1,0,0],[1,1,0],[1,2,0],[0,1,0],[2,1,0],[1,1,1],[1,1,2]],
];

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const CUBES_BY_DIFF: Record<Difficulty, [number, number]> = {
  easy:   [4, 5],
  medium: [5, 6],
  hard:   [6, 8],
};
const AXES_BY_DIFF: Record<Difficulty, ('x' | 'y' | 'z')[]> = {
  easy:   ['z'],
  medium: ['x', 'y'],
  hard:   ['x', 'y', 'z'],
};

interface TrialOption { shape: Shape; isMatch: boolean; rotationLabel: string; angleSum: number; }

function makeTrial(diff: Difficulty): { base: Shape; options: TrialOption[]; correctIdx: number } {
  // Pick base shape with appropriate cube count
  const [minC, maxC] = CUBES_BY_DIFF[diff];
  const candidates = SHAPES_LIB.filter(s => s.length >= minC && s.length <= maxC);
  const base = rndItem(candidates);
  const axes = AXES_BY_DIFF[diff];
  const optionCount = diff === 'easy' ? 3 : 4;

  // Generate the CORRECT option: random rotation around allowed axes.
  // For HARD: also chain extra rotations producing effective 45°/135° equivalents
  // (composition of 90° steps across multiple axes simulates oblique rotations,
  // forcing more difficult mental rotation — Shepard-Metzler classic).
  const buildRandomRotation = (): { shape: Shape; label: string; angleSum: number } => {
    let rot = base;
    let angleSum = 0;
    const labels: string[] = [];
    for (const axis of axes) {
      const k = 1 + Math.floor(Math.random() * 3);  // 90/180/270 (skip 0)
      for (let i = 0; i < k; i++) rot = rot.map(axis === 'x' ? rotateX : axis === 'y' ? rotateY : rotateZ);
      angleSum += k * 90;
      labels.push(`${axis.toUpperCase()}${k * 90}°`);
    }
    // HARD: add extra cross-axis rotation for compound transforms (~45°/135° effective)
    if (diff === 'hard' && Math.random() < 0.65) {
      const extraAxis = (['x','y','z'] as const)[Math.floor(Math.random() * 3)];
      const k = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < k; i++) {
        rot = rot.map(extraAxis === 'x' ? rotateX : extraAxis === 'y' ? rotateY : rotateZ);
      }
      angleSum += k * 90;
      labels.push(`${extraAxis.toUpperCase()}${k * 90}°⊕`);
    }
    return { shape: normalize(rot), label: labels.join(' '), angleSum };
  };

  const correct = buildRandomRotation();
  const opts: TrialOption[] = [
    { shape: correct.shape, isMatch: true, rotationLabel: correct.label, angleSum: correct.angleSum },
  ];

  // Generate distractors: mirror or another shape (rotated)
  let attempts = 0;
  while (opts.length < optionCount && attempts < 50) {
    attempts++;
    const useMirror = Math.random() < 0.55;
    if (useMirror) {
      // mirrored base, then rotated
      let cand = mirror(base);
      const k = 1 + Math.floor(Math.random() * 3);
      for (const axis of axes) {
        for (let i = 0; i < k; i++) cand = cand.map(axis === 'x' ? rotateX : axis === 'y' ? rotateY : rotateZ);
      }
      cand = normalize(cand);
      // make sure it's NOT actually a valid rotation of base (some shapes are achiral)
      if (isValidRotation(base, cand)) continue;
      // also avoid duplicates among options
      if (opts.some(o => shapeKey(o.shape) === shapeKey(cand))) continue;
      opts.push({ shape: cand, isMatch: false, rotationLabel: 'mirror', angleSum: 0 });
    } else {
      // different shape, rotated
      const other = rndItem(candidates.filter(s => s !== base));
      let cand = other;
      const k = 1 + Math.floor(Math.random() * 3);
      for (const axis of axes) {
        for (let i = 0; i < k; i++) cand = cand.map(axis === 'x' ? rotateX : axis === 'y' ? rotateY : rotateZ);
      }
      cand = normalize(cand);
      if (isValidRotation(base, cand)) continue;  // unlikely but possible if shapes overlap
      if (opts.some(o => shapeKey(o.shape) === shapeKey(cand))) continue;
      opts.push({ shape: cand, isMatch: false, rotationLabel: 'other', angleSum: 0 });
    }
  }

  // Shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const correctIdx = opts.findIndex(o => o.isMatch);
  return { base, options: opts, correctIdx };
}

// ─── isometric projection + SVG render ────────────────────────────────────

const ISO_X_DX = Math.cos(Math.PI / 6);   // ~0.866
const ISO_X_DY = Math.sin(Math.PI / 6);   // 0.5
const ISO_Z_DX = -Math.cos(Math.PI / 6);
const ISO_Z_DY = Math.sin(Math.PI / 6);

function project([x, y, z]: Cube, scale: number, ox: number, oy: number) {
  const sx = ox + (x * ISO_X_DX + z * ISO_Z_DX) * scale;
  const sy = oy + (-y + x * ISO_X_DY + z * ISO_Z_DY) * scale * 1.0;
  return { sx, sy };
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
  const colorFront = shadeColor(baseColor, -0.18);
  const colorRight = shadeColor(baseColor, -0.35);
  const stroke = shadeColor(baseColor, -0.55);

  return (
    <Svg width={size} height={size}>
      <G>
        {sorted.map((cube, i) => {
          const corners: Cube[] = [
            [cube[0],   cube[1],   cube[2]],
            [cube[0]+1, cube[1],   cube[2]],
            [cube[0]+1, cube[1]+1, cube[2]],
            [cube[0],   cube[1]+1, cube[2]],
            [cube[0],   cube[1],   cube[2]+1],
            [cube[0]+1, cube[1],   cube[2]+1],
            [cube[0]+1, cube[1]+1, cube[2]+1],
            [cube[0],   cube[1]+1, cube[2]+1],
          ];
          const p = corners.map(c => project(c, scale, ox, oy));
          // Three visible faces share the near corner (1,1,1) = corners[6].
          // Each visible face = z=max OR y=max OR x=max.
          // Top face (y=max): corners 3,2,6,7
          const topPts  = [p[3], p[2], p[6], p[7]].map(q => `${q.sx},${q.sy}`).join(' ');
          // Front face (z=max, the face FACING the viewer): corners 4,5,6,7
          // (NOT z=min — that's the back face, invisible).
          const frontPts= [p[4], p[5], p[6], p[7]].map(q => `${q.sx},${q.sy}`).join(' ');
          // Right face (x=max): corners 1,5,6,2
          const rightPts= [p[1], p[5], p[6], p[2]].map(q => `${q.sx},${q.sy}`).join(' ');
          return (
            <G key={i}>
              <Polygon points={frontPts} fill={colorFront} stroke={stroke} strokeWidth={1} />
              <Polygon points={rightPts} fill={colorRight} stroke={stroke} strokeWidth={1} />
              <Polygon points={topPts}   fill={colorTop}   stroke={stroke} strokeWidth={1} />
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

  const gate = useLevelGate('mental_rotation');
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'easy') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 10));

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState(() => makeTrial('easy'));
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<{ idx: number; ok: boolean } | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [trialStartTime, setTrialStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [angleRtPairs, setAngleRtPairs] = useState<{ angle: number; rt: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1);
    setAngleRtPairs([]);
    setTrial(makeTrial(difficulty));
    setFeedback(null);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    setTrialStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const computeSlope = (pairs: { angle: number; rt: number }[]): number => {
    if (pairs.length < 2) return 0;
    const n = pairs.length;
    const sumX = pairs.reduce((s, p) => s + p.angle, 0);
    const sumY = pairs.reduce((s, p) => s + p.rt, 0);
    const sumXY = pairs.reduce((s, p) => s + p.angle * p.rt, 0);
    const sumXX = pairs.reduce((s, p) => s + p.angle * p.angle, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  };

  const handlePick = async (idx: number) => {
    if (feedback !== null) return;
    const ok = idx === trial.correctIdx;
    const rt = Date.now() - trialStartTime;
    const correctAngle = trial.options[trial.correctIdx]?.angleSum || 90;
    setFeedback({ idx, ok });
    if (ok) {
      setHits(h => h + 1);
      setAngleRtPairs(arr => [...arr, { angle: correctAngle, rt }]);
    } else setErrors(e => e + 1);

    setTimeout(async () => {
      if (round >= trials) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        setPhase('result');
        const newHits = hits + (ok ? 1 : 0);
        const newErrors = errors + (ok ? 0 : 1);
        const finalPairs = ok ? [...angleRtPairs, { angle: correctAngle, rt }] : angleRtPairs;
        const slope = Number(computeSlope(finalPairs).toFixed(2));
        const meanRt = finalPairs.length ? Math.round(finalPairs.reduce((s, p) => s + p.rt, 0) / finalPairs.length) : 0;
        try {
          await saveSession({
            game_type: 'mental_rotation',
            score: Math.max(0, newHits * 100 - newErrors * 30 - Math.floor(finalTime)),
            time_seconds: finalTime,
            difficulty,
            mode: `${trials}t-3D`,
            errors: newErrors,
            details: {
              hits: newHits,
              errors: newErrors,
              trials,
              mean_rt: meanRt,
              angle_response_slope: slope,
              version: '3D',
            },
          });
        } catch (e) { console.error(e); }
      } else {
        setRound(r => r + 1);
        setTrial(makeTrial(difficulty));
        setFeedback(null);
        setTrialStartTime(Date.now());
      }
    }, 700);
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="cube" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('mentalRotation')}</Text>
        <Text style={styles.configDesc}>{t('mentalRotationDesc')}</Text>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>3D · Shepard-Metzler</Text>
        </View>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => {
            const cfg = CUBES_BY_DIFF[d];
            const axesN = AXES_BY_DIFF[d].length;
            const locked = gate.isLocked(d);
            return (
              <TouchableOpacity key={d} disabled={locked}
                style={[styles.modeButton, difficulty === d && !locked
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 }]}
                onPress={() => !locked && setDifficulty(d)}>
                <Text style={[styles.modeButtonText, { color: difficulty === d && !locked ? '#FFF' : colors.text }]}>
                  {t(d)} ({cfg[0]}-{cfg[1]} cubes · {axesN}D){locked ? ' 🔒' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {gate.nextHint && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
            {gate.nextHint}
          </Text>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[5, 10, 15].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => {
    const baseSize = 130;
    const optSize = 110;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
          <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('mentalRotationHint')}</Text>
        <View style={[styles.baseBox, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
          {renderShape(trial.base, baseSize, GRADIENT[0])}
          <Text style={[styles.baseLabel, { color: colors.textSecondary }]}>{t('label_reference')}</Text>
        </View>
        <View style={styles.optionsRow}>
          {trial.options.map((opt, i) => {
            const fb = feedback?.idx === i
              ? (feedback.ok ? '#22c55e' : '#f43f5e')
              : null;
            return (
              <TouchableOpacity key={i}
                disabled={feedback !== null}
                onPress={() => handlePick(i)}
                style={[styles.optionBox, {
                  backgroundColor: colors.surface,
                  borderColor: fb || colors.border,
                  borderWidth: fb ? 3 : 1,
                }]}
              >
                {renderShape(opt.shape, optSize, GRADIENT[1])}
                <Text style={[styles.optionLabel2, { color: colors.textSecondary }]}>
                  {opt.isMatch && feedback ? '✓ rotation' : feedback && opt.rotationLabel === 'mirror' ? '✗ mirror' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('mentalRotation')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="mentalRotation" icon="cube" gradient={GRADIENT as [string, string]}
          skillKey="skillSpatial" descriptionKey="mentalRotationIntroDesc"
          benefits={MR_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 30 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => router.back()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  versionBadge: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  versionText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'column', gap: 8 },
  modeButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  baseBox: { padding: 12, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
  baseLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  optionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 },
  optionBox: { padding: 8, borderRadius: 12, alignItems: 'center', gap: 4, minWidth: 120 },
  optionLabel2: { fontSize: 11, fontWeight: '600', minHeight: 14 },
});
