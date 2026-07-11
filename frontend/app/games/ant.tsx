/**
 * ANT — Attention Network Test (Fan, McCandliss, Sommer, Raz, Posner 2002).
 *
 * Cue type: none / center / double / spatial
 * Target: arrow at top or bottom, flanked by congruent or incongruent arrows
 * Three networks measured:
 *  alerting = RT(no cue) - RT(double cue)
 *  orienting = RT(center cue) - RT(spatial cue)
 *  executive = RT(incongruent) - RT(congruent)
 *
 * Уровни (persist, по паттерну cpt/simon): ручной селектор числа проб заменён на
 * usePersistentLevel('ant') + levelParams. Ось усложнения:
 *   - вариативность интервалов растёт (пред-пауза и CTOA всё менее предсказуемы —
 *     alerting-сеть нельзя «завести» ритмом)
 *   - окно ответа сокращается 3000мс → 1040мс (не успел = ошибка-пропуск)
 *   - число проб растёт ступенями 12 → 16 → 20
 *   - доля конфликтных (incongruent) проб растёт умеренно 30% → 55%
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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#005C97', '#363795'];
const ANT_BENEFITS = [
  { icon: 'eye-outline',     textKey: 'benefitAnt1' },
  { icon: 'navigate-outline',textKey: 'benefitAnt2' },
  { icon: 'flash-outline',   textKey: 'benefitAnt3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type CueType = 'none' | 'center' | 'double' | 'spatial';
type Congruence = 'congruent' | 'incongruent' | 'neutral';
type Direction = 'left' | 'right';
type Position = 'top' | 'bottom';

interface Trial { cue: CueType; pos: Position; dir: Direction; cong: Congruence; flankers: Direction[] | null; }
interface RtRec { cue: CueType; cong: Congruence; rt: number; }

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Уровень 1..15: интервалы всё менее предсказуемы, окно ответа сокращается,
// число проб растёт ступенями, доля конфликтных проб растёт умеренно.
function levelParams(level: number): {
  trials: number; incongruentProb: number; windowMs: number; preJitterMs: number; ctoaVarMs: number;
} {
  const trials = level <= 5 ? 12 : level <= 10 ? 16 : 20;
  const incongruentProb = Math.min(0.55, 0.30 + (level - 1) * 0.018);   // 30% → 55%
  const windowMs = Math.max(1000, 3000 - (level - 1) * 140);            // 3000мс → 1040мс
  const preJitterMs = 400 + (level - 1) * 80;                           // разброс пред-паузы 400 → 1520мс
  const ctoaVarMs = 100 + (level - 1) * 40;                             // разброс CTOA 100 → 660мс
  return { trials, incongruentProb, windowMs, preJitterMs, ctoaVarMs };
}

// Доля neutral фиксирована (~20%), остальное делят congruent/incongruent по уровню
function makeTrial(incongruentProb: number): Trial {
  const cue = rndItem<CueType>(['none','center','double','spatial']);
  const pos = rndItem<Position>(['top','bottom']);
  const dir = rndItem<Direction>(['left','right']);
  const r = Math.random();
  const cong: Congruence = r < incongruentProb ? 'incongruent' : r < incongruentProb + 0.2 ? 'neutral' : 'congruent';
  let flankers: Direction[] | null;
  if (cong === 'congruent') flankers = [dir, dir, dir, dir];
  else if (cong === 'incongruent') {
    const opp: Direction = dir === 'left' ? 'right' : 'left';
    flankers = [opp, opp, opp, opp];
  } else flankers = null;
  return { cue, pos, dir, cong, flankers };
}

export default function ANTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('ant');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [trial, setTrial] = useState<Trial>({ cue: 'none', pos: 'top', dir: 'left', cong: 'neutral', flankers: null });
  const [showCue, setShowCue] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<RtRec[]>([]);

  // Рефы — таймерная цепочка (пред-пауза → cue → blank → target → дедлайн → next)
  // живёт вне ре-рендеров, state в её колбэках был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const incongruentProbRef = useRef(0.3);
  const windowMsRef = useRef(3000);
  const preJitterRef = useRef(400);
  const ctoaVarRef = useRef(100);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<RtRec[]>([]);
  const trialRef = useRef<Trial>({ cue: 'none', pos: 'top', dir: 'left', cong: 'neutral', flankers: null });
  const stimAtRef = useRef(0);
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);

  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [cueTimer, targetTimer, blankTimer, deadlineTimer, fbTimer].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const onTargetShown = () => {
    stimAtRef.current = Date.now();
    answeredRef.current = false;
    setShowTarget(true);
    // Окно ответа уровня: не успел — ошибка-пропуск, проба закрывается сама
    deadlineTimer.current = setTimeout(() => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      errorsRef.current += 1;
      setErrors(errorsRef.current);
      setFeedback('wrong');
      fbTimer.current = setTimeout(advance, 350);
    }, windowMsRef.current);
  };

  const newTrial = () => {
    setShowCue(false); setShowTarget(false); setFeedback(null);
    const tr = makeTrial(incongruentProbRef.current);
    trialRef.current = tr;
    setTrial(tr);
    // Пред-пауза: разброс растёт с уровнем — момент cue нельзя предугадать
    cueTimer.current = setTimeout(() => {
      if (tr.cue !== 'none') {
        setShowCue(true);
        targetTimer.current = setTimeout(() => {
          setShowCue(false);
          // CTOA-вариативность уровня: blank 300..300+ctoaVar (вместо фикс. 400мс)
          blankTimer.current = setTimeout(onTargetShown, 300 + Math.random() * ctoaVarRef.current);
        }, 100);
      } else {
        // no cue → сопоставимая по времени пауза, тоже с вариативностью уровня
        blankTimer.current = setTimeout(onTargetShown, 400 + Math.random() * ctoaVarRef.current);
      }
    }, 400 + Math.random() * preJitterRef.current);
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
    incongruentProbRef.current = p.incongruentProb;
    windowMsRef.current = p.windowMs;
    preJitterRef.current = p.preJitterMs;
    ctoaVarRef.current = p.ctoaVarMs;
    totalTrialsRef.current = p.trials;
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0; rtsRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setRts([]); setRound(1);
    setPhase('playing');
    startTimeRef.current = Date.now();
    newTrial();
  };

  const calcMeans = (data: RtRec[]) => {
    const filt = (pred: (r: RtRec) => boolean) => {
      const arr = data.filter(pred).map(r => r.rt);
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    };
    const alerting = filt(r => r.cue === 'none') - filt(r => r.cue === 'double');
    const orienting = filt(r => r.cue === 'center') - filt(r => r.cue === 'spatial');
    const executive = filt(r => r.cong === 'incongruent') - filt(r => r.cong === 'congruent');
    const meanRt = data.length ? data.reduce((a, b) => a + b.rt, 0) / data.length : 0;
    return { alerting: Math.round(alerting), orienting: Math.round(orienting), executive: Math.round(executive), meanRt: Math.round(meanRt) };
  };

  const finish = async () => {
    clearAllTimers();
    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    const m = calcMeans(rtsRef.current);
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = totalTrialsRef.current > 0 ? h / totalTrialsRef.current : 0;
    // Проход уровня: ≥80% верных за раунд (пропуски по окну = ошибки)
    const passed = !isPreset && accuracy >= 0.8;
    if (passed) lvl.reach(levelRef.current + 1);
    else if (!isPreset) lvl.fail();
    setPhase(passed ? 'cleared' : 'result');   // авто-поток к следующему уровню
    try {
      await saveSession({
        game_type: 'ant',
        score: Math.max(0, Math.round(h * 60 - e * 50 - m.meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          accuracy: Math.round(accuracy * 100),
          n_trials: totalTrialsRef.current,
          mean_rt: m.meanRt, alerting_ms: m.alerting, orienting_ms: m.orienting, executive_ms: m.executive,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (d: Direction) => {
    if (!showTarget || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimer.current) clearTimeout(deadlineTimer.current);
    const rt = Date.now() - stimAtRef.current;
    const tr = trialRef.current;
    const ok = d === tr.dir;
    if (ok) {
      hitsRef.current += 1;
      setHits(hitsRef.current);
      rtsRef.current = [...rtsRef.current, { cue: tr.cue, cong: tr.cong, rt }];
      setRts(rtsRef.current);
    } else {
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(ok ? 'right' : 'wrong');
    fbTimer.current = setTimeout(advance, 350);
  };

  const m = calcMeans(rts);

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="git-network" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('ant')}</Text>
          <Text style={styles.configDesc}>{t('antDesc')}</Text>
        </LinearGradient>

        <LevelProgressMap gameId="ant" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} проб · конфликтных ~${Math.round(p.incongruentProb * 100)}% · окно ответа ${(p.windowMs / 1000).toFixed(1)} с · паузы всё непредсказуемее`
              : `${p.trials} trials · ~${Math.round(p.incongruentProb * 100)}% conflict · ${(p.windowMs / 1000).toFixed(1)} s response window · less predictable pauses`}
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

  const arrowFor = (d: Direction, size: number, color: string) => (
    <Ionicons name={d === 'left' ? 'arrow-back' : 'arrow-forward'} size={size} color={color} />
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{m.meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
      </View>
      <View style={[styles.networkRow]}>
        <Text style={[styles.netText, { color: '#22c55e' }]}>A {m.alerting}</Text>
        <Text style={[styles.netText, { color: '#fbbf24' }]}>O {m.orienting}</Text>
        <Text style={[styles.netText, { color: '#ef4444' }]}>E {m.executive}</Text>
      </View>
      <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
        {/* top cue / target slot */}
        <View style={styles.row}>
          {showCue && (trial.cue === 'double' || (trial.cue === 'spatial' && trial.pos === 'top')) && <Text style={styles.cueDot}>*</Text>}
          {showTarget && trial.pos === 'top' && (
            <View style={styles.arrowRow}>
              {trial.flankers ? trial.flankers.slice(0, 2).map((d, i) => <View key={'l'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'l'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
              <View style={{ marginHorizontal: 4 }}>{arrowFor(trial.dir, 32, colors.text)}</View>
              {trial.flankers ? trial.flankers.slice(2).map((d, i) => <View key={'r'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'r'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
            </View>
          )}
        </View>
        {/* center fixation */}
        <View style={styles.row}>
          {showCue && trial.cue === 'center' && <Text style={styles.cueDot}>*</Text>}
          {!showCue || trial.cue !== 'center' ? <Text style={{ color: colors.textSecondary, fontSize: 22 }}>+</Text> : null}
        </View>
        {/* bottom */}
        <View style={styles.row}>
          {showCue && (trial.cue === 'double' || (trial.cue === 'spatial' && trial.pos === 'bottom')) && <Text style={styles.cueDot}>*</Text>}
          {showTarget && trial.pos === 'bottom' && (
            <View style={styles.arrowRow}>
              {trial.flankers ? trial.flankers.slice(0, 2).map((d, i) => <View key={'l'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'l'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
              <View style={{ marginHorizontal: 4 }}>{arrowFor(trial.dir, 32, colors.text)}</View>
              {trial.flankers ? trial.flankers.slice(2).map((d, i) => <View key={'r'+i}>{arrowFor(d, 22, '#888')}</View>) : ['—','—'].map((s, i) => <Text key={'r'+i} style={{ fontSize: 22, color: '#888' }}>{s}</Text>)}
            </View>
          )}
        </View>
      </View>
      <View style={styles.choiceRow}>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handleAnswer('left')}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1] }]} onPress={() => handleAnswer('right')}>
          <Ionicons name="arrow-forward" size={28} color="#FFF" />
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
        <Text style={[styles.title, { color: colors.text }]}>{t('ant')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="ant" icon="git-network" gradient={GRADIENT as [string, string]}
          skillKey="skillFocus" descriptionKey="antIntroDesc"
          benefits={ANT_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="ant" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 60 - errors * 50 - m.meanRt * 0.05))}
          time={m.meanRt / 1000} errors={errors}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  networkRow: { flexDirection: 'row', gap: 18 },
  netText: { fontSize: 12, fontWeight: '700' },
  statText: { fontSize: 13, fontWeight: '700' },
  stimBox: { width: 380, height: 220, borderRadius: 14, borderWidth: 2, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  row: { height: 50, justifyContent: 'center', alignItems: 'center' },
  cueDot: { color: '#fbbf24', fontSize: 36, fontWeight: '900' },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  choiceRow: { flexDirection: 'row', gap: 24 },
  choiceBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
});
