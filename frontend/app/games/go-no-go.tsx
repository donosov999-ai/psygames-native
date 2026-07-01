import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
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
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#11998e', '#38ef7d'];
const GO_BENEFITS = [
  { icon: 'pause-circle-outline', textKey: 'benefitGoNoGo1' },
  { icon: 'flash-outline', textKey: 'benefitGoNoGo2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitGoNoGo3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

export default function GoNoGoGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(() => num('trials', 30));
  const [round, setRound] = useState(0);
  const [stimulus, setStimulus] = useState<'go' | 'nogo' | null>(null);
  const [stimulusTime, setStimulusTime] = useState(0);
  const [responded, setResponded] = useState(false);
  const [hits, setHits] = useState(0);          // нажал на go
  const [misses, setMisses] = useState(0);      // не нажал на go
  const [falseAlarms, setFalseAlarms] = useState(0); // нажал на nogo
  const [correctRej, setCorrectRej] = useState(0);   // не нажал на nogo
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);   // надёжный старт: useState startTime ловился в stale-замыкании finish → time=Date.now()/1000 (29659410:47)

  useEffect(() => () => { if (showTimerRef.current) clearTimeout(showTimerRef.current); }, []);

  const startGame = () => {
    setHits(0); setMisses(0); setFalseAlarms(0); setCorrectRej(0);
    setReactionTimes([]); setRound(0);
    setPhase('playing');
    startTimeRef.current = Date.now();
    setStartTime(Date.now());
    setTimeout(() => runRound(0, [], 0, 0, 0, 0), 800);
  };

  const runRound = (
    r: number,
    rts: number[],
    h: number, m: number, fa: number, cr: number,
  ) => {
    if (r >= trials) {
      finish(h, m, fa, cr, rts);
      return;
    }
    setRound(r + 1);
    const isGo = Math.random() < 0.7; // 70% Go, 30% NoGo
    const stim: 'go' | 'nogo' = isGo ? 'go' : 'nogo';
    setStimulus(stim);
    setResponded(false);
    const t0 = Date.now();
    setStimulusTime(t0);
    showTimerRef.current = setTimeout(() => {
      // Stimulus window expired
      const window = 1100;
      let nh = h, nm = m, nfa = fa, ncr = cr, nrts = [...rts];
      if (!responded) {
        if (stim === 'go') nm++;
        else ncr++;
      }
      setStimulus(null);
      // Inter-trial interval
      setTimeout(() => runRound(r + 1, nrts, nh, nm, nfa, ncr), 600 + Math.random() * 400);
    }, 1100);
  };

  // We need to handle response by closing over current trial; use refs for live state.
  const handleResponse = () => {
    if (stimulus === null || responded) return;
    setResponded(true);
    const rt = Date.now() - stimulusTime;
    if (stimulus === 'go') {
      setHits((h) => h + 1);
      setReactionTimes((arr) => [...arr, rt]);
    } else {
      setFalseAlarms((f) => f + 1);
    }
  };

  // Re-trigger evaluation on stimulus end via "responded"-aware tick:
  useEffect(() => {
    // When stimulus disappears and trial advances, react logic runs in runRound.
    // We track misses/correctRej in the `runRound` setTimeout above.
    // Patch here: when stimulus changes from non-null to null without responded → count properly.
  }, [stimulus]);

  const finish = async (h: number, m: number, fa: number, cr: number, rts: number[]) => {
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    setHits(h); setMisses(m); setFalseAlarms(fa); setCorrectRej(cr);
    setPhase('result');
    const total = h + m + fa + cr;
    const accuracy = total > 0 ? Math.round(((h + cr) / total) * 100) : 0;
    const avgRT = rts.length ? Math.round(rts.reduce((s, x) => s + x, 0) / rts.length) : 0;
    try {
      await saveSession({
        game_type: 'go_no_go',
        score: h * 10 - fa * 10,
        time_seconds: finalTime,
        difficulty: `${trials} trials`,
        mode: 'classic',
        errors: m + fa,
        details: { hits: h, misses: m, falseAlarms: fa, correctRej: cr, accuracy, avgRT },
      });
    } catch (e) { console.error(e); }
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="pause-circle" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('goNoGo')}</Text>
        <Text style={styles.configDesc}>{t('goNoGoDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[20, 30, 50].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setTrials(n)}>
              <Text style={[styles.modeButtonText, { color: trials === n ? '#FFF' : colors.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={[styles.legendText, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
        🟢 {t('goNoGoGoLabel')}   🔴 {t('goNoGoNoGoLabel')}
      </Text>
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
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits + correctRej}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{misses + falseAlarms}</Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleResponse}
        style={[
          styles.pad,
          {
            backgroundColor: stimulus === 'go' ? '#22c55e' : stimulus === 'nogo' ? '#f43f5e' : colors.surface,
          },
        ]}
      >
        <Text style={[styles.padText, { color: stimulus ? '#FFF' : colors.textSecondary }]}>
          {stimulus === 'go' ? 'GO' : stimulus === 'nogo' ? 'NO' : '•'}
        </Text>
      </TouchableOpacity>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goNoGoHint')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('goNoGo')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="goNoGo" icon="pause-circle" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="goNoGoIntroDesc"
          benefits={GO_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={hits * 10 - falseAlarms * 10} time={elapsedTime} errors={misses + falseAlarms}
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
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  legendText: { fontSize: 14, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 24, gap: 30, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  pad: { width: 240, height: 240, borderRadius: 120, justifyContent: 'center', alignItems: 'center' },
  padText: { fontSize: 60, fontWeight: '900' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
});
