import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
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

const GRADIENT = ['#1A2980', '#26D0CE'];
const SS_BENEFITS = [
  { icon: 'apps-outline',         textKey: 'benefitSs1' },
  { icon: 'arrow-undo-outline',   textKey: 'benefitSs2' },
  { icon: 'eye-outline',          textKey: 'benefitSs3' },
];

// CANTAB-style Spatial Span: 4×4 grid (or n×n), squares flash one by one,
// subject must reproduce in REVERSE order. Length grows; 2 fails at same length = stop.

type GamePhase = 'intro' | 'config' | 'show' | 'recall' | 'result';

export default function SpatialSpanGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  // v1.29.1 (мобайл): фикс 320px делал сетку узкой по центру — теперь full-width,
  // высотный лимит держит ландшафт/десктоп, 520 — потолок больших окон
  const { width, height } = useWindowDimensions();
  const gridW = Math.min(width - 32, height - 300, 520);

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [gridSize, setGridSize] = useState(4); // 4x4 (16 cells, classic CANTAB)
  const [startLen, setStartLen] = useState(2);

  const [seq, setSeq] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);
  const [userSeq, setUserSeq] = useState<number[]>([]);
  const [span, setSpan] = useState(0);
  const [errorsAtLen, setErrorsAtLen] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    [tickerRef, timerRef, fbTimerRef].forEach(r => { if (r.current) { clearInterval(r.current as any); clearTimeout(r.current as any); } });
  }, []);

  const cellCount = gridSize * gridSize;

  function shuffleN(n: number, k: number): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, k);
  }

  const showSequence = (len: number) => {
    setUserSeq([]);
    setFeedback(null);
    const next = shuffleN(cellCount, len);
    setSeq(next);
    setPhase('show');
    setShowIdx(-1);
    let i = 0;
    tickerRef.current = setInterval(() => {
      if (i < next.length) {
        setShowIdx(next[i]);
        setTimeout(() => setShowIdx(-1), 450);
        i++;
      } else {
        if (tickerRef.current) clearInterval(tickerRef.current);
        setPhase('recall');
      }
    }, 750);
  };

  const startGame = () => {
    setSpan(0); setErrorsAtLen(0); setTotalErrors(0);
    setUserSeq([]);
    setPhase('show');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
    showSequence(startLen);
  };

  const finish = async (finalSpan: number, finalErrors: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    try {
      await saveSession({
        game_type: 'spatial_span',
        score: Math.max(0, finalSpan * 250 - finalErrors * 50),
        time_seconds: finalTime,
        difficulty: 'medium',
        mode: `${gridSize}x${gridSize}-backward`,
        errors: finalErrors,
        details: { span: finalSpan, grid: gridSize },
      });
    } catch (e) { console.error(e); }
  };

  const handleTap = (i: number) => {
    if (phase !== 'recall' || feedback !== null) return;
    const expected = [...seq].reverse();
    const next = [...userSeq, i];
    setUserSeq(next);
    if (next[next.length - 1] !== expected[next.length - 1]) {
      setFeedback('wrong');
      const ne = errorsAtLen + 1;
      const te = totalErrors + 1;
      setErrorsAtLen(ne); setTotalErrors(te);
      fbTimerRef.current = setTimeout(() => {
        if (ne >= 2) finish(span, te);
        else showSequence(seq.length);
      }, 700);
      return;
    }
    if (next.length === expected.length) {
      setFeedback('right');
      const newSpan = Math.max(span, seq.length);
      setSpan(newSpan);
      setErrorsAtLen(0);
      fbTimerRef.current = setTimeout(() => {
        if (seq.length >= cellCount) finish(newSpan, totalErrors);
        else showSequence(seq.length + 1);
      }, 600);
    }
  };

  const cellSize = (gridW - (gridSize - 1) * 6) / gridSize;

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="apps" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('spatialSpan')}</Text>
        <Text style={styles.configDesc}>{t('spatialSpanDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('gridSize')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, gridSize === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setGridSize(n)}>
              <Text style={[styles.modeButtonText, { color: gridSize === n ? '#000' : colors.text }]}>{n}×{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('startLength')}</Text>
        <View style={styles.optionButtons}>
          {[2, 3, 4].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, startLen === n
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setStartLen(n)}>
              <Text style={[styles.modeButtonText, { color: startLen === n ? '#000' : colors.text }]}>{n}</Text>
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

  const renderGrid = () => (
    <View style={[styles.grid, { width: gridW }]}>
      {Array.from({ length: cellCount }).map((_, i) => {
        const lit = phase === 'show' && showIdx === i;
        const tapped = userSeq.includes(i);
        const lastTapped = userSeq[userSeq.length - 1] === i;
        const fbColor = feedback === 'right' && lastTapped ? '#22c55e' :
                        feedback === 'wrong' && lastTapped ? '#f43f5e' : null;
        return (
          <TouchableOpacity key={i}
            disabled={phase !== 'recall' || feedback !== null}
            onPress={() => handleTap(i)}
            style={{
              width: cellSize, height: cellSize, borderRadius: 8,
              backgroundColor: fbColor || (lit ? '#fbbf24' : tapped ? GRADIENT[1] : colors.surface),
              borderWidth: 2, borderColor: lit ? '#FFF' : colors.border,
            }}
          />
        );
      })}
    </View>
  );

  const renderShow = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>Span {span}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>Len {seq.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{totalErrors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('watchSequence')}</Text>
      {renderGrid()}
    </View>
  );

  const renderRecall = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>Span {span}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>{userSeq.length}/{seq.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{totalErrors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('reproduceBackward')}</Text>
      {renderGrid()}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('spatialSpan')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="spatialSpan" icon="apps" gradient={GRADIENT as [string, string]}
          skillKey="skillVisualMemory" descriptionKey="spatialSpanIntroDesc"
          benefits={SS_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'show' && renderShow()}
      {phase === 'recall' && renderRecall()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, span * 250 - totalErrors * 50)}
          time={elapsedTime} errors={totalErrors}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14 },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
});
