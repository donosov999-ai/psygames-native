import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
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
import { sndTimerTick, sndTimerEnd } from '@/src/services/feedback';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';

const GRADIENT = ['#fc4a1a', '#f7b733'];
const MATH_BENEFITS = [
  { icon: 'calculator-outline', textKey: 'benefitMath1' },
  { icon: 'cash-outline', textKey: 'benefitMath2' },
  { icon: 'flash-outline', textKey: 'benefitMath3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type Op = '+' | '-' | '*';

interface Problem {
  a: number;
  b: number;
  op: Op;
  answer: number;
}

// tier — внутрисессионный рамп: с ростом числа верных ответов задачи становятся крупнее.
// Выбранная сложность задаёт БАЗУ (диапазон/набор операций), tier масштабирует величину чисел.
function generateProblem(difficulty: Difficulty, tier = 0): Problem {
  const ops: Op[] = difficulty === 'easy' ? ['+', '-'] : difficulty === 'medium' ? ['+', '-', '*'] : ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const t = Math.min(tier, 5);   // потолок рампа, чтобы числа не разрослись до абсурда
  let a: number, b: number;
  if (op === '*') {
    if (difficulty === 'easy') { a = 2 + Math.floor(Math.random() * (8 + t * 2)); b = 2 + Math.floor(Math.random() * (8 + t)); }
    else if (difficulty === 'medium') { a = 3 + Math.floor(Math.random() * (10 + t * 3)); b = 3 + Math.floor(Math.random() * (9 + t * 2)); }
    else { a = 5 + Math.floor(Math.random() * (16 + t * 4)); b = 5 + Math.floor(Math.random() * (12 + t * 2)); }
  } else {
    const baseRange = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 50 : 100;
    const range = Math.round(baseRange * (1 + t * 0.4));
    a = 5 + Math.floor(Math.random() * range);
    b = 1 + Math.floor(Math.random() * range);
    if (op === '-' && b > a) { [a, b] = [b, a]; }
  }
  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
  return { a, b, op, answer };
}

export default function MathSprintGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const gate = useLevelGate('math_sprint');
  const lvl = usePersistentLevel('math_sprint');   // уровень → тир (1=easy, 2=medium, ≥3=hard)

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'easy') as Difficulty));
  const [duration, setDuration] = useState(() => num('duration', 60));
  const [timeLeft, setTimeLeft] = useState(60);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  const startGame = () => {
    setCorrect(0); setErrors(0); setStreak(0); setBestStreak(0); setScore(0);
    setUserAnswer('');
    setFeedback(null);
    const diff: Difficulty = isPreset ? difficulty : (lvl.level <= 1 ? 'easy' : lvl.level === 2 ? 'medium' : 'hard');   // тир от уровня
    if (!isPreset) setDifficulty(diff);
    setTimeLeft(duration);
    setProblem(generateProblem(diff, 0));
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    let lastSec = Math.ceil(duration);
    tickRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setElapsedTime(elapsed);
      const remaining = Math.max(0, duration - elapsed);
      setTimeLeft(remaining);
      const s = Math.ceil(remaining);
      if (s !== lastSec) { lastSec = s; if (s > 0 && s <= 5) sndTimerTick(); }   // SND-T: тик последних 5с
      if (remaining <= 0) finishGame();
    }, 100);
  };

  const finishGame = async () => {
    if (tickRef.current) clearInterval(tickRef.current);
    sndTimerEnd();   // SND-T: «время вышло»
    if (!isPreset && correct >= 12) lvl.reach((difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3) + 1);   // ≥12 верных → +уровень/тир
    setPhase('result');
    try {
      await saveSession({
        game_type: 'math_sprint',
        score,
        time_seconds: duration,
        difficulty,
        mode: `${duration}s`,
        errors,
        details: { correct, bestStreak },
      });
    } catch (e) { console.error(e); }
  };

  const submit = () => {
    if (!problem || userAnswer === '') return;
    const ans = parseInt(userAnswer, 10);
    let nextCorrect = correct;
    if (ans === problem.answer) {
      const newStreak = streak + 1;
      nextCorrect = correct + 1;
      const points = 10 + Math.min(newStreak * 2, 30);
      setCorrect(nextCorrect);
      setStreak(newStreak);
      setBestStreak(Math.max(bestStreak, newStreak));
      setScore((s) => s + points);
      setFeedback('correct');
    } else {
      setErrors((e) => e + 1);
      setStreak(0);
      setScore((s) => Math.max(0, s - 5));
      setFeedback('wrong');
    }
    setUserAnswer('');
    // Рамп: каждые 5 верных → tier+1 → следующая задача крупнее (свежий nextCorrect, не stale state).
    const nextTier = Math.floor(nextCorrect / 5);
    setTimeout(() => {
      setProblem(generateProblem(difficulty, nextTier));
      setFeedback(null);
      inputRef.current?.focus();   // десктоп: вернуть фокус в поле, чтобы печатать дальше без клика мышью
    }, 250);
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="calculator" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('mathSprint')}</Text>
        <Text style={styles.configDesc}>{t('mathSprintDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => {
            const locked = gate.isLocked(d);
            return (
            <TouchableOpacity key={d} disabled={locked}
              style={[styles.modeButton, difficulty === d && !locked
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 }]}
              onPress={() => !locked && setDifficulty(d)}>
              <Text style={[styles.modeButtonText, { color: difficulty === d && !locked ? '#FFF' : colors.text }]}>
                {d === 'easy' ? t('easy') : d === 'medium' ? t('medium') : t('hard')}{locked ? ' 🔒' : ''}
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('durationLabel')}</Text>
        <View style={styles.optionButtons}>
          {[30, 60, 120].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, duration === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setDuration(n)}>
              <Text style={[styles.modeButtonText, { color: duration === n ? '#FFF' : colors.text }]}>{n}{language === 'ru' ? 'с' : 's'}</Text>
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
        <Text style={[styles.statText, { color: colors.text }]}>⏱ {timeLeft.toFixed(1)}{language === 'ru' ? 'с' : 's'}{!isPreset ? ` · ${language === 'ru' ? 'Ур.' : 'Lv'}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>★ {score}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{correct}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        {streak >= 3 && <Text style={[styles.statText, { color: '#fbbf24' }]}>🔥{streak}</Text>}
        {Math.floor(correct / 5) > 0 && <Text style={[styles.statText, { color: '#3b82f6' }]}>📈{t('label_level_short_lower')}{Math.min(Math.floor(correct / 5), 5) + 1}</Text>}
      </View>
      <View style={[styles.problemArea, {
        backgroundColor: feedback === 'correct' ? 'rgba(34,197,94,0.15)' : feedback === 'wrong' ? 'rgba(244,63,94,0.15)' : 'transparent',
      }]}>
        {problem && (
          <Text style={[styles.problemText, { color: colors.text }]}>
            {problem.a} {problem.op === '*' ? '×' : problem.op} {problem.b} = ?
          </Text>
        )}
      </View>
      <TextInput
        ref={inputRef}
        value={userAnswer}
        onChangeText={(s) => setUserAnswer(s.replace(/[^-0-9]/g, ''))}
        onSubmitEditing={submit}
        autoFocus
        keyboardType="numeric"
        placeholder="?"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, {
          color: colors.text, borderColor: colors.border, backgroundColor: colors.surface,
        }]}
      />
      <TouchableOpacity onPress={submit} style={[styles.submitBtn, { backgroundColor: GRADIENT[0] }]}>
        <Text style={styles.submitText}>{t('check')}</Text>
      </TouchableOpacity>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('mathHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('mathSprint')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="mathSprint" icon="calculator" gradient={GRADIENT as [string, string]}
          skillKey="skillMath" descriptionKey="mathSprintIntroDesc"
          benefits={MATH_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={score} time={duration} errors={errors}
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
  playArea: { flex: 1, padding: 24, gap: 16, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 16, fontWeight: '700' },
  problemArea: { paddingVertical: 32, paddingHorizontal: 28, borderRadius: 14, minWidth: 240, alignItems: 'center' },
  problemText: { fontSize: 48, fontWeight: '900' },
  input: {
    fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: 4,
    paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 2,
    minWidth: 180,
  },
  submitBtn: { paddingVertical: 14, paddingHorizontal: 48, borderRadius: 10 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 12, textAlign: 'center' },
});
