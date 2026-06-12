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

const GRADIENT = ['#3a6186', '#89253e'];
const POSNER_BENEFITS = [
  { icon: 'eye-outline',         textKey: 'benefitPosner1' },
  { icon: 'navigate-outline',    textKey: 'benefitPosner2' },
  { icon: 'flash-outline',       textKey: 'benefitPosner3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type CueValidity = 'valid' | 'invalid' | 'neutral';
type Side = 'left' | 'right';

interface Trial { cueDir: Side | null; targetSide: Side; validity: CueValidity; }

// Validity proportions per difficulty: easy = 80% valid, hard = 60% valid (more uncertainty)
const VALID_RATIO = { easy: 0.80, medium: 0.70, hard: 0.55 };

function makeTrial(diff: Difficulty): Trial {
  const r = Math.random();
  let validity: CueValidity;
  if (r < VALID_RATIO[diff]) validity = 'valid';
  else if (r < VALID_RATIO[diff] + 0.15) validity = 'neutral';
  else validity = 'invalid';
  const targetSide: Side = Math.random() < 0.5 ? 'left' : 'right';
  let cueDir: Side | null;
  if (validity === 'valid') cueDir = targetSide;
  else if (validity === 'invalid') cueDir = targetSide === 'left' ? 'right' : 'left';
  else cueDir = null;
  return { cueDir, targetSide, validity };
}

export default function PosnerGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [trials, setTrials] = useState(20);

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ cueDir: null, targetSide: 'left', validity: 'neutral' });
  const [showCue, setShowCue] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByValidity, setRtsByValidity] = useState<Record<CueValidity, number[]>>({ valid: [], invalid: [], neutral: [] });
  const [startTime, setStartTime] = useState(0);

  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (cueTimerRef.current) clearTimeout(cueTimerRef.current);
    if (targetTimerRef.current) clearTimeout(targetTimerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const newTrial = () => {
    setShowCue(false); setShowTarget(false); setFeedback(null);
    const tr = makeTrial(difficulty);
    setTrial(tr);
    cueTimerRef.current = setTimeout(() => {
      setShowCue(true);
      // SOA: cue visible 100ms, then 100-200ms blank, then target
      targetTimerRef.current = setTimeout(() => {
        setShowCue(false);
        setTimeout(() => {
          setShowTarget(true);
          setStimAt(Date.now());
        }, 100);
      }, 100);
    }, 600 + Math.random() * 400);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRtsByValidity({ valid: [], invalid: [], neutral: [] }); setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    newTrial();
  };

  const finish = async (h: number, e: number, allRts: Record<CueValidity, number[]>) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const meanV = allRts.valid.length ? allRts.valid.reduce((a, b) => a + b, 0) / allRts.valid.length : 0;
    const meanI = allRts.invalid.length ? allRts.invalid.reduce((a, b) => a + b, 0) / allRts.invalid.length : 0;
    const validityEffect = Math.round(meanI - meanV);
    const flatten = [...allRts.valid, ...allRts.invalid, ...allRts.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'posner',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty,
        mode: `${trials}t`,
        errors: e,
        details: { mean_rt: Math.round(meanRt), validity_effect_ms: validityEffect },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (side: Side) => {
    if (!showTarget || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const ok = side === trial.targetSide;
    let nh = hits, ne = errors, nr = rtsByValidity;
    if (ok) {
      nh = hits + 1;
      nr = { ...rtsByValidity, [trial.validity]: [...rtsByValidity[trial.validity], rt] };
    } else ne = errors + 1;
    setHits(nh); setErrors(ne); setRtsByValidity(nr);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(() => {
      if (round >= trials) finish(nh, ne, nr);
      else { setRound(r => r + 1); newTrial(); }
    }, 350);
  };

  const meanRtAll = (() => {
    const all = [...rtsByValidity.valid, ...rtsByValidity.invalid, ...rtsByValidity.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();
  const validityEffect = (() => {
    const v = rtsByValidity.valid, i = rtsByValidity.invalid;
    if (!v.length || !i.length) return 0;
    return Math.round(i.reduce((a, b) => a + b, 0) / i.length - v.reduce((a, b) => a + b, 0) / v.length);
  })();

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="navigate" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('posner')}</Text>
        <Text style={styles.configDesc}>{t('posnerDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => (
            <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
              ? { backgroundColor: GRADIENT[0] }
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
          {[10, 20, 30].map((n) => (
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
        <Text style={[styles.statText, { color: colors.text }]}>{meanRtAll}{language === 'ru' ? 'мс' : 'ms'}</Text>
        <Text style={[styles.statText, { color: GRADIENT[0] }]}>VE {validityEffect}</Text>
      </View>
      <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
        {/* left target slot */}
        <View style={[styles.targetSlot, { borderColor: colors.border }]}>
          {showTarget && trial.targetSide === 'left' && <View style={[styles.target, { backgroundColor: GRADIENT[1] }]} />}
        </View>
        {/* center fixation + cue */}
        <View style={styles.center}>
          {showCue && trial.cueDir && (
            <Ionicons name={trial.cueDir === 'left' ? 'arrow-back' : 'arrow-forward'} size={36} color="#fbbf24" />
          )}
          {showCue && !trial.cueDir && <Text style={{ color: '#fbbf24', fontSize: 36 }}>+</Text>}
          {!showCue && <Text style={{ color: colors.textSecondary, fontSize: 28 }}>+</Text>}
        </View>
        {/* right target slot */}
        <View style={[styles.targetSlot, { borderColor: colors.border }]}>
          {showTarget && trial.targetSide === 'right' && <View style={[styles.target, { backgroundColor: GRADIENT[1] }]} />}
        </View>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('posnerHint')}</Text>
      <View style={styles.choiceRow}>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handleAnswer('left')}>
          <Ionicons name="arrow-back" size={32} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1] }]} onPress={() => handleAnswer('right')}>
          <Ionicons name="arrow-forward" size={32} color="#FFF" />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('posner')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="posner" icon="navigate" gradient={GRADIENT as [string, string]}
          skillKey="skillFocus" descriptionKey="posnerIntroDesc"
          benefits={POSNER_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 60 - meanRtAll * 0.05))}
          time={meanRtAll / 1000} errors={errors}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  stimBox: { width: 380, height: 130, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30 },
  targetSlot: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  target: { width: 30, height: 30, borderRadius: 15 },
  center: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  choiceRow: { flexDirection: 'row', gap: 24 },
  choiceBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
});
