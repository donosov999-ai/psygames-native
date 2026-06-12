import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
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

const GRADIENT = ['#7873f5', '#ff6ec4'];
const SW_BENEFITS = [
  { icon: 'swap-horizontal-outline', textKey: 'benefitSw1' },
  { icon: 'speedometer-outline',     textKey: 'benefitSw2' },
  { icon: 'shuffle-outline',         textKey: 'benefitSw3' },
];

// Stimulus = digit + letter pair, e.g. "3A". Cue tells which task:
// NUMBER: is the digit odd (left) or even (right)?
// LETTER: is the letter a vowel (left) or consonant (right)?
type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type CueTask = 'NUMBER' | 'LETTER';

const DIGITS = ['2','3','4','5','6','7','8','9'];
const LETTERS = ['A','E','I','U','B','D','F','G','K','M','N','P','R','S','T'];
const VOWELS = new Set(['A','E','I','U']);

interface Trial { stim: string; task: CueTask; correctLeft: boolean; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function isOdd(d: string): boolean { return parseInt(d, 10) % 2 === 1; }
function isVowel(l: string): boolean { return VOWELS.has(l); }

export default function SwitchingTaskGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // v1.29.3 (мобайл): стимул-бокс был фикс 200×200 — теперь во всю ширину, кнопки тоже
  const { width } = useWindowDimensions();
  const stStim = Math.min(width - 36, 320);
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 20));

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ stim: '', task: 'NUMBER', correctLeft: true });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [switchRts, setSwitchRts] = useState<number[]>([]); // RT only on switch trials
  const [startTime, setStartTime] = useState(0);

  const lastTaskRef = useRef<CueTask | null>(null);
  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (stimTimerRef.current) clearTimeout(stimTimerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const switchProb = (d: Difficulty) => d === 'easy' ? 0.30 : d === 'medium' ? 0.50 : 0.70;

  const makeTrial = (): Trial => {
    let task: CueTask;
    if (lastTaskRef.current === null) task = Math.random() < 0.5 ? 'NUMBER' : 'LETTER';
    else if (Math.random() < switchProb(difficulty)) task = lastTaskRef.current === 'NUMBER' ? 'LETTER' : 'NUMBER';
    else task = lastTaskRef.current;
    const digit = rndItem(DIGITS);
    const letter = rndItem(LETTERS);
    const stim = digit + letter;
    const correctLeft = task === 'NUMBER' ? isOdd(digit) : isVowel(letter);
    return { stim, task, correctLeft };
  };

  const newTrial = () => {
    setShowStim(false);
    setFeedback(null);
    const tr = makeTrial();
    setTrial(tr);
    stimTimerRef.current = setTimeout(() => {
      setShowStim(true);
      setStimAt(Date.now());
    }, 500);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRts([]); setSwitchRts([]); setRound(1);
    lastTaskRef.current = null;
    setPhase('playing');
    setStartTime(Date.now());
    newTrial();
  };

  const finish = async (h: number, e: number, allRts: number[], swRts: number[]) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const meanRt = allRts.length ? allRts.reduce((a, b) => a + b, 0) / allRts.length : 0;
    const swMean = swRts.length ? swRts.reduce((a, b) => a + b, 0) / swRts.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'switching_task',
        score: Math.max(0, Math.round(h * 80 - e * 50 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty,
        mode: `${trials}t`,
        errors: e,
        details: { mean_rt: Math.round(meanRt), switch_cost_ms: Math.round(swMean - meanRt) },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (left: boolean) => {
    if (!showStim || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const ok = left === trial.correctLeft;
    const isSwitch = lastTaskRef.current !== null && lastTaskRef.current !== trial.task;
    let nextHits = hits, nextErrors = errors, nextRts = rts, nextSwRts = switchRts;
    if (ok) {
      nextHits = hits + 1;
      nextRts = [...rts, rt];
      if (isSwitch) nextSwRts = [...switchRts, rt];
    } else {
      nextErrors = errors + 1;
    }
    setHits(nextHits); setErrors(nextErrors); setRts(nextRts); setSwitchRts(nextSwRts);
    setFeedback(ok ? 'right' : 'wrong');
    lastTaskRef.current = trial.task;
    fbTimerRef.current = setTimeout(() => {
      if (round >= trials) finish(nextHits, nextErrors, nextRts, nextSwRts);
      else { setRound(r => r + 1); newTrial(); }
    }, 350);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
  const isSwitchTrial = lastTaskRef.current !== null && lastTaskRef.current !== trial.task;

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="swap-horizontal" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('switchingTask')}</Text>
        <Text style={styles.configDesc}>{t('switchingTaskDesc')}</Text>
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

  const cueColor = trial.task === 'NUMBER' ? '#3b82f6' : '#f59e0b';
  const leftLabel = trial.task === 'NUMBER' ? t('odd') : t('vowel');
  const rightLabel = trial.task === 'NUMBER' ? t('even') : t('consonant');

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
      </View>
      <View style={[styles.cueBadge, { backgroundColor: cueColor }]}>
        <Ionicons name={trial.task === 'NUMBER' ? 'calculator' : 'text'} size={16} color="#FFF" />
        <Text style={styles.cueText}>
          {trial.task === 'NUMBER' ? t('taskNumber') : t('taskLetter')}
          {isSwitchTrial && showStim && '  ↻'}
        </Text>
      </View>
      <View style={[styles.stimBox, {
        width: stStim, height: stStim,
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border,
      }]}>
        <Text style={[styles.stimText, { color: colors.text, fontSize: stStim * 0.4 }]}>{showStim ? trial.stim : '•'}</Text>
      </View>
      <View style={[styles.choiceRow, { width: stStim }]}>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0], flex: 1 }]} onPress={() => handleAnswer(true)}>
          <Text style={styles.choiceTextSmall}>← {leftLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1], flex: 1 }]} onPress={() => handleAnswer(false)}>
          <Text style={styles.choiceTextSmall}>{rightLabel} →</Text>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('switchingTask')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="switchingTask" icon="swap-horizontal" gradient={GRADIENT as [string, string]}
          skillKey="skillSwitching" descriptionKey="switchingTaskIntroDesc"
          benefits={SW_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 50 - meanRt * 0.05))}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  cueBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  cueText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stimBox: { borderRadius: 24, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontWeight: '900' },
  choiceRow: { flexDirection: 'row', gap: 16 },
  choiceBtn: { paddingVertical: 16, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center' },
  choiceTextSmall: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
