import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';

const GRADIENT = ['#5b86e5', '#36d1dc'];
const N_BACK_BENEFITS = [
  { icon: 'analytics-outline', textKey: 'benefitNback1' },
  { icon: 'school-outline', textKey: 'benefitNback2' },
  { icon: 'rocket-outline', textKey: 'benefitNback3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Modality = 'single' | 'dual';   // single = visual only (legacy); dual = visual + audio (Brain Workshop style)

const AUDIO_LETTERS = ['B', 'D', 'F', 'H', 'K', 'L', 'M', 'Q', 'R', 'T'];   // consonants only — no confusion with positions

function speakLetter(letter: string) {
  if (typeof window === 'undefined') return;
  const synth = (window as any).speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel();
    const utt = new (window as any).SpeechSynthesisUtterance(letter);
    utt.rate = 1.2;
    utt.volume = 0.6;
    synth.speak(utt);
  } catch {}
}

export default function NBackGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  // v1.29.3 (мобайл): сетка 3×3 была фикс 240×240 — мелкая по центру. Теперь тянется
  // на ~80% ширины (потолок 132px/ячейка для планшетов), но не выше доступной высоты.
  const { width, height } = useWindowDimensions();
  const nbGridSide = Math.min(width - 48, height - 360, 420);
  const nbCell = (nbGridSide - 2 * 6) / 3; // 3 ячейки, 2 зазора по 6
  const router = useRouter();

  const gate = useLevelGate('n_back');
  const lvl = usePersistentLevel('n_back');   // персист-уровень = N (1-back=L1, 2-back=L2…)
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [nLevel, setNLevel] = useState(() => num('nLevel', 1));
  const [trials, setTrials] = useState(() => num('trials', 20));
  const [modality, setModality] = useState<Modality>(() => (str('modality', 'single') as Modality));
  const [history, setHistory] = useState<number[]>([]);
  const [audioHistory, setAudioHistory] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [activeLetter, setActiveLetter] = useState<string>('');
  const [showWindow, setShowWindow] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  // Visual stream stats
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [correctRejections, setCorrectRejections] = useState(0);
  // Audio stream stats (only used in dual mode)
  const [aHits, setAHits] = useState(0);
  const [aMisses, setAMisses] = useState(0);
  const [aFalseAlarms, setAFalseAlarms] = useState(0);
  const [aCorrectRejections, setACorrectRejections] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const trialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answeredRef = useRef(false);
  const aAnsweredRef = useRef(false);
  // Зеркало счётчиков в реф: finishGame вызывается из таймера runTrial и читал бы их из
  // устаревшего замыкания → сохранённые d'/accuracy/score недосчитывали последние пробы.
  const statsRef = useRef({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0, aHits: 0, aMisses: 0, aFalseAlarms: 0, aCorrectRejections: 0 });

  useEffect(() => {
    return () => {
      if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
    };
  }, []);

  const startGame = () => {
    if (!isPreset) setNLevel((cur) => Math.min(5, Math.max(cur, lvl.level)));   // N от уровня (флор); таймер 600мс ниже даёт стейту примениться
    setHits(0); setMisses(0); setFalseAlarms(0); setCorrectRejections(0);
    setAHits(0); setAMisses(0); setAFalseAlarms(0); setACorrectRejections(0);
    statsRef.current = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0, aHits: 0, aMisses: 0, aFalseAlarms: 0, aCorrectRejections: 0 };
    setHistory([]); setAudioHistory([]); setCurrentIdx(-1); setActiveCell(null); setActiveLetter('');
    setPhase('playing');
    setStartTime(Date.now());
    setTimeout(() => runTrial([], [], -1), 600);
  };

  const runTrial = (vHist: number[], aHist: string[], idx: number) => {
    const newIdx = idx + 1;
    if (newIdx >= trials) {
      finishGame(vHist, aHist);
      return;
    }
    const canMatch = newIdx >= nLevel;
    // Visual stimulus: 30% match
    let vStim: number;
    if (canMatch && Math.random() < 0.3) {
      vStim = vHist[newIdx - nLevel];
    } else {
      do { vStim = Math.floor(Math.random() * 9); }
      while (canMatch && vStim === vHist[newIdx - nLevel] && Math.random() < 0.5);
    }
    // Audio stimulus (only in dual mode): also ~30% match
    let aStim = '';
    if (modality === 'dual') {
      if (canMatch && Math.random() < 0.3) {
        aStim = aHist[newIdx - nLevel];
      } else {
        do { aStim = AUDIO_LETTERS[Math.floor(Math.random() * AUDIO_LETTERS.length)]; }
        while (canMatch && aStim === aHist[newIdx - nLevel] && Math.random() < 0.5);
      }
    }
    const newVHist = [...vHist, vStim];
    const newAHist = [...aHist, aStim];
    setHistory(newVHist);
    setAudioHistory(newAHist);
    setCurrentIdx(newIdx);
    setActiveCell(vStim);
    setActiveLetter(aStim);
    setShowWindow(true);
    answeredRef.current = false;
    aAnsweredRef.current = false;
    setWaitingResponse(canMatch);
    setElapsedTime((Date.now() - startTime) / 1000);

    // Speak the audio letter (web only — falls through silently on native)
    if (modality === 'dual' && aStim) speakLetter(aStim);

    // 700ms show, 1800ms response window
    trialTimerRef.current = setTimeout(() => {
      setActiveCell(null);
      setShowWindow(false);
      trialTimerRef.current = setTimeout(() => {
        // Auto-evaluate non-response
        if (canMatch) {
          if (!answeredRef.current) {
            const isMatch = vStim === vHist[newIdx - nLevel];
            if (isMatch) { statsRef.current.misses++; setMisses((m) => m + 1); }
            else { statsRef.current.correctRejections++; setCorrectRejections((c) => c + 1); }
          }
          if (modality === 'dual' && !aAnsweredRef.current) {
            const isMatch = aStim === aHist[newIdx - nLevel];
            if (isMatch) { statsRef.current.aMisses++; setAMisses((m) => m + 1); }
            else { statsRef.current.aCorrectRejections++; setACorrectRejections((c) => c + 1); }
          }
        }
        runTrial(newVHist, newAHist, newIdx);
      }, 1100);
    }, 700);
  };

  const handleMatchPress = () => {
    if (!waitingResponse || answeredRef.current) return;
    answeredRef.current = true;
    const stimulus = history[currentIdx];
    const target = history[currentIdx - nLevel];
    if (stimulus === target) { statsRef.current.hits++; setHits((h) => h + 1); }
    else { statsRef.current.falseAlarms++; setFalseAlarms((f) => f + 1); }
  };

  const handleAudioMatchPress = () => {
    if (!waitingResponse || aAnsweredRef.current) return;
    aAnsweredRef.current = true;
    const stimulus = audioHistory[currentIdx];
    const target = audioHistory[currentIdx - nLevel];
    if (stimulus === target) { statsRef.current.aHits++; setAHits((h) => h + 1); }
    else { statsRef.current.aFalseAlarms++; setAFalseAlarms((f) => f + 1); }
  };

  const finishGame = async (vHist: number[], aHist: string[]) => {
    if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
    // Финальные счётчики берём из рефа, не из устаревшего замыкания таймера (иначе d'/accuracy кривые).
    const { hits, misses, falseAlarms, correctRejections, aHits, aMisses, aFalseAlarms, aCorrectRejections } = statsRef.current;
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    const totalAnswered = hits + misses + falseAlarms + correctRejections;
    const accuracy = totalAnswered > 0 ? Math.round(((hits + correctRejections) / totalAnswered) * 100) : 0;
    if (!isPreset && accuracy >= 80) lvl.reach(nLevel + 1);   // ≥80% на N-back → уровень = N+1 (растём)
    // Signal Detection Theory: d' = z(hit_rate) - z(false_alarm_rate)
    // Hit rate = hits / (hits + misses); False alarm rate = falseAlarms / (falseAlarms + correctRejections)
    // Apply log-linear correction to avoid infinity (Snodgrass & Corwin 1988): add 0.5 to numerator, 1 to denominator
    const hitTrials = hits + misses;
    const faTrials = falseAlarms + correctRejections;
    const hitRate = hitTrials > 0 ? (hits + 0.5) / (hitTrials + 1) : 0.5;
    const faRate = faTrials > 0 ? (falseAlarms + 0.5) / (faTrials + 1) : 0.5;
    // Inverse normal CDF approximation (Beasley-Springer-Moro)
    const zScore = (p: number): number => {
      // simple approximation good enough for d-prime: rational approximation
      const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
      const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
      const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
      const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
      const pLow = 0.02425, pHigh = 1 - pLow;
      let q, r;
      if (p < pLow) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
      if (p <= pHigh) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    };
    const dPrime = Number((zScore(hitRate) - zScore(faRate)).toFixed(2));

    // Audio stream metrics (only meaningful in dual mode)
    const aHitTrials = aHits + aMisses;
    const aFaTrials = aFalseAlarms + aCorrectRejections;
    const aHitRate = aHitTrials > 0 ? (aHits + 0.5) / (aHitTrials + 1) : 0.5;
    const aFaRate = aFaTrials > 0 ? (aFalseAlarms + 0.5) / (aFaTrials + 1) : 0.5;
    const aDPrime = modality === 'dual' ? Number((zScore(aHitRate) - zScore(aFaRate)).toFixed(2)) : null;

    try {
      await saveSession({
        game_type: 'n_back',
        score: hits * 10 - falseAlarms * 5 + (modality === 'dual' ? aHits * 10 - aFalseAlarms * 5 : 0),
        time_seconds: finalTime,
        difficulty: `${nLevel}-back`,
        mode: `${trials}t-${modality}`,
        errors: misses + falseAlarms + (modality === 'dual' ? aMisses + aFalseAlarms : 0),
        details: {
          hits, misses, falseAlarms, correctRejections, accuracy,
          d_prime: dPrime,
          hit_rate: Number(hitRate.toFixed(3)),
          false_alarm_rate: Number(faRate.toFixed(3)),
          modality,
          ...(modality === 'dual' ? {
            audio_hits: aHits,
            audio_misses: aMisses,
            audio_falseAlarms: aFalseAlarms,
            audio_correctRejections: aCorrectRejections,
            audio_d_prime: aDPrime,
          } : {}),
        },
      });
    } catch (e) { console.error(e); }
  };

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="analytics" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('nBack')}</Text>
        <Text style={styles.configDesc}>{t('nBackDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('nLevelLabel')}</Text>
        <View style={styles.optionButtons}>
          {[1, 2, 3, 4].map((n) => {
            const locked = gate.isLocked(`${n}-back`);
            return (
            <TouchableOpacity
              key={n}
              disabled={locked}
              style={[
                styles.modeButton,
                nLevel === n && !locked
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 },
              ]}
              onPress={() => !locked && setNLevel(n)}
            >
              <Text style={[styles.modeButtonText, { color: nLevel === n && !locked ? '#FFF' : colors.text }]}>
                {n}-back{locked ? ' 🔒' : ''}
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
        <Text style={[styles.optionLabel, { color: colors.text }]}>Modality</Text>
        <View style={styles.optionButtons}>
          {(['single', 'dual'] as Modality[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeButton, modality === m
              ? { backgroundColor: GRADIENT[0] }
              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setModality(m)}>
              <Text style={[styles.modeButtonText, { color: modality === m ? '#FFF' : colors.text }]}>
                {m === 'single' ? '👁 Visual' : '👁 + 🔊 Dual'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[15, 20, 30].map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.modeButton,
                trials === n
                  ? { backgroundColor: GRADIENT[0] }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setTrials(n)}
            >
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
        <Text style={[styles.statText, { color: colors.text }]}>{nLevel}-back · {currentIdx + 1}/{trials}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: colors.error || '#f43f5e' }]}>✗{misses + falseAlarms}</Text>
      </View>
      <View style={styles.gridArea}>
        <View style={[styles.grid3x3, { width: nbGridSide, height: nbGridSide }]}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.gridCell,
                {
                  width: nbCell,
                  height: nbCell,
                  backgroundColor: activeCell === i && showWindow ? GRADIENT[0] : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            />
          ))}
        </View>
      </View>
      {/* In dual mode show the current letter visually too (for users without audio) */}
      {modality === 'dual' && showWindow && activeLetter && (
        <View style={[styles.letterDisplay, { backgroundColor: GRADIENT[1] }]}>
          <Text style={styles.letterText}>{activeLetter}</Text>
        </View>
      )}
      <View style={modality === 'dual' ? styles.dualBtnRow : undefined}>
        <TouchableOpacity
          disabled={!waitingResponse || answeredRef.current}
          onPress={handleMatchPress}
          style={[
            styles.matchButton,
            modality === 'dual' && { flex: 1, marginRight: 8 },
            {
              backgroundColor: !waitingResponse ? colors.surface : answeredRef.current ? '#6b7280' : GRADIENT[1],
            },
          ]}
        >
          <Text style={styles.matchBtnText}>
            {waitingResponse ? (modality === 'dual' ? '👁 Position' : t('match')) : t('warmup')}
          </Text>
        </TouchableOpacity>
        {modality === 'dual' && (
          <TouchableOpacity
            disabled={!waitingResponse || aAnsweredRef.current}
            onPress={handleAudioMatchPress}
            style={[
              styles.matchButton,
              { flex: 1, marginLeft: 8, backgroundColor: !waitingResponse ? colors.surface : aAnsweredRef.current ? '#6b7280' : GRADIENT[0] },
            ]}
          >
            <Text style={styles.matchBtnText}>
              {waitingResponse ? '🔊 Sound' : t('warmup')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {modality === 'dual'
          ? (language === 'ru'
              ? `Жми Position если позиция повторяет ${nLevel} назад. Жми Sound если буква повторяет ${nLevel} назад. Можно жать оба`
              : `Tap Position if the position repeats ${nLevel} back. Tap Sound if the letter repeats ${nLevel} back. You can tap both`)
          : t('nBackHint')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('nBack')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro
          nameKey="nBack"
          icon="analytics"
          gradient={GRADIENT as [string, string]}
          skillKey="skillWorkingMemory"
          descriptionKey="nBackIntroDesc"
          benefits={N_BACK_BENEFITS}
          onStart={() => setPhase('config')}
          onBack={() => goBackOrHome()}
        />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={hits * 10 - falseAlarms * 5}
          time={elapsedTime}
          errors={misses + falseAlarms}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', gap: 6, alignItems: 'center' },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 20, gap: 24, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  gridArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid3x3: { width: 240, height: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridCell: { width: 76, height: 76, borderRadius: 8, borderWidth: 1 },
  matchButton: { paddingVertical: 18, paddingHorizontal: 60, borderRadius: 12, alignItems: 'center' },
  matchBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  dualBtnRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%', maxWidth: 380 },
  letterDisplay: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  letterText: { color: '#FFF', fontSize: 38, fontWeight: '900' },
  hintText: { fontSize: 12, textAlign: 'center' },
});
