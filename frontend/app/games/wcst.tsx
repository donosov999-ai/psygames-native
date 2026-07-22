/**
 * WCST — Wisconsin Card Sorting Test (когнитивная гибкость / set-shifting)
 *
 * Парадигма: 4 референс-карты (различаются цветом/формой/числом). Игрок сортирует
 * целевую карту, подбирая референс по СКРЫТОМУ правилу (color / shape / count).
 * Правило узнаётся по обратной связи ✓/✗ и МОЛЧА меняется после серии верных.
 *
 * Диагностика (классика Heaton WCST):
 *   - perseverative errors — ошибки по СТАРОМУ правилу после его смены (главный
 *     маркер ригидности мышления / нарушений префронтальной коры)
 *   - categories_completed — сколько полных серий-под-правилом закрыто
 *
 * Уровни (persist, паттерн cpt/simon): usePersistentLevel('wcst') + levelParams.
 * Ось усложнения (НЕ искажает механику — меняется только частота/размах):
 *   - окно смены правила сокращается 9 → 3 подряд (правило меняется всё чаще →
 *     выше нагрузка на гибкость и больше шансов на персеверацию)
 *   - число проб растёт ступенями 24 → 32 → 40
 * Проход уровня: мало персеверативных ошибок (+ разумная точность) → LevelCleared
 * (авто-поток; провал → «почти, ещё раз» + рестарт того же уровня).
 *
 * КЛАССИЧЕСКИЙ режим сохранён отдельным выбором на конфиге (и через isPreset/зарядку):
 * стандартные параметры парадигмы — смена правила после 10 подряд, селектор числа
 * проб — чтобы снять чистую диагностическую метрику. Уровень при этом не трогается.
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
import GameShell from '@/src/components/GameShell';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';

const GRADIENT = ['#834d9b', '#d04ed6'];
const MAX_LEVEL = 12;
const CLASSIC_STREAK = 10;   // классический WCST: смена правила после 10 подряд

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

// Уровень 1..12: окно смены правила сокращается (правило меняется чаще),
// число проб растёт ступенями. Механика сортировки НЕ меняется — только частота/размах.
function levelParams(level: number): { trials: number; ruleChangeStreak: number; persevCap: number } {
  const trials = level <= 4 ? 24 : level <= 8 ? 32 : 40;
  // 9 → 3 подряд по мере роста уровня (плавно, через 12 уровней)
  const ruleChangeStreak = Math.max(3, 9 - Math.floor((level - 1) * 6 / (MAX_LEVEL - 1)));
  const persevCap = Math.max(2, Math.round(trials * 0.12));
  return { trials, ruleChangeStreak, persevCap };
}

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type Mode = 'level' | 'classic';

export default function WcstGame() {
  const { colors, colorblind } = useTheme();
  const HEX = colorblind ? COLOR_HEX_CB : COLOR_HEX;
  const { t, language } = useLanguage();
  const router = useRouter();

  const { isPreset } = useGamePreset();
  const lvl = usePersistentLevel('wcst');
  // Зарядка/пресет (wu=1 в URL) → авто-старт классического режима, уровень не трогаем.
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [mode, setMode] = useState<Mode>('level');
  const [clearedPassed, setClearedPassed] = useState(true);

  const [trials, setTrials] = useState(40);        // селектор классического режима (20/40/60)
  const [totalTrials, setTotalTrials] = useState(40); // активное число проб (для HUD)

  const [round, setRound] = useState(0);
  const [target, setTarget] = useState<Card>(() => makeTarget());
  const [rule, setRule] = useState<Rule>('color');
  const [streak, setStreak] = useState(0);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [perseverative, setPerseverative] = useState(0);
  const [feedback, setFeedback] = useState<{idx: number, ok: boolean} | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Счётчики раунда — в рефах (таймерная цепочка + finish читают их без stale-closure).
  const roundRef = useRef(0);
  const hitsRef = useRef(0);
  const errorsRef = useRef(0);
  const persevRef = useRef(0);
  const streakRef = useRef(0);
  const categoriesRef = useRef(0);       // закрытых серий-под-правилом
  const targetRef = useRef<Card>(makeTarget());
  const ruleRef = useRef<Rule>('color');
  const lastRuleRef = useRef<Rule | null>(null); // предыдущее правило (после смены)
  const justChangedRef = useRef<boolean>(false);

  // Параметры текущей партии (в рефах — таймер живёт вне ре-рендера).
  const classicRef = useRef(false);
  const levelRef = useRef(1);
  const trialsRef = useRef(40);
  const ruleStreakRef = useRef(CLASSIC_STREAK);
  const persevCapRef = useRef(2);
  const startTimeRef = useRef(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);

  const pickNewRule = (prev: Rule): Rule => {
    const opts: Rule[] = (['color','shape','count'] as Rule[]).filter(r => r !== prev);
    return opts[Math.floor(Math.random() * opts.length)];
  };

  const startGame = () => {
    const classic = isPreset || mode === 'classic';
    classicRef.current = classic;
    let total: number, streakThreshold: number;
    if (classic) {
      total = trials;                 // из селектора
      streakThreshold = CLASSIC_STREAK;
      levelRef.current = lvl.level;   // не участвует в прогрессии, но хранится
      persevCapRef.current = 0;
    } else {
      const p = levelParams(lvl.level);
      levelRef.current = lvl.level;
      total = p.trials;
      streakThreshold = p.ruleChangeStreak;
      persevCapRef.current = p.persevCap;
    }
    trialsRef.current = total;
    ruleStreakRef.current = streakThreshold;
    setTotalTrials(total);

    hitsRef.current = 0; errorsRef.current = 0; persevRef.current = 0;
    streakRef.current = 0; categoriesRef.current = 0; roundRef.current = 1;
    setHits(0); setErrors(0); setPerseverative(0); setStreak(0); setRound(1);

    const r0: Rule = rndItem(['color','shape','count']);
    ruleRef.current = r0; setRule(r0);
    lastRuleRef.current = null;
    justChangedRef.current = false;

    const tg = makeTarget();
    targetRef.current = tg; setTarget(tg);
    setFeedback(null);
    setPhase('playing');
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - startTimeRef.current) / 1000), 100);
  };

  const finish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalTime = (Date.now() - startTimeRef.current) / 1000;
    setElapsedTime(finalTime);

    const classic = classicRef.current;
    const h = hitsRef.current, e = errorsRef.current, pv = persevRef.current;
    const cats = categoriesRef.current, total = trialsRef.current;

    let passed = false;
    if (!classic) {
      // Проход = мало персеверативных ошибок (+ разумная точность против случайного тапа).
      passed = pv <= persevCapRef.current && h >= Math.ceil(total * 0.55);
      if (passed) lvl.reach(levelRef.current + 1);
      else lvl.fail();
      setClearedPassed(passed);
      setPhase('cleared');
    } else {
      // Классический/пресет — уровень не трогаем, экран статистики.
      setPhase('result');
    }

    saveSession({
      game_type: 'wcst',
      score: Math.max(0, h * 50 - e * 30 - pv * 50),
      time_seconds: finalTime,
      difficulty: classic ? 'medium' : (levelRef.current <= 4 ? 'easy' : levelRef.current <= 8 ? 'medium' : 'hard'),
      mode: classic ? `classic_${total}t` : `lvl${levelRef.current}`,
      errors: e,
      details: {
        perseverative: pv,             // ← клиническая метрика (обязательна по схеме)
        categories_completed: cats,
        hits: h,
        n_trials: total,
        ...(classic ? {} : { level: levelRef.current }),   // level только в уровневом режиме
      },
    }).catch(err => console.error(err));
  };

  const handlePick = (refIdx: number) => {
    if (feedback !== null) return;
    const ok = matchByRule(targetRef.current, REF_CARDS[refIdx], ruleRef.current);
    if (ok) {
      hitsRef.current += 1;
      streakRef.current += 1;
      justChangedRef.current = false;
    } else {
      errorsRef.current += 1;
      streakRef.current = 0;
      // perseverative: ответ по ПРЕДЫДУЩЕМУ правилу сразу после его смены
      if (justChangedRef.current && lastRuleRef.current
          && matchByRule(targetRef.current, REF_CARDS[refIdx], lastRuleRef.current)) {
        persevRef.current += 1;
      }
    }
    setHits(hitsRef.current); setErrors(errorsRef.current);
    setPerseverative(persevRef.current); setStreak(streakRef.current);
    setFeedback({ idx: refIdx, ok });

    advanceTimerRef.current = setTimeout(() => {
      // правило МОЛЧА меняется после серии верных (окно уровня / 10 в классике)
      if (streakRef.current >= ruleStreakRef.current) {
        const nextRule = pickNewRule(ruleRef.current);
        lastRuleRef.current = ruleRef.current;
        justChangedRef.current = true;
        ruleRef.current = nextRule;
        setRule(nextRule);
        streakRef.current = 0;
        setStreak(0);
        categoriesRef.current += 1;   // закрыта серия-под-правилом = категория
      }
      if (roundRef.current >= trialsRef.current) {
        finish();
      } else {
        roundRef.current += 1;
        setRound(roundRef.current);
        const tg = makeTarget();
        targetRef.current = tg;
        setTarget(tg);
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

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    const modeBtn = (m: Mode, label: string) => (
      <TouchableOpacity style={[styles.modeButton, mode === m
        ? { backgroundColor: GRADIENT[1] }
        : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
        onPress={() => setMode(m)}>
        <Text style={[styles.modeButtonText, { color: mode === m ? '#FFF' : colors.text }]}>{label}</Text>
      </TouchableOpacity>
    );
    return (
      <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
          <Ionicons name="shuffle" size={48} color="#FFF" />
          <Text style={styles.configTitle}>{t('wcst')}</Text>
          <Text style={styles.configDesc}>{t('wcstDesc')}</Text>
        </LinearGradient>

        {/* Режим: Уровни (прогрессия) / Классический (чистая диагностика) */}
        <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{language === 'ru' ? 'Режим' : 'Mode'}</Text>
          <View style={styles.optionButtons}>
            {modeBtn('level', language === 'ru' ? 'Уровни' : 'Levels')}
            {modeBtn('classic', language === 'ru' ? 'Классический' : 'Classic')}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {mode === 'classic'
              ? (language === 'ru'
                  ? 'Стандартные параметры: правило меняется после 10 подряд. Для чистой метрики.'
                  : 'Standard params: rule switches after 10 in a row. For a clean metric.')
              : (language === 'ru'
                  ? 'Правило меняется всё чаще с уровнем. Держи персеверативные ошибки низкими.'
                  : 'Rule switches more often each level. Keep perseverative errors low.')}
          </Text>
        </View>

        {mode === 'classic' ? (
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
        ) : (
          <>
            <LevelProgressMap gameId="wcst" currentLevel={lvl.level} maxLevel={MAX_LEVEL} colors={colors} language={language} />
            <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
              <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
                {language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                {language === 'ru'
                  ? `${p.trials} проб · смена правила после ${p.ruleChangeStreak} подряд`
                  : `${p.trials} trials · rule switches after ${p.ruleChangeStreak} in a row`}
              </Text>
              {/* Критерий прохождения виден игроку (паттерн cpt/simon) */}
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                {language === 'ru'
                  ? `Проход уровня: ≤${p.persevCap} персеверативных ошибок и ≥55% верных`
                  : `To pass: ≤${p.persevCap} perseverative errors and ≥55% correct`}
              </Text>
              {lvl.level > 1 && (
                <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.startBtn} onPress={startGame}>
          <LinearGradient colors={GRADIENT as [string, string]} style={styles.startBtnGrad}>
            <Text style={styles.startBtnText}>{t('start')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // игровая фаза — на едином каркасе GameShell: 4 референс-карты (ответы) прибиты к низу,
  // целевая карта в центре поля
  if (phase === 'playing') {
    return (
      <GameShell
        title={t('wcst')}
        onBack={() => goBackOrHome()}
        stats={
          <View style={styles.statsRow}>
            <Text style={[styles.statText, { color: colors.text }]}>{round}/{totalTrials}</Text>
            <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
            <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
            <Text style={[styles.statText, { color: GRADIENT[1] }]}>↻{perseverative}</Text>
            <Text style={[styles.statText, { color: colors.text }]}>{elapsedTime.toFixed(1)}{language === 'ru' ? 'с' : 's'}</Text>
          </View>
        }
        toolbar={
          <View style={styles.refRow}>
            {REF_CARDS.map((c, i) =>
              renderCard(c, true, i, feedback?.idx === i ? (feedback.ok ? 'right' : 'wrong') : null)
            )}
          </View>
        }
      >
        <View style={styles.fieldCol}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('wcstHint')}</Text>
          <View style={styles.targetWrap}>
            {renderCard(target, false)}
          </View>
        </View>
      </GameShell>
    );
  }

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
      {phase === 'cleared' && (
        <LevelCleared gameId="wcst" level={levelRef.current} passed={clearedPassed}
          stars={perseverative === 0 ? 3 : perseverative <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
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
  fieldCol: { alignItems: 'center', gap: 18 },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  statText: { fontSize: 13, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
  refRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  refCard: { width: 80, height: 102, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  targetWrap: { marginTop: 8 },
  targetCard: { width: 138, height: 128, borderRadius: 22, borderWidth: 3, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  shapeRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' },
});
