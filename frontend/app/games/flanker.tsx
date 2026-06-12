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

const GRADIENT = ['#16222a', '#3a6073'];
const FL_BENEFITS = [
  { icon: 'eye-outline',          textKey: 'benefitFl1' },
  { icon: 'flash-outline',        textKey: 'benefitFl2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitFl3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type TrialKind = 'congruent' | 'incongruent' | 'neutral';
type Direction = 'left' | 'right';

interface Trial { center: Direction; kind: TrialKind; flankers: Direction[] | null; }

function makeTrial(diff: Difficulty): Trial {
  const center: Direction = Math.random() < 0.5 ? 'left' : 'right';
  // distribution of trial types depends on difficulty
  const r = Math.random();
  let kind: TrialKind;
  if (diff === 'easy') {
    kind = r < 0.5 ? 'congruent' : r < 0.8 ? 'incongruent' : 'neutral';
  } else if (diff === 'medium') {
    kind = r < 0.4 ? 'congruent' : r < 0.85 ? 'incongruent' : 'neutral';
  } else {
    kind = r < 0.3 ? 'congruent' : r < 0.95 ? 'incongruent' : 'neutral';
  }
  let flankers: Direction[] | null;
  if (kind === 'congruent') flankers = [center, center, center, center];
  else if (kind === 'incongruent') {
    const opp: Direction = center === 'left' ? 'right' : 'left';
    flankers = [opp, opp, opp, opp];
  } else flankers = null;
  return { center, kind, flankers };
}

export default function FlankerGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [trials, setTrials] = useState(() => num('trials', 20));

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ center: 'left', kind: 'congruent', flankers: ['left','left','left','left'] });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByKind, setRtsByKind] = useState<Record<TrialKind, number[]>>({ congruent: [], incongruent: [], neutral: [] });
  const [startTime, setStartTime] = useState(0);

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (stimTimerRef.current) clearTimeout(stimTimerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    setTrial(makeTrial(difficulty));
    stimTimerRef.current = setTimeout(() => {
      setStimAt(Date.now());
      setShowStim(true);
    }, 500 + Math.random() * 600);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRtsByKind({ congruent: [], incongruent: [], neutral: [] }); setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    newTrial();
  };

  const finish = async (h: number, e: number, allRts: Record<TrialKind, number[]>) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const flatten = [...allRts.congruent, ...allRts.incongruent, ...allRts.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    const congMean = allRts.congruent.length ? allRts.congruent.reduce((a, b) => a + b, 0) / allRts.congruent.length : 0;
    const incongMean = allRts.incongruent.length ? allRts.incongruent.reduce((a, b) => a + b, 0) / allRts.incongruent.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'flanker',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty,
        mode: `${trials}t`,
        errors: e,
        details: {
          mean_rt: Math.round(meanRt),
          flanker_effect_ms: Math.round(incongMean - congMean),
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (chosen: Direction) => {
    if (!showStim || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const ok = chosen === trial.center;
    let nextHits = hits, nextErrors = errors, nextRts = rtsByKind;
    if (ok) {
      nextHits = hits + 1;
      nextRts = { ...rtsByKind, [trial.kind]: [...rtsByKind[trial.kind], rt] };
    } else {
      nextErrors = errors + 1;
    }
    setHits(nextHits); setErrors(nextErrors); setRtsByKind(nextRts);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(() => {
      if (round >= trials) finish(nextHits, nextErrors, nextRts);
      else { setRound(r => r + 1); newTrial(); }
    }, 350);
  };

  const meanRtAll = (() => {
    const all = [...rtsByKind.congruent, ...rtsByKind.incongruent, ...rtsByKind.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="flash" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('flanker')}</Text>
        <Text style={styles.configDesc}>{t('flankerDesc')}</Text>
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
          {[10, 20, 30].map((n) => (
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

  const arrowFor = (d: Direction, size: number, color: string) => (
    <Ionicons name={d === 'left' ? 'arrow-back' : 'arrow-forward'} size={size} color={color} />
  );

  const renderPlaying = () => {
    const fbColor =
      feedback === 'right' ? '#22c55e' :
      feedback === 'wrong' ? '#f43f5e' :
      colors.text;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
          <Text style={[styles.statText, { color: colors.text }]}>{meanRtAll}{language === 'ru' ? 'мс' : 'ms'}</Text>
        </View>
        <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback ? fbColor : colors.border, borderWidth: feedback ? 3 : 1 }]}>
          {showStim ? (
            <View style={styles.arrowRow}>
              {trial.flankers
                ? trial.flankers.slice(0, 2).map((d, i) => <View key={`l${i}`}>{arrowFor(d, 36, '#888')}</View>)
                : ['—','—'].map((s, i) => <Text key={`l${i}`} style={{ fontSize: 36, color: '#888' }}>{s}</Text>)
              }
              <View style={{ marginHorizontal: 8 }}>{arrowFor(trial.center, 56, fbColor)}</View>
              {trial.flankers
                ? trial.flankers.slice(2).map((d, i) => <View key={`r${i}`}>{arrowFor(d, 36, '#888')}</View>)
                : ['—','—'].map((s, i) => <Text key={`r${i}`} style={{ fontSize: 36, color: '#888' }}>{s}</Text>)
              }
            </View>
          ) : (
            <Text style={{ fontSize: 36, color: colors.textSecondary }}>•</Text>
          )}
        </View>
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
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('flanker')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="flanker" icon="flash" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="flankerIntroDesc"
          benefits={FL_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 24, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14 },
  statText: { fontSize: 14, fontWeight: '700' },
  stimBox: { width: 360, height: 120, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  choiceRow: { flexDirection: 'row', gap: 24 },
  choiceBtn: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
});
