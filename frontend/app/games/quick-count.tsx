import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
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
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';

// Быстрый подсчёт (subitizing) — новая игра v1.117.0. Отдельный когнитивный навык:
// оценить КОЛИЧЕСТВО объектов за долю секунды БЕЗ пересчёта по одному — не пересекается
// ни с одной из существующих игр (counter.tsx — это арифметика на сумму, не восприятие
// количества). Идея из разбора данных конкурента (freefocusgames/counting-boxes),
// реализация с нуля (репо AGPL — код не копировался, только сама задача из когнитивной психологии).
const GRADIENT = ['#f7971e', '#ffd200'];

const QUICKCOUNT_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitQuickCount1' },
  { icon: 'eye-outline', textKey: 'benefitQuickCount2' },
  { icon: 'calculator-outline', textKey: 'benefitQuickCount3' },
];

type GamePhase = 'intro' | 'config' | 'flash' | 'answer' | 'cleared' | 'result';
const BOSS_EVERY = 3;
const TRIALS_PER_ROUND = 12;

interface Dot { x: number; y: number }

// Уровень: диапазон количества точек растёт, время показа падает. Дно 300мс —
// ниже человек физически не успевает даже мельком зафиксировать взглядом.
function levelParams(level: number): { minN: number; maxN: number; exposureMs: number } {
  const base = 3 + Math.floor((level - 1) / 2);
  const spread = 2 + Math.floor(level / 5);
  return { minN: base, maxN: Math.min(20, base + spread), exposureMs: Math.max(300, 900 - level * 40) };
}

// Раскидать N точек без наложения (rejection sampling, лимит попыток — не зависать).
function scatterDots(n: number, w: number, h: number, r: number): Dot[] {
  const dots: Dot[] = [];
  const pad = r + 8;
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const x = pad + Math.random() * Math.max(1, w - pad * 2);
      const y = pad + Math.random() * Math.max(1, h - pad * 2);
      const ok = dots.every((d) => Math.hypot(d.x - x, d.y - y) >= r * 2.4);
      if (ok) { dots.push({ x, y }); placed = true; }
    }
    if (!placed) dots.push({ x: pad + Math.random() * Math.max(1, w - pad * 2), y: pad + Math.random() * Math.max(1, h - pad * 2) });
  }
  return dots;
}

export default function QuickCountGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, num } = useGamePreset();
  const lvl = usePersistentLevel('quick_count');
  const levelRef = useRef(1);
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [bossWon, setBossWon] = useState<boolean | null>(null);
  const [trial, setTrial] = useState(0);
  const [actualN, setActualN] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trialRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);

  const fieldW = Math.min(width - 48, 380);
  const fieldH = Math.min(height * 0.4, 320);
  const dotR = 16;

  useEffect(() => {
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, []);

  const startGame = () => {
    levelRef.current = lvl.level;
    correctRef.current = 0; wrongRef.current = 0; trialRef.current = 0;
    setCorrect(0); setWrong(0); setTrial(0); setBossWon(null);
    setStartTime(Date.now());
    runTrial(0);
  };

  const runTrial = (idx: number) => {
    if (idx >= TRIALS_PER_ROUND) { finishRound(); return; }
    const p = levelParams(levelRef.current);
    const n = p.minN + Math.floor(Math.random() * (p.maxN - p.minN + 1));
    setActualN(n);
    setDots(scatterDots(n, fieldW, fieldH, dotR));
    setPhase('flash');
    flashTimerRef.current = setTimeout(() => setPhase('answer'), p.exposureMs);
  };

  const handleAnswer = (guess: number) => {
    if (guess === actualN) { correctRef.current++; setCorrect((c) => c + 1); }
    else { wrongRef.current++; setWrong((w) => w + 1); }
    const next = trialRef.current + 1;
    trialRef.current = next;
    setTrial(next);
    setTimeout(() => runTrial(next), 250);
  };

  const finishRound = async () => {
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    const total = correctRef.current + wrongRef.current;
    const accuracy = total > 0 ? Math.round((correctRef.current / total) * 100) : 0;
    const passed = !isPreset && accuracy >= 80;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    try {
      await saveSession({
        game_type: 'quick_count',
        score: correctRef.current * 10 - wrongRef.current * 5,
        time_seconds: finalTime,
        difficulty: `Level ${levelRef.current}`,
        mode: `${TRIALS_PER_ROUND}t`,
        errors: wrongRef.current,
        details: { correct: correctRef.current, wrong: wrongRef.current, accuracy },
      });
    } catch (e) { console.error(e); }
    if (passed && levelRef.current % BOSS_EVERY === 0) setBossWon(true);
    if (passed) setPhase('cleared'); else setPhase('result');
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="flash" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('quickCount')}</Text>
        <Text style={styles.configDesc}>{t('quickCountDesc')}</Text>
      </LinearGradient>
      <LevelProgressMap gameId="quick_count" currentLevel={lvl.level} colors={colors} language={language} />
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderFlash = () => (
    <View style={styles.playArea}>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('quickCountLookHint')}</Text>
      <View style={[styles.field, { width: fieldW, height: fieldH, backgroundColor: colors.surface }]}>
        {dots.map((d, i) => (
          <View key={i} style={[styles.dot, { left: d.x - dotR, top: d.y - dotR, width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: GRADIENT[0] }]} />
        ))}
      </View>
    </View>
  );

  const renderAnswer = () => {
    const p = levelParams(levelRef.current);
    const choices = Array.from({ length: p.maxN + 3 - Math.max(1, p.minN - 2) }, (_, i) => Math.max(1, p.minN - 2) + i);
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{trial + 1}/{TRIALS_PER_ROUND}</Text>
          <Text style={[styles.statText, { color: colors.text }]}>✓{correct}</Text>
          <Text style={[styles.statText, { color: colors.error || '#f43f5e' }]}>✗{wrong}</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('quickCountAnswerHint')}</Text>
        <View style={[styles.field, { width: fieldW, height: fieldH * 0.4, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]} />
        <View style={styles.choiceGrid}>
          {choices.map((n) => (
            <TouchableOpacity key={n} style={[styles.choiceBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleAnswer(n)}>
              <Text style={[styles.choiceText, { color: colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('quickCount')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="quickCount" icon="flash" gradient={GRADIENT as [string, string]}
          skillKey="skillAttention" descriptionKey="quickCountIntroDesc" benefits={QUICKCOUNT_BENEFITS}
          onStart={() => setPhase('config')} onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'flash' && renderFlash()}
      {phase === 'answer' && renderAnswer()}
      {phase === 'cleared' && (
        <LevelCleared gameId="quick_count" level={levelRef.current} stars={bossWon ? 3 : (wrong === 0 ? 3 : wrong <= 2 ? 2 : 1)}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={correct * 10 - wrong * 5} time={elapsedTime} errors={wrong}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
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
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 },
  statsRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  field: { borderRadius: 16, position: 'relative', overflow: 'hidden' },
  dot: { position: 'absolute' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 380 },
  choiceBtn: { width: 52, height: 52, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  choiceText: { fontSize: 18, fontWeight: '700' },
});
