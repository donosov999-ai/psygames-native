/**
 * Posner Cueing Task — пространственное внимание (orienting).
 *
 * Парадигма: в центре фиксация, стрелка-подсказка (cue) указывает налево/направо,
 * затем цель появляется слева или справа. Valid cue = указала верно, invalid = соврала,
 * neutral = «+» без направления. Validity effect = RT_invalid − RT_valid (стоимость
 * перенацеливания внимания).
 *
 * Уровни (persist, по паттерну cpt/simon): ручные селекторы сложности и числа проб
 * заменены на usePersistentLevel('posner') + levelParams. Ось усложнения:
 *   - валидность подсказки падает 80% → 50% (подсказка чаще врёт = труднее ей доверять)
 *   - интервал cue→target варьируется сильнее: узкий 150-250мс → широкий 80-700мс
 *   - окно ответа сокращается 2200мс → 900мс (не успел = ошибка-пропуск)
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
import GameShell from '@/src/components/GameShell';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { hapticSuccess, hapticError } from '@/src/components/juice';

const GRADIENT = ['#3a6186', '#89253e'];
const POSNER_BENEFITS = [
  { icon: 'eye-outline',         textKey: 'benefitPosner1' },
  { icon: 'navigate-outline',    textKey: 'benefitPosner2' },
  { icon: 'flash-outline',       textKey: 'benefitPosner3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
type CueValidity = 'valid' | 'invalid' | 'neutral';
type Side = 'left' | 'right';

interface Trial { cueDir: Side | null; targetSide: Side; validity: CueValidity; }

const NEUTRAL_RATIO = 0.15;   // доля нейтральных проб фиксирована — меняется только valid/invalid баланс
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

// Уровень 1..15 (ось — по образцу cpt): валидность подсказки падает (подсказка чаще
// врёт), интервал cue→target варьируется сильнее (цель труднее «поймать» по ритму),
// окно ответа сокращается, число проб растёт ступенями.
function levelParams(level: number): { trials: number; validRatio: number; windowMs: number; soaMinMs: number; soaMaxMs: number } {
  const trials = level <= 5 ? 12 : level <= 10 ? 16 : 20;
  const validRatio = Math.max(0.5, 0.8 - (level - 1) * 0.022);   // 80% → 50%
  const windowMs = Math.max(900, 2200 - (level - 1) * 95);       // 2200мс → 900мс
  const soaMinMs = Math.max(80, 150 - (level - 1) * 5);          // пауза cue→target: от 150-250мс
  const soaMaxMs = Math.min(700, 250 + (level - 1) * 33);        //   до 80-700мс (сильное дрожание)
  return { trials, validRatio, windowMs, soaMinMs, soaMaxMs };
}

function makeTrial(validRatio: number): Trial {
  const r = Math.random();
  let validity: CueValidity;
  if (r < validRatio) validity = 'valid';
  else if (r < validRatio + NEUTRAL_RATIO) validity = 'neutral';
  else validity = 'invalid';
  const targetSide: Side = Math.random() < 0.5 ? 'left' : 'right';
  let cueDir: Side | null;
  if (validity === 'valid') cueDir = targetSide;
  else if (validity === 'invalid') cueDir = targetSide === 'left' ? 'right' : 'left';
  else cueDir = null;
  return { cueDir, targetSide, validity };
}

export default function PosnerGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('posner');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [trial, setTrial] = useState<Trial>({ cueDir: null, targetSide: 'left', validity: 'neutral' });
  const [showCue, setShowCue] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rtsByValidity, setRtsByValidity] = useState<Record<CueValidity, number[]>>({ valid: [], invalid: [], neutral: [] });

  // Рефы — таймерная цепочка (cue → пауза → target → дедлайн → следующая проба)
  // живёт вне ре-рендеров, state в её колбэках был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const validRatioRef = useRef(0.8);
  const windowMsRef = useRef(2200);
  const soaMinRef = useRef(150);
  const soaMaxRef = useRef(250);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const rtsRef = useRef<Record<CueValidity, number[]>>({ valid: [], invalid: [], neutral: [] });
  const trialRef = useRef<Trial>({ cueDir: null, targetSide: 'left', validity: 'neutral' });
  const stimAtRef = useRef(0);
  const answeredRef = useRef(false);
  const startTimeRef = useRef(0);

  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cueOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [cueTimerRef, cueOffTimerRef, gapTimerRef, deadlineTimerRef, fbTimerRef]
      .forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearAllTimers(), []);

  const newTrial = () => {
    setShowCue(false); setShowTarget(false); setFeedback(null);
    const tr = makeTrial(validRatioRef.current);
    trialRef.current = tr;
    setTrial(tr);
    cueTimerRef.current = setTimeout(() => {
      setShowCue(true);
      // cue виден 100мс, затем пауза (SOA уровня — варьируется сильнее с уровнем), затем цель
      cueOffTimerRef.current = setTimeout(() => {
        setShowCue(false);
        const gap = soaMinRef.current + Math.random() * (soaMaxRef.current - soaMinRef.current);
        gapTimerRef.current = setTimeout(() => {
          stimAtRef.current = Date.now();
          answeredRef.current = false;
          setShowTarget(true);
          // Окно ответа уровня: не успел — ошибка-пропуск, проба закрывается сама
          deadlineTimerRef.current = setTimeout(() => {
            if (answeredRef.current) return;
            answeredRef.current = true;
            errorsRef.current += 1;
            setErrors(errorsRef.current);
            setFeedback('wrong');
            fbTimerRef.current = setTimeout(advance, 350);
          }, windowMsRef.current);
        }, gap);
      }, 100);
    }, 600 + Math.random() * 400);
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
    validRatioRef.current = p.validRatio;
    windowMsRef.current = p.windowMs;
    soaMinRef.current = p.soaMinMs;
    soaMaxRef.current = p.soaMaxMs;
    totalTrialsRef.current = p.trials;
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0;
    rtsRef.current = { valid: [], invalid: [], neutral: [] };
    roundRef.current = 1;
    setHits(0); setErrors(0);
    setRtsByValidity({ valid: [], invalid: [], neutral: [] });
    setRound(1);
    setPhase('playing');
    startTimeRef.current = Date.now();
    newTrial();
  };

  const finish = async () => {
    clearAllTimers();
    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    const rts = rtsRef.current;
    const meanV = rts.valid.length ? rts.valid.reduce((a, b) => a + b, 0) / rts.valid.length : 0;
    const meanI = rts.invalid.length ? rts.invalid.reduce((a, b) => a + b, 0) / rts.invalid.length : 0;
    const validityEffect = Math.round(meanI - meanV);
    const flatten = [...rts.valid, ...rts.invalid, ...rts.neutral];
    const meanRt = flatten.length ? flatten.reduce((a, b) => a + b, 0) / flatten.length : 0;
    const h = hitsRef.current, e = errorsRef.current;
    const accuracy = totalTrialsRef.current > 0 ? h / totalTrialsRef.current : 0;
    // Проход уровня: ≥80% верных за раунд (пропуски по окну = ошибки)
    const passed = accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');   // пресет/свободный режим — уровень не трогаем, экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      // непрерывный поток: проход ИЛИ «почти» → баннер уровня, авто-рестарт.
      // веха: уровень засчитан (reach выше) → короткий босс, потом баннер cleared
      if (passed && levelRef.current % BOSS_EVERY === 0) {
        setClearedPassed(true);
        setPhase('boss');
      } else {
        setClearedPassed(passed);
        setPhase('cleared');
      }
    }
    try {
      await saveSession({
        game_type: 'posner',
        score: Math.max(0, Math.round(h * 80 - e * 60 - meanRt * 0.05)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          validity_effect_ms: validityEffect,
          accuracy: Math.round(accuracy * 100),
          n_trials: totalTrialsRef.current,
        },
      });
    } catch (err) { console.error(err); }
  };

  const handleAnswer = (side: Side) => {
    if (!showTarget || feedback !== null || answeredRef.current) return;
    answeredRef.current = true;
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    const rt = Date.now() - stimAtRef.current;
    const tr = trialRef.current;
    const ok = side === tr.targetSide;
    if (ok) {
      hapticSuccess();
      hitsRef.current += 1;
      setHits(hitsRef.current);
      rtsRef.current[tr.validity].push(rt);
      setRtsByValidity({ valid: [...rtsRef.current.valid], invalid: [...rtsRef.current.invalid], neutral: [...rtsRef.current.neutral] });
    } else {
      hapticError();
      errorsRef.current += 1;
      setErrors(errorsRef.current);
    }
    setFeedback(ok ? 'right' : 'wrong');
    fbTimerRef.current = setTimeout(advance, 350);
  };

  const meanRtAll = (() => {
    const all = [...rtsByValidity.valid, ...rtsByValidity.invalid, ...rtsByValidity.neutral];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  })();
  const validityEffect = (() => {
    const v = rtsByValidity.valid, i = rtsByValidity.invalid;
    if (!v.length || !i.length) return 0;
    return Math.round(i.reduce((a, b) => a + b, 0) / i.length - v.reduce((a, b) => a + b, 0) / v.length);
  })();

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="navigate" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('posner')}</Text>
          <Text style={styles.configDesc}>{t('posnerDesc')}</Text>
        </LinearGradient>

        <LevelProgressMap gameId="posner" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} проб · подсказка верна ~${Math.round(p.validRatio * 100)}% · окно ответа ${(p.windowMs / 1000).toFixed(1)} с`
              : `${p.trials} trials · cue valid ~${Math.round(p.validRatio * 100)}% · ${(p.windowMs / 1000).toFixed(1)} s response window`}
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

  // playing-фаза — на едином каркасе GameShell (стрелки ответа прибиты к низу)
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('posner')}
        onBack={() => { clearAllTimers(); goBackOrHome(); }}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
            <Text style={[styles.statText, { color: colors.text }]}>{meanRtAll}{language === 'ru' ? 'мс' : 'ms'}</Text>
            <Text style={[styles.statText, { color: colors.text }]}>VE {validityEffect}</Text>
          </View>
        }
        toolbar={
          <>
            <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[0] }]} onPress={() => handleAnswer('left')}>
              <Ionicons name="arrow-back" size={32} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: GRADIENT[1] }]} onPress={() => handleAnswer('right')}>
              <Ionicons name="arrow-forward" size={32} color="#FFF" />
            </TouchableOpacity>
          </>
        }
      >
        <View style={styles.fieldCol}>
          <View style={[styles.stimBox, { backgroundColor: colors.surface, borderColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : colors.border }]}>
            {/* left target slot */}
            <View style={[styles.targetSlot, { borderColor: colors.border }]}>
              {showTarget && trial.targetSide === 'left' && <View style={[styles.target, { backgroundColor: GRADIENT[1] }]} />}
            </View>
            {/* center fixation + cue */}
            <View style={styles.center}>
              {showCue && trial.cueDir && (
                <Ionicons name={trial.cueDir === 'left' ? 'arrow-back' : 'arrow-forward'} size={36} color="#fbbf24" />
              )}
              {showCue && !trial.cueDir && <Text style={{ color: '#fbbf24', fontSize: 36 }}>+</Text>}
              {!showCue && <Text style={{ color: colors.textSecondary, fontSize: 28 }}>+</Text>}
            </View>
            {/* right target slot */}
            <View style={[styles.targetSlot, { borderColor: colors.border }]}>
              {showTarget && trial.targetSide === 'right' && <View style={[styles.target, { backgroundColor: GRADIENT[1] }]} />}
            </View>
          </View>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('posnerHint')}</Text>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('posner')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="posner" icon="navigate" gradient={GRADIENT as [string, string]}
          skillKey="skillFocus" descriptionKey="posnerIntroDesc"
          benefits={POSNER_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'gonogo', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="posner" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors} passed={clearedPassed}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 80 - errors * 60 - meanRtAll * 0.05))}
          time={meanRtAll / 1000} errors={errors}
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
  fieldCol: { alignItems: 'center', gap: 18, alignSelf: 'stretch' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  stimBox: { width: 380, maxWidth: '100%', height: 130, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30 },
  targetSlot: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  target: { width: 30, height: 30, borderRadius: 15 },
  center: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  choiceBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
});
