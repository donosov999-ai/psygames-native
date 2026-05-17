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
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';

const GRADIENT = ['#11998e', '#ee0979'];
const BENEFITS = [
  { icon: 'pause-circle-outline', textKey: 'benefitInhibition1' },
  { icon: 'flash-outline', textKey: 'benefitInhibition2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitInhibition3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type SubMode = 'go_no_go' | 'stop_signal' | 'mixed';
type Difficulty = 'easy' | 'medium' | 'hard';

// Stop-Signal config
interface StopCfg { stopProb: number; ssd: number; goWindow: number; }
const STOP_DIFF: Record<Difficulty, StopCfg> = {
  easy:   { stopProb: 0.20, ssd: 380, goWindow: 1300 },
  medium: { stopProb: 0.30, ssd: 250, goWindow: 1100 },
  hard:   { stopProb: 0.35, ssd: 160, goWindow: 1000 },
};

type GngStimulus = 'go' | 'nogo' | null;
type SsState = 'idle' | 'go' | 'stop' | 'feedback';

export default function InhibitionGame() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();

  // Read preset mode from URL: ?mode=go_no_go | stop_signal | mixed
  const presetMode: SubMode | null =
    params.mode === 'go_no_go' || params.mode === 'stop_signal' || params.mode === 'mixed'
      ? params.mode : null;

  const [phase, setPhase] = useState<GamePhase>(presetMode ? 'config' : 'intro');
  const [subMode, setSubMode] = useState<SubMode>(presetMode || 'go_no_go');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [trials, setTrials] = useState(30);

  const [round, setRound] = useState(0);

  // Stats — common (mirrored in refs for handler closures)
  const [hits, setHits] = useState(0);          // correct go-pressed
  const [misses, setMisses] = useState(0);       // missed go (Go/No-Go: didn't press on go)
  const [falseAlarms, setFalseAlarms] = useState(0); // pressed on no-go (or on stop-signal)
  const [correctRej, setCorrectRej] = useState(0);   // didn't press on no-go / stop
  const [rts, setRts] = useState<number[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Refs mirror state for use in async handlers / timers
  const statsRef = useRef({ h: 0, m: 0, fa: 0, cr: 0, rts: [] as number[] });
  const updateStats = (next: { h: number; m: number; fa: number; cr: number; rts: number[] }) => {
    statsRef.current = next;
    setHits(next.h); setMisses(next.m); setFalseAlarms(next.fa);
    setCorrectRej(next.cr); setRts(next.rts);
  };

  // GNG-specific
  const [gngStim, setGngStim] = useState<GngStimulus>(null);
  const gngStimAtRef = useRef<number>(0);
  const gngRespondedRef = useRef<boolean>(false);

  // SS-specific
  const [ssSignal, setSsSignal] = useState<SsState>('idle');
  const [ssFeedback, setSsFeedback] = useState<'right' | 'wrong' | null>(null);
  const [ssTrialIsStop, setSsTrialIsStop] = useState(false);
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
    updateStats({ h: 0, m: 0, fa: 0, cr: 0, rts: [] });
    setRound(0);
    setPhase('playing');
    setStartTime(Date.now());
    pushTimer(setTimeout(() => runRound(0), 800));
  };

  const finish = async () => {
    const { h, m, fa, cr, rts: rtsArr } = statsRef.current;
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    setPhase('result');
    const total = h + m + fa + cr;
    const accuracy = total > 0 ? Math.round(((h + cr) / total) * 100) : 0;
    const avgRT = rtsArr.length ? Math.round(rtsArr.reduce((s, x) => s + x, 0) / rtsArr.length) : 0;

    // Save with original game_type for biomarker compatibility
    const gameType =
      subMode === 'mixed' ? 'inhibition_mixed' :
      subMode === 'go_no_go' ? 'go_no_go' : 'stop_signal';

    try {
      await saveSession({
        game_type: gameType,
        score: h * 10 + cr * 5 - fa * 12 - m * 5,
        time_seconds: finalTime,
        difficulty,
        mode: subMode === 'mixed' ? `${trials}t-mixed` : `${trials}t`,
        errors: m + fa,
        details: {
          hits: h, misses: m, falseAlarms: fa, correctRej: cr,
          accuracy, avgRT, mean_rt: avgRT,
          submode: subMode,
        },
      });
    } catch (e) { console.error(e); }
  };

  // Decide which sub-trial to run (for mixed mode)
  const pickTrialKind = (rNum: number): 'gng' | 'ss' => {
    if (subMode === 'go_no_go') return 'gng';
    if (subMode === 'stop_signal') return 'ss';
    // mixed: 50/50 with seeded shuffle by round number
    return rNum % 2 === 0 ? 'gng' : 'ss';
  };

  const runRound = (r: number) => {
    if (r >= trials) { finish(); return; }
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

    const window = difficulty === 'easy' ? 1200 : difficulty === 'hard' ? 800 : 1000;
    pushTimer(setTimeout(() => {
      const s = statsRef.current;
      if (!gngRespondedRef.current) {
        // No press: if go → miss; if nogo → correct rejection
        if (stim === 'go') updateStats({ ...s, m: s.m + 1 });
        else               updateStats({ ...s, cr: s.cr + 1 });
      }
      setGngStim(null);
      pushTimer(setTimeout(() => runRound(r + 1), 500 + Math.random() * 300));
    }, window));
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
    const cfg = STOP_DIFF[difficulty];
    const isStop = Math.random() < cfg.stopProb;
    setSsTrialIsStop(isStop);
    setSsSignal('idle'); setSsFeedback(null);
    ssRespondedRef.current = false;

    const fixDelay = 600 + Math.random() * 400;
    pushTimer(setTimeout(() => {
      setSsSignal('go');
      ssGoAtRef.current = Date.now();
      if (isStop) {
        pushTimer(setTimeout(() => {
          if (!ssRespondedRef.current) setSsSignal('stop');
        }, cfg.ssd));
      }
      pushTimer(setTimeout(() => {
        if (ssRespondedRef.current) return;
        endSsTrial(r, isStop ? 'stop_ok' : 'go_miss', 0);
      }, cfg.goWindow));
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
    const isStopTrial = ssTrialIsStop;
    endSsTrial(round - 1, isStopTrial ? 'stop_fail' : 'go_hit', rt);
  };

  // ─── Render: config ─────────────────────────────────────────────────────

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="hand-left" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('inhibition')}</Text>
        <Text style={styles.configDesc}>{t('inhibitionDesc')}</Text>
      </LinearGradient>

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

      {subMode === 'stop_signal' || subMode === 'mixed' ? (
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{t('difficultyLabel')}</Text>
          <View style={styles.optionButtons}>
            {(['easy','medium','hard'] as Difficulty[]).map((d) => (
              <TouchableOpacity key={d} style={[styles.modeButton, difficulty === d
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setDifficulty(d)}>
                <Text style={[styles.modeButtonText, { color: difficulty === d ? '#FFF' : colors.text }]}>{t(d)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[20, 30, 50].map((n) => (
            <TouchableOpacity key={n} style={[styles.modeButton, trials === n
              ? { backgroundColor: GRADIENT[0] }
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

  // ─── Render: playing ────────────────────────────────────────────────────

  const currentKind = pickTrialKind(round - 1);

  const renderGng = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
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
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
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
          onPress={() => { clearAllTimers(); router.back(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('inhibition')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="inhibition" icon="hand-left" gradient={GRADIENT as [string, string]}
          skillKey="skillInhibition" descriptionKey="inhibitionIntroDesc"
          benefits={BENEFITS} onStart={() => setPhase('config')} onBack={() => router.back()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={hits * 10 + correctRej * 5 - falseAlarms * 12 - misses * 5}
          time={elapsedTime} errors={misses + falseAlarms}
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
