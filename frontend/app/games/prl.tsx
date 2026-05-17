/**
 * PRL — Probabilistic Reversal Learning
 *
 * Парадигма (Cools 2002, Hampshire 2008): 2 стимула на экране (синий vs оранжевый круг).
 * Один = "хороший" (например, 80% reward / 20% punish), второй наоборот.
 * После N правильных выборов подряд правила скрытно МЕНЯЮТСЯ местами (reversal).
 * Subject должен заметить по обратной связи и переключиться.
 *
 * Биомаркеры (классика для vmPFC/orbitofrontal):
 *   - reversal_errors        — общее количество ошибок ПОСЛЕ каждого reversal
 *                               (медленность переучивания)
 *   - perseverative_errors   — продолжение старого правила после 2+ negative feedback
 *   - win_stay_rate          — после reward выбираешь тот же стимул (% от win-trials)
 *   - lose_shift_rate        — после punish меняешь (% от lose-trials)
 *   - mean_post_reversal_acc — средняя точность в первые 5 трайлов после reversal
 *
 * Прямой клинический intermediate phenotype финансовых решений:
 * vmPFC обновляет ценность по обратной связи; PRL мерит насколько быстро.
 */

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

const GRADIENT = ['#1e3c72', '#2a5298'];
const PRL_BENEFITS = [
  { icon: 'trending-up-outline',  textKey: 'benefitPrl1' },
  { icon: 'sync-outline',         textKey: 'benefitPrl2' },
  { icon: 'analytics-outline',    textKey: 'benefitPrl3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type Choice = 'A' | 'B';   // A = blue, B = orange

interface Cfg { rewardProb: number; trialsTotal: number; reversalAfter: [number, number]; }
const DIFF_CFG: Record<Difficulty, Cfg> = {
  easy:   { rewardProb: 0.90, trialsTotal: 40, reversalAfter: [8, 10] },   // very obvious
  medium: { rewardProb: 0.80, trialsTotal: 60, reversalAfter: [8, 12] },   // standard
  hard:   { rewardProb: 0.70, trialsTotal: 80, reversalAfter: [10, 16] },  // ambiguous feedback
};

interface TrialRecord {
  index: number;
  choice: Choice;
  rewardedChoice: Choice;     // which one was the "good" one this trial
  outcome: 'reward' | 'punish';
  isError: boolean;           // chose the bad one
  blockIndex: number;         // 0 = initial rule, 1 = after first reversal, ...
  trialInBlock: number;
}

export default function PRLGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  // running state
  const [trialIdx, setTrialIdx] = useState(0);
  const [bank, setBank] = useState(0);
  const [feedback, setFeedback] = useState<{ choice: Choice; outcome: 'reward' | 'punish' } | null>(null);
  const [revealCount, setRevealCount] = useState(0);  // current block trial counter

  // refs to avoid closure stale issues during fast tapping
  const goodChoiceRef = useRef<Choice>('A');         // current "good" stimulus
  const consecutiveCorrectRef = useRef(0);            // for reversal trigger
  const blockIndexRef = useRef(0);                    // increments on each reversal
  const trialInBlockRef = useRef(0);
  const trialsRef = useRef<TrialRecord[]>([]);
  const startTimeRef = useRef(0);
  const respondLockRef = useRef(false);

  useEffect(() => () => { respondLockRef.current = true; }, []);

  const rewardProb = DIFF_CFG[difficulty].rewardProb;
  const total = DIFF_CFG[difficulty].trialsTotal;
  const [revMin, revMax] = DIFF_CFG[difficulty].reversalAfter;

  const startGame = () => {
    trialsRef.current = [];
    goodChoiceRef.current = Math.random() < 0.5 ? 'A' : 'B';
    consecutiveCorrectRef.current = 0;
    blockIndexRef.current = 0;
    trialInBlockRef.current = 0;
    respondLockRef.current = false;
    setTrialIdx(0); setBank(100); setRevealCount(0); setFeedback(null);
    startTimeRef.current = Date.now();
    setPhase('playing');
  };

  const maybeReverse = () => {
    // reverse after consecutiveCorrect ∈ [revMin, revMax]
    const threshold = revMin + Math.floor(Math.random() * (revMax - revMin + 1));
    if (consecutiveCorrectRef.current >= threshold) {
      goodChoiceRef.current = goodChoiceRef.current === 'A' ? 'B' : 'A';
      blockIndexRef.current++;
      trialInBlockRef.current = 0;
      consecutiveCorrectRef.current = 0;
    }
  };

  const handleChoice = (c: Choice) => {
    if (respondLockRef.current || feedback !== null) return;
    respondLockRef.current = true;
    const isCorrect = c === goodChoiceRef.current;
    // probabilistic outcome: correct = reward with rewardProb, else punish; vice versa for incorrect
    const r = Math.random();
    const outcome: 'reward' | 'punish' =
      isCorrect ? (r < rewardProb ? 'reward' : 'punish')
                : (r < rewardProb ? 'punish' : 'reward');
    const trial: TrialRecord = {
      index: trialsRef.current.length,
      choice: c,
      rewardedChoice: goodChoiceRef.current,
      outcome,
      isError: !isCorrect,
      blockIndex: blockIndexRef.current,
      trialInBlock: trialInBlockRef.current,
    };
    trialsRef.current.push(trial);
    trialInBlockRef.current++;
    if (isCorrect) consecutiveCorrectRef.current++;
    else consecutiveCorrectRef.current = 0;

    setBank((b) => b + (outcome === 'reward' ? 10 : -5));
    setFeedback({ choice: c, outcome });
    setTrialIdx(trialsRef.current.length);
    setRevealCount(trialInBlockRef.current);

    setTimeout(() => {
      maybeReverse();
      setFeedback(null);
      respondLockRef.current = false;
      if (trialsRef.current.length >= total) finish();
    }, 600);
  };

  const finish = async () => {
    respondLockRef.current = true;
    const trials = trialsRef.current;
    const totalTime = (Date.now() - startTimeRef.current) / 1000;

    // Reversal errors = errors in trials where blockIndex > 0 (after first reversal)
    const reversalErrors = trials.filter(t => t.blockIndex > 0 && t.isError).length;

    // Perseverative errors: after 2+ punishments in a row, still picking the same losing stimulus.
    // Approximation: count trials where (this is an error) AND (previous 2 trials were also errors with same choice).
    let perseverative = 0;
    for (let i = 2; i < trials.length; i++) {
      if (trials[i].isError && trials[i-1].isError && trials[i-2].isError &&
          trials[i].choice === trials[i-1].choice && trials[i].choice === trials[i-2].choice) {
        perseverative++;
      }
    }

    // win_stay: after a 'reward' on trial i, did subject pick the same stimulus on trial i+1?
    let winN = 0, winStay = 0, loseN = 0, loseShift = 0;
    for (let i = 0; i < trials.length - 1; i++) {
      if (trials[i].outcome === 'reward') {
        winN++;
        if (trials[i+1].choice === trials[i].choice) winStay++;
      } else {
        loseN++;
        if (trials[i+1].choice !== trials[i].choice) loseShift++;
      }
    }
    const winStayRate = winN > 0 ? winStay / winN : 0;
    const loseShiftRate = loseN > 0 ? loseShift / loseN : 0;

    // Mean post-reversal accuracy: first 5 trials after each reversal
    const postReversalTrials = trials.filter(t => t.blockIndex > 0 && t.trialInBlock < 5);
    const postReversalCorrect = postReversalTrials.filter(t => !t.isError).length;
    const postReversalAcc = postReversalTrials.length > 0 ? postReversalCorrect / postReversalTrials.length : 0;

    // Total errors
    const totalErrors = trials.filter(t => t.isError).length;
    const accuracy = trials.length > 0 ? (trials.length - totalErrors) / trials.length : 0;

    setPhase('result');

    try {
      await saveSession({
        game_type: 'prl',
        score: Math.max(0, bank),
        time_seconds: totalTime,
        difficulty,
        mode: `${total}t-${Math.round(rewardProb * 100)}%`,
        errors: totalErrors,
        details: {
          hits: trials.length - totalErrors,
          errors: totalErrors,
          n_trials: trials.length,
          n_reversals: blockIndexRef.current,
          reversal_errors: reversalErrors,
          perseverative_errors: perseverative,
          win_stay_rate: Number(winStayRate.toFixed(3)),
          lose_shift_rate: Number(loseShiftRate.toFixed(3)),
          mean_post_reversal_acc: Number(postReversalAcc.toFixed(3)),
          accuracy: Number(accuracy.toFixed(3)),
          final_bank: bank,
        },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => { if (phase === 'playing') finish(); };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="trending-up" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('prl')}</Text>
        <Text style={styles.configDesc}>{t('prlDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
        <View style={styles.optionButtons}>
          {(['easy','medium','hard'] as Difficulty[]).map((d) => {
            const cfg = DIFF_CFG[d];
            return (
              <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
                ? { backgroundColor: GRADIENT[1] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setDifficulty(d)}>
                <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>
                  {t(d)} ({Math.round(cfg.rewardProb*100)}%, {cfg.trialsTotal}t)
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        💡 {t('prlNote')}
      </Text>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderStimulus = (which: Choice, color: string) => {
    const isFeedback = feedback?.choice === which;
    const fbColor = isFeedback
      ? (feedback.outcome === 'reward' ? '#22c55e' : '#f43f5e')
      : null;
    return (
      <TouchableOpacity
        key={which}
        disabled={feedback !== null}
        onPress={() => handleChoice(which)}
        style={[styles.stim, {
          backgroundColor: fbColor || color,
          borderColor: isFeedback ? (feedback.outcome === 'reward' ? '#16a34a' : '#dc2626') : 'transparent',
          borderWidth: isFeedback ? 4 : 0,
        }]}
      >
        <Text style={styles.stimLabel}>{which}</Text>
        {isFeedback && (
          <Text style={styles.fbText}>
            {feedback.outcome === 'reward' ? '+10¢' : '−5¢'}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{trialIdx}/{total}</Text>
        <Text style={[styles.statText, { color: bank >= 100 ? '#22c55e' : '#f43f5e', fontSize: 18 }]}>
          💰 {bank}¢
        </Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>
          R:{blockIndexRef.current}
        </Text>
        <Text style={[styles.statText, { color: colors.textSecondary }]}>
          ✓{revealCount}
        </Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {t('prlHint')}
      </Text>
      <View style={styles.stimRow}>
        {renderStimulus('A', '#3b82f6')}
        {renderStimulus('B', '#f59e0b')}
      </View>
      <TouchableOpacity style={[styles.stopBtn, { borderColor: colors.border }]} onPress={stop}>
        <Text style={[styles.stopBtnText, { color: colors.textSecondary }]}>СТОП</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { respondLockRef.current = true; router.back(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('prl')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="prl" icon="trending-up" gradient={GRADIENT as [string, string]}
          skillKey="skillRisk" descriptionKey="prlIntroDesc"
          benefits={PRL_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, bank)}
          time={(Date.now() - startTimeRef.current) / 1000}
          errors={trialsRef.current.filter(t => t.isError).length}
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
  optionButtons: { flexDirection: 'column', gap: 8 },
  modeButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16, lineHeight: 18 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 16, gap: 24, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  stimRow: { flexDirection: 'row', gap: 28, marginTop: 12 },
  stim: { width: 130, height: 130, borderRadius: 65, justifyContent: 'center', alignItems: 'center' },
  stimLabel: { color: '#FFF', fontSize: 48, fontWeight: '900' },
  fbText: { color: '#FFF', fontSize: 18, fontWeight: '900', marginTop: -8 },
  stopBtn: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, marginTop: 12 },
  stopBtnText: { fontSize: 13, fontWeight: '700' },
});
