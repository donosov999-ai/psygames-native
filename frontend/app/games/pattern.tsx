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
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import GameResult from '@/src/components/GameResult';
import GameIntro from '@/src/components/GameIntro';
import { useGamePreset } from '@/src/hooks/useGamePreset';

const GRADIENT = ['#7028e4', '#e5b2ca'];
const PATTERN_BENEFITS = [
  { icon: 'analytics-outline', textKey: 'benefitPattern1' },
  { icon: 'school-outline', textKey: 'benefitPattern2' },
  { icon: 'bulb-outline', textKey: 'benefitPattern3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'cleared' | 'result';
type Difficulty = 'easy' | 'medium' | 'hard';

// Каждый ряд = ОДНОЗНАЧНО продолжаемая прогрессия (правило Дениса: фрактальные/неоднозначные нельзя).
// Подсказка 2 ступени: classRu (класс) → ruleRu (формула/правило).
interface Sequence { items: number[]; answer: number; classRu: string; classEn: string; ruleRu: string; ruleEn: string; }

function shuffle<T>(arr: T[]): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
const rnd = (n: number) => Math.floor(Math.random() * n);

function genArithmetic(): Sequence {
  const start = 1 + rnd(9), step = 2 + rnd(6);
  return { items: [start, start+step, start+2*step, start+3*step], answer: start+4*step,
    classRu: 'Арифметическая прогрессия', classEn: 'Arithmetic', ruleRu: `Каждый член больше на ${step}`, ruleEn: `Each term +${step}` };
}
function genGeometric(): Sequence {
  const start = 2 + rnd(3), r = 2 + rnd(2);   // ×2..×3
  return { items: [start, start*r, start*r*r, start*r*r*r], answer: start*r*r*r*r,
    classRu: 'Геометрическая прогрессия', classEn: 'Geometric', ruleRu: `Каждый член умножается на ${r}`, ruleEn: `Each term ×${r}` };
}
function genSquares(): Sequence {
  const s = 1 + rnd(4);
  return { items: [s*s, (s+1)*(s+1), (s+2)*(s+2), (s+3)*(s+3)], answer: (s+4)*(s+4),
    classRu: 'Квадраты чисел', classEn: 'Squares', ruleRu: `n²: ${s}², ${s+1}², ${s+2}², …`, ruleEn: `n²: ${s}², ${s+1}², …` };
}
function genCubes(): Sequence {
  const s = 1 + rnd(2);
  return { items: [s*s*s, (s+1)*(s+1)*(s+1), (s+2)*(s+2)*(s+2)], answer: (s+3)*(s+3)*(s+3),
    classRu: 'Кубы чисел', classEn: 'Cubes', ruleRu: `n³: ${s}³, ${s+1}³, …`, ruleEn: `n³: ${s}³, ${s+1}³, …` };
}
function genFibonacci(): Sequence {
  let a = 1 + rnd(3), b = a + 1 + rnd(2);
  const all = [a, b]; for (let i=0;i<3;i++){ const c=a+b; all.push(c); a=b; b=c; }
  return { items: all.slice(0,4), answer: all[4],
    classRu: 'Похоже на Фибоначчи', classEn: 'Fibonacci-like', ruleRu: 'Сумма двух предыдущих', ruleEn: 'Sum of the previous two' };
}
function genGrowingDiff(): Sequence {
  const start = 1 + rnd(5), baseStep = 1 + rnd(3);
  const items = [start]; let s = baseStep;
  for (let i=0;i<3;i++){ items.push(items[items.length-1] + s); s++; }
  return { items, answer: items[3] + s,
    classRu: 'Растущая разность', classEn: 'Growing difference', ruleRu: `Разность растёт на 1 каждый шаг (${baseStep}, ${baseStep+1}, …)`, ruleEn: 'Difference grows by 1 each step' };
}
function genLookAndSay(): Sequence {
  const seqs = [1, 11, 21, 1211, 111221, 312211];   // однозначный ряд «посмотри и скажи»
  const i = rnd(2);
  return { items: seqs.slice(i, i+4), answer: seqs[i+4],
    classRu: '«Посмотри и скажи»', classEn: 'Look-and-say', ruleRu: 'Читай предыдущий вслух: «один 1» → 11, «два 1 один 2» …', ruleEn: 'Read the previous term aloud: "one 1" → 11' };
}
function genInterleaved(): Sequence {
  const startO = 1 + rnd(4), a = 1 + rnd(3);     // нечётные позиции: +a
  const startE = 5 + rnd(5),  b = 5 + rnd(6);     // чётные позиции: +b
  // показываем O1,E1,O2,E2; ответ = O3 (следующая нечётная позиция)
  return { items: [startO, startE, startO+a, startE+b], answer: startO + 2*a,
    classRu: 'Два переплетённых ряда', classEn: 'Two interleaved series', ruleRu: `Позиции 1,3,5… растут на ${a}; позиции 2,4… на ${b}. Нужна следующая нечётная`, ruleEn: `Odd positions +${a}, even +${b}` };
}

// Уровень → класс прогрессии (труднота растёт; БЕЗ лимита времени).
function makeSequence(level: number): Sequence {
  if (level <= 2)  return genArithmetic();
  if (level <= 4)  return genGeometric();
  if (level <= 6)  return rnd(2) ? genSquares() : genCubes();
  if (level <= 8)  return genFibonacci();
  if (level <= 10) return genGrowingDiff();
  if (level <= 12) return genLookAndSay();
  return genInterleaved();
}

function makeOptions(answer: number, count = 4): number[] {
  const opts = new Set<number>([answer]);
  while (opts.size < count) {
    const delta = Math.max(1, Math.round(Math.abs(answer) * 0.15)) + Math.floor(Math.random() * 5) + 1;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const candidate = answer + sign * delta;
    if (candidate !== answer && candidate > -1000) opts.add(candidate);
  }
  return shuffle(Array.from(opts));
}

export default function PatternGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();

  const lvl = usePersistentLevel('pattern');
  const { isPreset, num } = useGamePreset();
  useEffect(() => { if (isPreset) startGame(); }, []); // eslint-disable-line react-hooks/exhaustive-deps — пресет → авто-старт
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [trials, setTrials] = useState(() => num('trials', 10));
  const [round, setRound] = useState(0);
  const [seq, setSeq] = useState<Sequence>({ items: [], answer: 0, classRu: '', classEn: '', ruleRu: '', ruleEn: '' });
  const [options, setOptions] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [hintStage, setHintStage] = useState(0);   // 0 нет · 1 класс · 2 правило
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(1);
  const hintUsedRef = useRef(false);   // подсказка хоть раз за игру → потолок 2⭐

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const newRound = () => {
    const s = makeSequence(levelRef.current);
    setSeq(s);
    setOptions(makeOptions(s.answer));
    setFeedback(null);
    setHintStage(0);
  };

  const startGame = () => {
    levelRef.current = lvl.level;
    hintUsedRef.current = false;
    setHits(0); setErrors(0); setRound(1);
    newRound();
    setPhase('playing');
    const start = Date.now();
    setStartTime(start);
    timerRef.current = setInterval(() => setElapsedTime((Date.now() - start) / 1000), 100);
  };

  const handleAnswer = async (val: number) => {
    if (feedback !== null) return;
    const correct = val === seq.answer;
    if (correct) setHits((h) => h + 1);
    else setErrors((e) => e + 1);
    setFeedback(correct ? 'right' : 'wrong');
    setTimeout(async () => {
      if (round >= trials) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = (Date.now() - startTime) / 1000;
        setElapsedTime(finalTime);
        const newHits = correct ? hits + 1 : hits;
        const passed = !isPreset && newHits / trials >= 0.7;
        if (passed) lvl.reach(levelRef.current + 1);   // прошёл уровень → следующий
        setPhase(passed ? 'cleared' : 'result');   // авто-поток к следующему уровню
        try {
          await saveSession({
            game_type: 'pattern',
            score: newHits * 100 - (errors + (correct ? 0 : 1)) * 25,
            time_seconds: finalTime,
            difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
            mode: `lvl${levelRef.current}`,
            errors: errors + (correct ? 0 : 1),
            details: { level: levelRef.current, hits: newHits, errors: errors + (correct ? 0 : 1), trials, hint_used: hintUsedRef.current },
          });
        } catch (e) { console.error(e); }
      } else {
        setRound((r) => r + 1);
        newRound();
      }
    }, 700);
  };

  const useHint = () => {
    if (feedback !== null) return;
    setHintStage((s) => {
      const next = Math.min(2, s + 1);
      if (next >= 1) hintUsedRef.current = true;   // подсказка → потолок 2⭐ за игру
      return next;
    });
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="analytics" size={48} color="#FFF" />
        <Text style={styles.configTitle}>{t('pattern')}</Text>
        <Text style={styles.configDesc}>{t('patternDesc')}</Text>
      </LinearGradient>
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>{language === 'ru' ? 'Уровень' : 'Level'} {lvl.level}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {lvl.level <= 2 ? (language === 'ru' ? 'Арифметическая прогрессия' : 'Arithmetic')
           : lvl.level <= 4 ? (language === 'ru' ? 'Геометрическая прогрессия' : 'Geometric')
           : lvl.level <= 6 ? (language === 'ru' ? 'Квадраты и кубы' : 'Squares & cubes')
           : lvl.level <= 8 ? (language === 'ru' ? 'Похоже на Фибоначчи' : 'Fibonacci-like')
           : lvl.level <= 10 ? (language === 'ru' ? 'Растущая разность' : 'Growing difference')
           : lvl.level <= 12 ? (language === 'ru' ? '«Посмотри и скажи» (нужна подсказка)' : 'Look-and-say (use hint)')
           : (language === 'ru' ? 'Два переплетённых ряда' : 'Two interleaved series')}
        </Text>
        {lvl.level > 1 && (
          <TouchableOpacity onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('trialsLabel')}</Text>
        <View style={styles.optionButtons}>
          {[5, 10, 15].map((n) => (
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
    </ScrollView>
  );

  const renderPlaying = () => (
    <View style={styles.playArea}>
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.text }]}>{round}/{trials}</Text>
        <Text style={[styles.statText, { color: '#22c55e' }]}>✓{hits}</Text>
        <Text style={[styles.statText, { color: '#f43f5e' }]}>✗{errors}</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('patternHint')}</Text>
      <View style={styles.sequenceArea}>
        {seq.items.map((n, i) => (
          <View key={i} style={[styles.seqCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.seqText, { color: colors.text }]}>{n}</Text>
          </View>
        ))}
        <View style={[styles.seqCell, { backgroundColor: feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : 'transparent', borderColor: GRADIENT[0], borderWidth: 2 }]}>
          <Text style={[styles.seqText, { color: feedback ? '#FFF' : GRADIENT[0] }]}>?</Text>
        </View>
      </View>
      <View style={styles.optionsArea}>
        {options.map((o, i) => (
          <TouchableOpacity key={i}
            disabled={feedback !== null}
            onPress={() => handleAnswer(o)}
            style={[styles.optBtn, { backgroundColor: GRADIENT[0] }]}
          >
            <Text style={styles.optText}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {hintStage >= 1 && (
        <View style={[styles.hintBox, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>💡 {language === 'ru' ? seq.classRu : seq.classEn}</Text>
          {hintStage >= 2 && <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{language === 'ru' ? seq.ruleRu : seq.ruleEn}</Text>}
        </View>
      )}
      <TouchableOpacity onPress={useHint} disabled={hintStage >= 2 || feedback !== null}
        style={[styles.hintBtn, { borderColor: GRADIENT[0], opacity: (hintStage >= 2 || feedback !== null) ? 0.4 : 1 }]}>
        <Text style={{ color: GRADIENT[0], fontWeight: '700', fontSize: 14 }}>
          💡 {hintStage === 0 ? (language === 'ru' ? 'Подсказка' : 'Hint') : hintStage === 1 ? (language === 'ru' ? 'Ещё: правило (−1⭐)' : 'More: rule (−1⭐)') : (language === 'ru' ? 'Подсказка использована' : 'Hint used')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('pattern')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'intro' && (
        <GameIntro nameKey="pattern" icon="analytics" gradient={GRADIENT as [string, string]}
          skillKey="skillReasoning" descriptionKey="patternIntroDesc"
          benefits={PATTERN_BENEFITS} onStart={() => setPhase('config')} onBack={() => goBackOrHome()} />
      )}
      {phase === 'config' && renderConfig()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'cleared' && (() => {
        const base = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
        const stars = hintUsedRef.current ? Math.min(2, base) : base;   // подсказка → потолок 2⭐
        return (
        <LevelCleared level={levelRef.current} stars={stars}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
        );
      })()}
      {phase === 'result' && (() => {
        const base = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
        const stars = hintUsedRef.current ? Math.min(2, base) : base;   // подсказка → потолок 2⭐
        return (
        <GameResult
          score={Math.max(0, hits * 100 - errors * 25)}
          time={elapsedTime} errors={errors} stars={stars}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
        );
      })()}
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
  startBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playArea: { flex: 1, justifyContent: 'center', padding: 18, gap: 18, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  statText: { fontSize: 16, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  sequenceArea: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  seqCell: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  seqText: { fontSize: 24, fontWeight: '800' },
  optionsArea: { flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 360 },
  optBtn: { paddingVertical: 18, paddingHorizontal: 24, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  optText: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  hintBox: { padding: 12, borderRadius: 10, borderWidth: 1.5, maxWidth: 340, alignItems: 'center' },
  hintBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 22, borderWidth: 1.5 },
});
