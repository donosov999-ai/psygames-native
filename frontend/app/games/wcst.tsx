import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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

const GRADIENT = ['#834d9b', '#d04ed6'];
const WCST_BENEFITS = [
  { icon: 'shuffle-outline', textKey: 'benefitWcst1' },
  { icon: 'bulb-outline',    textKey: 'benefitWcst2' },
  { icon: 'options-outline', textKey: 'benefitWcst3' },
];

// 4 reference cards: differ in (color, shape, count). Subject must sort target by hidden rule.
type Color = 'R' | 'G' | 'B' | 'Y';
type Shape = 'circle' | 'triangle' | 'square' | 'star';
type Count = 1 | 2 | 3 | 4;
type Rule = 'color' | 'shape' | 'count';

const COLOR_HEX: Record<Color, string> = { R: '#ef4444', G: '#22c55e', B: '#3b82f6', Y: '#eab308' };
// A1 колор-блайнд — Okabe-Ito (вермильон/бирюз-зелёный/синий/жёлтый, различимы при дальтонизме).
const COLOR_HEX_CB: Record<Color, string> = { R: '#d55e00', G: '#009e73', B: '#0072b2', Y: '#f0e442' };
const COLORS: Color[] = ['R','G','B','Y'];
const SHAPES: Shape[] = ['circle','triangle','square','star'];
const COUNTS: Count[] = [1,2,3,4];

interface Card { color: Color; shape: Shape; count: Count; }

// 4 reference cards — each unique color/shape/count, like classic WCST:
const REF_CARDS: Card[] = [
  { color: 'R', shape: 'triangle', count: 1 },
  { color: 'G', shape: 'star',     count: 2 },
  { color: 'B', shape: 'square',   count: 3 },
  { color: 'Y', shape: 'circle',   count: 4 },
];

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function makeTarget(): Card {
  // ensure target card matches at least one ref card on each dimension (always solvable)
  return {
    color: rndItem(COLORS),
    shape: rndItem(SHAPES),
    count: rndItem(COUNTS),
  };
}

function matchByRule(target: Card, ref: Card, rule: Rule): boolean {
  if (rule === 'color') return target.color === ref.color;
  if (rule === 'shape') return target.shape === ref.shape;
  return target.count === ref.count;
}

type GamePhase = 'intro' | 'config' | 'playing' | 'result';

export default function WcstGame() {
  const { colors, colorblind } = useTheme();
  const HEX = colorblind ? COLOR_HEX_CB : COLOR_HEX;
  const { t, language } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(40);

  const [round, setRound] = useState(0);
  const [target, setTarget] = useState<Card>(() => makeTarget());
  const [rule, setRule] = useState<Rule>('color');
  const [streak, setStreak] = useState(0);            // consecutive correct in a row
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [perseverative, setPerseverative] = useState(0); // errors using OLD rule after rule change
  const [feedback, setFeedback] = useState<{idx: number, ok: boolean} | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const lastRuleRef = useRef<Rule | null>(null); // previous rule (after change)
  const justChangedRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const pickNewRule = (prev: Rule): Rule => {
    const opts: Rule[] = (['color','shape','count'] as Rule[]).filter(r => r !== prev);
    return opts[Math.floor(Math.random() * opts.length)];
  };

  const startGame = () => {
    setHits(0); setErrors(0); setPerseverative(0); setRound(1);
    setStreak(0);
    const r0: Rule = rndItem(['color','shape','count']);
    setRule(r0);
    lastRuleRef.current = null;
    justChangedRef.current = false;
    setTarget(makeTarget());
    setFeedback(null);
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handlePick = (refIdx: number) => {
    if (feedback !== null) return;
    const ok = matchByRule(target, REF_CARDS[refIdx], rule);
    let newHits = hits, newErrors = errors, newPersev = perseverative;
    let newStreak = streak;
    if (ok) {
      newHits = hits + 1;
      newStreak = streak + 1;
      justChangedRef.current = false;
    } else {
      newErrors = errors + 1;
      newStreak = 0;
      // perseverative if user answered using PREVIOUS rule
      if (justChangedRef.current && lastRuleRef.current
          && matchByRule(target, REF_CARDS[refIdx], lastRuleRef.current)) {
        newPersev = perseverative + 1;
      }
    }
    setHits(newHits); setErrors(newErrors); setPerseverative(newPersev); setStreak(newStreak);
    setFeedback({ idx: refIdx, ok });
    setTimeout(() => {
      // rule changes after 6 consecutive correct (classic WCST = 10, but we shorten)
      let nextRule = rule;
      if (newStreak >= 6) {
        nextRule = pickNewRule(rule);
        lastRuleRef.current = rule;
        justChangedRef.current = true;
        setRule(nextRule);
        setStreak(0);
      }
      if (round >= trials) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        setPhase('result');
        saveSession({
          game_type: 'wcst',
          score: Math.max(0, newHits * 50 - newErrors * 30 - newPersev * 50),
          time_seconds: finalTime,
          difficulty: 'medium',
          mode: `${trials}t`,
          errors: newErrors,
          details: { perseverative: newPersev },
        }).catch(e => console.error(e));
      } else {
        setRound(r => r + 1);
        setTarget(makeTarget());
        setFeedback(null);
      }
    }, 600);
  };

  const renderShape = (shape: Shape, color: string, size: number) => {
    if (shape === 'circle') {
      return <View style={{ width: size, height: size, borderRadius: size/2, backgroundColor: color }} />;
    }
    if (shape === 'square') {
      return <View style={{ width: size, height: size, borderRadius: 3, backgroundColor: color }} />;
    }
    if (shape === 'triangle') {
      return <View style={{
        width: 0, height: 0,
        borderLeftWidth: size/2, borderRightWidth: size/2, borderBottomWidth: size,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
      }} />;
    }
    // star — text glyph
    return <Text style={{ fontSize: size, color, lineHeight: size, includeFontPadding: false }}>★</Text>;
  };

  const renderCard = (card: Card, isRef: boolean, idx?: number, fb?: 'right' | 'wrong' | null) => {
    const fbColor = fb === 'right' ? '#22c55e' : fb === 'wrong' ? '#f43f5e' : null;
    const inner = (
      <>
        <View style={styles.shapeRow}>
          {Array.from({ length: card.count }).map((_, i) => (
            <View key={i} style={{ marginHorizontal: 3, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}>
              {renderShape(card.shape, HEX[card.color], isRef ? 18 : 28)}
            </View>
          ))}
        </View>
      </>
    );
    if (isRef) {
      return (
        <TouchableOpacity key={idx} onPress={() => idx !== undefined && handlePick(idx)}
          disabled={feedback !== null}
          style={[styles.refCard, {
            backgroundColor: colors.surface,
            borderColor: fbColor || colors.border,
            borderWidth: fbColor ? 3 : 1,
          }]}>
          {inner}
        </TouchableOpacity>
      );
    }
    return (
      <LinearGradient colors={[colors.surface, GRADIENT[1] + '18']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.targetCard, { borderColor: GRADIENT[1] }]}>
        {inner}
      </LinearGradient>
    );
  };

  const renderConfig = () => (
    <View style={styles.configContainer}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="shuffle" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('wcst')}</Text>
        <Text style={styles.configDesc}>{t('wcstDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[20, 40, 60].map((n) => (
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

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
        <Text style={[styles.statText, { color: GRADIENT[1] }]}>↻{perseverative}</Text>
        <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('wcstHint')}</Text>
      <View style={styles.refRow}>
        {REF_CARDS.map((c, i) =>
          renderCard(c, true, i, feedback?.idx === i ? (feedback.ok ? 'right' : 'wrong') : null)
        )}
      </View>
      <View style={styles.targetWrap}>
        {renderCard(target, false)}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('wcst')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="wcst" icon="shuffle" gradient={GRADIENT as [string, string]}
          skillKey="skillSwitching" descriptionKey="wcstIntroDesc"
          benefits={WCST_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 50 - errors * 30 - perseverative * 50)}
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
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  refRow: { flexDirection: 'row', gap: 8 },
  refCard: { width: 80, height: 102, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  targetWrap: { marginTop: 26 },
  targetCard: { width: 138, height: 128, borderRadius: 22, borderWidth: 3, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  shapeRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' },
});
