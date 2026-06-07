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
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#7028e4', '#e5b2ca'];
const PATTERN_BENEFITS = [
  { icon: 'analytics-outline', textKey: 'benefitPattern1' },
  { icon: 'school-outline', textKey: 'benefitPattern2' },
  { icon: 'bulb-outline', textKey: 'benefitPattern3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Sequence { items: number[]; answer: number; rule: string; }

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function makeSequence(diff: Difficulty): Sequence {
  // Pick rule based on difficulty
  const easyRules = ['add', 'subtract', 'double'];
  const medRules = ['add', 'subtract', 'double', 'square', 'arith2'];
  const hardRules = ['add', 'double', 'square', 'arith2', 'fib', 'alternating', 'triple'];
  const rules = diff === 'easy' ? easyRules : diff === 'medium' ? medRules : hardRules;
  const rule = rules[Math.floor(Math.random() * rules.length)];

  let items: number[] = [];
  let answer = 0;

  if (rule === 'add') {
    const start = 1 + Math.floor(Math.random() * 9);
    const step = 2 + Math.floor(Math.random() * 6);
    items = [start, start + step, start + 2 * step, start + 3 * step];
    answer = start + 4 * step;
  } else if (rule === 'subtract') {
    const start = 30 + Math.floor(Math.random() * 50);
    const step = 2 + Math.floor(Math.random() * 7);
    items = [start, start - step, start - 2 * step, start - 3 * step];
    answer = start - 4 * step;
  } else if (rule === 'double') {
    const start = 1 + Math.floor(Math.random() * 4);
    items = [start, start * 2, start * 4, start * 8];
    answer = start * 16;
  } else if (rule === 'triple') {
    const start = 1 + Math.floor(Math.random() * 3);
    items = [start, start * 3, start * 9, start * 27];
    answer = start * 81;
  } else if (rule === 'square') {
    const start = 1 + Math.floor(Math.random() * 3);
    items = [start * start, (start + 1) * (start + 1), (start + 2) * (start + 2), (start + 3) * (start + 3)];
    answer = (start + 4) * (start + 4);
  } else if (rule === 'arith2') {
    // arithmetic with growing step: 1, 2, 4, 7, 11 (diff +1 each)
    const start = 1 + Math.floor(Math.random() * 5);
    const baseStep = 1 + Math.floor(Math.random() * 3);
    items = [start];
    let s = baseStep;
    for (let i = 0; i < 3; i++) { items.push(items[items.length - 1] + s); s++; }
    answer = items[items.length - 1] + s;
  } else if (rule === 'fib') {
    let a = 1 + Math.floor(Math.random() * 3);
    let b = a + 1 + Math.floor(Math.random() * 2);
    items = [a, b];
    for (let i = 0; i < 3; i++) { const c = a + b; items.push(c); a = b; b = c; }
    answer = a + b;
    items = items.slice(0, 5);
    answer = items[3] + items[4];
    items = items.slice(0, 4);
  } else if (rule === 'alternating') {
    // 2 +5 -2 +5 -2 = e.g. 2,7,5,10,8 → next 13
    const start = 2 + Math.floor(Math.random() * 5);
    const a = 3 + Math.floor(Math.random() * 4);
    const b = 1 + Math.floor(Math.random() * 3);
    items = [start, start + a, start + a - b, start + 2 * a - b];
    answer = start + 2 * a - 2 * b;
  }
  return { items, answer, rule };
}

function makeOptions(answer: number, count = 4): number[] {
  const opts = new Set<number>([answer]);
  while (opts.size < count) {
    const delta = Math.max(1, Math.round(Math.abs(answer) * 0.15)) + Math.floor(Math.random() * 5) + 1;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const candidate = answer + sign * delta;
    if (candidate !== answer && candidate > -1000) opts.add(candidate);
  }
  return shuffle(Array.from(opts));
}

export default function PatternGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const gate = useLevelGate('pattern');
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'easy') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 10));
  const [round, setRound] = useState(0);
  const [seq, setSeq] = useState<Sequence>({ items: [], answer: 0, rule: '' });
  const [options, setOptions] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => {
    const s = makeSequence(difficulty);
    setSeq(s);
    setOptions(makeOptions(s.answer));
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

  const handleAnswer = async (val: number) => {
    if (feedback !== null) return;
    const correct = val === seq.answer;
    if (correct) setHits((h) => h + 1);
    else setErrors((e) => e + 1);
    setFeedback(correct ? 'right' : 'wrong');
    setTimeout(async () => {
      if (round >= trials) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        setPhase('result');
        const newHits = correct ? hits + 1 : hits;
        try {
          await saveSession({
            game_type: 'pattern',
            score: newHits * 100 - (errors + (correct ? 0 : 1)) * 25,
            time_seconds: finalTime,
            difficulty,
            mode: `${trials}t`,
            errors: errors + (correct ? 0 : 1),
            details: { hits: newHits, errors: errors + (correct ? 0 : 1), trials },
          });
        } catch (e) { console.error(e); }
      } else {
        setRound((r) => r + 1);
        newRound();
      }
    }, 700);
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="analytics" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('pattern')}</Text>
        <Text style={styles.configDesc}>{t('patternDesc')}</Text>
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('patternHint')}</Text>
      <View style={styles.sequenceArea}>
        {seq.items.map((n, i) => (
          <View key={i} style={[styles.seqCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.seqText, { color: colors.text }]}>{n}</Text>
          </View>
        ))}
        <View style={[styles.seqCell, { backgroundColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : 'transparent', borderColor: GRADIENT[0], borderWidth: 2 }]}>
          <Text style={[styles.seqText, { color: feedback ? '#FFF' : GRADIENT[0] }]}>?</Text>
        </View>
      </View>
      <View style={styles.optionsArea}>
        {options.map((o, i) => (
          <TouchableOpacity key={i}
            disabled={feedback !== null}
            onPress={() => handleAnswer(o)}
            style={[styles.optBtn, { backgroundColor: GRADIENT[0] }]}
          >
            <Text style={styles.optText}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('pattern')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="pattern" icon="analytics" gradient={GRADIENT as [string, string]}
          skillKey="skillReasoning" descriptionKey="patternIntroDesc"
          benefits={PATTERN_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 25)}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  sequenceArea: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  seqCell: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  seqText: { fontSize: 24, fontWeight: '800' },
  optionsArea: { flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360 },
  optBtn: { paddingVertical: 18, paddingHorizontal: 24, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  optText: { color: '#FFF', fontSize: 22, fontWeight: '800' },
});
