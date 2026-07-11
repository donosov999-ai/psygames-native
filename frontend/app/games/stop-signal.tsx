/**
 * Stop-Signal Task — классика inhibitory control (response inhibition).
 *
 * Парадигма: после фиксации появляется сигнал GO — надо нажать кнопку как можно
 * быстрее. В части проб через SSD мс после GO появляется СТОП-сигнал (✋) —
 * ответ надо подавить (не нажимать). Нажатие на стоп-пробе = failed inhibition
 * (в т.ч. если нажал ДО появления стопа — как в реальном SST, любой ответ на
 * стоп-пробе считается провалом торможения). Пропуск GO = omission-ошибка.
 *
 * Уровни (persist, по паттерну cpt/simon): ручные селекторы сложности и числа
 * проб заменены на usePersistentLevel('stop_signal') + levelParams. Ось усложнения:
 *   - SSD растёт 150мс → 430мс (стоп-сигнал появляется ПОЗЖЕ — ответ уже
 *     запущен, тормозить труднее; race model)
 *   - доля стоп-проб растёт 20% → 40%
 *   - окно ответа сокращается 1400мс → 700мс (темп: медлить с GO тоже нельзя)
 *   - число проб ступенями 12 → 16 → 20
 * Проход уровня: ≥80% верных проб → LevelCleared (авто-поток к следующему).
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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

const GRADIENT = ['#ee0979', '#ff6a00'];
const STOP_BENEFITS = [
  { icon: 'hand-left-outline', textKey: 'benefitStopSignal1' },
  { icon: 'pause-circle-outline', textKey: 'benefitStopSignal2' },
  { icon: 'flash-off-outline', textKey: 'benefitStopSignal3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type SignalState = 'idle' | 'go' | 'stop' | 'feedback';
type TrialOutcome = 'go_hit' | 'go_miss' | 'stop_ok' | 'stop_fail';

// Уровень 1..15 (непрерывный маппинг бывшей DIFF-таблицы easy/medium/hard):
//   - ssd растёт (стоп-сигнал позже = ответ уже запущен = тормозить труднее)
//   - доля стоп-проб растёт (нельзя расслабиться в «всегда жми»)
//   - окно ответа сокращается (темп: тянуть с GO тоже нельзя)
function levelParams(level: number): { trials: number; stopProb: number; ssd: number; goWindow: number } {
  const trials = level <= 5 ? 12 : level <= 10 ? 16 : 20;         // 12 → 16 → 20
  const ssd = Math.min(430, 150 + (level - 1) * 20);              // 150мс → 430мс
  const stopProb = Math.min(0.4, 0.2 + (level - 1) * 0.015);      // 20% → 40%
  const goWindow = Math.max(700, 1400 - (level - 1) * 50);        // 1400мс → 700мс
  return { trials, stopProb, ssd, goWindow };
}

export default function StopSignalGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('stop_signal');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [clearedPassed, setClearedPassed] = useState(true);

  const [round, setRound] = useState(0);
  const [totalTrials, setTotalTrials] = useState(12);
  const [signal, setSignal] = useState<SignalState>('idle');
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  const [hits, setHits] = useState(0);                 // Go pressed correctly
  const [errors, setErrors] = useState(0);             // Go missed OR Stop violated
  const [correctStops, setCorrectStops] = useState(0); // Stop trials successfully inhibited
  const [rts, setRts] = useState<number[]>([]);

  // Рефы — таймерная цепочка (фиксация → GO → стоп/дедлайн → следующая проба)
  // живёт вне ре-рендеров, state в её колбэках был бы устаревшим (паттерн simon/cpt).
  const levelRef = useRef(1);
  const stopProbRef = useRef(0.2);
  const ssdRef = useRef(150);
  const goWindowRef = useRef(1400);
  const totalTrialsRef = useRef(12);
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const correctStopsRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const trialIsStopRef = useRef(false);
  const goAtRef = useRef<number>(0);
  const respondedRef = useRef<boolean>(false);
  const startTimeRef = useRef(0);

  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    [goTimerRef, stopTimerRef, endTimerRef, interTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
  };

  useEffect(() => () => clearTimers(), []);

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    stopProbRef.current = p.stopProb;
    ssdRef.current = p.ssd;
    goWindowRef.current = p.goWindow;
    totalTrialsRef.current = p.trials;
    setTotalTrials(p.trials);
    hitsRef.current = 0; errorsRef.current = 0; correctStopsRef.current = 0;
    rtsRef.current = [];
    roundRef.current = 1;
    setHits(0); setErrors(0); setCorrectStops(0); setRts([]);
    setRound(1);
    setSignal('idle'); setFeedback(null);
    setPhase('playing');
    startTimeRef.current = Date.now();
    nextTrial();
  };

  const finish = async () => {
    clearTimers();
    const totalTime = (Date.now() - startTimeRef.current) / 1000;
    const h = hitsRef.current, e = errorsRef.current, cs = correctStopsRef.current;
    const finalRts = rtsRef.current;
    const meanRt = finalRts.length ? finalRts.reduce((a, b) => a + b, 0) / finalRts.length : 0;
    const total = totalTrialsRef.current;
    // Проход уровня: ≥80% верных проб (верная = go_hit или stop_ok;
    // ошибки — ОБЕ по механике: пропуск GO и нажатие на стоп-пробе)
    const accuracy = total > 0 ? (h + cs) / total : 0;
    const passed = accuracy >= 0.8;
    if (isPreset) {
      setPhase('result');                        // пресет/свободный режим — экран статистики
    } else {
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');                       // непрерывный поток: и проход, и провал → баннер уровня
    }
    try {
      await saveSession({
        game_type: 'stop_signal',
        score: Math.max(0, Math.round(h * 50 + cs * 100 - e * 60 - meanRt * 0.1)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: e,
        details: {
          level: levelRef.current,
          mean_rt: Math.round(meanRt),
          hits: h,
          correct_stops: cs,
          accuracy: Math.round(accuracy * 100),
          n_trials: total,
          ssd_ms: ssdRef.current,
        },
      });
    } catch (err) { console.error(err); }
  };

  const nextTrial = () => {
    const isStop = Math.random() < stopProbRef.current;
    trialIsStopRef.current = isStop;
    setSignal('idle');
    setFeedback(null);
    respondedRef.current = false;

    const fixDelay = 700 + Math.random() * 700;
    goTimerRef.current = setTimeout(() => {
      setSignal('go');
      goAtRef.current = Date.now();
      // schedule stop signal if applicable (SSD уровня)
      if (isStop) {
        stopTimerRef.current = setTimeout(() => {
          if (!respondedRef.current) setSignal('stop');
        }, ssdRef.current);
      }
      // end trial window (окно ответа уровня)
      endTimerRef.current = setTimeout(() => {
        if (respondedRef.current) return;
        // No press — Go = miss; Stop = correct inhibition
        endTrial(isStop ? 'stop_ok' : 'go_miss', 0);
      }, goWindowRef.current);
    }, fixDelay);
  };

  const endTrial = (outcome: TrialOutcome, rt: number) => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    let fb: 'right' | 'wrong' = 'right';
    if (outcome === 'go_hit')   { hitsRef.current += 1; rtsRef.current = [...rtsRef.current, rt]; fb = 'right'; }
    if (outcome === 'go_miss')  { errorsRef.current += 1; fb = 'wrong'; }
    if (outcome === 'stop_ok')  { correctStopsRef.current += 1; fb = 'right'; }
    if (outcome === 'stop_fail'){ errorsRef.current += 1; fb = 'wrong'; }
    setHits(hitsRef.current); setErrors(errorsRef.current); setCorrectStops(correctStopsRef.current);
    setRts([...rtsRef.current]);
    setSignal('feedback'); setFeedback(fb);
    interTimerRef.current = setTimeout(() => {
      if (roundRef.current >= totalTrialsRef.current) { finish(); return; }
      roundRef.current += 1;
      setRound(roundRef.current);
      nextTrial();
    }, 600);
  };

  const onPressGo = () => {
    if (respondedRef.current) return;
    if (signal !== 'go' && signal !== 'stop') return;
    respondedRef.current = true;
    const rt = Date.now() - goAtRef.current;
    // Нажатие на стоп-пробе = failed inhibition, даже если стоп ещё не показан
    if (signal === 'stop' || trialIsStopRef.current) endTrial('stop_fail', rt);
    else endTrial('go_hit', rt);
  };

  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="hand-left" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('stopSignal')}</Text>
          <Text style={styles.configDesc}>{t('stopSignalDesc')}</Text>
        </LinearGradient>
        <LevelProgressMap gameId="stop_signal" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {language === 'ru'
              ? `${p.trials} проб · стоп-сигналов ~${Math.round(p.stopProb * 100)}% · стоп через ${p.ssd} мс · окно ${(p.goWindow / 1000).toFixed(1)} с`
              : `${p.trials} trials · ~${Math.round(p.stopProb * 100)}% stop signals · stop at ${p.ssd} ms · ${(p.goWindow / 1000).toFixed(1)} s window`}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход уровня: ≥80% верных проб (нажал при ✋ или пропустил GO = ошибка)'
              : 'To pass: ≥80% correct trials (pressing on ✋ or missing GO = error)'}
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

  const stimColor =
    feedback === 'right' ? '#22c55e' :
    feedback === 'wrong' ? '#f43f5e' :
    signal === 'go' ? '#22c55e' :
    signal === 'stop' ? '#f43f5e' :
    '#444';

  const stimLabel =
    signal === 'go' ? t('goBtn') :
    signal === 'stop' ? '✋' :
    feedback ? (feedback === 'right' ? '✓' : '✗') :
    '•';

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#3b82f6' }]}>✋{correctStops}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{meanRt}{language === 'ru' ? 'мс' : 'ms'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('stopHint')}</Text>
      <View style={[styles.stimulusBox, { backgroundColor: stimColor + '33', borderColor: stimColor }]}>
        <Text style={[styles.stimText, { color: stimColor }]}>{stimLabel}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={onPressGo}
        style={styles.goBtnWrap}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.goBtn}>
          <Text style={styles.goBtnText}>{t('goBtn')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('stopSignal')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="stopSignal" icon="hand-left" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="stopSignalIntroDesc"
          benefits={STOP_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="stop_signal" level={levelRef.current} stars={errors === 0 ? 3 : errors <= 2 ? 2 : 1}
          passed={clearedPassed}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, Math.round(hits * 50 + correctStops * 100 - errors * 60 - meanRt * 0.1))}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 16, gap: 16, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  stimulusBox: { width: 200, height: 200, borderRadius: 24, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontSize: 56, fontWeight: '900' },
  goBtnWrap: { borderRadius: 60, overflow: 'hidden', marginTop: 12 },
  goBtn: { paddingVertical: 22, paddingHorizontal: 80, alignItems: 'center', borderRadius: 60 },
  goBtnText: { color: '#FFF', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
});
