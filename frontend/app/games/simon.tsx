/**
 * Simon Task (v1.9.0 — 48-я игра, классика inhibitory control)
 *
 * v1.9.1: Скрыта из основного меню (hideFromMenu: true в games.ts).
 * Доступна через ⚡ Конфликт внимания → выбор режима "Цвет vs Позиция"
 * (рядом со Stroop, Stroop-Emotional, Flanker — 4 парадигмы interference
 * resolution под одной крышкой, чтобы не плодить дубли в каталоге).
 *
 * Парадигма: цветной квадрат появляется СЛЕВА или СПРАВА от центра экрана.
 * Правило: жми ЛЕВУЮ кнопку если СИНИЙ, ПРАВУЮ если КРАСНЫЙ (color-based).
 *
 * Congruent trial: позиция матчит правильный ответ (синий слева → жми левую) — легко
 * Incongruent trial: позиция НЕ матчит ответ (синий справа → жми левую) — медленнее
 *
 * Simon Effect = RT_incongruent - RT_congruent → измеряет силу автоматического
 * пространственного отвлечения. Меньше effect = лучше inhibitory control.
 *
 * Отличие от Flanker (фланкеры): Flanker = конфликт от соседних стрелок.
 * Отличие от Stroop: Stroop = семантический конфликт (значение vs цвет шрифта).
 * Simon = пространственный конфликт (позиция стимула vs нужная сторона ответа).
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

const GRADIENT = ['#1e3a8a', '#7f1d1d'];   // blue → red (отсылка к двум цветам стимула)
const COLOR_BLUE = '#3b82f6';
const COLOR_RED = '#ef4444';

const SI_BENEFITS = [
  { icon: 'flash-outline',            textKey: 'benefitSi1' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitSi2' },
  { icon: 'brain-outline',            textKey: 'benefitSi3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
type StimColor = 'blue' | 'red';
type Position = 'left' | 'right';
type TrialKind = 'congruent' | 'incongruent';

interface Trial {
  color: StimColor;
  position: Position;
  kind: TrialKind;
}

/** Правильная сторона ответа по цвету: blue→left, red→right */
const correctSide = (c: StimColor): Position => (c === 'blue' ? 'left' : 'right');

function makeTrial(diff: Difficulty): Trial {
  const color: StimColor = Math.random() < 0.5 ? 'blue' : 'red';
  // Распределение incongruent растёт со сложностью
  const incongruentProb = diff === 'easy' ? 0.4 : diff === 'medium' ? 0.55 : 0.7;
  const isIncongruent = Math.random() < incongruentProb;
  const correct = correctSide(color);
  const position: Position = isIncongruent
    ? (correct === 'left' ? 'right' : 'left')
    : correct;
  return { color, position, kind: isIncongruent ? 'incongruent' : 'congruent' };
}

export default function SimonGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [trials, setTrials] = useState(20);

  const [round, setRound] = useState(0);
  const [trial, setTrial] = useState<Trial>({ color: 'blue', position: 'left', kind: 'congruent' });
  const [showStim, setShowStim] = useState(false);
  const [stimAt, setStimAt] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByKind, setRtsByKind] = useState<Record<TrialKind, number[]>>({ congruent: [], incongruent: [] });
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
    setHits(0); setErrors(0);
    setRtsByKind({ congruent: [], incongruent: [] });
    setRound(1);
    setPhase('playing');
    setStartTime(Date.now());
    newTrial();
  };

  const finish = async (h: number, e: number, allRts: Record<TrialKind, number[]>) => {
    const totalTime = (Date.now() - startTime) / 1000;
    const flatten = [...allRts.congruent, ...allRts.incongruent];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    const congMean = allRts.congruent.length ? allRts.congruent.reduce((a, b) => a + b, 0) / allRts.congruent.length : 0;
    const incongMean = allRts.incongruent.length ? allRts.incongruent.reduce((a, b) => a + b, 0) / allRts.incongruent.length : 0;
    const simonEffect = Math.round(incongMean - congMean);   // Чем меньше — тем лучше inhibition
    setPhase('result');
    try {
      await saveSession({
        game_type: 'simon',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05 - Math.max(0, simonEffect) * 0.3)),
        time_seconds: totalTime,
        difficulty,
        mode: `${trials}t`,
        errors: e,
        details: {
          mean_rt: Math.round(meanRt),
          simon_effect_ms: simonEffect,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (chosen: Position) => {
    if (!showStim || feedback !== null) return;
    const rt = Date.now() - stimAt;
    const correct = correctSide(trial.color);
    const ok = chosen === correct;
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
    const all = [...rtsByKind.congruent, ...rtsByKind.incongruent];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="flash" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('simon')}</Text>
        <Text style={styles.configDesc}>{t('simonDesc')}</Text>
      </LinearGradient>

      {/* Правила игры — статический rule reminder */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text, marginBottom: 8 }]}>{t('simonRule')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: COLOR_BLUE }} />
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>{t('simonLeftBtn')}</Text>
          </View>
          <Text style={{ color: colors.textSecondary }}>·</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: COLOR_RED }} />
            <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>{t('simonRightBtn')}</Text>
          </View>
        </View>
      </View>

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
    </View>
  );

  const renderPlaying = () => {
    const fbColor =
      feedback === 'right' ? '#22c55e' :
      feedback === 'wrong' ? '#f43f5e' :
      colors.text;
    const stimColor = trial.color === 'blue' ? COLOR_BLUE : COLOR_RED;
    return (
      <View style={styles.playArea}>
        <View style={styles.statsRow}>
          <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
          <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
          <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
          <Text style={[styles.statText, { color: colors.text }]}>{meanRtAll}{language === 'ru' ? 'мс' : 'ms'}</Text>
        </View>
        {/* Stim area — широкая, квадрат появляется слева или справа от центра */}
        <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback ? fbColor : colors.border, borderWidth: feedback ? 3 : 1 }]}>
          {/* Центральный фиксационный крестик */}
          <Text style={{ position: 'absolute', fontSize: 24, color: colors.textSecondary, opacity: 0.4 }}>+</Text>
          {showStim && (
            <View style={{
              position: 'absolute',
              left: trial.position === 'left' ? 30 : undefined,
              right: trial.position === 'right' ? 30 : undefined,
              width: 64, height: 64, borderRadius: 10,
              backgroundColor: stimColor,
              shadowColor: stimColor, shadowOpacity: 0.6, shadowRadius: 14,
            }} />
          )}
        </View>
        {/* Подсказка правила (для конфига и для playing) */}
        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', maxWidth: 320 }}>
          {t('hint_simon_color_rule')}
        </Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: COLOR_BLUE }]} onPress={() => handleAnswer('left')}>
            <Ionicons name="arrow-back" size={32} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: COLOR_RED }]} onPress={() => handleAnswer('right')}>
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
        <Text style={[styles.title, { color: colors.text }]}>{t('simon')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="simon" icon="flash" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="simonIntroDesc"
          benefits={SI_BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14 },
  statText: { fontSize: 14, fontWeight: '700' },
  stimBox: {
    width: 360, height: 140, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  choiceRow: { flexDirection: 'row', gap: 24 },
  choiceBtn: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
});
