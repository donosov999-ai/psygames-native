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
 *
 * ─── Уровни vs классический пресет (полуклиническая парадигма) ───
 * РЕЖИМ «Уровни» (usePersistentLevel('prl') + levelParams): ось усложнения —
 *   частота реверсалов РАСТЁТ (реверс наступает после всё меньшего числа верных подряд)
 *   + награда ЗАШУМЛЯЕТСЯ (rewardProb 0.90 → 0.68, ближе к неоднозначной обратной связи).
 *   Число проб растёт ступенями (30 → 40 → 50). Проход = ≥60% верных выборов ПОСЛЕ
 *   реверсалов (адаптация к смене правила). Непрерывный поток через LevelCleared.
 * РЕЖИМ «Классический (диагностика)»: фиксированные easy/medium/hard параметры
 *   парадигмы сохранены доступным выбором — чтобы снимать ЧИСТУЮ метрику на стандартных
 *   значениях. Запуск из зарядки (isPreset) тоже идёт классическим — уровень не трогает.
 * Диагностические метрики (win-stay/lose-shift, reversal/perseverative errors, число
 *   реверсалов) пишутся в details в ОБОИХ режимах.
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
import GameShell from '@/src/components/GameShell';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#1e3c72', '#2a5298'];
const PRL_BENEFITS = [
  { icon: 'trending-up-outline',  textKey: 'benefitPrl1' },
  { icon: 'sync-outline',         textKey: 'benefitPrl2' },
  { icon: 'analytics-outline',    textKey: 'benefitPrl3' },
];

// Проход уровня: доля верных выборов ПОСЛЕ реверсалов (адаптация к смене правила).
const PASS_ACC = 0.6;

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type RunMode = 'level' | 'classic';
type Choice = 'A' | 'B';   // A = blue, B = orange

interface Cfg { rewardProb: number; trialsTotal: number; reversalAfter: [number, number]; }
const DIFF_CFG: Record<Difficulty, Cfg> = {
  easy:   { rewardProb: 0.90, trialsTotal: 40, reversalAfter: [8, 10] },   // very obvious
  medium: { rewardProb: 0.80, trialsTotal: 60, reversalAfter: [8, 12] },   // standard
  hard:   { rewardProb: 0.70, trialsTotal: 80, reversalAfter: [10, 16] },  // ambiguous feedback
};

// Уровень 1..12: реверсалы учащаются (порог верных-подряд падает 8 → 3),
// награда зашумляется (rewardProb 0.90 → 0.68), число проб растёт ступенями (30 → 40 → 50).
// Сама механика парадигмы (вероятностный исход + скрытый reversal) НЕ меняется — только
// частота реверсала и размах шума награды.
function levelParams(level: number): { rewardProb: number; trialsTotal: number; revMin: number; revMax: number } {
  const trialsTotal = level <= 4 ? 30 : level <= 8 ? 40 : 50;
  const rewardProb = Math.max(0.68, 0.90 - (level - 1) * 0.022);   // 0.90 → ~0.68 (шумнее)
  const revMin = Math.max(3, 8 - Math.floor((level - 1) * 0.5));   // 8 → 3 (реверс чаще)
  const revMax = revMin + 2;
  return { rewardProb, trialsTotal, revMin, revMax };
}

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
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str } = useGamePreset();
  const lvl = usePersistentLevel('prl');

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [runMode, setRunMode] = useState<RunMode>('level');
  // Классический режим (диагностика): пресет-зарядка (isPreset) читает diff из URL.
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));

  // running state
  const [trialIdx, setTrialIdx] = useState(0);
  const [totalTrials, setTotalTrials] = useState(30);
  const [bank, setBank] = useState(0);
  const [feedback, setFeedback] = useState<{ choice: Choice; outcome: 'reward' | 'punish' } | null>(null);
  const [revealCount, setRevealCount] = useState(0);  // current block trial counter
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера LevelCleared
  const [clearedStars, setClearedStars] = useState(3);

  // refs to avoid closure stale issues during fast tapping
  const goodChoiceRef = useRef<Choice>('A');         // current "good" stimulus
  const consecutiveCorrectRef = useRef(0);            // for reversal trigger
  const blockIndexRef = useRef(0);                    // increments on each reversal
  const trialInBlockRef = useRef(0);
  const trialsRef = useRef<TrialRecord[]>([]);
  const startTimeRef = useRef(0);
  const respondLockRef = useRef(false);

  // параметры текущей партии — в рефах (таймер +600мс в handleChoice читает их без stale-closure)
  const classicRef = useRef(false);   // true = классический/пресет (уровень не трогаем, экран статистики)
  const levelRef = useRef(0);         // 0 = классика; иначе номер уровня
  const rewardProbRef = useRef(0.90);
  const totalRef = useRef(30);
  const revMinRef = useRef(8);
  const revMaxRef = useRef(10);

  useEffect(() => () => { respondLockRef.current = true; }, []);
  // Запуск из зарядки → авто-старт классическим (чистая метрика, уровень не трогается).
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = () => {
    const classic = isPreset || runMode === 'classic';
    classicRef.current = classic;
    let rewardProb: number, total: number, revMin: number, revMax: number, lvlNum: number;
    if (classic) {
      const cfg = DIFF_CFG[difficulty];
      rewardProb = cfg.rewardProb; total = cfg.trialsTotal;
      [revMin, revMax] = cfg.reversalAfter;
      lvlNum = 0;
    } else {
      const p = levelParams(lvl.level);
      rewardProb = p.rewardProb; total = p.trialsTotal;
      revMin = p.revMin; revMax = p.revMax;
      lvlNum = lvl.level;
    }
    rewardProbRef.current = rewardProb;
    totalRef.current = total;
    revMinRef.current = revMin;
    revMaxRef.current = revMax;
    levelRef.current = lvlNum;

    trialsRef.current = [];
    goodChoiceRef.current = Math.random() < 0.5 ? 'A' : 'B';
    consecutiveCorrectRef.current = 0;
    blockIndexRef.current = 0;
    trialInBlockRef.current = 0;
    respondLockRef.current = false;
    setTrialIdx(0); setBank(100); setRevealCount(0); setFeedback(null);
    setTotalTrials(total);
    startTimeRef.current = Date.now();
    setPhase('playing');
  };

  const maybeReverse = () => {
    // reverse after consecutiveCorrect ∈ [revMin, revMax] (частота задаётся уровнем/сложностью)
    const revMin = revMinRef.current, revMax = revMaxRef.current;
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
    const rewardProb = rewardProbRef.current;
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
      if (trialsRef.current.length >= totalRef.current) finish();
    }, 600);
  };

  const finish = async () => {
    respondLockRef.current = true;
    const classic = classicRef.current;
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

    // Mean post-reversal accuracy: first 5 trials after each reversal (клиническая метрика)
    const postReversalTrials = trials.filter(t => t.blockIndex > 0 && t.trialInBlock < 5);
    const postReversalCorrect = postReversalTrials.filter(t => !t.isError).length;
    const postReversalAcc = postReversalTrials.length > 0 ? postReversalCorrect / postReversalTrials.length : 0;

    // Total errors
    const totalErrors = trials.filter(t => t.isError).length;
    const accuracy = trials.length > 0 ? (trials.length - totalErrors) / trials.length : 0;

    // Проход уровня: доля верных выборов на ВСЕХ пост-реверс блоках (адаптация).
    // Если реверсала не случилось (короткая партия) — падаем на общую точность, чтобы
    // не заваливать уровень «пустой» пост-реверс выборкой.
    const adaptTrials = trials.filter(t => t.blockIndex > 0);
    const adaptCorrect = adaptTrials.filter(t => !t.isError).length;
    const adaptAcc = adaptTrials.length > 0 ? adaptCorrect / adaptTrials.length : accuracy;
    const passed = !classic && adaptAcc >= PASS_ACC;
    const stars = adaptAcc >= 0.8 ? 3 : adaptAcc >= 0.65 ? 2 : 1;

    if (!classic) {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();   // гистерезис: 3 провала подряд → уровень -1
    }
    // Непрерывный поток: уровневый режим → баннер LevelCleared (passed=false = «почти, ещё раз»
    // + рестарт того же уровня), без тупика. Классика/пресет → экран статистики GameResult.
    setClearedPassed(passed);
    setClearedStars(stars);
    setPhase(classic ? 'result' : 'cleared');

    try {
      await saveSession({
        game_type: 'prl',
        score: Math.max(0, bank),
        time_seconds: totalTime,
        difficulty: classic ? difficulty : (levelRef.current <= 4 ? 'easy' : levelRef.current <= 8 ? 'medium' : 'hard'),
        mode: classic ? `${totalRef.current}t-${Math.round(rewardProbRef.current * 100)}%` : `lvl${levelRef.current}`,
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
          post_reversal_adapt_acc: Number(adaptAcc.toFixed(3)),
          accuracy: Number(accuracy.toFixed(3)),
          final_bank: bank,
          ...(classic ? {} : { level: levelRef.current }),
        },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => { if (phase === 'playing') finish(); };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="trending-up" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('prl')}</Text>
          <Text style={styles.configDesc}>{t('prlDesc')}</Text>
        </LinearGradient>

        {/* Переключатель режима: уровни (прогрессия) vs классический (чистая диагностика) */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Режим' : 'Mode'}</Text>
          <View style={styles.optionButtons}>
            {(['level', 'classic'] as RunMode[]).map((m) => (
              <TouchableOpacity key={m} style={[styles.modeButton, runMode === m
                ? { backgroundColor: GRADIENT[1] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setRunMode(m)}>
                <Text style={[styles.modeButtonText, { color: runMode === m ? '#FFF' : colors.text }]}>
                  {m === 'level'
                    ? (language === 'ru' ? 'Уровни — прогрессия' : 'Levels — progression')
                    : (language === 'ru' ? 'Классический — диагностика' : 'Classic — diagnostic')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {runMode === 'level' ? (
          <>
            <LevelProgressMap gameId="prl" currentLevel={lvl.level} maxLevel={12} colors={colors} language={language} />
            <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
              <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
                {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                {language === 'ru'
                  ? `${p.trialsTotal} проб · награда ${Math.round(p.rewardProb * 100)}% · реверс каждые ${p.revMin}-${p.revMax} верных подряд`
                  : `${p.trialsTotal} trials · reward ${Math.round(p.rewardProb * 100)}% · reversal every ${p.revMin}-${p.revMax} correct in a row`}
              </Text>
              {/* Критерий прохождения виден игроку (паттерн cpt/simon v1.112.0) */}
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                {language === 'ru'
                  ? `Проход: ≥${Math.round(PASS_ACC * 100)}% верных выборов после реверсалов`
                  : `To pass: ≥${Math.round(PASS_ACC * 100)}% correct choices after reversals`}
              </Text>
              {lvl.level > 1 && (
                <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            {/* Классический пресет — фиксированные параметры для чистой клинической метрики */}
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
          </>
        )}

        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

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

  // игровая фаза — на едином каркасе GameShell: круги-ответы и стоп прибиты к низу
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('prl')}
        onBack={() => { respondLockRef.current = true; goBackOrHome(); }}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{trialIdx}/{totalTrials}</Text>
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
        }
        toolbar={
          <View style={styles.toolbarCol}>
            <View style={styles.stimRow}>
              {renderStimulus('A', '#3b82f6')}
              {renderStimulus('B', '#f59e0b')}
            </View>
            <TouchableOpacity style={[styles.stopBtn, { borderColor: colors.border }]} onPress={stop}>
              <Text style={[styles.stopBtnText, { color: colors.textSecondary }]}>{t('btn_stop')}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {t('prlHint')}
        </Text>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { respondLockRef.current = true; goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('prl')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="prl" icon="trending-up" gradient={GRADIENT as [string, string]}
          skillKey="skillRisk" descriptionKey="prlIntroDesc"
          benefits={PRL_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared gameId="prl" level={levelRef.current} passed={clearedPassed} stars={clearedStars}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, bank)}
          time={(Date.now() - startTimeRef.current) / 1000}
          errors={trialsRef.current.filter(t => t.isError).length}
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
  optionButtons: { flexDirection: 'column', gap: 8 },
  modeButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16, lineHeight: 18 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  toolbarCol: { alignItems: 'center', gap: 4 },
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
