/**
 * Number Bonds — собери цель из слагаемых (разложение числа, ментальная арифметика).
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор сложности и числа задач
 * заменён на usePersistentLevel('number_bonds') + levelParams. Ось усложнения:
 *   - числа крупнее: max значение фишки 12 → 40
 *   - пул фишек шире: 8 → 12 (больше дистракторов)
 *   - решение длиннее: 2–3 слагаемых → 3–5
 *   - окно на задачу сокращается 45с → 15с (не уложился = ошибка, задача пропускается)
 *   - число задач растёт ступенями 6 → 8 → 10
 * Проход уровня: ≤2 ошибок за раунд → LevelCleared (авто-поток).
 * Пресеты (зарядка, wu=1): прежнее поведение — diff/trials из params, без окна, reach/fail не трогаем.
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
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';

const GRADIENT = ['#36d1dc', '#5b86e5'];
const NB_BENEFITS = [
  { icon: 'calculator-outline', textKey: 'benefitNumberBonds1' },
  { icon: 'shuffle-outline', textKey: 'benefitNumberBonds2' },
  { icon: 'git-merge-outline', textKey: 'benefitNumberBonds3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

interface Puzzle { target: number; chips: number[]; }
interface PuzzleCfg { pool: number; maxV: number; solMin: number; solMax: number; }

// Уровень 1..15: числа крупнее, пул фишек шире, решение длиннее,
// окно на задачу сокращается, число задач растёт ступенями (6 → 8 → 10).
function levelParams(level: number): PuzzleCfg & { trials: number; windowMs: number } {
  const trials = level <= 5 ? 6 : level <= 10 ? 8 : 10;
  const pool = Math.min(12, 8 + Math.floor((level - 1) / 3));      // 8 → 12 фишек
  const maxV = 12 + (level - 1) * 2;                               // max фишка 12 → 40
  const solMin = level <= 4 ? 2 : 3;
  const solMax = level <= 4 ? 3 : level <= 9 ? 4 : 5;              // слагаемых 2–3 → 3–5
  const windowMs = Math.max(15000, 45000 - (level - 1) * 2200);    // окно 45с → 15с
  return { trials, pool, maxV, solMin, solMax, windowMs };
}

// Пресеты зарядки (wu=1) продолжают ходить по старым diff-конфигам
const DIFF_CFG: Record<Difficulty, PuzzleCfg> = {
  easy:   { pool: 8,  maxV: 12, solMin: 2, solMax: 3 },
  medium: { pool: 9,  maxV: 18, solMin: 3, solMax: 4 },
  hard:   { pool: 12, maxV: 25, solMin: 3, solMax: 5 },
};

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function makePuzzle(cfg: PuzzleCfg): Puzzle {
  const solSize = cfg.solMin + Math.floor(Math.random() * (cfg.solMax - cfg.solMin + 1));

  // 1) Build a guaranteed solution: pick `solSize` distinct values
  const sol: number[] = [];
  const used = new Set<number>();
  while (sol.length < solSize) {
    const v = 1 + Math.floor(Math.random() * cfg.maxV);
    if (!used.has(v)) { used.add(v); sol.push(v); }
  }
  const target = sol.reduce((a, b) => a + b, 0);

  // 2) Add distractors so total == cfg.pool
  const distractors: number[] = [];
  let guard = 0;
  while (distractors.length < cfg.pool - sol.length && guard < 200) {
    const v = 1 + Math.floor(Math.random() * cfg.maxV);
    // avoid trivially equal-to-target chips (would be a 1-chip "solution")
    if (v !== target) distractors.push(v);
    guard++;
  }
  const chips = shuffle([...sol, ...distractors]);
  return { target, chips };
}

export default function NumberBondsGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset, str, num } = useGamePreset();
  const lvl = usePersistentLevel('number_bonds');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  // Пресет-параметры (только wu=1): вне пресета сложность идёт от уровня
  const [difficulty] = useState<Difficulty>(() => (str('diff', 'medium') as Difficulty));
  const [presetTrials] = useState(() => num('trials', 8));

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(8);
  const [puzzle, setPuzzle] = useState<Puzzle>({ target: 0, chips: [] });
  const [picked, setPicked] = useState<number[]>([]); // chip indices
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [roundLeft, setRoundLeft] = useState(0);   // остаток окна текущей задачи (сек), только уровневый режим
  const [clearedPassed, setClearedPassed] = useState(true);   // прошёл ли уровень (для баннера LevelCleared)

  // Рефы — счётчики/параметры раунда живут вне ре-рендеров: таймерная цепочка
  // (окно задачи → фидбек → следующая задача) в колбэках видела бы устаревший state
  // (паттерн cpt/simon).
  const levelRef = useRef(1);
  const cfgRef = useRef<PuzzleCfg>(DIFF_CFG.medium);
  const windowMsRef = useRef(0);          // 0 = без окна (пресет)
  const trialsRef = useRef(8);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const solvedRef = useRef(false);        // задача закрыта (решена или просрочена)
  const startTimeRef = useRef(0);
  const roundStartAtRef = useRef(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    [deadlineTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const newRound = () => {
    setPuzzle(makePuzzle(cfgRef.current));
    setPicked([]);
    setFeedback(null);
    solvedRef.current = false;
    roundStartAtRef.current = Date.now();
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    if (windowMsRef.current > 0) {
      setRoundLeft(windowMsRef.current / 1000);
      // Окно уровня: не уложился — ошибка, задача пропускается (иначе можно застрять навсегда)
      deadlineTimerRef.current = setTimeout(() => {
        if (solvedRef.current) return;
        solvedRef.current = true;
        if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
        errorsRef.current += 1;
        setErrors(errorsRef.current);
        setFeedback('wrong');
        fbTimerRef.current = setTimeout(advance, 600);
      }, windowMsRef.current);
    }
  };

  const advance = () => {
    if (roundRef.current >= trialsRef.current) { finish(); return; }
    roundRef.current += 1;
    setRound(roundRef.current);
    newRound();
  };

  const startGame = () => {
    clearAllTimers();
    if (isPreset) {
      // пресет зарядки: прежнее поведение (diff/trials из params, без окна времени)
      cfgRef.current = DIFF_CFG[difficulty];
      windowMsRef.current = 0;
      trialsRef.current = presetTrials;
      levelRef.current = 0;
    } else {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      cfgRef.current = { pool: p.pool, maxV: p.maxV, solMin: p.solMin, solMax: p.solMax };
      windowMsRef.current = p.windowMs;
      trialsRef.current = p.trials;
    }
    setTotalTrials(trialsRef.current);
    hitsRef.current = 0; errorsRef.current = 0; roundRef.current = 1;
    setHits(0); setErrors(0); setRound(1);
    setElapsedTime(0);
    setPhase('playing');
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      setElapsedTime((now - startTimeRef.current) / 1000);
      if (windowMsRef.current > 0) {
        setRoundLeft(Math.max(0, (windowMsRef.current - (now - roundStartAtRef.current)) / 1000));
      }
    }, 100);
    newRound();
  };

  const finish = async () => {
    clearAllTimers();
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = (h + e) > 0 ? h / (h + e) : 0;
    // Проход уровня: ≤2 ошибок за раунд (неверная сумма и просрочка окна = ошибка)
    const passed = !isPreset && e <= 2;
    if (isPreset) {
      setPhase('result');                       // пресет/свободный режим: экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
        setClearedPassed(true);
        setPhase('boss');
      } else {
        setClearedPassed(passed);
        setPhase('cleared');                     // непрерывный поток: провал → «почти, ещё раз» + авто-рестарт того же уровня
      }
    }
    try {
      await saveSession({
        game_type: 'number_bonds',
        score: Math.max(0, h * 100 - e * 25 - Math.floor(finalTime)),
        time_seconds: finalTime,
        difficulty: isPreset ? difficulty : (levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard'),
        mode: isPreset ? `${trialsRef.current}t` : `lvl${levelRef.current}`,
        errors: e,
        details: {
          hits: h,
          errors: e,
          trials: trialsRef.current,
          level: levelRef.current,
          accuracy: Math.round(accuracy * 100),
        },
      });
    } catch (err) { console.error(err); }
  };

  const togglePick = (idx: number) => {
    if (feedback !== null || solvedRef.current) return;
    setPicked((p) => p.includes(idx) ? p.filter((i) => i !== idx) : [...p, idx]);
  };

  const sumPicked = picked.reduce((s, i) => s + (puzzle.chips[i] ?? 0), 0);

  const validate = () => {
    if (feedback !== null || solvedRef.current) return;
    if (picked.length < 2) {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      hapticError();
      fbTimerRef.current = setTimeout(() => setFeedback(null), 600);
      return;
    }
    const correct = sumPicked === puzzle.target;
    if (correct) {
      solvedRef.current = true;
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
      hitsRef.current += 1;
      setHits(hitsRef.current);
      setFeedback('right');
      hapticSuccess();
      fbTimerRef.current = setTimeout(advance, 700);
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      hapticError();
      // неверная сумма: та же задача, сброс выбора (окно продолжает тикать)
      fbTimerRef.current = setTimeout(() => { setPicked([]); setFeedback(null); }, 700);
    }
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="git-merge" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('numberBonds')}</Text>
          <Text style={styles.configDesc}>{t('numberBondsDesc')}</Text>
        </LinearGradient>

        <LevelProgressMap gameId="number_bonds" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} задач · числа до ${p.maxV} · фишек ${p.pool} · слагаемых ${p.solMin}–${p.solMax} · ${Math.round(p.windowMs / 1000)} с на задачу`
              : `${p.trials} puzzles · numbers up to ${p.maxV} · ${p.pool} chips · ${p.solMin}–${p.solMax} addends · ${Math.round(p.windowMs / 1000)}s per puzzle`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход уровня: не больше 2 ошибок (неверная сумма или не уложился в окно = ошибка)'
              : 'To pass: at most 2 errors (a wrong sum or missing the time window counts as an error)'}
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        {!isPreset && (
          <Text style={[styles.statText, { color: roundLeft <= 5 ? '#f43f5e' : colors.text }]}>
            ⏱{Math.ceil(roundLeft)}{language === 'ru' ? 'с' : 's'}
          </Text>
        )}
        <Text style={[styles.statText, { color: colors.textSecondary }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('numberBondsHint')}</Text>
      <View style={[styles.targetBox, {
        borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : GRADIENT[1],
        backgroundColor: feedback === 'right' ? '#22c55e22' : feedback === 'wrong' ? '#f43f5e22' : colors.surface,
      }]}>
        <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>Σ =</Text>
        <Text style={[styles.targetVal, { color: GRADIENT[1] }]}>{puzzle.target}</Text>
        <Text style={[styles.runningSum, { color: sumPicked === puzzle.target ? '#22c55e' : colors.text }]}>
          {sumPicked}
        </Text>
      </View>
      <View style={styles.chipsArea}>
        {puzzle.chips.map((v, i) => {
          const sel = picked.includes(i);
          return (
            <TouchableOpacity key={i}
              onPress={() => togglePick(i)}
              disabled={feedback !== null}
              style={[styles.chip, {
                backgroundColor: sel ? GRADIENT[1] : colors.surface,
                borderColor: sel ? GRADIENT[0] : colors.border,
              }]}
            >
              <Text style={[styles.chipText, { color: sel ? '#FFF' : colors.text }]}>{v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setPicked([])}>
          <Text style={[styles.actionTxt, { color: colors.text }]}>{t('clearBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={validate}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.actionGrad}>
            <Text style={styles.actionTxt}>{t('validateBtn')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('numberBonds')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="numberBonds" icon="git-merge" gradient={GRADIENT as [string, string]}
          skillKey="skillMath" descriptionKey="numberBondsIntroDesc"
          benefits={NB_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="number_bonds" level={levelRef.current}
          passed={clearedPassed}
          stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 25 - Math.floor(elapsedTime))}
          time={elapsedTime} errors={errors}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center' },
  targetBox: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16, borderWidth: 2 },
  targetLabel: { fontSize: 16, fontWeight: '600' },
  targetVal: { fontSize: 36, fontWeight: '900' },
  runningSum: { fontSize: 18, fontWeight: '700', marginLeft: 8 },
  chipsArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 420 },
  chip: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  chipText: { fontSize: 20, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10 },
  actionBtnPrimary: { borderRadius: 10, overflow: 'hidden' },
  actionGrad: { paddingVertical: 12, paddingHorizontal: 22 },
  actionTxt: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
