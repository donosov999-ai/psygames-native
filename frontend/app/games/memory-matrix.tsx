import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#8e2de2', '#4a00e0'];
const MATRIX_BENEFITS = [
  { icon: 'map-outline', textKey: 'benefitMatrix1' },
  { icon: 'eye-outline', textKey: 'benefitMatrix2' },
  { icon: 'images-outline', textKey: 'benefitMatrix3' },
];

type GamePhase = 'intro' | 'config' | 'showing' | 'input' | 'feedback' | 'result';
type MatrixMode = 'static' | 'sequential';   // static = pattern flashes once; sequential = cells light up one-by-one, reproduce in order

export default function MemoryMatrixGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const gate = useLevelGate('memory_matrix');
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [gridSize, setGridSize] = useState(() => num('size', 3));
  const [matrixMode, setMatrixMode] = useState<MatrixMode>(() => (str('mode', 'static') as MatrixMode));
  const [litCells, setLitCells] = useState<Set<number>>(new Set());
  const [litSequence, setLitSequence] = useState<number[]>([]);     // order for sequential mode
  const [activeIdx, setActiveIdx] = useState<number>(-1);            // current flashing cell in sequential
  const [pickedCells, setPickedCells] = useState<Set<number>>(new Set());
  const [pickedSequence, setPickedSequence] = useState<number[]>([]);// user's tap order for sequential mode
  const [round, setRound] = useState(0);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const totalRounds = 10;

  const numLit = (n: number) => Math.min(n * n - 1, Math.max(3, 2 + Math.floor(n / 2) + Math.floor(round / 3)));

  const newRound = (gs: number, r: number) => {
    const total = gs * gs;
    const need = Math.min(total - 1, 3 + Math.floor((r - 1) / 3));
    const seq: number[] = [];
    const seenSet = new Set<number>();
    while (seq.length < need) {
      const c = Math.floor(Math.random() * total);
      if (!seenSet.has(c)) { seq.push(c); seenSet.add(c); }
    }
    setLitCells(seenSet);
    setLitSequence(seq);
    setPickedCells(new Set());
    setPickedSequence([]);
    setPhase('showing');

    if (matrixMode === 'static') {
      // Original behavior: show whole pattern, hide, await input
      setTimeout(() => setPhase('input'), Math.max(900, 1500 - r * 80));
    } else {
      // Sequential: flash cells one by one, then await ordered reproduction
      const flashMs = Math.max(400, 700 - r * 30);
      const gapMs = 200;
      seq.forEach((cellIdx, i) => {
        setTimeout(() => setActiveIdx(cellIdx), i * (flashMs + gapMs));
        setTimeout(() => setActiveIdx(-1), i * (flashMs + gapMs) + flashMs);
      });
      setTimeout(() => setPhase('input'), seq.length * (flashMs + gapMs) + 300);
    }
  };

  const startGame = () => {
    setHits(0); setErrors(0); setScore(0); setRound(1);
    setStartTime(Date.now());
    newRound(gridSize, 1);
  };

  const handleCellPress = (idx: number) => {
    if (phase !== 'input' || pickedCells.has(idx)) return;
    const newPicked = new Set(pickedCells);
    newPicked.add(idx);
    setPickedCells(newPicked);
    const newSequence = [...pickedSequence, idx];
    setPickedSequence(newSequence);

    let isHit: boolean;
    if (matrixMode === 'static') {
      isHit = litCells.has(idx);
    } else {
      // sequential: must be the right cell at the right step
      const expectedIdx = litSequence[newSequence.length - 1];
      isHit = idx === expectedIdx;
    }

    if (isHit) {
      setHits((h) => h + 1);
      setScore((s) => s + 10);
    } else {
      setErrors((e) => e + 1);
      setScore((s) => Math.max(0, s - 5));
    }
    // Финальные значения для saveSession: замыкание score/hits/errors не учитывает ТЕКУЩИЙ тап
    // (setState функциональный, но сохранение ниже читает старое замыкание) → считаем явно.
    const fHits = hits + (isHit ? 1 : 0);
    const fErrors = errors + (isHit ? 0 : 1);
    const fScore = isHit ? score + 10 : Math.max(0, score - 5);

    // All lit cells found OR a wrong cell — end round
    const allFound = matrixMode === 'static'
      ? Array.from(litCells).every((c) => newPicked.has(c))
      : newSequence.length >= litSequence.length && newSequence.every((c, i) => c === litSequence[i]);
    const wrongPicked = !isHit;
    if (allFound || wrongPicked) {
      setFeedbackMsg(allFound && !wrongPicked ? t('matrixGood') : t('matrixMissed'));
      setPhase('feedback');
      setTimeout(async () => {
        if (round >= totalRounds) {
          if (true) { /* end */ }
          const finalTime = (Date.now() - startTime) / 1000;
          setElapsedTime(finalTime);
          setPhase('result');
          try {
            await saveSession({
              game_type: 'memory_matrix',
              score: fScore,
              time_seconds: finalTime,
              difficulty: `${gridSize}x${gridSize}`,
              mode: `${totalRounds}r`,
              errors: fErrors,
              details: { hits: fHits, finalRound: round },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => {
            const next = r + 1;
            newRound(gridSize, next);
            return next;
          });
        }
      }, 900);
    }
  };

  // v1.29.1 (мобайл): full-width сетка — зажим 420px + потолок 70 делали её мелкой по центру.
  // Высотный лимит (хедер+статус ≈ 280) держит ландшафт/десктоп; 110 — потолок больших окон.
  const cellSize = Math.min(
    (width - 32 - (gridSize - 1) * 6) / gridSize,
    (height - 280 - (gridSize - 1) * 6) / gridSize,
    110
  );

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="grid" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('memoryMatrix')}</Text>
        <Text style={styles.configDesc}>{t('memoryMatrixDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('gridSize')}</Text>
        <View style={styles.optionButtons}>
          {[3, 4, 5, 6].map((n) => {
            const levelKey = `${n}x${n}`;
            const locked = gate.isLocked(levelKey);
            return (
            <TouchableOpacity
              key={n}
              disabled={locked}
              style={[
                styles.modeButton,
                gridSize === n && !locked
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 },
              ]}
              onPress={() => !locked && setGridSize(n)}
            >
              <Text style={[styles.modeButtonText, { color: gridSize === n && !locked ? '#FFF' : colors.text }]}>
                {n}×{n}{locked ? ' 🔒' : ''}
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
        <View style={styles.optionButtons}>
          {(['static', 'sequential'] as MatrixMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeButton,
                matrixMode === m
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMatrixMode(m)}
            >
              <Text style={[styles.modeButtonText, { color: matrixMode === m ? '#FFF' : colors.text, fontSize: 12 }]}>
                {m === 'static'
                  ? t('label_mode_static')
                  : t('label_mode_sequential')}
              </Text>
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

  const renderGrid = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalRounds}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{score}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {phase === 'showing' ? t('matrixMemorize') : phase === 'input' ? t('matrixRecall') : feedbackMsg}
      </Text>
      <View
        style={[styles.gridArea, { width: gridSize * (cellSize + 6) - 6, height: gridSize * (cellSize + 6) - 6 }]}
      >
        {Array.from({ length: gridSize * gridSize }).map((_, i) => {
          const isLit = matrixMode === 'static' ? litCells.has(i) : (activeIdx === i);
          const isPicked = pickedCells.has(i);
          let bg = colors.surface;
          let border = colors.textSecondary;   // заметная рамка (было colors.border — бледная, поля не видно на светлой теме)
          if (phase === 'showing' && isLit) bg = GRADIENT[0];
          else if (phase === 'input' && isPicked) bg = isLit ? '#22c55e' : '#f43f5e';
          else if (phase === 'feedback') {
            if (isLit && !isPicked) bg = '#fbbf24';
            else if (isLit && isPicked) bg = '#22c55e';
            else if (!isLit && isPicked) bg = '#f43f5e';
          }
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onPress={() => handleCellPress(i)}
              style={[
                styles.cell,
                { width: cellSize, height: cellSize, backgroundColor: bg, borderColor: border, borderWidth: 2 },
              ]}
            />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('memoryMatrix')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="memoryMatrix"
          icon="grid"
          gradient={GRADIENT as [string, string]}
          skillKey="skillVisualMemory"
          descriptionKey="memoryMatrixIntroDesc"
          benefits={MATRIX_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {(phase === 'showing' || phase === 'input' || phase === 'feedback') && renderGrid()}
      {phase === 'result' && (
        <GameResult score={score} time={elapsedTime} errors={errors}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, alignItems: 'center', gap: 14 },
  statsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  statText: { fontSize: 15, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', minHeight: 18 },
  gridArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  cell: { borderRadius: 8, borderWidth: 1 },
});
