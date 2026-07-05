import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import { useLevelGate } from '@/src/hooks/useLevelGate';
import GameResult from '@/src/components/GameResult';
import BossRound from '@/src/components/BossRound';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const CORSI_RULES: LevelRule[] = [
  {
    key: 'reverse', fromLevel: 10,
    ru: { title: 'Обратный порядок', rule: 'С этого уровня повторяй последовательность В ОБРАТНОМ порядке — от последнего блока к первому.', example: 'Пример: загорелись блоки 1 → 2 → 3 — нажимай 3, 2, 1.' },
    en: { title: 'Reverse order', rule: 'From this level on, reproduce the sequence in REVERSE — from the last block back to the first.', example: 'Example: blocks flash 1 → 2 → 3 — tap 3, 2, 1.' },
  },
];

const GRADIENT = ['#0083B0', '#00B4DB'];
const CORSI_BENEFITS = [
  { icon: 'grid-outline', textKey: 'benefitCorsi1' },
  { icon: 'eye-outline',  textKey: 'benefitCorsi2' },
  { icon: 'apps-outline', textKey: 'benefitCorsi3' },
];

// Classic Corsi: 9 blocks placed at fixed positions, sequence flashes one by one,
// subject reproduces in same (or reverse) order.
type GamePhase = 'intro' | 'config' | 'show' | 'recall' | 'boss' | 'cleared' | 'result';
const BOSS_EVERY = 3;   // веха-босс каждые 3 уровня (резкая смена: память позиций → счёт чисел)
type Mode = 'forward' | 'backward';

// Уровень (1..15+): L1-6 span 3→8 · L7-9 показ быстрее · L10+ обязательный обратный порядок.
function levelParams(level: number): { startSpan: number; tickMs: number; flashMs: number; reverse: boolean } {
  const startSpan = Math.min(8, 2 + level);             // L1=3 → L6=8
  const fast = Math.max(0, level - 6);
  const tickMs = Math.max(480, 800 - fast * 45);
  const flashMs = Math.max(280, 500 - fast * 30);
  const reverse = level >= 10;                            // L10+ — обратный порядок
  return { startSpan, tickMs, flashMs, reverse };
}

const POS = [
  { x: 70, y: 80 }, { x: 200, y: 50 }, { x: 320, y: 90 },
  { x: 50, y: 200 }, { x: 220, y: 180 }, { x: 340, y: 220 },
  { x: 80, y: 320 }, { x: 240, y: 320 }, { x: 320, y: 360 },
];
// scale to fit smaller widths
const BOARD_W = 400;
const BOARD_H = 420;

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

export default function CorsiGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  // v1.29.1 (мобайл): доска 400×420 фикс ВЫЛЕЗАЛА за экран 390px — теперь скейлится
  // под ширину (и растёт на больших экранах до ×1.5); позиции и блоки умножаются на scale
  const { width, height } = useWindowDimensions();
  const boardScale = Math.min((width - 24) / BOARD_W, (height - 300) / BOARD_H, 1.5);

  const gate = useLevelGate('corsi');
  const lvl = usePersistentLevel('corsi');   // персист-уровень (как у судоку)
  const { isPreset, str, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [bossWon, setBossWon] = useState<boolean | null>(null);   // итог босса-вехи (null = босса не было)
  const [mode, setMode] = useState<Mode>(() => (str('mode', 'forward') as Mode));
  // Справка правил уровня (в зарядке-пресете не показываем — там свой поток).
  // enabled на recall: во время show модалка закрыла бы саму последовательность.
  const levelRules = useLevelRules('corsi', lvl.level, CORSI_RULES, phase === 'recall' && !isPreset);

  const [seq, setSeq] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);     // currently lit during show phase
  const [userSeq, setUserSeq] = useState<number[]>([]);
  const [span, setSpan] = useState(0);            // longest correct sequence
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelRef = useRef(1);
  const tickMsRef = useRef(800);
  const flashMsRef = useRef(500);
  const modeRef = useRef<Mode>('forward');

  useEffect(() => () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
  }, []);

  const startGame = () => {
    const effLevel = lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    setBossWon(null);
    let startSpan: number;
    if (isPreset) {
      startSpan = num('startLen', 3);
      tickMsRef.current = 800; flashMsRef.current = 500;
      modeRef.current = mode;
    } else {
      // уровень рулит: span → скорость показа → обратный порядок
      startSpan = p.startSpan;
      tickMsRef.current = p.tickMs; flashMsRef.current = p.flashMs;
      modeRef.current = p.reverse ? 'backward' : 'forward';
      setMode(modeRef.current);
    }
    setSpan(0); setErrors(0);
    setUserSeq([]);
    setPhase('show');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
    showSequence(startSpan);
  };

  const showSequence = (len: number) => {
    setUserSeq([]);
    setFeedback(null);
    // build random sequence of `len` distinct blocks
    const indices = shuffle(Array.from({ length: 9 }, (_, i) => i));
    const next = indices.slice(0, len);
    setSeq(next);
    setPhase('show');
    setShowIdx(-1);
    let i = 0;
    tickerRef.current = setInterval(() => {
      if (i < next.length) {
        setShowIdx(next[i]);
        setTimeout(() => setShowIdx(-1), flashMsRef.current);
        i++;
      } else {
        if (tickerRef.current) clearInterval(tickerRef.current);
        setPhase('recall');
      }
    }, tickMsRef.current);
  };

  const finish = async (finalSpan: number, finalErrors: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTime) / 1000;
    setElapsedTime(finalTime);
    const passed = !isPreset && finalSpan >= levelParams(levelRef.current).startSpan;
    if (passed) lvl.reach(levelRef.current + 1);   // прошёл стартовый span уровня → +уровень
    try {
      await saveSession({
        game_type: 'corsi',
        score: Math.max(0, finalSpan * 200 - finalErrors * 50),
        time_seconds: finalTime,
        difficulty: modeRef.current,
        mode: `L${levelRef.current}`,
        errors: finalErrors,
        details: { span: finalSpan },
      });
    } catch (e) { console.error(e); }
    // веха-босс: при чистом прохождении каждые BOSS_EVERY уровней → битва (память → счёт)
    if (passed && levelRef.current % BOSS_EVERY === 0) { setBossWon(null); setPhase('boss'); }
    else if (passed) setPhase('cleared');   // авто-поток к следующему уровню
    else setPhase('result');
  };

  const handleTap = (i: number) => {
    if (phase !== 'recall' || feedback !== null) return;
    const expected = modeRef.current === 'forward' ? seq : [...seq].reverse();
    const next = [...userSeq, i];
    setUserSeq(next);
    if (next[next.length - 1] !== expected[next.length - 1]) {
      // wrong — fail
      setFeedback('wrong');
      const newErrors = errors + 1;
      setErrors(newErrors);
      fbTimerRef.current = setTimeout(() => {
        if (newErrors >= 2) finish(span, newErrors);  // 2 errors = stop, classic Corsi
        else { showSequence(seq.length); }            // retry same length once
      }, 700);
      return;
    }
    if (next.length === expected.length) {
      // success — increase span
      setFeedback('right');
      const newSpan = Math.max(span, seq.length);
      setSpan(newSpan);
      fbTimerRef.current = setTimeout(() => {
        if (seq.length >= 9) finish(newSpan, errors);
        else showSequence(seq.length + 1);
      }, 600);
    }
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="grid" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('corsi')}</Text>
        <Text style={styles.configDesc}>{t('corsiDesc')}</Text>
      </LinearGradient>
      <LevelProgressMap gameId="corsi" currentLevel={lvl.level} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('mode')}</Text>
        <View style={styles.optionButtons}>
          {(['forward','backward'] as Mode[]).map((m) => {
            const locked = gate.isLocked(m);
            return (
            <TouchableOpacity key={m} disabled={locked}
              style={[styles.modeButton, mode === m && !locked
                ? { backgroundColor: GRADIENT[0] }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: locked ? 0.5 : 1 }]}
              onPress={() => !locked && setMode(m)}>
              <Text style={[styles.modeButtonText, { color: mode === m && !locked ? '#FFF' : colors.text }]}>
                {m === 'forward' ? t('forward') : t('backward')}{locked ? ' 🔒' : ''}
              </Text>
            </TouchableOpacity>
            );
          })}
        </View>
        {gate.nextHint && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
            {gate.nextHint}
          </Text>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Уровень' : 'Level'}</Text>
        <Text style={[styles.modeButtonText, { color: colors.textSecondary }]}>
          {language === 'ru' ? `Ур. ${lvl.level} — растёт сам (span → скорость → обратный порядок)` : `Lv ${lvl.level} — grows with results (span → speed → reverse)`}
        </Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
          <Text style={styles.startBtnText}>{t('start')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderBoard = () => {
    const block = 60 * boardScale;
    return (
      <View style={[styles.board, { width: BOARD_W * boardScale, height: BOARD_H * boardScale, backgroundColor: colors.surface, borderColor: colors.border }]}>
        {POS.map((p, i) => {
          const lit = phase === 'show' && showIdx === i;
          const tapped = userSeq.includes(i);
          const lastTapped = userSeq[userSeq.length - 1] === i;
          const fbColor = feedback === 'right' && lastTapped ? '#22c55e' :
                          feedback === 'wrong' && lastTapped ? '#f43f5e' :
                          null;
          return (
            <TouchableOpacity key={i}
              disabled={phase !== 'recall' || feedback !== null}
              onPress={() => handleTap(i)}
              style={{
                position: 'absolute',
                left: p.x * boardScale - block / 2, top: p.y * boardScale - block / 2,
                width: block, height: block, borderRadius: 8,
                backgroundColor: fbColor || (lit ? GRADIENT[1] : tapped ? GRADIENT[0] : '#444'),
                borderWidth: 2, borderColor: lit ? '#fff' : 'transparent',
              }}
            />
          );
        })}
      </View>
    );
  };

  const renderShow = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>Span {span}{!isPreset ? ` · ${language === 'ru' ? 'Ур.' : 'Lv'}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>Len {seq.length}</Text>
        {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('watchSequence')}</Text>
      {renderBoard()}
    </View>
  );

  const renderRecall = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>Span {span}{!isPreset ? ` · ${language === 'ru' ? 'Ур.' : 'Lv'}${lvl.level}` : ''}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>{userSeq.length}/{seq.length}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        {!isPreset && <LevelRuleBadge lr={levelRules} color={GRADIENT[0]} ru={language === 'ru'} />}
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>
        {mode === 'forward' ? t('reproduceForward') : t('reproduceBackward')}
      </Text>
      {renderBoard()}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('corsi')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="corsi" icon="grid" gradient={GRADIENT as [string, string]}
          skillKey="skillVisualMemory" descriptionKey="corsiIntroDesc"
          benefits={CORSI_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'show' && renderShow()}
      {phase === 'recall' && renderRecall()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'boss' && (
        <BossRound config={{ type: 'counting', gradient: GRADIENT as [string, string] }}
          language={language} colors={colors}
          onComplete={(win) => { setBossWon(win); setPhase('cleared'); }} />
      )}
      {phase === 'cleared' && (
        <LevelCleared gameId="corsi" level={levelRef.current} stars={bossWon === true ? 3 : (errors === 0 ? 3 : errors <= 2 ? 2 : 1)}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, span * 200 - errors * 50) + (bossWon ? 100 : 0)}
          stars={bossWon === true ? 3 : undefined}
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
  playArea: { flex: 1, justifyContent: 'center', padding: 12, gap: 12, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  board: { borderRadius: 14, borderWidth: 1, position: 'relative' },
});
