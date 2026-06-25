/**
 * CPT — Continuous Performance Test (Conners Not-X variant)
 *
 * Парадигма: каждые 1-2 секунды появляется буква. Subject должен ТАПНУТЬ на
 * любую букву КРОМЕ X (X = non-target — надо подавить ответ). 80% targets, 20% X.
 *
 * Биомаркеры (классика ADHD-диагностики, Conners CPT-3):
 *   - omission_errors    — пропущенные targets (внимание упало)
 *   - commission_errors  — реакции на X (impulse control failure)
 *   - mean_rt            — средняя RT на correct hits
 *   - rt_variability     — CV-RT = std/mean (один из самых валидных ADHD-маркеров)
 *   - vigilance_decrement — slope RT по квартилям сессии (мс/quartile, чем выше = внимание падает)
 *
 * Длительность 4/8/12 мин — достаточно чтобы поймать decrement.
 */

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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';

const GRADIENT = ['#0f4c75', '#3282b8'];
const CPT_BENEFITS = [
  { icon: 'time-outline',           textKey: 'benefitCpt1' },
  { icon: 'eye-outline',            textKey: 'benefitCpt2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitCpt3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

const LETTERS_NON_X = ['A','B','C','D','E','F','G','H','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','Y','Z'];  // без X
const CONFUSABLE = ['K','Y','V','W','N','M'];   // угловатые буквы — похожи на X при беглом взгляде
const STIM_DURATION = 250;          // буква видна 250мс

// Сложность РАСТЁТ НЕ ВРЕМЕНЕМ (длительность фикс ~90с — короткие сессии не скучают), а ТРУДНОСТЬЮ задачи:
//   L1-5  — классический X-CPT (жми на X), ISI 1500→900 (темп растёт)
//   L6-10 — AX-CPT (жми на X ТОЛЬКО если перед ней была A — нагрузка на рабочую память), ISI 1100→850
//   L11-15— AX-CPT + ISI 800→500 + растущая доля похожих на X дистракторов (перцептивная нагрузка)
function levelParams(level: number): { durationSec: number; isiMs: number; mode: 'X' | 'AX'; confusableRatio: number; targetRate: number } {
  const durationSec = 90;
  if (level <= 5)  return { durationSec, isiMs: Math.max(900, 1500 - (level - 1) * 150), mode: 'X',  confusableRatio: 0, targetRate: 0.28 };
  if (level <= 10) return { durationSec, isiMs: Math.max(850, 1100 - (level - 6) * 60),  mode: 'AX', confusableRatio: 0, targetRate: 0.32 };
  return { durationSec, isiMs: Math.max(500, 800 - (level - 11) * 75), mode: 'AX', confusableRatio: Math.min(0.5, 0.15 + (level - 11) * 0.09), targetRate: 0.32 };
}

function pickDistractor(confusableRatio: number): string {
  if (confusableRatio > 0 && Math.random() < confusableRatio) return CONFUSABLE[Math.floor(Math.random() * CONFUSABLE.length)];
  return LETTERS_NON_X[Math.floor(Math.random() * LETTERS_NON_X.length)];
}
// Continuous-AX: target X строится через предшествующую A; редкая X-без-A = ловушка (commission).
function pickNextLetter(mode: 'X' | 'AX', confusableRatio: number, targetRate: number, prev: string): string {
  if (mode === 'X') return Math.random() < targetRate ? 'X' : pickDistractor(confusableRatio);
  if (Math.random() < targetRate) return prev === 'A' ? 'X' : 'A';   // строим пару A→X
  if (prev !== 'A' && Math.random() < 0.18) return 'X';              // X без A = ловушка-commission
  return pickDistractor(confusableRatio);
}

interface TrialRecord {
  letter: string;
  isTarget: boolean;
  responded: boolean;
  rt: number | null;        // ms from stim onset to tap
  correct: boolean;         // (target & responded) OR (non-target & not_responded)
  trialIndex: number;       // position in sequence
}

export default function CPTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const lvl = usePersistentLevel('cpt');
  const [phase, setPhase] = useState<GamePhase>('intro');

  const [currentLetter, setCurrentLetter] = useState<string>('');
  const [letterVisible, setLetterVisible] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  // running counters for HUD
  const [hits, setHits] = useState(0);
  const [omissions, setOmissions] = useState(0);
  const [commissions, setCommissions] = useState(0);
  const [trialIdx, setTrialIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);

  // refs to avoid closure staleness in long-running timers
  const trialsRef = useRef<TrialRecord[]>([]);
  const currentTrialRef = useRef<TrialRecord | null>(null);
  const startTimeRef = useRef(0);
  const stimOnsetRef = useRef(0);
  const respondedRef = useRef(false);

  const isiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  // параметры текущего уровня (в рефах — таймеры живут вне ре-рендера)
  const levelRef = useRef(1);
  const isiRef = useRef(1500);
  const modeRef = useRef<'X' | 'AX'>('X');
  const confusableRef = useRef(0);
  const targetRateRef = useRef(0.28);
  const durationSecRef = useRef(90);
  const prevLetterRef = useRef('');

  const clearAllTimers = () => {
    [isiTimerRef, stimTimerRef, offTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
    if (remainingTimerRef.current) clearInterval(remainingTimerRef.current);
  };

  useEffect(() => () => { stoppedRef.current = true; clearAllTimers(); }, []);

  const scheduleNextStimulus = () => {
    if (stoppedRef.current) return;
    const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
    if (elapsedSec >= durationSecRef.current) {
      finish();
      return;
    }
    const isi = isiRef.current * (0.85 + Math.random() * 0.3);   // ISI уровня ±15% дрожание
    isiTimerRef.current = setTimeout(() => {
      if (stoppedRef.current) return;
      // выбрать стимул по режиму уровня; isTarget = «нужно ли жать»
      const prev = prevLetterRef.current;
      const letter = pickNextLetter(modeRef.current, confusableRef.current, targetRateRef.current, prev);
      const isTgt = modeRef.current === 'X' ? letter === 'X' : (letter === 'X' && prev === 'A');
      prevLetterRef.current = letter;
      const trial: TrialRecord = {
        letter,
        isTarget: isTgt,
        responded: false,
        rt: null,
        correct: false,
        trialIndex: trialsRef.current.length,
      };
      currentTrialRef.current = trial;
      respondedRef.current = false;
      stimOnsetRef.current = Date.now();
      setCurrentLetter(letter);
      setLetterVisible(true);
      // hide after STIM_DURATION
      offTimerRef.current = setTimeout(() => {
        if (stoppedRef.current) return;
        setLetterVisible(false);
      }, STIM_DURATION);
      // close trial window after one full ISI from onset
      const trialWindow = isiRef.current; // окно ответа = один ISI уровня
      stimTimerRef.current = setTimeout(() => {
        if (stoppedRef.current) return;
        // close trial: if not responded and target = omission; if not responded and non-target = correct rejection
        const t = currentTrialRef.current;
        if (t && !t.responded) {
          if (t.isTarget) {
            t.correct = false;
            setOmissions(o => o + 1);
            flashFeedback('wrong');
          } else {
            t.correct = true;
            // correct rejection — silent
          }
        }
        if (t) {
          trialsRef.current.push(t);
          setTrialIdx(trialsRef.current.length);
        }
        currentTrialRef.current = null;
        scheduleNextStimulus();
      }, trialWindow);
    }, isi);
  };

  const flashFeedback = (kind: 'right' | 'wrong') => {
    setFeedback(kind);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
    fbTimerRef.current = setTimeout(() => setFeedback(null), 200);
  };

  const handleTap = () => {
    const t = currentTrialRef.current;
    if (!t || respondedRef.current) return;
    respondedRef.current = true;
    t.responded = true;
    t.rt = Date.now() - stimOnsetRef.current;
    if (t.isTarget) {
      t.correct = true;
      setHits(h => h + 1);
      flashFeedback('right');
    } else {
      // commission: tapped on X
      t.correct = false;
      setCommissions(c => c + 1);
      flashFeedback('wrong');
    }
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    isiRef.current = p.isiMs;
    modeRef.current = p.mode;
    confusableRef.current = p.confusableRatio;
    targetRateRef.current = p.targetRate;
    durationSecRef.current = p.durationSec;
    prevLetterRef.current = '';
    stoppedRef.current = false;
    trialsRef.current = [];
    currentTrialRef.current = null;
    setHits(0); setOmissions(0); setCommissions(0); setTrialIdx(0);
    setFeedback(null);
    setLetterVisible(false);
    setCurrentLetter('');
    setRemaining(p.durationSec);
    setPhase('playing');
    startTimeRef.current = Date.now();
    remainingTimerRef.current = setInterval(() => {
      const left = durationSecRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRemaining(Math.max(0, left));
    }, 200);
    scheduleNextStimulus();
  };

  const finish = async () => {
    stoppedRef.current = true;
    clearAllTimers();
    setLetterVisible(false);

    const trials = trialsRef.current;
    const targets = trials.filter(t => t.isTarget);
    const nonTargets = trials.filter(t => !t.isTarget);
    const totalHits = targets.filter(t => t.responded).length;
    const totalOmissions = targets.filter(t => !t.responded).length;
    const totalCommissions = nonTargets.filter(t => t.responded).length;

    // RT stats on hits only
    const hitRts = targets.filter(t => t.responded && t.rt !== null).map(t => t.rt as number);
    const meanRt = hitRts.length ? hitRts.reduce((a, b) => a + b, 0) / hitRts.length : 0;
    const rtVar = hitRts.length > 1
      ? hitRts.reduce((s, rt) => s + Math.pow(rt - meanRt, 2), 0) / hitRts.length
      : 0;
    const rtStd = Math.sqrt(rtVar);
    const cvRt = meanRt > 0 ? rtStd / meanRt : 0;  // coefficient of variation

    // Vigilance decrement: split hits into 4 quartiles, compute mean RT per quartile,
    // linear regression slope (ms per quartile). Positive slope = attention dropping.
    let vigilanceSlope = 0;
    if (hitRts.length >= 8) {
      const q = 4;
      const perQ = Math.floor(hitRts.length / q);
      const meansByQuartile: number[] = [];
      for (let i = 0; i < q; i++) {
        const slice = hitRts.slice(i * perQ, (i + 1) * perQ);
        meansByQuartile.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      // simple linear regression: x = [1,2,3,4], y = means
      const xs = [1, 2, 3, 4];
      const meanX = 2.5;
      const meanY = meansByQuartile.reduce((a, b) => a + b, 0) / 4;
      const num = xs.reduce((s, x, i) => s + (x - meanX) * (meansByQuartile[i] - meanY), 0);
      const den = xs.reduce((s, x) => s + Math.pow(x - meanX, 2), 0);
      vigilanceSlope = den > 0 ? num / den : 0;
    }

    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    // прохождение уровня: высокая доля hits + мало commission → следующий уровень
    const accuracy = targets.length ? totalHits / targets.length : 0;
    const commissionRate = nonTargets.length ? totalCommissions / nonTargets.length : 0;
    if (accuracy >= 0.7 && commissionRate <= 0.3) lvl.reach(levelRef.current + 1);
    setPhase('result');

    try {
      await saveSession({
        game_type: 'cpt',
        score: Math.max(0, Math.round(totalHits * 5 - totalCommissions * 20 - totalOmissions * 10)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: totalOmissions + totalCommissions,
        details: {
          level: levelRef.current,
          paradigm: modeRef.current,
          hits: totalHits,
          omission_errors: totalOmissions,
          commission_errors: totalCommissions,
          n_targets: targets.length,
          n_nontargets: nonTargets.length,
          mean_rt: Math.round(meanRt),
          rt_std: Math.round(rtStd),
          rt_variability: Number(cvRt.toFixed(3)),    // CV-RT
          vigilance_decrement: Math.round(vigilanceSlope),  // ms per quartile
        },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => {
    if (phase !== 'playing') return;
    finish();
  };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="time" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('cpt')}</Text>
        <Text style={styles.configDesc}>{t('cptDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
          {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {lvl.level <= 5
            ? (language === 'ru' ? 'X-CPT · жми на каждую X · 90 сек' : 'X-CPT · tap every X · 90 s')
            : lvl.level <= 10
            ? (language === 'ru' ? 'AX-CPT · жми на X только после A · 90 сек' : 'AX-CPT · tap X only after A · 90 s')
            : (language === 'ru' ? 'AX-CPT · X после A · быстрее + похожие буквы · 90 сек' : 'AX-CPT · X after A · faster + look-alikes · 90 s')}
        </Text>
        {lvl.level > 1 && (
          <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        ⚠ {t('cptStrenuous')}
      </Text>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPlaying = () => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const totalDoneTrials = trialIdx;
    const fbColor = feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : null;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: GRADIENT[1], fontSize: 18 }]}>
            {mins}:{secs.toString().padStart(2, '0')}
          </Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗o{omissions}</Text>
          <Text style={[styles.statText, { color: '#fbbf24' }]}>✗c{commissions}</Text>
          <Text style={[styles.statText, { color: colors.textSecondary }]}>{totalDoneTrials}t</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {modeRef.current === 'AX'
            ? (language === 'ru' ? 'Жми только на X, если ПЕРЕД ней была A' : 'Tap X only if it followed A')
            : (language === 'ru' ? 'Жми на каждую X. Не пропускай!' : 'Tap every X. Don\'t miss!')}
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleTap}
          style={[styles.stimBox, {
            backgroundColor: fbColor ? fbColor + '33' : colors.surface,
            borderColor: fbColor || (letterVisible && currentLetter === 'X' ? '#fbbf24' : colors.border),
            borderWidth: letterVisible ? 3 : 1,
          }]}
        >
          {letterVisible && (
            <Text style={[styles.stimText, {
              color: currentLetter === 'X' ? '#fbbf24' : colors.text,
            }]}>
              {currentLetter}
            </Text>
          )}
          {!letterVisible && <Text style={[styles.fixCross, { color: colors.textSecondary }]}>+</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.stopBtn, { borderColor: '#f43f5e' }]} onPress={stop}>
          <Text style={[styles.stopBtnText, { color: '#f43f5e' }]}>{t('btn_stop')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('cpt')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="cpt" icon="time" gradient={GRADIENT as [string, string]}
          skillKey="skillSustainedAttention" descriptionKey="cptIntroDesc"
          benefits={CPT_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 5 - commissions * 20 - omissions * 10)}
          time={durationSecRef.current} errors={omissions + commissions}
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
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  configDesc: { fontSize: 13, color: '#FFF', opacity: 0.9, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 22, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  stimBox: { width: 240, height: 240, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontSize: 120, fontWeight: '900' },
  fixCross: { fontSize: 48, opacity: 0.4 },
  stopBtn: { paddingVertical: 10, paddingHorizontal: 30, borderRadius: 8, borderWidth: 1 },
  stopBtnText: { fontSize: 14, fontWeight: '700' },
});
