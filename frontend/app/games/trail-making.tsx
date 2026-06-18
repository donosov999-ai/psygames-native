import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
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

const GRADIENT = ['#fc6076', '#ff9a44'];
const TRAIL_BENEFITS = [
  { icon: 'swap-horizontal-outline', textKey: 'benefitTrail1' },
  { icon: 'flash-outline', textKey: 'benefitTrail2' },
  { icon: 'pulse-outline', textKey: 'benefitTrail3' },
];

const RU_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХ';
const EN_LETTERS = 'ABCDEFGHIJKLMNOPQRST';

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Mode = 'A' | 'B';

interface Node { label: string; x: number; y: number; }

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function makeNodes(mode: Mode, n: number, lang: string, w: number, h: number): Node[] {
  const letters = lang === 'ru' ? RU_LETTERS : EN_LETTERS;
  const labels: string[] = [];
  if (mode === 'A') {
    for (let i = 1; i <= n; i++) labels.push(String(i));
  } else {
    // 1, A, 2, Б, 3, В …
    for (let i = 0; i < n; i++) {
      labels.push(String(i + 1));
      if (i < letters.length) labels.push(letters[i]);
    }
  }
  // place non-overlapping
  const margin = 40;
  const cellSize = 60;
  const nodes: Node[] = [];
  let attempts = 0;
  for (const lbl of labels) {
    let placed = false;
    for (let a = 0; a < 100 && !placed; a++) {
      const x = rand(margin, w - margin);
      const y = rand(margin, h - margin);
      let ok = true;
      for (const n2 of nodes) {
        const dx = n2.x - x, dy = n2.y - y;
        if (dx * dx + dy * dy < cellSize * cellSize) { ok = false; break; }
      }
      if (ok) { nodes.push({ label: lbl, x, y }); placed = true; }
    }
    if (!placed) nodes.push({ label: lbl, x: rand(margin, w - margin), y: rand(margin, h - margin) });
    attempts++;
  }
  return nodes;
}

export default function TrailMakingGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<Mode>(() => (str('mode', 'B') as Mode));
  const [count, setCount] = useState(() => num('count', 8));
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playW = Math.min(width - 32, 600);
  const playH = Math.min(height * 0.55, 460);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startGame = () => {
    setNodes(makeNodes(mode, count, language, playW, playH));
    setCurrentIdx(0);
    setErrors(0);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleNodePress = async (idx: number) => {
    if (idx === currentIdx) {
      const next = currentIdx + 1;
      if (next >= nodes.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        setCurrentIdx(next);
        setPhase('result');
        try {
          await saveSession({
            game_type: 'trail_making',
            score: Math.max(0, Math.round(1000 - finalTime * 5 - errors * 30)),
            time_seconds: finalTime,
            difficulty: `Trail-${mode}`,
            mode: `${count}n`,
            errors,
            details: { hits: count, errors, total_nodes: count, completion_time: finalTime },
          });
        } catch (e) { console.error(e); }
      } else {
        setCurrentIdx(next);
      }
    } else if (idx > currentIdx) {
      setErrors((e) => e + 1);
    }
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="swap-horizontal" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('trailMaking')}</Text>
        <Text style={styles.configDesc}>{t('trailMakingDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trailModeLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['A', 'B'] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeButton,
                mode === m
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>
                {m === 'A' ? t('trailA') : t('trailB')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('countLabel')}</Text>
        <View style={styles.optionButtons}>
          {[6, 8, 10, 12].map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.modeButton,
                count === n
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setCount(n)}
            >
              <Text style={[styles.modeButtonText, { color: count === n ? '#FFF' : colors.text }]}>{n}</Text>
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
        <Text style={[styles.statText, { color: colors.text }]}>{currentIdx}/{nodes.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {currentIdx < nodes.length ? `${t('nextLabel')}: ${nodes[currentIdx].label}` : t('done')}
      </Text>
      <View style={[styles.canvas, { width: playW, height: playH, backgroundColor: colors.surface }]}>
        <Svg width={playW} height={playH} style={StyleSheet.absoluteFill as any}>
          {nodes.slice(0, currentIdx).map((n, i) => {
            if (i === 0) return null;
            const prev = nodes[i - 1];
            return (
              <Line
                key={i}
                x1={prev.x} y1={prev.y} x2={n.x} y2={n.y}
                stroke={GRADIENT[0]} strokeWidth={3}
              />
            );
          })}
        </Svg>
        {nodes.map((n, i) => {
          const done = i < currentIdx;
          const isNext = i === currentIdx;
          let bg = colors.card;
          let textColor = colors.text;
          let borderColor = colors.border;
          if (done) { bg = GRADIENT[0]; textColor = '#FFF'; borderColor = GRADIENT[0]; }
          else if (isNext) { borderColor = GRADIENT[1]; }
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onPress={() => handleNodePress(i)}
              style={[
                styles.node,
                {
                  left: n.x - 22,
                  top: n.y - 22,
                  backgroundColor: bg,
                  borderColor,
                  borderWidth: isNext ? 3 : 2,
                },
              ]}
            >
              <Text style={[styles.nodeLabel, { color: textColor }]}>{n.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('trailMaking')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="trailMaking"
          icon="swap-horizontal"
          gradient={GRADIENT as [string, string]}
          skillKey="skillSwitching"
          descriptionKey="trailMakingIntroDesc"
          benefits={TRAIL_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(1000 - elapsedTime * 5 - errors * 30))}
          time={elapsedTime}
          errors={errors}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  canvas: { borderRadius: 12, position: 'relative', overflow: 'hidden' },
  node: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  nodeLabel: { fontSize: 15, fontWeight: '700' },
});
