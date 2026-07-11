/**
 * Торможение — объединённая игра: Go/No-Go + Стоп-сигнал.
 *
 * Парадигмы:
 *  - Go/No-Go (action restraint): стимул сразу определяет реакцию.
 *    Биомаркер: % commission errors, hits.
 *  - Стоп-сигнал (action cancellation): всегда «жми», но в части проб
 *    через короткую SSD появляется стоп-сигнал. Биомаркер: SSRT, hits.
 *
 * Sub-mode сохраняет оригинальный game_type ('go_no_go' | 'stop_signal')
 * — биомаркеры и тренды совместимы с историей.
 *
 * Mixed — ротация обоих режимов внутри одной сессии (50/50).
 *
 * Уровни (persist, по паттерну cpt/simon): ручные селекторы сложности и числа
 * проб заменены на usePersistentLevel('inhibition') + levelParams. Ось усложнения:
 *   - окно go-ответа сокращается 1300мс → ~850мс (не успел = пропуск)
 *   - SSD растёт 150мс → ~480мс (стоп-сигнал позже — тормозить труднее)
 *   - доля стоп-проб растёт умеренно 20% → 35%
 *   - число проб растёт ступенями 20 → 26 → 32
 * Селектор суб-режима (Go/No-Go / Стоп-сигнал / Микс) остаётся — он меняет
 * ПРАВИЛО игры, не сложность.
 * Проход уровня: ≥80% верных (ложная тревога И пропуск go = ошибки) → LevelCleared.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

const GRADIENT = ['#11998e', '#ee0979'];
const BENEFITS = [
  { icon: 'pause-circle-outline', textKey: 'benefitInhibition1' },
  { icon: 'flash-outline', textKey: 'benefitInhibition2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitInhibition3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type SubMode = 'go_no_go' | 'stop_signal' | 'mixed';

// Уровень 1..15. Ось усложнения (по паттерну cpt/simon):
//   goWindow сокращается (реагировать надо быстрее),
//   ssd растёт (стоп-сигнал приходит позже — отменить ответ труднее),
//   stopProb растёт умеренно (стоп-проб больше — выше нагрузка на торможение),
//   trials растёт ступенями 20 → 26 → 32.
function levelParams(level: number): { trials: number; stopProb: number; ssd: number; goWindow: number } {
  const trials = level <= 5 ? 20 : level <= 10 ? 26 : 32;
  const stopProb = Math.min(0.35, 0.20 + (level - 1) * 0.011);   // 20% → 35%
  const ssd = Math.min(480, 150 + (level - 1) * 24);             // 150мс → 480мс
  const goWindow = Math.max(850, 1300 - (level - 1) * 32);       // 1300мс → ~850мс
  return { trials, stopProb, ssd, goWindow };
}

type GngStimulus = 'go' | 'nogo' | null;
type SsState = 'idle' | 'go' | 'stop' | 'feedback';

export default function InhibitionGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();

  // Read preset mode from URL: ?mode=go_no_go | stop_signal | mixed
  const presetMode: SubMode | null =
    params.mode === 'go_no_go' || params.mode === 'stop_signal' || params.mode === 'mixed'
      ? params.mode : null;

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('inhibition');
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт

  const [phase, setPhase] = useState<GamePhase>(presetMode ? 'config' : 'intro');
  const [subMode, setSubMode] = useState<SubMode>(presetMode || 'go_no_go');
  const [totalTrials, setTotalTrials] = useState(20);
  const [clearedPassed, setClearedPassed] = useState(true);

  const [round, setRound] = useState(0);

  // Stats — common (mirrored in refs for handler closures)
  const [hits, setHits] = useState(0);          // correct go-pressed
  const [misses, setMisses] = useState(0);       // missed go (Go/No-Go: didn't press on go)
  const [falseAlarms, setFalseAlarms] = useState(0); // pressed on no-go (or on stop-signal)
  const [correctRej, setCorrectRej] = useState(0);   // didn't press on no-go / stop
  const [rts, setRts] = useState<number[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Refs mirror state for use in async handlers / timers
  const statsRef = useRef({ h: 0, m: 0, fa: 0, cr: 0, rts: [] as number[] });
  const updateStats = (next: { h: number; m: number; fa: number; cr: number; rts: number[] }) => {
    statsRef.current = next;
    setHits(next.h); setMisses(next.m); setFalseAlarms(next.fa);
    setCorrectRej(next.cr); setRts(next.rts);
  };

  // Параметры уровня + счётчики раунда — в рефах: таймерная цепочка
  // (fixDelay → стимул → окно → следующая проба) живёт вне ре-рендеров,
  // state в её колбэках был бы устаревшим (паттерн cpt/simon).
  const levelRef = useRef(1);
  const stopProbRef = useRef(0.20);
  const ssdRef = useRef(150);
  const goWindowRef = useRef(1300);
  const totalTrialsRef = useRef(20);
  const subModeRef = useRef<SubMode>('go_no_go');
  const roundRef = useRef(0);
  const startTimeRef = useRef(0);

  // GNG-specific
  const [gngStim, setGngStim] = useState<GngStimulus>(null);
  const gngStimAtRef = useRef<number>(0);
  const gngRespondedRef = useRef<boolean>(false);

  // SS-specific
  const [ssSignal, setSsSignal] = useState<SsState>('idle');
  const [ssFeedback, setSsFeedback] = useState<'right' | 'wrong' | null>(null);
  const ssTrialIsStopRef = useRef(false);
  const ssGoAtRef = useRef<number>(0);
  const ssRespondedRef = useRef<boolean>(false);

  // Timers
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pushTimer = (id: ReturnType<typeof setTimeout>) => timersRef.current.push(id);
  const clearAllTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => () => clearAllTimers(), []);

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  const startGame = () => {
    const p = levelParams(lvl.level);
    levelRef.current = lvl.level;
    stopProbRef.current = p.stopProb;
    ssdRef.current = p.ssd;
    goWindowRef.current = p.goWindow;
    totalTrialsRef.current = p.trials;
    subModeRef.current = subMode;
    setTotalTrials(p.trials);
    updateStats({ h: 0, m: 0, fa: 0, cr: 0, rts: [] });
    roundRef.current = 0;
    setRound(0);
    setGngStim(null);
    setSsSignal('idle'); setSsFeedback(null);
    setPhase('playing');
    startTimeRef.current = Date.now();
    pushTimer(setTimeout(() => runRound(0), 800));
  };

  const finish = async () => {
    clearAllTimers();
    const { h, m, fa, cr, rts: rtsArr } = statsRef.current;
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);
    const total = h + m + fa + cr;
    // Честная accuracy по механике: верные = go-нажатия (h) + верные торможения (cr);
    // ошибки = ложные тревоги (fa: нажал на no-go/стоп) И пропуски go (m).
    const accuracy = total > 0 ? (h + cr) / total : 0;
    const avgRT = rtsArr.length ? Math.round(rtsArr.reduce((s, x) => s + x, 0) / rtsArr.length) : 0;

    // Проход уровня: ≥80% верных (на пресетах уровень не двигаем)
    const levelPassed = accuracy >= 0.8;
    if (isPreset) {
      // Пресет/свободный режим — уровень не трогаем, экран статистики как было
      setPhase('result');
    } else {
      // Непрерывный поток: и проход, и провал уровня → баннер LevelCleared
      // (passed=false рисует «почти, ещё раз» + авто-рестарт того же уровня)
      if (levelPassed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(levelPassed);
      setPhase('cleared');
    }

    // Save with original game_type for biomarker compatibility
    const gameType =
      subModeRef.current === 'mixed' ? 'inhibition_mixed' :
      subModeRef.current === 'go_no_go' ? 'go_no_go' : 'stop_signal';

    try {
      await saveSession({
        game_type: gameType,
        score: h * 10 + cr * 5 - fa * 12 - m * 5,
        time_seconds: finalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        mode: `lvl${levelRef.current}`,
        errors: m + fa,
        details: {
          level: levelRef.current,
          hits: h, misses: m, falseAlarms: fa, correctRej: cr,
          accuracy: Math.round(accuracy * 100), avgRT, mean_rt: avgRT,
          submode: subModeRef.current,
          n_trials: totalTrialsRef.current,
          stop_prob: stopProbRef.current,
          ssd_ms: ssdRef.current,
          go_window_ms: goWindowRef.current,
        },
      });
    } catch (e) { console.error(e); }
  };

  // Decide which sub-trial to run (for mixed mode)
  const pickTrialKind = (rNum: number): 'gng' | 'ss' => {
    if (subModeRef.current === 'go_no_go') return 'gng';
    if (subModeRef.current === 'stop_signal') return 'ss';
    // mixed: 50/50 with seeded shuffle by round number
    return rNum % 2 === 0 ? 'gng' : 'ss';
  };

  const runRound = (r: number) => {
    if (r >= totalTrialsRef.current) { finish(); return; }
    roundRef.current = r + 1;
    setRound(r + 1);
    const kind = pickTrialKind(r);
    if (kind === 'gng') runGngTrial(r);
    else runSsTrial(r);
  };

  // ─── Go/No-Go trial ────────────────────────────────────────────────────

  const runGngTrial = (r: number) => {
    setSsSignal('idle'); setSsFeedback(null);
    const isGo = Math.random() < 0.7;
    const stim: GngStimulus = isGo ? 'go' : 'nogo';
    setGngStim(stim);
    gngStimAtRef.current = Date.now();
    gngRespondedRef.current = false;

    pushTimer(setTimeout(() => {
      const s = statsRef.current;
      if (!gngRespondedRef.current) {
        // No press: if go → miss; if nogo → correct rejection
        if (stim === 'go') updateStats({ ...s, m: s.m + 1 });
        else               updateStats({ ...s, cr: s.cr + 1 });
      }
      setGngStim(null);
      pushTimer(setTimeout(() => runRound(r + 1), 500 + Math.random() * 300));
    }, goWindowRef.current));
  };

  const onGngPress = () => {
    if (gngStim === null || gngRespondedRef.current) return;
    gngRespondedRef.current = true;
    const rt = Date.now() - gngStimAtRef.current;
    const s = statsRef.current;
    if (gngStim === 'go') {
      updateStats({ ...s, h: s.h + 1, rts: [...s.rts, rt] });
    } else {
      updateStats({ ...s, fa: s.fa + 1 });
    }
  };

  // ─── Stop-Signal trial ─────────────────────────────────────────────────

  const runSsTrial = (r: number) => {
    setGngStim(null);
    const isStop = Math.random() < stopProbRef.current;
    ssTrialIsStopRef.current = isStop;
    setSsSignal('idle'); setSsFeedback(null);
    ssRespondedRef.current = false;

    const fixDelay = 600 + Math.random() * 400;
    pushTimer(setTimeout(() => {
      setSsSignal('go');
      ssGoAtRef.current = Date.now();
      if (isStop) {
        pushTimer(setTimeout(() => {
          if (!ssRespondedRef.current) setSsSignal('stop');
        }, ssdRef.current));
      }
      pushTimer(setTimeout(() => {
        if (ssRespondedRef.current) return;
        endSsTrial(r, isStop ? 'stop_ok' : 'go_miss', 0);
      }, goWindowRef.current));
    }, fixDelay));
  };

  const endSsTrial = (
    r: number,
    outcome: 'go_hit' | 'go_miss' | 'stop_ok' | 'stop_fail',
    rt: number,
  ) => {
    const s = statsRef.current;
    let next = { ...s };
    let fb: 'right' | 'wrong' = 'right';
    if (outcome === 'go_hit')   { next.h++; next.rts = [...s.rts, rt]; fb = 'right'; }
    if (outcome === 'go_miss')  { next.m++; fb = 'wrong'; }
    if (outcome === 'stop_ok')  { next.cr++; fb = 'right'; }
    if (outcome === 'stop_fail'){ next.fa++; fb = 'wrong'; }
    updateStats(next);
    setSsSignal('feedback'); setSsFeedback(fb);
    pushTimer(setTimeout(() => runRound(r + 1), 500));
  };

  const onSsPress = () => {
    if (ssRespondedRef.current) return;
    if (ssSignal !== 'go' && ssSignal !== 'stop') return;
    ssRespondedRef.current = true;
    const rt = Date.now() - ssGoAtRef.current;
    const isStopTrial = ssTrialIsStopRef.current;
    endSsTrial(roundRef.current - 1, isStopTrial ? 'stop_fail' : 'go_hit', rt);
  };

  // ─── Render: config ─────────────────────────────────────────────────────

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="hand-left" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('inhibition')}</Text>
          <Text style={styles.configDesc}>{t('inhibitionDesc')}</Text>
        </LinearGradient>

        {/* Селектор суб-режима остаётся: он меняет ПРАВИЛО игры (парадигму), не сложность */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('inhibitionModeLabel')}</Text>
          <View style={styles.optionButtons}>
            {(['go_no_go', 'stop_signal', 'mixed'] as SubMode[]).map((m) => (
              <TouchableOpacity key={m} style={[styles.modeButton, subMode === m
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setSubMode(m)}>
                <Text style={[styles.modeButtonText, { color: subMode === m ? '#FFF' : colors.text }]}>
                  {m === 'go_no_go' ? t('goNoGo') : m === 'stop_signal' ? t('stopSignal') : t('mixedMode')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.modeHint, { color: colors.textSecondary }]}>
            {subMode === 'go_no_go' ? t('inhibitionGngHint')
              : subMode === 'stop_signal' ? t('inhibitionSsHint')
              : t('inhibitionMixedHint')}
          </Text>
        </View>

        <LevelProgressMap gameId="inhibition" currentLevel={lvl.level} colors={colors} language={language} />
        <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
            {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {subMode === 'go_no_go'
              ? (language === 'ru'
                ? `${p.trials} проб · окно ответа ${(p.goWindow / 1000).toFixed(1)} с`
                : `${p.trials} trials · ${(p.goWindow / 1000).toFixed(1)} s response window`)
              : (language === 'ru'
                ? `${p.trials} проб · окно ответа ${(p.goWindow / 1000).toFixed(1)} с · стоп-проб ~${Math.round(p.stopProb * 100)}% · стоп через ${p.ssd} мс`
                : `${p.trials} trials · ${(p.goWindow / 1000).toFixed(1)} s window · ~${Math.round(p.stopProb * 100)}% stop trials · stop at ${p.ssd} ms`)}
          </Text>
          {/* Критерий прохождения уровня виден игроку (паттерн cpt v1.112.0) */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {language === 'ru'
              ? 'Проход уровня: ≥80% верных (нажал на NO/стоп или пропустил GO = ошибка)'
              : 'To pass: ≥80% correct (pressing on NO/stop or missing GO counts as an error)'}
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

  // ─── Render: playing ────────────────────────────────────────────────────

  const currentKind = pickTrialKind(round - 1);

  const renderGng = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits + correctRej}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{misses + falseAlarms}</Text>
      </View>
      <Text style={[styles.modeBadge, { color: colors.textSecondary }]}>Go/No-Go</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onGngPress}
        style={[styles.pad, {
          backgroundColor: gngStim === 'go' ? '#22c55e' : gngStim === 'nogo' ? '#f43f5e' : colors.surface,
        }]}
      >
        <Text style={[styles.padText, { color: gngStim ? '#FFF' : colors.textSecondary }]}>
          {gngStim === 'go' ? 'GO' : gngStim === 'nogo' ? 'NO' : '•'}
        </Text>
      </TouchableOpacity>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goNoGoHint')}</Text>
    </View>
  );

  const ssStimColor =
    ssFeedback === 'right' ? '#22c55e' :
    ssFeedback === 'wrong' ? '#f43f5e' :
    ssSignal === 'go' ? '#22c55e' :
    ssSignal === 'stop' ? '#f43f5e' :
    '#444';
  const ssStimLabel =
    ssSignal === 'go' ? t('goBtn') :
    ssSignal === 'stop' ? '✋' :
    ssFeedback ? (ssFeedback === 'right' ? '✓' : '✗') : '•';

  const renderSs = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#3b82f6' }]}>✋{correctRej}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{misses + falseAlarms}</Text>
      </View>
      <Text style={[styles.modeBadge, { color: colors.textSecondary }]}>{t('stopSignal')}</Text>
      <View style={[styles.stimulusBox, { backgroundColor: ssStimColor + '33', borderColor: ssStimColor }]}>
        <Text style={[styles.stimText, { color: ssStimColor }]}>{ssStimLabel}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={onSsPress} style={styles.goBtnWrap}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.goBtn}>
          <Text style={styles.goBtnText}>{t('goBtn')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('stopHint')}</Text>
    </View>
  );

  const renderPlaying = () => currentKind === 'gng' ? renderGng() : renderSs();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('inhibition')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="inhibition" icon="hand-left" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="inhibitionIntroDesc"
          benefits={BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (
        <LevelCleared gameId="inhibition" level={levelRef.current} passed={clearedPassed}
          stars={(misses + falseAlarms) === 0 ? 3 : (misses + falseAlarms) <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={hits * 10 + correctRej * 5 - falseAlarms * 12 - misses * 5}
          time={elapsedTime} errors={misses + falseAlarms}
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
  modeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  modeHint: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, padding: 16, gap: 14, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  modeBadge: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  pad: { width: 220, height: 220, borderRadius: 110, justifyContent: 'center', alignItems: 'center' },
  padText: { fontSize: 56, fontWeight: '900' },
  stimulusBox: { width: 180, height: 180, borderRadius: 24, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  stimText: { fontSize: 56, fontWeight: '900' },
  goBtnWrap: { borderRadius: 60, overflow: 'hidden', marginTop: 8 },
  goBtn: { paddingVertical: 18, paddingHorizontal: 60, alignItems: 'center', borderRadius: 60 },
  goBtnText: { color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
});
