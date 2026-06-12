import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#36d1dc', '#5b86e5'];
const NB_BENEFITS = [
  { icon: 'calculator-outline', textKey: 'benefitNumberBonds1' },
  { icon: 'shuffle-outline', textKey: 'benefitNumberBonds2' },
  { icon: 'git-merge-outline', textKey: 'benefitNumberBonds3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Puzzle { target: number; chips: number[]; }

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function makePuzzle(diff: Difficulty): Puzzle {
  // pool size, max chip value, expected solution size
  const cfg = diff === 'easy'
    ? { pool: 8, maxV: 12, solSize: 2 + Math.floor(Math.random() * 2) }     // 2–3 chips
    : diff === 'medium'
    ? { pool: 9, maxV: 18, solSize: 3 + Math.floor(Math.random() * 2) }     // 3–4
    : { pool: 12, maxV: 25, solSize: 3 + Math.floor(Math.random() * 3) };   // 3–5

  // 1) Build a guaranteed solution: pick `solSize` distinct values
  const sol: number[] = [];
  const used = new Set<number>();
  while (sol.length < cfg.solSize) {
    const v = 1 + Math.floor(Math.random() * cfg.maxV);
    if (!used.has(v)) { used.add(v); sol.push(v); }
  }
  const target = sol.reduce((a, b) => a + b, 0);

  // 2) Add distractors so total == cfg.pool
  const distractors: number[] = [];
  let guard = 0;
  while (distractors.length < cfg.pool - sol.length && guard < 200) {
    const v = 1 + Math.floor(Math.random() * cfg.maxV);
    // avoid trivially equal-to-target chips (would be a 1-chip "solution")
    if (v !== target) distractors.push(v);
    guard++;
  }
  const chips = shuffle([...sol, ...distractors]);
  return { target, chips };
}

export default function NumberBondsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 8));

  const [round, setRound] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle>({ target: 0, chips: [] });
  const [picked, setPicked] = useState<number[]>([]); // chip indices
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => {
    setPuzzle(makePuzzle(difficulty));
    setPicked([]);
    setFeedback(null);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const togglePick = (idx: number) => {
    if (feedback !== null) return;
    setPicked((p) => p.includes(idx) ? p.filter((i) => i !== idx) : [...p, idx]);
  };

  const sumPicked = picked.reduce((s, i) => s + (puzzle.chips[i] ?? 0), 0);

  const validate = async () => {
    if (feedback !== null) return;
    if (picked.length < 2) {
      setFeedback('wrong'); setErrors((e) => e + 1);
      setTimeout(() => setFeedback(null), 600);
      return;
    }
    const correct = sumPicked === puzzle.target;
    setFeedback(correct ? 'right' : 'wrong');
    if (correct) setHits((h) => h + 1); else setErrors((e) => e + 1);
    setTimeout(async () => {
      if (correct) {
        if (round >= trials) {
          if (timerRef.current) clearInterval(timerRef.current);
          const finalTime = (Date.now() - startTime) / 1000;
          setElapsedTime(finalTime);
          setPhase('result');
          try {
            await saveSession({
              game_type: 'number_bonds',
              score: Math.max(0, (hits + 1) * 100 - errors * 25 - Math.floor(finalTime)),
              time_seconds: finalTime,
              difficulty,
              mode: `${trials}t`,
              errors,
              details: { hits: hits + 1, errors, trials },
            });
          } catch (e) { console.error(e); }
        } else {
          setRound((r) => r + 1);
          newRound();
        }
      } else {
        setPicked([]);
        setFeedback(null);
      }
    }, 700);
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="git-merge" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('numberBonds')}</Text>
        <Text style={styles.configDesc}>{t('numberBondsDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => (
            <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
              ? { backgroundColor: GRADIENT[1] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDifficulty(d)}>
              <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>{t(d)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[5, 8, 12].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[1] }
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('numberBondsHint')}</Text>
      <View style={[styles.targetBox, {
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : GRADIENT[1],
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
      }]}>
        <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>Σ =</Text>
        <Text style={[styles.targetVal, { color: GRADIENT[1] }]}>{puzzle.target}</Text>
        <Text style={[styles.runningSum, { color: sumPicked === puzzle.target ? '#22c55e' : colors.text }]}>
          {sumPicked}
        </Text>
      </View>
      <View style={styles.chipsArea}>
        {puzzle.chips.map((v, i) => {
          const sel = picked.includes(i);
          return (
            <TouchableOpacity key={i}
              onPress={() => togglePick(i)}
              disabled={feedback !== null}
              style={[styles.chip, {
                backgroundColor: sel ? GRADIENT[1] : colors.surface,
                borderColor: sel ? GRADIENT[0] : colors.border,
              }]}
            >
              <Text style={[styles.chipText, { color: sel ? '#FFF' : colors.text }]}>{v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setPicked([])}>
          <Text style={[styles.actionTxt, { color: colors.text }]}>{t('clearBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={validate}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.actionGrad}>
            <Text style={styles.actionTxt}>{t('validateBtn')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('numberBonds')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="numberBonds" icon="git-merge" gradient={GRADIENT as [string, string]}
          skillKey="skillMath" descriptionKey="numberBondsIntroDesc"
          benefits={NB_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 25 - Math.floor(elapsedTime))}
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
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  targetBox: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16, borderWidth: 2 },
  targetLabel: { fontSize: 16, fontWeight: '600' },
  targetVal: { fontSize: 36, fontWeight: '900' },
  runningSum: { fontSize: 18, fontWeight: '700', marginLeft: 8 },
  chipsArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 420 },
  chip: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  chipText: { fontSize: 20, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10 },
  actionBtnPrimary: { borderRadius: 10, overflow: 'hidden' },
  actionGrad: { paddingVertical: 12, paddingHorizontal: 22 },
  actionTxt: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
