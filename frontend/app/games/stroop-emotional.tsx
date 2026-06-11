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

const GRADIENT = ['#8E2DE2', '#4A00E0'];
const STROOP2_BENEFITS = [
  { icon: 'heart-dislike-outline', textKey: 'benefitStroop2_1' },
  { icon: 'eye-outline',           textKey: 'benefitStroop2_2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitStroop2_3' },
];

// Emotional Stroop (Williams, Mathews, MacLeod 1996):
// Subject names INK COLOR of words. Words have valence: threat / positive / neutral.
// Threat words slow color naming → emotional interference.

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Valence = 'threat' | 'positive' | 'neutral';

const COLORS_RGB = ['red', 'green', 'blue', 'yellow'];
const COLOR_HEX: Record<string, string> = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#eab308' };

interface WordSet { ru: string[]; en: string[]; }
const WORDS: Record<Valence, WordSet> = {
  threat: {
    ru: ['смерть','боль','опасность','страх','удар','война','рана','кровь','авария','угроза','ужас','паника'],
    en: ['death','pain','danger','fear','attack','war','wound','blood','crash','threat','horror','panic'],
  },
  positive: {
    ru: ['радость','любовь','счастье','смех','подарок','успех','солнце','музыка','семья','дружба','улыбка','победа'],
    en: ['joy','love','happy','laugh','gift','success','sun','music','family','friend','smile','victory'],
  },
  neutral: {
    ru: ['стол','окно','книга','стена','доска','чашка','стул','лампа','полка','дверь','коробка','зонт'],
    en: ['table','window','book','wall','board','cup','chair','lamp','shelf','door','box','umbrella'],
  },
};

interface Trial { word: string; valence: Valence; color: string; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function makeTrial(lang: 'ru' | 'en'): Trial {
  // balanced distribution: 1/3 threat, 1/3 positive, 1/3 neutral (per Williams et al. mixed)
  const valence = rndItem<Valence>(['threat','positive','neutral']);
  const word = rndItem(WORDS[valence][lang]);
  const color = rndItem(COLORS_RGB);
  return { word, valence, color };
}

export default function StroopEmotionalGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(24);

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ word: '', valence: 'neutral', color: 'red' });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByValence, setRtsByValence] = useState<Record<Valence, number[]>>({ threat: [], positive: [], neutral: [] });
  const [startTime, setStartTime] = useState(0);

  const stimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    [stimTimer, fbTimer].forEach(r => { if (r.current) clearTimeout(r.current); });
  }, []);

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    const tr = makeTrial(language);
    setTrial(tr);
    stimTimer.current = setTimeout(() => {
      setStimAt(Date.now());
      setShowStim(true);
    }, 500 + Math.random() * 400);
  };

  const startGame = () => {
    setHits(0); setErrors(0); setRtsByValence({ threat: [], positive: [], neutral: [] }); setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    newTrial();
  };

  const finish = async (h: number, e: number, allRts: Record<Valence, number[]>) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const meanV = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const tMean = meanV(allRts.threat), pMean = meanV(allRts.positive), nMean = meanV(allRts.neutral);
    const interferenceThreat = Math.round(tMean - nMean);
    const interferencePositive = Math.round(pMean - nMean);
    const flatten = [...allRts.threat, ...allRts.positive, ...allRts.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    setPhase('result');
    try {
      await saveSession({
        game_type: 'stroop_emotional',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: 'medium',
        mode: `${trials}t`,
        errors: e,
        details: {
          mean_rt: Math.round(meanRt),
          interference_threat_ms: interferenceThreat,
          interference_positive_ms: interferencePositive,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (color: string) => {
    if (!showStim || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const ok = color === trial.color;
    let nh = hits, ne = errors, nr = rtsByValence;
    if (ok) { nh = hits + 1; nr = { ...rtsByValence, [trial.valence]: [...rtsByValence[trial.valence], rt] }; }
    else ne = errors + 1;
    setHits(nh); setErrors(ne); setRtsByValence(nr);
    setFeedback(ok ? 'right' : 'wrong');
    fbTimer.current = setTimeout(() => {
      if (round >= trials) finish(nh, ne, nr);
      else { setRound(r => r + 1); newTrial(); }
    }, 350);
  };

  const meanV = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const interfThreat = meanV(rtsByValence.threat) && meanV(rtsByValence.neutral)
    ? meanV(rtsByValence.threat) - meanV(rtsByValence.neutral) : 0;
  const meanRtAll = (() => {
    const all = [...rtsByValence.threat, ...rtsByValence.positive, ...rtsByValence.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="heart-dislike" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('stroopEmotional')}</Text>
        <Text style={styles.configDesc}>{t('stroopEmotionalDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[12, 24, 36].map((n) => (
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRtAll}{language === 'ru' ? 'мс' : 'ms'}</Text>
        <Text style={[styles.statText, { color: '#ef4444' }]}>IT {interfThreat}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('stroop2Hint')}</Text>
      <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
        {showStim ? (
          <Text style={{ color: COLOR_HEX[trial.color], fontSize: 44, fontWeight: '900', letterSpacing: 2 }}>
            {trial.word}
          </Text>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 36 }}>+</Text>
        )}
      </View>
      <View style={styles.choiceGrid}>
        {COLORS_RGB.map((c) => (
          <TouchableOpacity key={c} style={[styles.colorBtn, { backgroundColor: COLOR_HEX[c] }]} onPress={() => handleAnswer(c)}>
            <Text style={styles.colorBtnText}>{t('color_'+c)}</Text>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('stroopEmotional')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="stroopEmotional" icon="heart-dislike" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="stroopEmotionalIntroDesc"
          benefits={STROOP2_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
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
  playArea: { flex: 1, padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  stimBox: { width: 320, height: 130, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  choiceGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 360 },
  colorBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  colorBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
