import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Circle, Rect, Polygon } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#34e89e', '#0f3443'];
const FIND_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitFind1' },
  { icon: 'search-outline', textKey: 'benefitFind2' },
  { icon: 'sparkles-outline', textKey: 'benefitFind3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'feedback' | 'result';
type Shape = { kind: 'circle' | 'rect' | 'tri'; x: number; y: number; size: number; color: string; rot?: number };

const PALETTE = ['#ef4444','#3b82f6','#22c55e','#fbbf24','#a855f7','#06b6d4','#f97316','#ec4899'];

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function generateScene(width: number, height: number, count: number): Shape[] {
  const shapes: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const kinds: Shape['kind'][] = ['circle','rect','tri'];
    shapes.push({
      kind: kinds[Math.floor(Math.random()*3)],
      x: rand(20, width - 40),
      y: rand(20, height - 40),
      size: rand(14, 30),
      color: PALETTE[Math.floor(Math.random()*PALETTE.length)],
      rot: Math.random() * 360,
    });
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
    const change = Math.floor(Math.random() * 3);
    if (change === 0) {
      // change color
      let c;
      do { c = PALETTE[Math.floor(Math.random() * PALETTE.length)]; } while (c === altered[i].color);
      altered[i].color = c;
    } else if (change === 1) {
      // change size
      altered[i].size = altered[i].size > 22 ? altered[i].size - 8 : altered[i].size + 10;
    } else {
      // change kind
      const kinds: Shape['kind'][] = ['circle','rect','tri'];
      let k;
      do { k = kinds[Math.floor(Math.random()*3)]; } while (k === altered[i].kind);
      altered[i].kind = k;
    }
  }
  return { altered, diffIdx };
}

export default function FindDifferencesGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [diffCount, setDiffCount] = useState(3);
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

  const sceneW = Math.min(width - 24, 400);
  const sceneH = Math.min(280, sceneW * 0.7);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => {
    const sc = generateScene(sceneW, sceneH, 12);
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
    const handler = side === 'R' ? () => handleShapePress(idx) : undefined;
    const shape = side === 'L' ? scene[idx] : altered[idx];
    if (!shape) return null;
    if (shape.kind === 'circle') {
      return <Circle key={idx} cx={shape.x} cy={shape.y} r={shape.size / 2}
        fill={shape.color} stroke={stroke} strokeWidth={strokeWidth} onPress={handler} />;
    } else if (shape.kind === 'rect') {
      return <Rect key={idx} x={shape.x - shape.size / 2} y={shape.y - shape.size / 2}
        width={shape.size} height={shape.size} fill={shape.color}
        stroke={stroke} strokeWidth={strokeWidth} onPress={handler} />;
    } else {
      const s = shape.size;
      const points = `${shape.x},${shape.y - s/2} ${shape.x + s/2},${shape.y + s/2} ${shape.x - s/2},${shape.y + s/2}`;
      return <Polygon key={idx} points={points} fill={shape.color}
        stroke={stroke} strokeWidth={strokeWidth} onPress={handler} />;
    }
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
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
    </View>
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
        <View style={[styles.sceneBox, { backgroundColor: colors.surface }]}>
          <Svg width={sceneW} height={sceneH}>
            {altered.map((_, i) => renderShape(altered[i], i, 'R'))}
          </Svg>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('findDiff')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="findDiff" icon="search" gradient={GRADIENT as [string, string]}
          skillKey="skillDetailAttention" descriptionKey="findDiffIntroDesc"
          benefits={FIND_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {(phase === 'playing' || phase === 'feedback') && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={Math.max(0, hits * 50 - errors * 10)} time={elapsedTime} errors={errors}
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
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 16 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center' },
  scenesArea: { gap: 8 },
  sceneBox: { borderRadius: 8, overflow: 'hidden' },
});
