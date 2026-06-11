import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#ee0979', '#ff6a00'];
const STOP_BENEFITS = [
  { icon: 'hand-left-outline', textKey: 'benefitStopSignal1' },
  { icon: 'pause-circle-outline', textKey: 'benefitStopSignal2' },
  { icon: 'flash-off-outline', textKey: 'benefitStopSignal3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type SignalState = 'idle' | 'go' | 'stop' | 'feedback';

interface DifficultyCfg { stopProb: number; ssd: number; goWindow: number; }
const DIFF: Record<Difficulty, DifficultyCfg> = {
  easy:   { stopProb: 0.20, ssd: 380, goWindow: 1300 },  // signal at 380ms after Go
  medium: { stopProb: 0.30, ssd: 250, goWindow: 1100 },
  hard:   { stopProb: 0.35, ssd: 160, goWindow: 1000 },
};

export default function StopSignalGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [trials, setTrials] = useState(20);

  const [round, setRound] = useState(0);
  const [signal, setSignal] = useState<SignalState>('idle');
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [trialIsStop, setTrialIsStop] = useState(false);

  const [hits, setHits] = useState(0);          // Go pressed correctly
  const [errors, setErrors] = useState(0);       // Go missed OR Stop violated
  const [correctStops, setCorrectStops] = useState(0); // Stop trials successfully inhibited
  const [rts, setRts] = useState<number[]>([]);
  const [startTime, setStartTime] = useState(0);

  const goAtRef = useRef<number>(0);
  const respondedRef = useRef<boolean>(false);
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (goTimerRef.current) clearTimeout(goTimerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    if (interTimerRef.current) clearTimeout(interTimerRef.current);
  };

  useEffect(() => () => clearTimers(), []);

  const startGame = () => {
    setHits(0); setErrors(0); setCorrectStops(0); setRts([]); setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    nextTrial(1);
  };

  const finish = async (h: number, e: number, cs: number, finalRts: number[]) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const meanRt = finalRts.length ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'stop_signal',
        score: Math.max(0, Math.round(h * 50 + cs * 100 - e * 60 - meanRt * 0.1)),
        time_seconds: totalTime,
        difficulty,
        mode: `${trials}t`,
        errors: e,
        details: { mean_rt: Math.round(meanRt), hits: h, correct_stops: cs },
      });
    } catch (err) { console.error(err); }
  };

  const nextTrial = (rNum: number) => {
    const cfg = DIFF[difficulty];
    const isStop = Math.random() < cfg.stopProb;
    setTrialIsStop(isStop);
    setSignal('idle');
    setFeedback(null);
    respondedRef.current = false;

    const fixDelay = 700 + Math.random() * 700;
    goTimerRef.current = setTimeout(() => {
      setSignal('go');
      goAtRef.current = Date.now();
      // schedule stop signal if applicable
      if (isStop) {
        stopTimerRef.current = setTimeout(() => {
          if (!respondedRef.current) setSignal('stop');
        }, cfg.ssd);
      }
      // end trial window
      endTimerRef.current = setTimeout(() => {
        if (respondedRef.current) return;
        // No press — Go = miss; Stop = correct inhibition
        endTrial(isStop ? 'stop_ok' : 'go_miss', 0, rNum);
      }, cfg.goWindow);
    }, fixDelay);
  };

  const endTrial = (outcome: 'go_hit' | 'go_miss' | 'stop_ok' | 'stop_fail', rt: number, rNum: number) => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    let newHits = hits, newErrors = errors, newStops = correctStops;
    let newRts = rts;
    let fb: 'right' | 'wrong' = 'right';
    if (outcome === 'go_hit')  { newHits = hits + 1; newRts = [...rts, rt]; fb = 'right'; }
    if (outcome === 'go_miss') { newErrors = errors + 1; fb = 'wrong'; }
    if (outcome === 'stop_ok') { newStops = correctStops + 1; fb = 'right'; }
    if (outcome === 'stop_fail'){ newErrors = errors + 1; fb = 'wrong'; }
    setHits(newHits); setErrors(newErrors); setCorrectStops(newStops); setRts(newRts);
    setSignal('feedback'); setFeedback(fb);
    interTimerRef.current = setTimeout(() => {
      if (rNum >= trials) finish(newHits, newErrors, newStops, newRts);
      else { setRound((r) => r + 1); nextTrial(rNum + 1); }
    }, 600);
  };

  const onPressGo = () => {
    if (respondedRef.current) return;
    if (signal !== 'go' && signal !== 'stop') return;
    respondedRef.current = true;
    const rt = Date.now() - goAtRef.current;
    if (signal === 'stop' || trialIsStop) endTrial('stop_fail', rt, round);
    else endTrial('go_hit', rt, round);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="hand-left" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('stopSignal')}</Text>
        <Text style={styles.configDesc}>{t('stopSignalDesc')}</Text>
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
    </View>
  );

  const stimColor =
    feedback === 'right' ? '#22c55e' :
    feedback === 'wrong' ? '#f43f5e' :
    signal === 'go' ? '#22c55e' :
    signal === 'stop' ? '#f43f5e' :
    '#444';

  const stimLabel =
    signal === 'go' ? t('goBtn') :
    signal === 'stop' ? '✋' :
    feedback ? (feedback === 'right' ? '✓' : '✗') :
    '•';

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#3b82f6' }]}>✋{correctStops}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('stopHint')}</Text>
      <View style={[styles.stimulusBox, { backgroundColor: stimColor + '33', borderColor: stimColor }]}>
        <Text style={[styles.stimText, { color: stimColor }]}>{stimLabel}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={onPressGo}
        style={styles.goBtnWrap}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.goBtn}>
          <Text style={styles.goBtnText}>{t('goBtn')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearTimers(); router.back(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('stopSignal')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="stopSignal" icon="hand-left" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="stopSignalIntroDesc"
          benefits={STOP_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 50 + correctStops * 100 - errors * 60 - meanRt * 0.1))}
          time={meanRt / 1000} errors={errors}
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
  playArea: { flex: 1, padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  stimulusBox: { width: 200, height: 200, borderRadius: 24, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontSize: 56, fontWeight: '900' },
  goBtnWrap: { borderRadius: 60, overflow: 'hidden', marginTop: 12 },
  goBtn: { paddingVertical: 22, paddingHorizontal: 80, alignItems: 'center', borderRadius: 60 },
  goBtnText: { color: '#FFF', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
});
