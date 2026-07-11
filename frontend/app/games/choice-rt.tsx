/**
 * Choice RT — время реакции выбора (стрелки).
 *
 * Парадигма: после случайной паузы появляется стрелка — жми кнопку
 * соответствующего направления как можно быстрее.
 *
 * Уровни (persist, по паттерну cpt/simon): ручные селекторы режима (2/4 стрелки)
 * и числа проб заменены на usePersistentLevel('choice_rt') + levelParams.
 * Ось усложнения:
 *   - число вариантов выбора растёт: 2 стрелки (L1-5) → 3 (L6-10) → 4 (L11-15)
 *   - окно ответа сокращается 2000мс → 750мс (не успел = ошибка-пропуск)
 *   - число проб растёт ступенями 12 → 16 → 20
 * Проход уровня: ≥80% верных ответов за раунд → LevelCleared (авто-поток).
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
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#fdc830', '#f37335'];
const CHOICE_BENEFITS = [
  { icon: 'flash-outline', textKey: 'benefitChoiceRt1' },
  { icon: 'crosshairs', textKey: 'benefitChoiceRt2' },
  { icon: 'hand-right-outline', textKey: 'benefitChoiceRt3' },
];

type Direction = 'left' | 'right' | 'up' | 'down';
const ARROW_ICON: Record<Direction, string> = {
  left: 'arrow-back', right: 'arrow-forward', up: 'arrow-up', down: 'arrow-down',
};

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';

// Уровень 1..15: число вариантов выбора растёт (2 → 3 → 4 стрелки — по механике
// парадигмы: больше альтернатив = закон Хика, RT растёт), окно ответа сокращается,
// число проб растёт ступенями (12 → 16 → 20).
function levelParams(level: number): { trials: number; dirs: Direction[]; windowMs: number } {
  const trials = level <= 5 ? 12 : level <= 10 ? 16 : 20;
  const dirs: Direction[] =
    level <= 5 ? ['left', 'right']
    : level <= 10 ? ['left', 'right', 'up']
    : ['left', 'right', 'up', 'down'];
  const windowMs = Math.max(750, 2000 - (level - 1) * 90);   // 2000мс → 750мс
  return { trials, dirs, windowMs };
}

export default function ChoiceRtGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('choice_rt');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [stim, setStim] = useState<Direction>('left');
  const [showStim, setShowStim] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [activeDirs, setActiveDirs] = useState<Direction[]>(['left', 'right']);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);

  // Рефы — таймерная цепочка (пауза → стимул → дедлайн → следующая проба)
  // живёт вне ре-рендеров, state в её колбэках был бы устаревшим (паттерн simon/cpt).
  const levelRef = useRef(1);
  const dirsRef = useRef<Direction[]>(['left', 'right']);
  const windowMsRef = useRef(2000);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const stimRef = useRef<Direction>('left');
  const stimAtRef = useRef(0);
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);

  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [stimTimerRef, deadlineTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const newTrial = () => {
    setShowStim(false); setFeedback(null);
    const dirs = dirsRef.current;
    const next = dirs[Math.floor(Math.random() * dirs.length)];
    stimRef.current = next;
    stimTimerRef.current = setTimeout(() => {
      stimAtRef.current = Date.now();
      answeredRef.current = false;
      setStim(next);
      setShowStim(true);
      // Окно ответа уровня: не успел — ошибка-пропуск, проба закрывается сама
      deadlineTimerRef.current = setTimeout(() => {
        if (answeredRef.current) return;
        answeredRef.current = true;
        errorsRef.current += 1;
        setErrors(errorsRef.current);
        setFeedback('wrong');
        fbTimerRef.current = setTimeout(advance, 350);
      }, windowMsRef.current);
    }, 600 + Math.random() * 1200);
  };

  const advance = () => {
    if (roundRef.current >= totalTrialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newTrial();
  };

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    dirsRef.current = p.dirs;
    windowMsRef.current = p.windowMs;
    totalTrialsRef.current = p.trials;
    setActiveDirs(p.dirs);
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0; rtsRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setRts([]);
    setRound(1);
    setPhase('playing');
    startTimeRef.current = Date.now();
    newTrial();
  };

  const finish = async () => {
    clearAllTimers();
    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    const finalRts = rtsRef.current;
    const meanRt = finalRts.length ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = totalTrialsRef.current > 0 ? h / totalTrialsRef.current : 0;
    // Проход уровня: ≥80% верных за раунд (пропуски по окну = ошибки)
    const passed = !isPreset && accuracy >= 0.8;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    setPhase(passed ? 'cleared' : 'result');   // авто-поток к следующему уровню
    try {
      await saveSession({
        game_type: 'choice_rt',
        score: Math.max(0, Math.round(h * 100 - e * 50 - meanRt * 0.1)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          hits: h,
          accuracy: Math.round(accuracy * 100),
          n_trials: totalTrialsRef.current,
          n_choices: dirsRef.current.length,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handlePress = (chosen: Direction) => {
    if (!showStim || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = Date.now() - stimAtRef.current;
    const correct = chosen === stimRef.current;
    if (correct) {
      hitsRef.current += 1;
      rtsRef.current = [...rtsRef.current, rt];
      setHits(hitsRef.current);
      setRts(rtsRef.current);
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(correct ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(advance, 350);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="arrow-forward-circle" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('choiceRt')}</Text>
          <Text style={styles.configDesc}>{t('choiceRtDesc')}</Text>
        </LinearGradient>

        <LevelProgressMap gameId="choice_rt" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} проб · ${p.dirs.length} направления · окно ответа ${(p.windowMs / 1000).toFixed(1)} с`
              : `${p.trials} trials · ${p.dirs.length} directions · ${(p.windowMs / 1000).toFixed(1)} s response window`}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {p.dirs.map(d => d === 'left' ? '←' : d === 'right' ? '→' : d === 'up' ? '↑' : '↓').join('  ')}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход уровня: ≥80% верных ответов (не успел в окно = ошибка)'
              : 'To pass: ≥80% correct answers (missing the window counts as an error)'}
          </Text>
          {lvl.level > 1 && (
            <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const padBtn = (d: Direction) => (
    <TouchableOpacity key={d} style={[styles.padBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handlePress(d)}>
      <Ionicons name={ARROW_ICON[d] as any} size={32} color="#FFF" />
    </TouchableOpacity>
  );

  const renderPad = () => {
    if (activeDirs.length === 4) {
      return (
        <View style={styles.padGrid}>
          <View style={styles.padRow}>
            <View style={styles.padCell} />
            {padBtn('up')}
            <View style={styles.padCell} />
          </View>
          <View style={styles.padRow}>
            {padBtn('left')}
            <View style={styles.padCell} />
            {padBtn('right')}
          </View>
          <View style={styles.padRow}>
            <View style={styles.padCell} />
            {padBtn('down')}
            <View style={styles.padCell} />
          </View>
        </View>
      );
    }
    if (activeDirs.length === 3) {
      return (
        <View style={styles.padGrid}>
          <View style={styles.padRow}>{padBtn('up')}</View>
          <View style={styles.padRow}>
            {padBtn('left')}
            <View style={styles.padCell} />
            {padBtn('right')}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.padRow}>
        {padBtn('left')}
        {padBtn('right')}
      </View>
    );
  };

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
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
      {renderPad()}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('choiceRt')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="choiceRt" icon="arrow-forward-circle" gradient={GRADIENT as [string, string]}
          skillKey="skillReaction" descriptionKey="choiceRtIntroDesc"
          benefits={CHOICE_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="choice_rt" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 100 - errors * 50 - meanRt * 0.1))}
          time={meanRt / 1000} errors={errors}
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
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18 },
  statText: { fontSize: 15, fontWeight: '700' },
  stimulusBox: { width: 200, height: 200, borderRadius: 24, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  waitText: { fontSize: 60, opacity: 0.5 },
  padGrid: { gap: 8, alignItems: 'center' },
  padRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  padBtn: { width: 64, height: 64, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  padCell: { width: 64, height: 64 },
});
