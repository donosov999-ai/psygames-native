import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView
} from 'react-native';
import Svg, { Circle, Rect, Polygon } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#34e89e', '#0f3443'];
const FIND_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitFind1' },
  { icon: 'search-outline', textKey: 'benefitFind2' },
  { icon: 'sparkles-outline', textKey: 'benefitFind3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'feedback' | 'result';
type Shape = { kind: 'circle' | 'rect' | 'tri'; x: number; y: number; size: number; color: string; rot?: number };

// Радуга из 7 различимых цветов (R-O-Y-G-C-B-M). Убрана только фуксия #ec4899 —
// она отстояла от красного всего на ~85 RGB («не отличить»), заменена чистой мадджентой #d946ef.
// Контраст самого ОТЛИЧИЯ гарантирует farColor (берёт дальнюю половину палитры),
// поэтому богатая палитра не мешает игре: разница в цвете всегда заметна.
const PALETTE = ['#ef4444','#f97316','#facc15','#22c55e','#06b6d4','#3b82f6','#d946ef'];

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
// Цвет для diff'а — из самой дальней половины палитры, чтобы разница была контрастной и заметной.
function farColor(current: string): string {
  const others = PALETTE.filter((c) => c !== current).sort((x, y) => colorDist(current, y) - colorDist(current, x));
  const top = others.slice(0, Math.max(2, Math.ceil(others.length / 2)));
  return top[Math.floor(Math.random() * top.length)];
}

/**
 * Distance between two shape centers below which they would visually
 * overlap and one would block taps on the other. Using sum of half-sizes
 * + padding (so even after a size-change diff, they still don't collide).
 */
function tooClose(a: Shape, b: Shape, padding = 12): boolean {
  const minDist = (a.size + b.size) / 2 + padding;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return (dx * dx + dy * dy) < (minDist * minDist);
}

function generateScene(width: number, height: number, count: number): Shape[] {
  const shapes: Shape[] = [];
  const kinds: Shape['kind'][] = ['circle','rect','tri'];
  const MAX_ATTEMPTS_PER_SHAPE = 60;

  for (let i = 0; i < count; i++) {
    let placed: Shape | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SHAPE; attempt++) {
      const candidate: Shape = {
        kind: kinds[Math.floor(Math.random() * 3)],
        x: rand(24, width - 24),
        y: rand(24, height - 24),
        size: rand(24, 44),
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        rot: Math.random() * 360,
      };
      // Reject if overlaps any already-placed shape
      const collides = shapes.some(s => tooClose(candidate, s));
      if (!collides) { placed = candidate; break; }
    }
    // Fallback: if we couldn't find a non-colliding spot in 60 tries,
    // accept the last candidate anyway (rare with reasonable density).
    if (!placed) {
      placed = {
        kind: kinds[Math.floor(Math.random() * 3)],
        x: rand(24, width - 24),
        y: rand(24, height - 24),
        size: rand(20, 30),   // smaller fallback
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        rot: Math.random() * 360,
      };
    }
    shapes.push(placed);
  }
  return shapes;
}

function withDifference(scene: Shape[], diffCount: number): { altered: Shape[]; diffIdx: number[] } {
  const altered = scene.map((s) => ({ ...s }));
  const indices = Array.from({ length: scene.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const diffIdx = indices.slice(0, diffCount);
  for (const i of diffIdx) {
    // Try size change first only if it stays safe (won't overlap neighbors).
    // Otherwise fall through to color or kind change.
    const tryChanges = [Math.floor(Math.random() * 3), 0, 1, 2];   // randomized first attempt, plus all fallbacks
    let applied = false;
    for (const change of tryChanges) {
      if (applied) break;
      if (change === 0) {
        // change color — берём контрастный (farColor), чтобы разница была хорошо видна
        altered[i].color = farColor(altered[i].color);
        applied = true;
      } else if (change === 1) {
        // change size — only if grown size still doesn't overlap others
        const candidate = { ...altered[i] };
        candidate.size = candidate.size > 32 ? candidate.size - 14 : candidate.size + 16;
        const overlaps = altered.some((other, oi) => oi !== i && tooClose(candidate, other, 10));
        if (!overlaps) {
          altered[i].size = candidate.size;
          applied = true;
        }
      } else {
        // change kind
        const kinds: Shape['kind'][] = ['circle','rect','tri'];
        let k;
        do { k = kinds[Math.floor(Math.random() * 3)]; } while (k === altered[i].kind);
        altered[i].kind = k;
        applied = true;
      }
    }
  }
  return { altered, diffIdx };
}

export default function FindDifferencesGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [diffCount, setDiffCount] = useState(() => num('diffCount', 3));
  const [trials] = useState(8);
  const [round, setRound] = useState(0);
  const [scene, setScene] = useState<Shape[]>([]);
  const [altered, setAltered] = useState<Shape[]>([]);
  const [diffIdx, setDiffIdx] = useState<number[]>([]);
  const [foundIdx, setFoundIdx] = useState<Set<number>>(new Set());
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Larger scene area = more room to avoid overlaps (was 280, now ~340)
  const sceneW = Math.min(width - 24, 440);
  const sceneH = Math.min(340, sceneW * 0.8);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => {
    const sc = generateScene(sceneW, sceneH, 10);
    const { altered: alt, diffIdx: idx } = withDifference(sc, diffCount);
    setScene(sc);
    setAltered(alt);
    setDiffIdx(idx);
    setFoundIdx(new Set());
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleShapePress = async (idx: number) => {
    if (foundIdx.has(idx)) return;
    if (diffIdx.includes(idx)) {
      const newFound = new Set(foundIdx);
      newFound.add(idx);
      setFoundIdx(newFound);
      setHits((h) => h + 1);
      if (newFound.size === diffIdx.length) {
        // Round complete
        setTimeout(() => {
          if (round >= trials) {
            finish();
          } else {
            setRound((r) => r + 1);
            newRound();
          }
        }, 600);
      }
    } else {
      setErrors((e) => e + 1);
    }
  };

  // Тап по координате → ближайшая фигура в радиусе (а не по точному SVG-контуру).
  // Раньше onPress висел на самой фигуре: мелкий треугольник = крошечная зона, легко промахнуться.
  const handleSceneTap = (x: number, y: number) => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < altered.length; i++) {
      const s = altered[i];
      if (!s) continue;
      const dx = s.x - x, dy = s.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const tol = Math.max(s.size / 2 + 16, 28);   // прощаем промах до ~края+16px (мин 28)
      if (d <= tol && d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) handleShapePress(best);
  };

  const finish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'find_differences',
        score: hits * 50 - errors * 10,
        time_seconds: finalTime,
        difficulty: `${diffCount} diffs`,
        mode: `${trials}t`,
        errors,
        details: { hits, errors, diff_count: diffCount, trials },
      });
    } catch (e) { console.error(e); }
  };

  const renderShape = (s: Shape, idx: number, side: 'L' | 'R') => {
    const isFound = side === 'R' && foundIdx.has(idx);
    const stroke = isFound ? '#fbbf24' : 'transparent';
    const strokeWidth = isFound ? 3 : 0;
    const shape = side === 'L' ? scene[idx] : altered[idx];
    if (!shape) return null;
    // Тапы ловит контейнер сцены (handleSceneTap по координате) — у самих фигур onPress нет.
    if (shape.kind === 'circle') {
      return <Circle key={idx} cx={shape.x} cy={shape.y} r={shape.size / 2}
        fill={shape.color} stroke={stroke} strokeWidth={strokeWidth} />;
    } else if (shape.kind === 'rect') {
      return <Rect key={idx} x={shape.x - shape.size / 2} y={shape.y - shape.size / 2}
        width={shape.size} height={shape.size} fill={shape.color}
        stroke={stroke} strokeWidth={strokeWidth} />;
    } else {
      const s = shape.size;
      const points = `${shape.x},${shape.y - s/2} ${shape.x + s/2},${shape.y + s/2} ${shape.x - s/2},${shape.y + s/2}`;
      return <Polygon key={idx} points={points} fill={shape.color}
        stroke={stroke} strokeWidth={strokeWidth} />;
    }
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="search" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('findDiff')}</Text>
        <Text style={styles.configDesc}>{t('findDiffDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('diffsCount')}</Text>
        <View style={styles.optionButtons}>
          {[2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, diffCount === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDiffCount(n)}>
              <Text style={[styles.modeButtonText, { color: diffCount === n ? '#FFF' : colors.text }]}>{n}</Text>
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{foundIdx.size}/{diffIdx.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('findHint')}</Text>
      <View style={[styles.scenesArea, { width: sceneW }]}>
        <View style={[styles.sceneBox, { backgroundColor: colors.surface }]}>
          <Svg width={sceneW} height={sceneH}>
            {scene.map((_, i) => renderShape(scene[i], i, 'L'))}
          </Svg>
        </View>
        <View
          style={[styles.sceneBox, { backgroundColor: colors.surface }]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => handleSceneTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        >
          <Svg width={sceneW} height={sceneH} pointerEvents="none">
            {altered.map((_, i) => renderShape(altered[i], i, 'R'))}
          </Svg>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('findDiff')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="findDiff" icon="search" gradient={GRADIENT as [string, string]}
          skillKey="skillDetailAttention" descriptionKey="findDiffIntroDesc"
          benefits={FIND_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {(phase === 'playing' || phase === 'feedback') && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={Math.max(0, hits * 50 - errors * 10)} time={elapsedTime} errors={errors}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
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
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 16 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center' },
  scenesArea: { gap: 18 },
  // Чёткая рамка вокруг каждой сцены — видна и на тёмной, и на светлой теме
  // (#94a3b8 — средне-серый, контрастит и с чёрным, и с белым фоном).
  sceneBox: { borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#94a3b8' },
});
