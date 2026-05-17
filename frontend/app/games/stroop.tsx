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

const GRADIENT = ['#fc466b', '#3f5efb'];
const STROOP_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitStroop1' },
  { icon: 'shuffle-outline', textKey: 'benefitStroop2' },
  { icon: 'bulb-outline', textKey: 'benefitStroop3' },
];

const COLORS_DEF = [
  { name: 'red', ru: 'КРАСНЫЙ', en: 'RED', hex: '#ef4444' },
  { name: 'blue', ru: 'СИНИЙ', en: 'BLUE', hex: '#3b82f6' },
  { name: 'green', ru: 'ЗЕЛЁНЫЙ', en: 'GREEN', hex: '#22c55e' },
  { name: 'yellow', ru: 'ЖЁЛТЫЙ', en: 'YELLOW', hex: '#eab308' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Mode = 'word' | 'ink';

export default function StroopGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<Mode>('ink');
  const [trials] = useState(20);
  const [round, setRound] = useState(0);
  const [word, setWord] = useState(COLORS_DEF[0]);
  const [inkColor, setInkColor] = useState(COLORS_DEF[1]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [trialStartTime, setTrialStartTime] = useState(0);
  const [rtsCongruent, setRtsCongruent] = useState<number[]>([]);
  const [rtsIncongruent, setRtsIncongruent] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const nextRound = () => {
    const w = COLORS_DEF[Math.floor(Math.random() * 4)];
    let c;
    if (Math.random() < 0.7) {
      do { c = COLORS_DEF[Math.floor(Math.random() * 4)]; } while (c.name === w.name);
    } else {
      c = w;
    }
    setWord(w); setInkColor(c);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRound(1);
    setRtsCongruent([]); setRtsIncongruent([]);
    nextRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    setTrialStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleAnswer = async (chosen: typeof COLORS_DEF[0]) => {
    const correct = mode === 'ink' ? inkColor.name : word.name;
    const isCongruent = inkColor.name === word.name;
    const rt = Date.now() - trialStartTime;
    const isCorrect = chosen.name === correct;

    if (isCorrect) {
      setHits((h) => h + 1);
      // record RT only on correct trials (standard psychometric convention)
      if (isCongruent) setRtsCongruent((arr) => [...arr, rt]);
      else setRtsIncongruent((arr) => [...arr, rt]);
    } else setErrors((e) => e + 1);

    if (round >= trials) {
      if (timerRef.current) clearInterval(timerRef.current);
      const finalTime = (Date.now() - startTime) / 1000;
      setElapsedTime(finalTime);
      setPhase('result');
      // compute final means including this last trial
      const finalRtsCongr = isCorrect && isCongruent ? [...rtsCongruent, rt] : rtsCongruent;
      const finalRtsIncongr = isCorrect && !isCongruent ? [...rtsIncongruent, rt] : rtsIncongruent;
      const meanCongr = finalRtsCongr.length ? Math.round(finalRtsCongr.reduce((a,b)=>a+b,0) / finalRtsCongr.length) : 0;
      const meanIncongr = finalRtsIncongr.length ? Math.round(finalRtsIncongr.reduce((a,b)=>a+b,0) / finalRtsIncongr.length) : 0;
      const interferenceMs = meanCongr && meanIncongr ? meanIncongr - meanCongr : 0;
      try {
        await saveSession({
          game_type: 'stroop',
          score: hits + (isCorrect ? 1 : 0),
          time_seconds: finalTime,
          difficulty: mode,
          mode: `${trials}t`,
          errors: errors + (isCorrect ? 0 : 1),
          details: {
            hits: hits + (isCorrect ? 1 : 0),
            errors: errors + (isCorrect ? 0 : 1),
            mean_rt_congruent: meanCongr,
            mean_rt_incongruent: meanIncongr,
            interference_ms: interferenceMs,
          },
        });
      } catch (e) { console.error(e); }
    } else {
      setRound((r) => r + 1);
      setTrialStartTime(Date.now());
      nextRound();
    }
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="eye" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('stroop')}</Text>
        <Text style={styles.configDesc}>{t('stroopDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('stroopModeLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['ink', 'word'] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeButton,
                mode === m
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>
                {m === 'ink' ? t('stroopByInk') : t('stroopByWord')}
              </Text>
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <View style={styles.wordArea}>
        <Text style={[styles.bigWord, { color: inkColor.hex }]}>
          {language === 'ru' ? word.ru : word.en}
        </Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {mode === 'ink' ? t('stroopHintInk') : t('stroopHintWord')}
      </Text>
      <View style={styles.answersGrid}>
        {COLORS_DEF.map((c) => (
          <TouchableOpacity
            key={c.name}
            style={[styles.answerBtn, { backgroundColor: c.hex }]}
            onPress={() => handleAnswer(c)}
          >
            <Text style={styles.answerText}>{language === 'ru' ? c.ru : c.en}</Text>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('stroop')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="stroop"
          icon="eye"
          gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition"
          descriptionKey="stroopIntroDesc"
          benefits={STROOP_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => router.back()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult score={hits} time={elapsedTime} errors={errors}
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
  playArea: { flex: 1, padding: 20, gap: 20, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  wordArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bigWord: { fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  answersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 360 },
  answerBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 10, minWidth: 140, alignItems: 'center' },
  answerText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
