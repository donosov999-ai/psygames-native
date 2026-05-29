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

const GRADIENT = ['#fdc830', '#f37335'];
const CHOICE_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitChoiceRt1' },
  { icon: 'crosshairs', textKey: 'benefitChoiceRt2' },
  { icon: 'hand-right-outline', textKey: 'benefitChoiceRt3' },
];

type Direction = 'left' | 'right' | 'up' | 'down';
const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down'];
const ARROW_ICON: Record<Direction, string> = {
  left: 'arrow-back', right: 'arrow-forward', up: 'arrow-up', down: 'arrow-down',
};

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Mode = '2dir' | '4dir';

export default function ChoiceRtGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<Mode>('4dir');
  const [trials, setTrials] = useState(20);

  const [round, setRound] = useState(0);
  const [stim, setStim] = useState<Direction>('left');
  const [stimAt, setStimAt] = useState<number>(0);
  const [showStim, setShowStim] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [startTime, setStartTime] = useState(0);

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (stimTimerRef.current) clearTimeout(stimTimerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const dirsForMode = (m: Mode): Direction[] => m === '2dir' ? ['left', 'right'] : DIRECTIONS;

  const newTrial = (rNum: number) => {
    setShowStim(false);
    setFeedback(null);
    const dirs = dirsForMode(mode);
    const next = dirs[Math.floor(Math.random() * dirs.length)];
    const delay = 600 + Math.random() * 1200;
    stimTimerRef.current = setTimeout(() => {
      setStim(next);
      setStimAt(Date.now());
      setShowStim(true);
    }, delay);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRts([]); setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    newTrial(1);
  };

  const finish = async (finalHits: number, finalErrors: number, finalRts: number[]) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const meanRt = finalRts.length ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'choice_rt',
        score: Math.max(0, Math.round(finalHits * 100 - finalErrors * 50 - meanRt * 0.1)),
        time_seconds: totalTime,
        difficulty: mode === '2dir' ? 'easy' : 'medium',
        mode: `${trials}t-${mode}`,
        errors: finalErrors,
        details: { mean_rt: Math.round(meanRt), hits: finalHits },
      });
    } catch (e) { console.error(e); }
  };

  const handlePress = (chosen: Direction) => {
    if (!showStim || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const correct = chosen === stim;
    const nextHits = hits + (correct ? 1 : 0);
    const nextErrors = errors + (correct ? 0 : 1);
    const nextRts = correct ? [...rts, rt] : rts;
    setHits(nextHits);
    setErrors(nextErrors);
    setRts(nextRts);
    setFeedback(correct ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(() => {
      if (round >= trials) finish(nextHits, nextErrors, nextRts);
      else { setRound((r) => r + 1); newTrial(round + 1); }
    }, 350);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
  const dirs = dirsForMode(mode);

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="arrow-forward-circle" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('choiceRt')}</Text>
        <Text style={styles.configDesc}>{t('choiceRtDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
        <View style={styles.optionButtons}>
          {(['2dir', '4dir'] as Mode[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeButton, mode === m
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setMode(m)}>
              <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>
                {m === '2dir' ? '← →' : '← → ↑ ↓'}
              </Text>
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
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}мс</Text>
      </View>
      <View style={[styles.stimulusBox, {
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border,
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
      }]}>
        {showStim ? (
          <Ionicons name={ARROW_ICON[stim] as any} size={120} color={feedback === 'wrong' ? '#f43f5e' : GRADIENT[1]} />
        ) : (
          <Text style={[styles.waitText, { color: colors.textSecondary }]}>•</Text>
        )}
      </View>
      <View style={dirs.length === 4 ? styles.padGrid : styles.padRow}>
        {dirs.length === 4 ? (
          <>
            <View style={styles.padRow}>
              <View style={styles.padCell} />
              <TouchableOpacity style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress('up')}>
                <Ionicons name="arrow-up" size={32} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.padCell} />
            </View>
            <View style={styles.padRow}>
              <TouchableOpacity style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress('left')}>
                <Ionicons name="arrow-back" size={32} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.padCell} />
              <TouchableOpacity style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress('right')}>
                <Ionicons name="arrow-forward" size={32} color="#FFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.padRow}>
              <View style={styles.padCell} />
              <TouchableOpacity style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress('down')}>
                <Ionicons name="arrow-down" size={32} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.padCell} />
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress('left')}>
              <Ionicons name="arrow-back" size={32} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress('right')}>
              <Ionicons name="arrow-forward" size={32} color="#FFF" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('choiceRt')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="choiceRt" icon="arrow-forward-circle" gradient={GRADIENT as [string, string]}
          skillKey="skillReaction" descriptionKey="choiceRtIntroDesc"
          benefits={CHOICE_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 100 - errors * 50 - meanRt * 0.1))}
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
  playArea: { flex: 1, padding: 16, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 15, fontWeight: '700' },
  stimulusBox: { width: 200, height: 200, borderRadius: 24, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  waitText: { fontSize: 60, opacity: 0.5 },
  padGrid: { gap: 8, alignItems: 'center' },
  padRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  padBtn: { width: 64, height: 64, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  padCell: { width: 64, height: 64 },
});
